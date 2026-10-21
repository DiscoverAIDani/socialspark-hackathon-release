import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PLATFORMS,TONES,makeOfflineDrafts} from '../public/platform-drafts.js';
import {reviewText} from '../public/privacy.js';
import {getCopyAvailability} from '../public/copy-availability.js';
import {validateGeneratedDrafts,createNebiusMessages} from '../security/nebius-draft-adapter.mjs';
import {FIXTURE_DRAFTS,FIXTURE_IDEA,runFictionalNebiusRehearsal} from '../security/nebius-fake-session.mjs';
const read = f=>readFile(new URL('../public/'+f,import.meta.url),'utf8');
test('all four platforms available, TikTok hook caption distinct for every tone',()=>{
 assert.deepEqual(PLATFORMS.map(p=>p.id),['facebook','instagram','linkedin','tiktok']);
 for(const tone of TONES){
   const drafts=makeOfflineDrafts('This fictional workshop welcomes beginners.',tone);
   assert.deepEqual(Object.keys(drafts),PLATFORMS.map(p=>p.id));
   assert.equal(new Set(Object.values(drafts)).size,4);
   assert.match(drafts.tiktok,/workshop welcomes beginners/);
   assert.match(drafts.tiktok,/#/);
 }
});
test('TikTok independently blocks copy when phone number is added, then requires acknowledgment',()=>{
 const drafts=makeOfflineDrafts('A friendly fictional workshop.');
 const contaminated=drafts.tiktok+' Call 916-555-0198.';
 const review=reviewText(contaminated);
 assert.equal(review.concerns,true);
 assert.equal(getCopyAvailability({text:contaminated,review,currentRevision:2,reviewRevision:2,acknowledged:false}).enabled,false);
 assert.equal(getCopyAvailability({text:contaminated,review,currentRevision:2,reviewRevision:2,acknowledged:true}).enabled,true);
 assert.equal(reviewText(drafts.facebook).concerns,false);
});
test('fourth TikTok card includes independent edit, risk, warning, acknowledgment and manual copy controls',async()=>{
 const html=await read('index.html');
 for(const suffix of ['preview','risk','warnings','risk-list','ack','copy','copy-note','outcome','manual-copy','fallback']) assert.match(html,new RegExp('id="studio-'+suffix+'-tiktok"'));
 assert.match(html,/data-platform="tiktok"/);
 assert.match(html,/spark-charge-tiktok/);
 assert.match(html,/Four platform-ready drafts/);
});
test('browser offline rehearsal reviews four results and never auto-applies',async()=>{
 const js=await read('studio-ai-bridge.js');
 assert.match(js,/for\(const \{id:platform,label\} of PLATFORMS\)/);
 assert.match(js,/applyCheck.addEventListener/);
 assert.match(js,/applyReviewedStudioDrafts/);
 assert.match(js,/Four simulated drafts/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});
test('server response validation rejects three-only and accepts safe four-output fixture',()=>{
 const success=validateGeneratedDrafts(JSON.stringify(FIXTURE_DRAFTS),FIXTURE_IDEA);
 assert.equal(success.ok,true);
 assert.equal(Object.keys(success.drafts).length,4);
 const {tiktok,...three}=FIXTURE_DRAFTS;
 assert.equal(validateGeneratedDrafts(JSON.stringify(three),FIXTURE_IDEA).code,'wrong-platform-shape');
 const prompt=createNebiusMessages(FIXTURE_IDEA,'friendly');
 assert.match(prompt[0].content,/TikTok/);
});
test('fake Nebius path validates four drafts and makes zero real network calls',async()=>{
 const result=await runFictionalNebiusRehearsal();
 assert.equal(result.ok,true);assert.equal(result.platformCount,4);
 assert.equal(result.realNetworkCalls,0);assert.equal(result.creditsSpent,0);
});
test('desktop 2x2 layout with one-column mobile and accessible motion preference',async()=>{
 const css=await read('styles.css');
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:850px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
