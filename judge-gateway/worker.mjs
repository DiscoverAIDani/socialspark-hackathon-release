/**
 * LOCKED, separately deployed Cloudflare Worker for curated, judge-only SocialSpark
 * demonstrations. NEVER wired into the public static site.
 *
 * Defaults deny all inference. No external provider request is possible unless
 * an operator separately configures secrets, a D1 window/cap, and two explicit
 * activation flags. Deploying a Worker alone never grants permission to spend.
 */
import {requestNebiusDrafts} from '../security/nebius-draft-adapter.mjs';
import {inspectMaskedRequest} from '../security/ai-request-validation.mjs';
import {renderJudgePage, JUDGE_CLIENT_SCRIPT} from './judge-page.mjs';
import {JUDGE_SQL} from './sql.mjs';

export const JUDGE_PROMPTS = Object.freeze([
  Object.freeze({id:'workshop',text:'Invite people to a fictional beginner workshop.'}),
  Object.freeze({id:'bookswap',text:'Announce a fictional community book swap.'}),
  Object.freeze({id:'cafe',text:'Share a fictional cafe new seasonal menu.'}),
  Object.freeze({id:'art',text:'Promote a fictional neighborhood art night.'}),
  Object.freeze({id:'cleanup',text:'Invite volunteers to a fictional park cleanup.'}),
  Object.freeze({id:'milestone',text:'Celebrate a fictional small team milestone.'})
]);

const ALLOWED_TONES = new Set(['friendly','professional','playful']);
const MAX_REQUEST_BYTES = 3500;
const MAX_PROVIDER_OUTPUT_BYTES = 12000;
const JUDGE_ACTION = 'judge_generate';
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EXPOSURE_END_EXCLUSIVE = Date.UTC(2026,11,16,8,0,0); // Dec 15, 11:59 PM Pacific.
const SINGLE_TEST_CUTOFF = Date.UTC(2026,9,30,17,30,0); // Oct 30 at 10:30 AM Pacific; expires irrevocably.
// Pin the only reviewed model candidate; reject any runtime substitution or retired model.
const ALLOWED_MODEL = 'nvidia/Nemotron-3_5-Lightning';
const DENY = Object.freeze({ok:false,error:'Unavailable or not authorized.'});

function headers(contentType='application/json; charset=utf-8'){
  return {
    'Content-Type':contentType,
    'Cache-Control':'no-store, max-age=0',
    'Pragma':'no-cache',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'X-Robots-Tag':'noindex, nofollow',
    'Cross-Origin-Resource-Policy':'same-origin',
    'X-Frame-Options':'DENY',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
  };
}
function reply(status,body=DENY){
  return new Response(JSON.stringify(body),{status,headers:headers()});
}
function singleTestMode(env,now){
  return env?.JUDGE_SINGLE_TEST_APPROVAL==='ONE_REQUEST_ONLY_2026_10_30' &&
    env.JUDGE_GATE_ENABLED===undefined &&
    env.JUDGE_BILLING_HARD_CAP_CONFIRMED===undefined &&
    Number.isFinite(now) && now<SINGLE_TEST_CUTOFF-60000;
}
function ready(env,origin,now){
  const generalAuthorized=env?.JUDGE_GATE_ENABLED==='EXPLICITLY_APPROVED' &&
    env?.JUDGE_BILLING_HARD_CAP_CONFIRMED==='YES_PROVIDER_ENFORCED';
  return Boolean(
    env && (generalAuthorized||singleTestMode(env,now)) &&
    env.JUDGE_ORIGIN===origin &&
    origin.startsWith('https://') &&
    typeof env.NEBIUS_API_KEY==='string' && env.NEBIUS_API_KEY.length>=12 &&
    env.JUDGE_MODEL_ID===ALLOWED_MODEL &&
    typeof env.TURNSTILE_SECRET==='string' && env.TURNSTILE_SECRET.length>=10 &&
    typeof env.TURNSTILE_SITE_KEY==='string' &&
    /^[A-Za-z0-9_-]{15,100}$/.test(env.TURNSTILE_SITE_KEY) &&
    env.DB && typeof env.DB.prepare==='function' &&
    Number.isFinite(now) && now<EXPOSURE_END_EXCLUSIVE-60000
  );
}
async function boundedBody(request){
  const reader=request.body?.getReader?.();
  if(!reader) return null;
  const pieces=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_REQUEST_BYTES){await reader.cancel();return null;}
      pieces.push(value);
    }
    const joined=new Uint8Array(total);
    let pos=0;
    for(const part of pieces){joined.set(part,pos);pos+=part.length;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));
  }catch{return null;}
}
function inputChoice(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.getPrototypeOf(body)!==Object.prototype)return null;
  if(Object.keys(body).sort().join(',')!=='confirmed,promptId,ticket,tone,turnstileToken')return null;
  if(body.confirmed!==true||typeof body.promptId!=='string'||!ALLOWED_TONES.has(body.tone))return null;
  if(typeof body.turnstileToken!=='string'||body.turnstileToken.length<8||body.turnstileToken.length>2048)return null;
  if(typeof body.ticket!=='string'||!(/^[a-f0-9]{64}$/.test(body.ticket)))return null;
  const prompt=JUDGE_PROMPTS.find(p=>p.id===body.promptId);
  if(!prompt)return null;
  const payload={maskedText:prompt.text,currentRevision:1,approvedRevision:1,maskValidated:true,explicitConsent:true};
  if(!inspectMaskedRequest(payload).ok)return null;
  return {prompt,payload,tone:body.tone,token:body.turnstileToken,ticket:body.ticket};
}
function previewChoice(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
     Object.getPrototypeOf(body)!==Object.prototype)return null;
  if(Object.keys(body).sort().join(',')!=='promptId,tone')return null;
  if(!ALLOWED_TONES.has(body.tone)||typeof body.promptId!=='string')return null;
  const prompt=JUDGE_PROMPTS.find(p=>p.id===body.promptId);
  if(!prompt)return null;
  return {prompt,tone:body.tone};
}
function freshTicket(){
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function createTicket(db,ticketHash,inviteHash,promptId,tone,nowSec){
  const result=await db.prepare(JUDGE_SQL.createTicket).bind(ticketHash,inviteHash,promptId,tone,nowSec+120,inviteHash,nowSec,nowSec).run();
  return result?.success===true && result?.meta?.changes===1;
}
async function consumeTicket(db,ticketHash,inviteHash,promptId,tone,nowSec){
  const result=await db.prepare(JUDGE_SQL.consumeTicket).bind(ticketHash,inviteHash,promptId,tone,nowSec).run();
  return result?.success===true && result?.meta?.changes===1;
}
async function sha256hex(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function validInvite(db,inviteHash,nowSec){
  // Reject unknown/revoked/expired invites before external challenge verification.
  // This is only a cheap precheck: the atomic D1 reservation checks again later.
  const tokenHash=await db.prepare(JUDGE_SQL.validInvite).bind(inviteHash,nowSec).first('token_sha256');
  return tokenHash===inviteHash;
}
async function verifyTurnstile(transport,token,env,hostname){
  const data=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:token});
  try{
    const result=await transport(SITEVERIFY_URL,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:data.toString(),
      signal:AbortSignal.timeout(7000),
      redirect:'error'
    });
    if(!result?.ok)return false;
    const report=await result.json();
    return report?.success===true && report.hostname===hostname && report.action===JUDGE_ACTION;
  }catch{return false;}
}
async function reserve(db,hashedCode,ticketHash,promptId,tone,nowSec,oneTime=false){
  // Single atomic SQLite UPDATE. Authorization, fixed time window, lifetime
  // request cap and global one-request-at-a-time guard are checked together.
  // "Used" is incremented BEFORE any potentially billable request. Never refund
  // it, including on errors. Fail closed on unknown metadata or DB failures.
  const statement=oneTime?JUDGE_SQL.singleTestReserve:JUDGE_SQL.reserve;
  const result=await db.prepare(statement).bind(nowSec,nowSec,hashedCode,nowSec,ticketHash,hashedCode,promptId,tone,nowSec).run();
  return result?.success===true && result?.meta?.changes===1;
}
async function release(db){
  // If D1 fails, leave the shared gate closed instead of assuming the
  // in-flight billable request completed safely.
  const result=await db.prepare(JUDGE_SQL.release).run();
  return result?.success===true && result?.meta?.changes===1;
}
function htmlHeaders(){
  return {
    ...headers('text/html; charset=utf-8'),
    'Content-Security-Policy':"default-src 'none'; script-src 'self' https://challenges.cloudflare.com; "+
      "style-src 'self' 'unsafe-inline'; frame-src https://challenges.cloudflare.com; "+
      "connect-src 'self' https://challenges.cloudflare.com; img-src 'self' data: https://challenges.cloudflare.com; "+
      "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  };
}
function scriptHeaders(){
  return {...headers('text/javascript; charset=utf-8'),
    'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
}
export function createJudgeGateway({transport=fetch,clock=()=>Date.now()}={}){
  return {
    async fetch(request,env){
      const url=new URL(request.url);
      const tick=clock();
      const active=ready(env,url.origin,tick);
      if(url.pathname==='/'&&request.method==='GET'){
        if(!active)return reply(503);
        return new Response(renderJudgePage(env.TURNSTILE_SITE_KEY,JUDGE_PROMPTS),
          {status:200,headers:htmlHeaders()});
      }
      if(url.pathname==='/judge.js'&&request.method==='GET'){
        if(!active)return reply(503);
        return new Response(JUDGE_CLIENT_SCRIPT,{status:200,headers:scriptHeaders()});
      }
      if(url.pathname!=='/api/generate'&&url.pathname!=='/api/prepare')return reply(404);
      if(request.method!=='POST')return reply(405);
      if(!active)return reply(503);
      // A bearer code in the Authorization header, not cookies/URLs, means a
      // cross-origin form cannot authenticate. Enforce Origin additionally.
      if(request.headers.get('Origin')!==url.origin ||
         !['same-origin',null].includes(request.headers.get('Sec-Fetch-Site')))return reply(403);
      const auth=request.headers.get('Authorization')??'';
      if(!/^Bearer [a-f0-9]{64}$/.test(auth))return reply(403);
      if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')??''))return reply(415);
      const data=await boundedBody(request);
      if(url.pathname==='/api/prepare'){
        const choice=previewChoice(data);
        if(!choice)return reply(400);
        const digest=await sha256hex(auth.slice(7));
        const ticket=freshTicket();
        let stored=false;
        try{
          stored=await createTicket(env.DB,await sha256hex(ticket),digest,
            choice.prompt.id,choice.tone,Math.floor(tick/1000));
        }catch{return reply(503);}
        if(!stored)return reply(429);
        // Prompt and tone come from trusted server-side catalog, not client text.
        return reply(200,{ok:true,ticket,promptId:choice.prompt.id,
          tone:choice.tone,exactText:choice.prompt.text,expiresInSeconds:120});
      }
      const selected=inputChoice(data);
      if(!selected)return reply(400);
      const digest=await sha256hex(auth.slice(7));
      // Never allow unauthenticated traffic to cause external Siteverify calls.
      try{
        if(!await validInvite(env.DB,digest,Math.floor(tick/1000)))return reply(403);
      }catch{return reply(503);}
      const ok=await verifyTurnstile(transport,selected.token,env,url.hostname);
      if(!ok)return reply(403);
      const ticketHash=await sha256hex(selected.ticket);
      const reservationTime=clock();
      if(!ready(env,url.origin,reservationTime))return reply(503);
      const nowSec=Math.floor(reservationTime/1000);
      let reserved=false;
      try{
        reserved=await reserve(env.DB,digest,ticketHash,selected.prompt.id,selected.tone,nowSec,singleTestMode(env,reservationTime));
      }catch{return reply(503);}
      if(!reserved)return reply(429);
      let ticketConsumed=false;
      try{
        ticketConsumed=await consumeTicket(env.DB,ticketHash,digest,
          selected.prompt.id,selected.tone,nowSec);
      }catch{/* fail closed, consume quota but no paid call */}
      if(!ticketConsumed){
        try{await release(env.DB);}catch{/* locked gate needs manual inspection */}
        return reply(503);
      }
      // Check again immediately before the external inference call. Block
      // late requests even if challenge verification crossed the cutoff.
      if(!ready(env,url.origin,clock())){
        try{await release(env.DB);}catch{/* locked gate needs manual inspection */}
        return reply(503);
      }
      let modelResult;
      try{
        modelResult=await requestNebiusDrafts({
          payload:selected.payload,tone:selected.tone,
          key:env.NEBIUS_API_KEY,model:ALLOWED_MODEL,
          serverAuthorization:true,providerApproval:true,
          fetchImpl:transport,timeoutMs:15000
        });
      }catch{
        modelResult={ok:false};
      }
      let released=false;
      try{released=await release(env.DB);}
      catch{/* fail closed; an operator must inspect the locked gate */}
      if(!released)return reply(503);
      if(!modelResult?.ok)return reply(502);
      const drafts=modelResult.drafts;
      if(!drafts||JSON.stringify(drafts).length>MAX_PROVIDER_OUTPUT_BYTES)return reply(502);
      return reply(200,{ok:true,promptId:selected.prompt.id,tone:selected.tone,drafts,reviewRequired:true,autoPublished:false});
    }
  };
}
export default createJudgeGateway();
