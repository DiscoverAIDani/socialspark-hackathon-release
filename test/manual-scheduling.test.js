import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAppServer} from '../server.mjs';
import {getCopyAvailability} from '../public/copy-availability.js';
import {reviewText} from '../public/privacy.js';
import {PLATFORMS} from '../public/platform-drafts.js';
import {localDateTime,localDay,prepareScheduledItems,readScheduledItems,pendingState,createReminderICS,STORAGE_KEY,PLATFORM_URLS,MAX_ITEMS} from '../public/schedule-core.js';
const NOW=new Date('2026-10-19T12:00:00-07:00');
const formatLocal=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const at=formatLocal(new Date(NOW.getTime()+2*60*60*1000));
const build=(params={})=>prepareScheduledItems({drafts:{facebook:'A fictional workshop.',tiktok:'Learn together ⚡ #Test'},selected:['facebook','tiktok'],when:at,now:NOW,idFactory:(()=>{let n=0;return()=>`test-id-${++n}`;})(),...params});

test('future local time parses without inventing timezone offset',()=>{
 const d=localDateTime(at);assert.equal(d.getFullYear(),new Date(NOW).getFullYear());assert.equal(formatLocal(d),at);
 assert.equal(localDateTime('not-a-date'),null);
 assert.equal(localDateTime('2026-02-29T16:30'),null);
 assert.equal(localDateTime('2026-12-25T25:00'),null);
 assert.equal(localDay(d),at.slice(0,10));
});
test('manually schedules only explicitly chosen reviewed draft snapshots',()=>{
 const results=build();assert.deepEqual(results.map(x=>x.platform),['facebook','tiktok']);
 assert.deepEqual(results.map(x=>x.text),['A fictional workshop.','Learn together ⚡ #Test']);
 assert.equal(results[0].at,new Date(localDateTime(at)).toISOString());
 assert.equal(results[1].createdAt,NOW.toISOString());
 assert.equal(pendingState(results[0],NOW.getTime()),'Awaiting manual posting');
 assert.equal(pendingState(results[0],new Date(results[0].at).getTime()),'Due for manual posting');
 assert.ok(STORAGE_KEY.includes('schedule'));
});
test('date/time and selected platforms are strict',()=>{
 const err=(overrides,fragment)=>assert.throws(()=>build(overrides),new RegExp(fragment));
 err({when:'2026-10-18T11:00'},'future');
 err({when:formatLocal(new Date(NOW.getTime()+30_000))},'future');
 err({when:formatLocal(new Date(NOW.getTime()+367*86400e3))},'year');
 err({when:'no'},'valid');
 err({selected:[]},'least one');
 err({selected:['facebook','facebook']},'duplicate');
 err({selected:['youtube']},'Unsupported');
 err({drafts:{facebook:'',tiktok:'ok'}},'Invalid facebook');
 err({drafts:{facebook:'x'.repeat(6001),tiktok:'ok'}},'Invalid facebook');
 err({idFactory:()=>'<script>'},'identifier');
});
test('saved drafts round-trip in explicit-only local storage format',()=>{
 const original=build();const recovered=readScheduledItems(JSON.stringify(original));
 assert.deepEqual(recovered,original);assert.deepEqual(readScheduledItems(null),[]);
 const extras={...original[0],neverExport:'secret metadata'};
 assert.ok(!('neverExport' in readScheduledItems(JSON.stringify([extras]))[0]));
 assert.throws(()=>readScheduledItems('{not json'),/could not be read/);
 assert.throws(()=>readScheduledItems(JSON.stringify([...original,...original])),/duplicate identifiers/);
 assert.throws(()=>readScheduledItems(JSON.stringify(Array(MAX_ITEMS+1).fill(original[0]))),/limit/);
 assert.throws(()=>readScheduledItems(JSON.stringify([{...original[0],platform:'unknown'}])),/validation/);
 assert.throws(()=>readScheduledItems(JSON.stringify([{...original[0],text:'x'.repeat(6001)}])),/validation/);
});
test('calendar file deliberately excludes all saved post text and email-style injection',()=>{
 const original=build({drafts:{facebook:'TOP SECRET POST CONTENT\nATTENDEE:Jane',tiktok:'Other private content 🌟'}});
 const ics=createReminderICS(original,NOW);
 assert.match(ics,/BEGIN:VCALENDAR\r\n/);
 assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,2);
 assert.equal((ics.match(/END:VALARM/g)||[]).length,2);
 assert.match(ics,/SUMMARY:SocialSpark: manually post to Facebook/);
 assert.match(ics,/SUMMARY:SocialSpark: manually post to TikTok/);
 assert.match(ics,/TRIGGER:-PT15M/);
 assert.match(ics,/DTSTART:\d{8}T\d{6}Z/);
 assert.doesNotMatch(ics,/TOP SECRET|ATTENDEE:Jane|Other private content|fictional workshop|🌟/);
 assert.match(ics.replace(/\r\n /g,''),/Open SocialSpark in the same browser/);
 assert.ok(ics.trimEnd().split('\r\n').every(line=>new TextEncoder().encode(line).length<=75));
 assert.throws(()=>createReminderICS([]),/No valid/);
});
test('schedule cannot bypass the platform privacy acknowledgment',()=>{
 const sample='Call me at 916-555-0142';
 const review=reviewText(sample);
 assert.equal(review.concerns,true);
 assert.equal(getCopyAvailability({text:sample,review,currentRevision:2,reviewRevision:2,acknowledged:false}).enabled,false);
 assert.equal(getCopyAvailability({text:sample,review,currentRevision:2,reviewRevision:2,acknowledged:true}).enabled,true);
});
test('UI uses opt-in persistence and no network requests or automatic publishing',async()=>{
 const js=await readFile(new URL('../public/studio-scheduler.js',import.meta.url),'utf8');
 const studio=await readFile(new URL('../public/studio.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(js,/consent\.checked/);
 assert.match(js,/getSchedulingDrafts/);
 assert.match(js,/copyAllowed/);
 assert.match(js,/localStorage\.setItem/);
 assert.match(js,/localStorage\.getItem/);
 assert.match(js,/reviewText\(item\.text\)/);
 assert.match(js,/getCopyAvailability/);
 assert.match(js,/\.textContent/);
 assert.doesNotMatch(js,/\bfetch\s*\(|\.innerHTML\s*=|serviceWorker|setInterval\(/);
 assert.match(studio,/isStale\(\)/);
 assert.match(studio,/export function getSchedulingDrafts/);
 assert.match(html,/id="studio-scheduler"/);
 assert.match(html,/type="datetime-local"/);
 assert.match(html,/Browser storage is <strong>not encrypted<\/strong>/);
 for(const p of PLATFORMS){assert.match(html,new RegExp(`id="schedule-check-${p.id}"`));assert.ok(PLATFORM_URLS[p.id].startsWith('https://'));}
});
test('offline server allowlists scheduler code but does not accept new POSTs',async()=>{
 const server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const path of ['/studio-scheduler.js','/schedule-core.js']){
   const res=await fetch(base+path);assert.equal(res.status,200);
   assert.match(res.headers.get('content-security-policy'),/connect-src 'none'/);
  }
  const post=await fetch(base+'/api/schedule',{method:'POST',body:'a private post'});
  assert.equal(post.status,405);
 }finally{await new Promise(r=>server.close(r));}
});
