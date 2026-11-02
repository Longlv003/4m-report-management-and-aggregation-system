const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), '4m-audit-ip-'));
process.env.APP_DATABASE_URL = 'file:' + path.join(temp,'test.sqlite').replace(/\\/g,'/');
process.env.JWT_SECRET = 'audit-ip-test-secret-at-least-32-characters';
process.env.INITIAL_ADMIN_PASSWORD = 'AuditIpAdmin123!';
process.env.INITIAL_USER_PASSWORD = 'AuditIpUser123!';
const { runMigrations } = require('../dist/database/migrations');
const { getDb, dbConnection } = require('../dist/database/connection');
const { createApp } = require('../dist/app');
const { normalizeClientIp, clientIpMiddleware } = require('../dist/middlewares/client-ip.middleware');
const { auditMiddleware } = require('../dist/middlewares/audit.middleware');
const { withWriteTransaction } = require('../dist/database/transaction');

async function main() {
  assert.equal(normalizeClientIp('::ffff:192.168.1.42'),'192.168.1.42');
  assert.equal(normalizeClientIp('::1'),'127.0.0.1');
  assert.equal(normalizeClientIp('2001:db8::1'),'2001:db8::1');
  assert.equal(normalizeClientIp('::ffff:c000:201'),'::ffff:c000:201');
  assert.equal(normalizeClientIp('invalid'),undefined);
  assert.equal(normalizeClientIp(undefined),undefined);
  const app=createApp();
  // A remote direct caller cannot forge its address using forwarding headers.
  const untrusted=Object.assign(Object.create(app.request),{
    socket:{remoteAddress:'198.51.100.10'},headers:{'x-forwarded-for':'203.0.113.99'}
  });
  clientIpMiddleware(untrusted,{},()=>{});
  assert.equal(untrusted.clientIp,'198.51.100.10');
  const db=getDb();let server,proxy;
  try {
    await runMigrations();
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    let response=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json','x-forwarded-for':'198.51.100.23'},
      body:JSON.stringify({username:'admin',password:process.env.INITIAL_ADMIN_PASSWORD})});
    assert.equal(response.status,200);const token=(await response.json()).data.token;
    response=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json','x-forwarded-for':'198.51.100.24'},
      body:JSON.stringify({username:'admin',password:'incorrect'})});assert.equal(response.status,401);
    response=await fetch(base+'/api/v1/mapping',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'x-forwarded-for':'198.51.100.25'},
      body:JSON.stringify({itemName:'Audit IP',seqNo:'0350',pcsPerSheet:96})});assert.equal(response.status,201);

    const closing={ originalUrl:'/api/v1/test/closed-socket',method:'GET',query:{},headers:{},
      socket:{remoteAddress:'::ffff:192.168.1.42'},get ip(){return this.socket.remoteAddress;},user:{id:'acc-admin',username:'admin'}};
    clientIpMiddleware(closing,{},()=>{});
    const res=Object.assign(new EventEmitter(),{statusCode:200,locals:{}});
    auditMiddleware(closing,res,()=>{});closing.socket.remoteAddress=undefined;res.emit('finish');
    await withWriteTransaction(async()=>{});
    const logs=(await db.execute('SELECT * FROM audit_logs')).rows;
    assert.ok(logs.some(row=>row.action==='LOGIN'&&row.ip_address==='198.51.100.23'));
    assert.ok(logs.some(row=>row.action==='POST_ATTEMPT'&&row.outcome==='FAILED'&&row.account_id===null&&row.ip_address==='198.51.100.24'));
    assert.ok(logs.some(row=>row.action==='CREATE'&&row.resource==='item_mapping'&&row.ip_address==='198.51.100.25'));
    assert.ok(logs.some(row=>row.resource==='/api/v1/test/closed-socket'&&row.ip_address==='192.168.1.42'));

    // Exercise the actual Vite proxy config, including its replacement of forged headers.
    const frontend=path.resolve(__dirname,'../../frontend');
    const vite=await import(pathToFileURL(path.join(frontend,'node_modules/vite/dist/node/index.js')).href);
    const loaded=await vite.loadConfigFromFile({command:'serve',mode:'test'},path.join(frontend,'vite.config.ts'));
    proxy=await vite.createServer({configFile:false,root:frontend,server:{host:'127.0.0.1',port:0,strictPort:false,
      proxy:{'/api':{...loaded.config.server.proxy['/api'],target:base}}}});
    await proxy.listen();const port=proxy.httpServer.address().port;
    await new Promise((resolve,reject)=>{
      const request=http.get({host:'127.0.0.1',port,path:'/api/v1/audit?search=proxy-ip-test',agent:false,
        headers:{Authorization:'Bearer '+token,'x-forwarded-for':'203.0.113.99'}},response=>{response.resume();response.on('end',resolve);});request.on('error',reject);
    });
    // The admin has audit:view via its DB role even though the request comes through Vite.
    await withWriteTransaction(async()=>{});
    const proxied=(await db.execute("SELECT ip_address FROM audit_logs WHERE resource='/api/v1/audit' ORDER BY rowid DESC LIMIT 1")).rows[0];
    assert.equal(proxied.ip_address,'127.0.0.1');
    console.log('Audit IP tests passed: authenticated/anonymous failures, successful mutation, closed socket, IPv4/IPv6, trusted forwarding, untrusted caller and actual Vite proxy spoof protection.');
  } finally {
    if(proxy)await proxy.close();
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await dbConnection.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
