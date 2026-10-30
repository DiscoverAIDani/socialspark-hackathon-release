/** Standalone judge-only UI; contains no API secret, no token persistence. */
function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,character=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[character]);
}
export function renderJudgePage(siteKey,prompts){
  const options=prompts.map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.text)+'</option>').join('\n');
  return '<!doctype html><html lang="en"><head>'+
  '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
  '<meta name="robots" content="noindex,nofollow">'+
  '<title>SocialSpark — Invited Judge Evaluation</title>'+
  '<style>'+
  '*{box-sizing:border-box}body{margin:0;background:#111326;color:#eef0ff;font:16px/1.5 system-ui,-apple-system,sans-serif}'+
  'main{width:min(880px,94vw);margin:3rem auto;padding:1.8rem;border:1px solid #394063;background:#191e35;border-radius:18px}'+
  'h1{font-size:clamp(1.7rem,4vw,2.5rem);margin:0 0 .5rem}h2{font-size:1.1rem}p{color:#c3cce7}label{display:block;font-weight:600;margin:1rem 0 .4rem}'+
  'input,select,button{font:inherit;width:100%;min-height:46px;padding:.65rem;border-radius:9px}input,select{background:#f5f7ff;color:#101525;border:2px solid transparent}'+
  'button{color:#fff;background:#5849c5;border:0;font-weight:700;cursor:pointer;margin-top:1rem}button:disabled{opacity:.5;cursor:not-allowed}'+
  '.note{font-size:.9rem}.notice{padding:1rem;border:1px solid #4e577f;border-radius:10px}'+
  '.check{display:flex;gap:.75rem;align-items:flex-start;font-weight:400}.check input{width:24px;min-height:24px;margin:0}'+
  '.status{min-height:2rem;padding:.5rem 0}section{margin-top:1.8rem}article{background:#232945;padding:1rem;margin:1rem 0;border-radius:10px;border:1px solid #444e76}'+
  'article p{white-space:pre-wrap;color:#edf0ff;overflow-wrap:anywhere}'+
  '@media(max-width:600px){main{padding:1rem;margin:1rem auto}}'+
  '</style>'+
  '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>'+
  '<script src="/judge.js" defer></script>'+
  '</head><body><main>'+
  '<h1>SocialSpark — Judge Evaluation</h1>'+
  '<p>Private, invite-only demonstration using NVIDIA inference through Nebius Token Factory.</p>'+
  '<div class="notice"><strong>Fictional prompts only.</strong> Please do not enter personal data or real posts. '+
  'Each approved request creates four AI-assisted drafts for Facebook, Instagram, LinkedIn, and TikTok. '+
  'Drafts are for review; nothing is automatically published or copied.</div>'+
  '<form id="judge-form" autocomplete="off">'+
  '<label for="judge-code">Invitation code (shared privately)</label>'+
  '<input type="password" id="judge-code" name="judge-code" autocomplete="off" spellcheck="false" required minlength="64" maxlength="64">'+
  '<label for="prompt">Select a fictional demonstration</label>'+
  '<select id="prompt" name="prompt">'+options+'</select>'+
  '<label for="tone">Choose the writing tone</label>'+
  '<select id="tone" name="tone"><option value="friendly">Friendly</option>'+
  '<option value="professional">Professional</option><option value="playful">Playful</option></select>'+
  '<button id="preview" type="button">Review exact fictional prompt first</button>'+ 
  '<p id="exact-preview" role="status" aria-live="polite">No request approved yet.</p>'+ 
  '<label class="check" for="confirm"><input type="checkbox" id="confirm" required disabled>'+
  '<span>I reviewed the selected fictional prompt and approve one Nebius/NVIDIA model request. '+
  'I understand this is a live AI request and that I must review all drafts before using them.</span></label>'+
  '<div class="cf-turnstile" data-sitekey="'+escapeHtml(siteKey)+'" data-action="judge_generate" data-theme="dark"></div>'+
  '<button id="generate" type="submit">Generate four AI drafts</button>'+
  '<p id="status" class="status" role="status" aria-live="polite">No AI request made.</p>'+
  '</form>'+
  '<section id="results" hidden><h2>Drafts to review</h2><p class="note">These results are unverified drafts, not published posts.</p>'+
  '<div id="drafts"></div></section>'+
  '<p class="note">One-time challenge verification, a private invitation and a limited global request allowance protect this demonstration. '+
  'Your access code is not stored in this browser. Review all output for accuracy, safety, and privacy.</p>'+
  '</main></body></html>';
}

/** Plain script with no browser token storage or client-side model key. */
export const JUDGE_CLIENT_SCRIPT = String.raw`
'use strict';
(() => {
  const form=document.getElementById('judge-form');
  const button=document.getElementById('generate');
  const status=document.getElementById('status');
  const drafts=document.getElementById('drafts');
  const results=document.getElementById('results');
  let sending=false;
  let preparing=false;
  let ticket=null;
  const confirm=document.getElementById('confirm');
  const preview=document.getElementById('preview');
  const exact=document.getElementById('exact-preview');
  function invalidate(){
    ticket=null;
    confirm.checked=false;
    confirm.disabled=true;
    exact.textContent='Select Review again for a new, exact prompt approval.';
  }
  for(const id of ['judge-code','prompt','tone']){
    document.getElementById(id).addEventListener('input',invalidate);
    document.getElementById(id).addEventListener('change',invalidate);
  }
  preview.addEventListener('click',async()=>{
    if(sending||preparing)return;
    invalidate();
    const code=document.getElementById('judge-code').value.trim();
    const promptId=document.getElementById('prompt').value;
    const tone=document.getElementById('tone').value;
    if(!/^[a-f0-9]{64}$/.test(code)){
      exact.textContent='Enter a valid private invitation code first.';return;
    }
    preparing=true;preview.disabled=true;
    try{
      const response=await fetch('/api/prepare',{
        method:'POST',redirect:'error',cache:'no-store',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+code},
        body:JSON.stringify({promptId,tone})
      });
      const data=await response.json();
      if(!response.ok||data.ok!==true||!/^[a-f0-9]{64}$/.test(data.ticket)||
         data.promptId!==promptId||data.tone!==tone){
           const e=Error('prepare-failed');e.status=response.status;throw e;
         }
      ticket=data.ticket;
      exact.textContent='Exact text to Nebius (fictional): '+data.exactText+
        ' | Tone: '+tone+'. Review before approving. This ticket expires in two minutes.';
      confirm.disabled=false;
    }catch(err){
      invalidate();
      // Report only the HTTP status class; never show the invite, ticket or secret.
      const safeStatus=err?.status && [400,403,405,415,429,503].includes(err.status) ? ' (HTTP '+err.status+')' : '';
      exact.textContent='The invitation could not prepare a request'+safeStatus+'. No provider call made.';
    }finally{preparing=false;preview.disabled=false;}
  });
  const platforms=[['facebook','Facebook'],['instagram','Instagram'],['linkedin','LinkedIn'],['tiktok','TikTok']];
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(sending)return;
    const code=document.getElementById('judge-code').value.trim();
    const promptId=document.getElementById('prompt').value;
    const tone=document.getElementById('tone').value;
    const confirmed=confirm.checked;
    const challenge=form.querySelector('input[name="cf-turnstile-response"]')?.value||'';
    if(!/^[a-f0-9]{64}$/.test(code)||!confirmed||!ticket||!challenge){
      status.textContent='Enter the invite code, approve the fictional example, and complete the challenge.';
      return;
    }
    sending=true;
    button.disabled=true;
    status.textContent='Requesting one set of fictional AI drafts. This may use a reserved paid inference request.';
    results.hidden=true;
    drafts.replaceChildren();
    try{
      const response=await fetch('/api/generate',{
        method:'POST',redirect:'error',cache:'no-store',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+code},
        body:JSON.stringify({promptId,tone,ticket,confirmed:true,turnstileToken:challenge})
      });
      const data=await response.json();
      if(!response.ok||data.ok!==true||!data.drafts)throw Error('request-denied');
      for(const [id,label] of platforms){
        const value=data.drafts[id];
        if(typeof value!=='string')throw Error('invalid-output');
        const card=document.createElement('article');
        const title=document.createElement('h2');
        const body=document.createElement('p');
        title.textContent=label;
        body.textContent=value; // Never interpret AI output as HTML
        card.append(title,body);
        drafts.append(card);
      }
      status.textContent='Four AI drafts returned. Review carefully. No automatic posting.';
      results.hidden=false;
    }catch{
      status.textContent='The request was unavailable or did not pass safety checks. No drafts were applied. Do not retry automatically.';
    }finally{
      sending=false;
      button.disabled=false;
      invalidate();
      // Turnstile tokens are single-use; require fresh user action to retry.
      if(typeof window.turnstile?.reset==='function')window.turnstile.reset();
    }
  });
})();
`;
