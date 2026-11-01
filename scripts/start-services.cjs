const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const node = path.join(root, 'runtime', 'node', 'node-v22.14.0-win-x64', 'node.exe');
const app = JSON.parse(fs.readFileSync(path.join(root, 'backend', 'config', 'app.json'), 'utf8')).app;
const services = [
  { name: 'Backend', port: app.port || 4000, status: 401, probe: '/api/v1/auth/me',
    cwd: path.join(root, 'backend'), entry: path.join(root, 'backend', 'node_modules', 'tsx', 'dist', 'cli.mjs'), args: ['src/server.ts'] },
  { name: 'Frontend', port: 5173, status: 200, probe: '/',
    cwd: path.join(root, 'frontend'), entry: path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'),
    args: ['--host', '0.0.0.0', '--port', '5173', '--strictPort'] }
];
const children = [];

function isOccupied(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = result => { socket.destroy(); resolve(result); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(false));
  });
}
function isReady(service) {
  return new Promise(resolve => {
    const request = http.get({ host: '127.0.0.1', port: service.port, path: service.probe }, response => {
      response.resume(); resolve(response.statusCode === service.status);
    });
    request.once('error', () => resolve(false));
    request.setTimeout(1000, () => { request.destroy(); resolve(false); });
  });
}
function normalize(value) {
  try { value = decodeURIComponent(value); } catch {}
  return value.replace(/\\/g, '/').toLowerCase();
}
function getPortOwners(port) {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = `
    $ErrorActionPreference = 'Stop'
    $ids = @(Get-NetTCPConnection -State Listen -LocalPort ${port} | Select-Object -ExpandProperty OwningProcess -Unique)
    $owners = @(foreach ($ownerId in $ids) {
      Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId" | Select-Object ProcessId,ExecutablePath,CommandLine
    })
    ConvertTo-Json -InputObject $owners -Compress
  `;
  try {
    return JSON.parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    }));
  } catch {
    throw new Error('Port ' + port + ' is occupied, but its owner could not be verified. No existing process was stopped.');
  }
}
function belongsToProject(service, owner) {
  if (normalize(owner.ExecutablePath || '') !== normalize(node)) return false;
  const command = normalize(owner.CommandLine || '');
  if (service.name === 'Frontend') return command.includes(normalize(service.entry));
  return command.includes(normalize(path.join(root, 'backend', 'node_modules', 'tsx'))) && command.includes('src/server.ts');
}
async function start(service, logDir) {
  const log = path.join(logDir, service.name.toLowerCase() + '-start.stdout.log');
  const fd = fs.openSync(log, 'a');
  try {
    // Argument arrays bypass CMD entirely, including paths containing spaces and '&'.
    const child = spawn(node, [service.entry, ...service.args], {
      cwd: service.cwd, env: { ...process.env, PATH: path.dirname(node) + path.delimiter + process.env.PATH },
      detached: true, windowsHide: true, stdio: ['ignore', fd, fd]
    });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    children.push(child);
    child.unref();
  } finally { fs.closeSync(fd); }
}
async function main() {
  for (const file of [node, ...services.map(service => service.entry)]) {
    if (!fs.existsSync(file)) throw new Error('Missing runtime/dependency: ' + file);
  }
  if (process.argv.includes('--check')) {
    console.log('[OK] Background launcher and dependencies verified.');
    return;
  }
  const missing = [];
  // Verify every occupied port before starting anything; never replace an unrelated application.
  for (const service of services) {
    if (!await isOccupied(service.port)) { missing.push(service); continue; }
    const owners = getPortOwners(service.port);
    if (!owners.length || !owners.every(owner => belongsToProject(service, owner))) {
      throw new Error('Port ' + service.port + ' belongs to another application. No new services were started and no process was stopped.');
    }
    console.log('[OK] ' + service.name + ' is already running; reusing existing process.');
  }
  const paths = JSON.parse(fs.readFileSync(path.join(root, 'backend', 'config', 'paths.json'), 'utf8')).paths;
  const logDir = path.resolve(root, paths.logDir || 'data/logs');
  fs.mkdirSync(logDir, { recursive: true });
  for (const service of missing) await start(service, logDir);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if ((await Promise.all(services.map(isReady))).every(Boolean)) {
      const host = process.env.SCAN4M_HOST_IP || '127.0.0.1';
      for (const service of services) console.log('[OK] ' + service.name + ' ready: http://' + host + ':' + service.port);
      console.log('[OK] ' + (missing.length ? 'Started ' + missing.length + ' missing service(s).' : 'System is already running; no duplicate processes created.'));
      console.log('[OK] Services run in the background. Logs: ' + logDir);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('Startup failed or timed out. See service logs in ' + logDir);
}
main().catch(error => {
  // Only clean up process trees created by this launch attempt.
  for (const child of children) {
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
  }
  console.error('[ERROR] ' + error.message);
  process.exitCode = 1;
});
