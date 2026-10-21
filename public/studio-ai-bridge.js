/** Explicit user-directed OFFLINE browser-to-server rehearsal. Never sends real posts. */
import {createMaskPreview} from './masking.js';
import {reviewText} from './privacy.js';
import {studioSnapshot,applyReviewedStudioDrafts} from './studio.js';
import {PLATFORMS} from './platform-drafts.js';
const $=id=>document.getElementById(id);
const sample='Invite people to a fictional beginner workshop.';
const idea=$('studio-idea'), tone=$('studio-tone');
const exact=$('bridge-exact'), approval=$('bridge-consent'), requestButton=$('bridge-request');
const status=$('bridge-status'), review=$('bridge-review'), posts=$('bridge-posts'), applyCheck=$('bridge-apply-check'), applyButton=$('bridge-apply');
let prepared=null;
let busy=false;
let consumed=false;
let pending=null;
const say=text=>{status.textContent=text;};
function reset(){
  prepared=null;pending=null;exact.value='';approval.checked=false;approval.disabled=true;
  requestButton.disabled=true;review.hidden=true;posts.replaceChildren();applyCheck.checked=false;applyButton.disabled=true;
  if(!consumed)say('No request made. Real AI is disabled in this version.');
}
idea.addEventListener('input',reset);
tone.addEventListener('change',reset);
$('studio-create').addEventListener('click',reset);
$('studio-clear').addEventListener('click',reset);
$('bridge-example').addEventListener('click',()=>{
  if(busy||consumed)return;
  idea.value=sample;idea.dispatchEvent(new Event('input',{bubbles:true}));
  tone.value='friendly';tone.dispatchEvent(new Event('change',{bubbles:true}));
  say('Fixed fictional test idea entered. Preview it before using the local mock.');
});
$('bridge-preview').addEventListener('click',()=>{
  if(busy||consumed)return;
  reset();
  if(idea.value!==sample||tone.value!=='friendly') {say('Offline mock supports only the fixed fictional workshop example and Friendly tone. No text sent.');return;}
  try{
    const check=reviewText(idea.value),mask=createMaskPreview(idea.value);
    if(!check.complete||check.concerns||!mask.validation.passedKnownPatterns||mask.replacements.length||mask.maskedText!==sample){say('Local review not clear; no text sent.');return;}
    exact.value=mask.maskedText;approval.disabled=false;
    prepared=studioSnapshot();say('Preview ready. Check the exact text yourself; no request has been sent yet.');
  }catch{say('Could not validate local preview. No request sent.');}
});
approval.addEventListener('change',()=>{requestButton.disabled=!approval.checked||!prepared||busy||consumed;});
function unchanged(s){const current=studioSnapshot();return !!s && s.idea===current.idea&&s.tone===current.tone&&s.changeSequence===current.changeSequence;}
async function jsonRequest(path,payload,csrf){
  const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-SocialSpark-Csrf':csrf},body:JSON.stringify(payload),cache:'no-store',redirect:'error'});
  const data=await response.json();
  if(!response.ok||!data.ok)throw Error(data.code||'request-rejected');
  return data;
}
requestButton.addEventListener('click',async()=>{
  if(busy||consumed||!prepared||!approval.checked||!unchanged(prepared)||exact.value!==sample)return;
  busy=true;requestButton.disabled=true;say('Requesting one LOCAL simulated response. No NVIDIA calls.');
  try{
    const sessionResponse=await fetch('/api/mock/session',{credentials:'same-origin',cache:'no-store',redirect:'error'});
    if(!sessionResponse.ok)throw Error('offline-rehearsal-not-started');
    const session=await sessionResponse.json();
    if(session.mode!=='offline-mock'||session.scenario!==sample||typeof session.csrf!=='string')throw Error('offline-rehearsal-not-verified');
    if(!unchanged(prepared)||!approval.checked)throw Error('idea-changed');
    const payload={maskedText:exact.value,revision:1,tone:'friendly'};
    const first=await jsonRequest('/api/mock/prepare',payload,session.csrf);
    if(!unchanged(prepared)||!approval.checked)throw Error('idea-changed');
    const result=await jsonRequest('/api/mock/complete',{...payload,ticket:first.ticket,confirm:'OFFLINE MOCK ONLY'},session.csrf);
    consumed=true;
    if(result.mode!=='offline-mock'||result.providerRequests!==0||result.creditsSpent!==0||!result.drafts)throw Error('unexpected-response');
    if(!unchanged(prepared))throw Error('idea-changed-after-response');
    pending={drafts:result.drafts,snapshot:prepared};
    posts.replaceChildren();
    for(const {id:platform,label} of PLATFORMS){
      const card=document.createElement('div');card.className='bridge-result';
      const title=document.createElement('strong');title.textContent=label+' · OFFLINE MOCK';
      const content=document.createElement('p');content.textContent=result.drafts[platform]??'';
      card.append(title,content);posts.appendChild(card);
    }
    review.hidden=false;say('Four simulated drafts returned locally. Review all four; none were applied. No credits spent.');
  }catch{say('Offline rehearsal unavailable or rejected. No automatic retry. Original drafts have not changed.');}
  finally{busy=false;requestButton.disabled=true;}
});
applyCheck.addEventListener('change',()=>{applyButton.disabled=!applyCheck.checked||!pending||!unchanged(pending.snapshot);});
applyButton.addEventListener('click',()=>{
  if(!pending||!applyCheck.checked||!unchanged(pending.snapshot))return;
  const ok=applyReviewedStudioDrafts({results:pending.drafts,snapshot:pending.snapshot,source:'offline-mock'});
  pending=null;applyButton.disabled=true;applyCheck.checked=false;
  say(ok?'Four explicitly reviewed OFFLINE MOCK drafts applied. No real AI or posting.':'The studio changed before applying; drafts were not replaced.');
});
