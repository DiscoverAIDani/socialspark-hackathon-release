/** Four-card LIVE integration remains inert unless the separately unlocked owner
 * localhost process marks the HTML as live. Default preview makes ZERO requests.
 * This is a developer-only fictional browser trial, not a production gateway.
 */
import {createMaskPreview} from './masking.js';
import {reviewText} from './privacy.js';
import {studioSnapshot,applyReviewedStudioDrafts} from './studio.js';
import {PLATFORMS} from './platform-drafts.js';
const $=id=>document.getElementById(id);
const isOwnerMode=document.documentElement.dataset.socialsparkOwnerLive==='yes';
if(isOwnerMode){
  const fixture="Announce the grand opening of a fictional neighborhood shop. Invite customers to visit. Do not invent an address, phone number, website, opening date, business hours, or prices. The owner will add approved public contact details manually after reviewing the drafts.";
  const idea=$('studio-idea'),tone=$('studio-tone'),panel=$('owner-live-panel');
  const exact=$('owner-live-exact'),approval=$('owner-live-consent'),requestButton=$('owner-live-request');
  const status=$('owner-live-status'),review=$('owner-live-review'),posts=$('owner-live-posts');
  const applyCheck=$('owner-live-apply-check'),applyButton=$('owner-live-apply');
  panel.hidden=false;
  const intro=document.querySelector('.spark-hero-copy p:last-child');
  if(intro)intro.textContent='One idea. Four platform drafts. Owner-only NVIDIA browser test is potentially billable; explicit authorization required.';
  const state=$('studio-ai-preflight');
  if(state){const note=state.querySelector('.studio-ai-state');if(note)note.textContent='OWNER LIVE TRIAL · Nothing sent';}
  const tip=document.querySelector('.studio-tip');
  if(tip)tip.textContent='Owner-only live trial: sample drafts are local templates, while separately consented NVIDIA drafts come from Nebius. No automatic publishing. Review all results.';
  const prepNote=$('studio-ai-preflight-note');
  if(prepNote)prepNote.textContent='Owner live trial enabled in this server process. Real requests require separate review and consent below; potentially billable.';
  const footer=document.querySelector('main > footer');
  if(footer)footer.textContent='Owner-only potentially billable NVIDIA browser trial · Fixed fictional text only · No publishing';
  let snapshot=null,busy=false,consumed=false,pending=null;
  const say=text=>{status.textContent=text;};
  function reset(){
    snapshot=null;pending=null;exact.value='';approval.checked=false;approval.disabled=true;
    requestButton.disabled=true;review.hidden=true;posts.replaceChildren();applyCheck.checked=false;applyButton.disabled=true;
    if(!consumed)say('Nothing sent. The one-request live trial requires an exact preview and separate approval.');
  }
  const unchanged=s=>{
    const current=studioSnapshot();return !!s&&s.idea===current.idea&&s.tone===current.tone&&s.changeSequence===current.changeSequence;
  };
  idea.addEventListener('input',reset);
  tone.addEventListener('change',reset);
  $('studio-create').addEventListener('click',reset);
  $('studio-clear').addEventListener('click',reset);
  $('owner-live-example').addEventListener('click',()=>{
    if(busy||consumed)return;
    idea.value=fixture;idea.dispatchEvent(new Event('input',{bubbles:true}));
    tone.value='friendly';tone.dispatchEvent(new Event('change',{bubbles:true}));
    say('Fictional shop idea loaded. Review the exact text before consenting. No request sent.');
  });
  $('owner-live-preview').addEventListener('click',()=>{
    if(busy||consumed)return;
    reset();
    if(idea.value!==fixture||tone.value!=='friendly') {say('Only the fixed fictional shop announcement with Friendly tone is permitted. No request sent.');return;}
    try {
      const local=reviewText(idea.value),mask=createMaskPreview(idea.value);
      if(!local.complete||local.concerns||!mask.validation.passedKnownPatterns||mask.replacements.length||mask.maskedText!==fixture){say('Local screening failed; no text sent.');return;}
      exact.value=mask.maskedText;snapshot=studioSnapshot();approval.disabled=false;
      say('Exact fictional preview ready. Nothing sent. Approving may incur a Nebius charge.');
    }catch{say('Preview validation failed. No request sent.');}
  });
  approval.addEventListener('change',()=>{requestButton.disabled=!approval.checked||!snapshot||busy||consumed;});
  async function jsonRequest(url,body,csrf){
    const response=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
      headers:{'Content-Type':'application/json','X-SocialSpark-Csrf':csrf},body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok||!data.ok)throw Error('request-rejected');
    return data;
  }
  requestButton.addEventListener('click',async()=>{
    if(!approval.checked||busy||consumed||!unchanged(snapshot)||exact.value!==fixture)return;
    busy=true;consumed=true;requestButton.disabled=true;
    say('One authorized live attempt in progress. A charge is possible even if it fails. Do not retry.');
    try {
      const response=await fetch('/api/owner-live/session',{credentials:'same-origin',cache:'no-store',redirect:'error'});
      if(!response.ok)throw Error('session-unavailable');
      const session=await response.json();
      if(session.mode!=='owner-live'||session.scenario!==fixture||session.used||typeof session.csrf!=='string')throw Error('trial-unavailable');
      if(!approval.checked||!unchanged(snapshot))throw Error('input-changed');
      const input={maskedText:exact.value,revision:1,tone:'friendly'};
      const preflight=await jsonRequest('/api/owner-live/prepare',input,session.csrf);
      if(!approval.checked||!unchanged(snapshot))throw Error('input-changed');
      const result=await jsonRequest('/api/owner-live/complete',{...input,ticket:preflight.ticket,confirm:'LIVE OWNER FICTIONAL REQUEST'},session.csrf);
      if(result.mode!=='owner-live'||result.providerAttempts!==1||!result.drafts||Object.keys(result.drafts).length!==4||
         !PLATFORMS.every(({id})=>typeof result.drafts[id]==='string'&&result.drafts[id].trim()))throw Error('invalid-live-response');
      if(!unchanged(snapshot))throw Error('input-changed');
      pending={drafts:result.drafts,snapshot};
      posts.replaceChildren();
      for(const {id,label} of PLATFORMS){
        const card=document.createElement('div');card.className='bridge-result';
        const heading=document.createElement('strong');heading.textContent=label+' · NVIDIA NEMOTRON';
        const text=document.createElement('p');text.textContent=result.drafts[id];
        card.append(heading,text);posts.append(card);
      }
      review.hidden=false;
      say('One real model response returned and validated locally. Review four drafts before applying. Add any approved public phone or address manually afterwards; no publishing.');
    }catch{say('The owner live trial did not return four validated drafts. It may have incurred a charge. Do NOT retry or delete the attempt lock. Existing cards are unchanged.');}
    finally{busy=false;requestButton.disabled=true;}
  });
  applyCheck.addEventListener('change',()=>{applyButton.disabled=!applyCheck.checked||!pending||!unchanged(pending.snapshot);});
  applyButton.addEventListener('click',()=>{
    if(!pending||!applyCheck.checked||!unchanged(pending.snapshot))return;
    const ok=applyReviewedStudioDrafts({results:pending.drafts,snapshot:pending.snapshot,source:'owner-live'});
    pending=null;applyCheck.checked=false;applyButton.disabled=true;
    say(ok?'Four reviewed NVIDIA drafts applied. Recheck privacy and facts before copying. No publishing.':'Idea changed; drafts were not applied.');
  });
}
