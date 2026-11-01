// Isolated browser verification server; never reads or writes the installed database.
import './test-environment.js';
import { runMigrations } from '../src/database/migrations.js';
import { getDb, dbConnection } from '../src/database/connection.js';
import { createApp } from '../src/app.js';

async function start() {
  await runMigrations();
  const db = getDb();
  await db.execute(`INSERT INTO source_files (id,file_path,file_name,file_type,source_system,file_size,sha256,detected_at,status)
    VALUES ('ui-file','test','UI fixture.csv','CSV','wcsScan',1,'ui-fixture','','SUCCESS')`);
  await db.execute(`INSERT INTO wcs_records (id,file_id,match_key,item_code,batch_no,seq_no,start_time,created_at)
    VALUES ('ui-wcs','ui-file','DEMO_00001_0070','DEMO','00001','0070','2026-11-01 07:00:00','')`);
  await db.execute(`INSERT INTO scan4m_records (id,match_key,wcs_record_id,match_status,date,start_time,item_name,item_code,lot_no,seq_no,machine,created_at,updated_at)
    VALUES ('ui-scan','DEMO_00001_0070','ui-wcs','UNMATCHED_PLUS','2026-11-01','2026-11-01 07:00:00','Demo record','DEMO','00001','0070','Demo Scan','','')`);
  await db.execute(`INSERT INTO cvr4m_records (id,match_status,date,start_time,item_name,item_code,lot_no,seq_no,machine,created_at,updated_at)
    VALUES ('ui-cvr','UNMATCHED_PLUS','2026-11-01','2026-11-01 07:00:00','Demo record','DEMO','00001','0070','Demo Verify','','')`);
  const server = createApp().listen(4010,'127.0.0.1',() => console.log('UI verification: http://127.0.0.1:4010'));
  process.on('SIGTERM',() => server.close(async () => { await dbConnection.close(); process.exit(0); }));
}
start().catch(error => { console.error(error);process.exitCode=1; });
