/**
 * Regression for 2026-10-22 owner-run live-trial UI findings.
 * Static assertions complement the existing mocked HTTP and provider tests.
 * These tests do not call Nebius or start a real live trial.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('owner-only button correctly names the fixed shop scenario, without changing offline workshop rehearsal',async()=>{
 const html=await read('public/index.html');
 assert.match(html,/<button[^>]*id="owner-live-example"[^>]*>Load fixed fictional shop idea<\/button>/);
 assert.doesNotMatch(html,/<button[^>]*id="owner-live-example"[^>]*>Load fixed fictional workshop idea<\/button>/);
 assert.match(html,/id="bridge-example"/);
 const live=await read('public/studio-owner-live.js');
 assert.match(live,/Fictional shop idea loaded/);
});

test('owner trial status reflects not-requested, in-progress, successful, or uncertain results',async()=>{
 const live=await read('public/studio-owner-live.js');
 for(const message of [
  'OWNER LIVE TRIAL · Not requested',
  'OWNER LIVE TRIAL · Attempt in progress',
  'OWNER LIVE TRIAL · 1 live response received',
  'OWNER LIVE TRIAL · Attempt ended; check details'
 ])assert.ok(live.includes(message),message);
 assert.ok(live.indexOf("setModeStatus('OWNER LIVE TRIAL · 1 live response received')") >
           live.indexOf("if(!unchanged(snapshot))throw Error('input-changed');"));
 assert.match(live,/const setModeStatus=message=>\{if\(modeStatus\)modeStatus\.textContent=message;\};/);
 assert.doesNotMatch(live,/OWNER LIVE TRIAL · Nothing sent/);
});

test('offline masking preview cannot overwrite real owner-only trial status with No requests possible',async()=>{
 const studio=await read('public/studio.js');
 assert.match(studio,/const isOwnerTrial = document\.documentElement\.dataset\.socialsparkOwnerLive === 'yes';/);
 assert.match(studio,/This is a local masking preview only\. The separate owner-only NVIDIA trial has its own status below/);
 assert.match(studio,/This local preview sent nothing; see the separate owner-only trial below/);
 assert.match(studio,/isOwnerTrial\s*\?/);
 assert.match(studio,/No real Nebius AI requests are possible from this browser/);
 const live=await read('public/studio-owner-live.js');
 assert.match(live,/const modeStatus=state\?\.querySelector\('\.studio-ai-state'\)/);
});

test('owner-only UI corrections never add API credentials, network calls, or production deployment',async()=>{
 const live=await read('public/studio-owner-live.js');
 const script=await read('scripts/start-owner-live.mjs');
 const config=JSON.parse(await read('wrangler.jsonc'));
 assert.deepEqual(Object.keys(config).sort(),['assets','compatibility_date','name']);
 assert.equal(Object.hasOwn(config,'main'),false);
 assert.doesNotMatch(live,/NEBIUS_API_KEY|localStorage|sessionStorage|Bearer /);
 assert.doesNotMatch(script,/fetch\(|https:\/\/api\.tokenfactory\.nebius\.com/);
 assert.equal(live.includes("if(isOwnerMode)"),true);
});
