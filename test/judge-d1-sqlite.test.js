/**
 * Actual SQLite execution test for the SQL sent to Cloudflare D1.
 * Database is ephemeral/in-memory. There is NO external network and NO model call.
 * Node 22's built-in SQLite module is experimental; its standard SQL semantics
 * are sufficient to check our statement bindings and atomic conditions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JUDGE_SQL} from '../judge-gateway/sql.mjs';

const NOW=1794484800; // fixed 2026-11-12 simulation time
const INVITE='a'.repeat(64);
const TICKET='b'.repeat(64);

function dbFixture(maxRequests=2){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../judge-gateway/schema.sql',import.meta.url),'utf8'));
  db.prepare('UPDATE judge_gate SET enabled=1,window_starts_utc=?,window_ends_utc=?,max_requests=? WHERE id=1')
    .run(NOW-100,NOW+100,maxRequests);
  db.prepare('INSERT INTO judge_invites(token_sha256,enabled,expires_at_utc,label) VALUES(?,1,?,?)')
    .run(INVITE,NOW+90,'fictional-judge');
  return db;
}
function createTicket(db,ticket=TICKET,{prompt='workshop',tone='friendly',now=NOW}={}){
  return db.prepare(JUDGE_SQL.createTicket).run(
    ticket,INVITE,prompt,tone,now+120,INVITE,now,now
  ).changes;
}
function reserve(db,ticket=TICKET,{prompt='workshop',tone='friendly',now=NOW}={}){
  return db.prepare(JUDGE_SQL.reserve).run(
    now,now,INVITE,now,ticket,INVITE,prompt,tone,now
  ).changes;
}
function consume(db,ticket=TICKET,{prompt='workshop',tone='friendly',now=NOW}={}){
  return db.prepare(JUDGE_SQL.consumeTicket).run(
    ticket,INVITE,prompt,tone,now
  ).changes;
}
test('SQL migration starts disabled with zero allowed requests',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    db.exec(readFileSync(new URL('../judge-gateway/schema.sql',import.meta.url),'utf8'));
    const row=db.prepare('SELECT enabled, max_requests, used_requests, request_active FROM judge_gate WHERE id=1').get();
    assert.deepEqual([row.enabled,row.max_requests,row.used_requests,row.request_active],[0,0,0,0]);
  }finally{db.close();}
});
test('real SQLite validates single-use tickets and atomic global budget reservations',()=>{
  const db=dbFixture(2);
  try{
    assert.equal(db.prepare(JUDGE_SQL.validInvite).get(INVITE,NOW).token_sha256,INVITE);
    assert.equal(createTicket(db),1);
    assert.equal(createTicket(db),0);
    assert.equal(reserve(db,TICKET,{tone:'playful'}),0);
    assert.equal(reserve(db),1);
    assert.equal(reserve(db),0,'a concurrent reservation is blocked by the active-request lock');
    assert.equal(consume(db),1);
    assert.equal(consume(db),0,'ticket cannot be consumed again');
    assert.equal(db.prepare(JUDGE_SQL.release).run().changes,1);
    assert.equal(reserve(db),0,'previously consumed ticket cannot be used to spend another request');
    assert.equal(createTicket(db,'c'.repeat(64)),1);
    assert.equal(reserve(db,'c'.repeat(64)),1);
    assert.equal(consume(db,'c'.repeat(64)),1);
    assert.equal(db.prepare(JUDGE_SQL.release).run().changes,1);
    assert.equal(createTicket(db,'d'.repeat(64)),1);
    assert.equal(reserve(db,'d'.repeat(64)),0,'total request cap reached');
    const row=db.prepare('SELECT used_requests,request_active FROM judge_gate WHERE id=1').get();
    assert.deepEqual([row.used_requests,row.request_active],[2,0]);
  }finally{db.close();}
});
test('real SQLite rejects revoked and expired invitations and expired tickets',()=>{
  const db=dbFixture(5);
  try{
    assert.equal(createTicket(db),1);
    assert.equal(reserve(db,TICKET,{now:NOW+101}),0,'window expired');
    assert.equal(reserve(db,TICKET,{now:NOW+121}),0,'ticket expired');
    db.prepare('UPDATE judge_invites SET enabled=0 WHERE token_sha256=?').run(INVITE);
    assert.equal(db.prepare(JUDGE_SQL.validInvite).get(INVITE,NOW),undefined);
    assert.equal(reserve(db),0,'revoked invitation cannot reserve');
  }finally{db.close();}
});
test('example Wrangler entrypoint resolves beside its config, not nested twice',()=>{
  const path=fileURLToPath(new URL('../judge-gateway/wrangler.example.jsonc',import.meta.url));
  const json=JSON.parse(readFileSync(path,'utf8').replace(/^\s*\/\/.*$/gm,''));
  assert.equal(json.main,'./worker.mjs');
  assert.equal(existsSync(resolve(dirname(path),json.main)),true);
  assert.equal(json.d1_databases[0].database_id,'REPLACE_WITH_APPROVED_D1_DATABASE_ID');
});
