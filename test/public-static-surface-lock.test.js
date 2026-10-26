/**
 * Public static boundary audit: keep the submitted demo network-isolated.
 * These tests add defense in depth; they are NOT proof of a hosted live model
 * or a provider billing ceiling. No real HTTP or Nebius requests occur.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('every script loaded from the static page is a local, module-only file',async()=>{
 const html=await read('public/index.html');
 const scripts=[...html.matchAll(/<script\b([^>]*)>/gi)];
 assert.ok(scripts.length>=5);
 for(const [,tag] of scripts){
   assert.match(tag,/\btype="module"/);
   const path=tag.match(/\bsrc="([^"]+)"/)?.[1];
   assert.ok(path && /^\/[a-z0-9-]+\.js$/i.test(path),'local script source required');
   await read('public'+path);
 }
 assert.doesNotMatch(html,/<iframe\b|<script\b[^>]*\bsrc="https?:/i);
 assert.doesNotMatch(html,/data-socialspark-owner-live\s*=\s*["']yes["']/i);
});

test('browser scripts cannot directly call a paid model provider or use a provider key',async()=>{
 const js=(await readdir(new URL('public/',root))).filter(x=>x.endsWith('.js'));
 assert.ok(js.length>=10);
 for(const filename of js){
   const source=await read('public/'+filename);
   assert.doesNotMatch(source,/api\.tokenfactory\.nebius\.com|NEBIUS_API_KEY|Authorization\s*:\s*['"]Bearer|https?:\/\/api\.openai\.com/i,filename);
   assert.doesNotMatch(source,/\b(?:XMLHttpRequest|WebSocket|sendBeacon)\s*\(/,filename);
 }
});

test('only isolated rehearsal / owner-only modules contain browser fetch logic',async()=>{
 const js=(await readdir(new URL('public/',root))).filter(x=>x.endsWith('.js'));
 const files=[];
 for(const filename of js){
   const source=await read('public/'+filename);
   if(/\bfetch\s*\(/.test(source))files.push(filename);
 }
 assert.deepEqual(files.sort(),['studio-ai-bridge.js','studio-owner-live.js']);
 const rehearsal=await read('public/studio-ai-bridge.js');
 const live=await read('public/studio-owner-live.js');
 assert.match(rehearsal,/\/api\/mock\/session/);
 assert.match(rehearsal,/\/api\/mock\/complete/);
 assert.match(rehearsal,/providerRequests!==0\|\|result\.creditsSpent!==0/);
 assert.match(live,/if\(isOwnerMode\)\{/);
 assert.match(live,/document\.documentElement\.dataset\.socialsparkOwnerLive==='yes'/);
 assert.match(live,/\/api\/owner-live\/session/);
 assert.match(live,/\/api\/owner-live\/complete/);
});

test('static deployment forbids browser network connections regardless of dormant scripts',async()=>{
 const config=JSON.parse(await read('wrangler.jsonc'));
 assert.deepEqual(Object.keys(config).sort(),['assets','compatibility_date','name']);
 assert.equal(config.assets.directory,'./public');
 const header=await read('public/_headers');
 assert.match(header,/^\/\*\s*$/m);
 assert.match(header,/^\s*Content-Security-Policy:[^\n]*\bconnect-src 'none';/m);
 assert.match(header,/^\s*Content-Security-Policy:[^\n]*\bscript-src 'self';/m);
 assert.match(header,/^\s*Content-Security-Policy:[^\n]*\bform-action 'none';/m);
});
