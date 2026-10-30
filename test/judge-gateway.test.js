import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {JUDGE_CLIENT_SCRIPT} from '../judge-gateway/judge-page.mjs';
import {createJudgeGateway} from '../judge-gateway/worker.mjs';
import {FIXTURE_DRAFTS} from '../security/nebius-fake-session.mjs';

const ORIGIN='https://judges.socialspark.example';
const CODE='a'.repeat(64); // Fake invite, NEVER a usable judge credential
const HASH=createHash('sha256').update(CODE).digest('hex');
const GOOD_TIME=Date.parse('2026-11-12T12:00:00Z');
const JUDGE_PAYLOAD={promptId:'workshop',tone:'friendly',confirmed:true,turnstileToken:'FAKE_TURNSTILE_TOKEN'};
const MODEL='nvidia/Nemotron-3_5-Lightning';

class FakeD1{
  constructor(){
    this.enabled=1;
    this.start=Math.floor(Date.parse('2026-11-01T00:00:00Z')/1000);
    this.end=Math.floor(Date.parse('2026-12-15T20:00:00Z')/1000);
    this.max=4;this.used=0;this.active=0;
    this.invites=new Map([[HASH,{enabled:1,expiry:this.end}]]);
    this.tickets=new Map();
  }
  prepare(sql){
    const self=this;
    return {bind(...args){return {run:()=>self.execute(sql,args),first:()=>self.first(sql,args)};},run:()=>self.execute(sql,[])};
  }
  async first(sql,args){
    if(!sql.includes('SELECT token_sha256 FROM judge_invites'))throw Error('Unexpected fake D1 read');
    const [hash,now]=args;
    const invite=this.invites.get(hash);
    return invite?.enabled===1&&invite.expiry>=now?hash:null;
  }
  async execute(sql,args){
    if(sql.includes('INSERT OR IGNORE INTO judge_tickets')){
      const [ticketHash,inviteHash,promptId,tone,expires,secondHash,now,nowAgain]=args;
      const invite=this.invites.get(inviteHash);
      const open=[...this.tickets.values()].filter(t=>!t.consumed&&t.expires>=nowAgain).length;
      const valid=inviteHash===secondHash&&invite?.enabled===1&&invite.expiry>=now&&
        open<20&&!this.tickets.has(ticketHash);
      if(valid)this.tickets.set(ticketHash,{inviteHash,promptId,tone,expires,consumed:false});
      return {success:true,meta:{changes:valid?1:0}};
    }
    if(sql.includes('UPDATE judge_tickets SET consumed=1')){
      const [ticketHash,inviteHash,promptId,tone,now]=args;
      const t=this.tickets.get(ticketHash);
      const valid=t&&!t.consumed&&t.inviteHash===inviteHash&&t.promptId===promptId&&
        t.tone===tone&&t.expires>=now;
      if(valid)t.consumed=true;
      return {success:true,meta:{changes:valid?1:0}};
    }
    if(sql.includes('SET used_requests=used_requests+1')){
      const [now1,now2,hash,now3,ticketHash,linkedHash,promptId,tone,now4]=args;
      const invite=this.invites.get(hash);
      const t=this.tickets.get(ticketHash);
      const valid=this.enabled===1&&this.active===0&&this.used<this.max&&
        now1>=this.start&&now2<=this.end&&invite?.enabled===1&&invite?.expiry>=now3&&
        t&&!t.consumed&&t.inviteHash===linkedHash&&linkedHash===hash&&
        t.promptId===promptId&&t.tone===tone&&t.expires>=now4;
      if(valid){this.used++;this.active=1;}
      return {success:true,meta:{changes:valid?1:0}};
    }
    if(sql.includes('SET request_active=0')){
      const changed=this.active===1;
      if(changed)this.active=0;
      return {success:true,meta:{changes:changed?1:0}};
    }
    throw Error('Unsupported SQL in fake database');
  }
}
function env(db=new FakeD1()){
  return {
    JUDGE_GATE_ENABLED:'EXPLICITLY_APPROVED',
    JUDGE_BILLING_HARD_CAP_CONFIRMED:'YES_PROVIDER_ENFORCED',
    JUDGE_ORIGIN:ORIGIN,JUDGE_MODEL_ID:MODEL,
    NEBIUS_API_KEY:'FAKE_KEY_NOT_FOR_REAL_INFERENCE',
    TURNSTILE_SITE_KEY:'0x4AAAAA_TEST_PUBLIC_KEY',
    TURNSTILE_SECRET:'FAKE_SERVER_SIDE_SECRET',
    DB:db
  };
}
function judgeRequest(data=JUDGE_PAYLOAD,{code=CODE,origin=ORIGIN,site='same-origin',method='POST',contentType='application/json'}={}){
  return new Request(ORIGIN+'/api/generate',{
    method,headers:{Origin:origin,'Sec-Fetch-Site':site,'Authorization':'Bearer '+code,
      'Content-Type':contentType},
    body:method==='POST'?JSON.stringify(data):undefined
  });
}
function previewRequest({code=CODE,origin=ORIGIN,data={promptId:'workshop',tone:'friendly'}}={}){
  return new Request(ORIGIN+'/api/prepare',{
    method:'POST',
    headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Authorization':'Bearer '+code,
      'Content-Type':'application/json'},
    body:JSON.stringify(data)
  });
}
async function approvedRequest(gateway,e,options={}){
  const prepared=await gateway.fetch(previewRequest(options),e);
  assert.equal(prepared.status,200);
  const body=await prepared.json();
  assert.match(body.ticket,/^[a-f0-9]{64}$/);
  assert.equal(body.exactText,'Invite people to a fictional beginner workshop.');
  return judgeRequest({...JUDGE_PAYLOAD,ticket:body.ticket});
}
function fakeTransport({onModel=()=>{},turnstileGood=true,turnstileHostname='judges.socialspark.example',turnstileAction='judge_generate',modelStatus=200,modelBody=FIXTURE_DRAFTS}={}){
  let siteverify=0,provider=0;
  const transport=async (url,request)=>{
    if(url.includes('turnstile/v0/siteverify')){
      siteverify++;
      const params=new URLSearchParams(request.body);
      assert.equal(params.get('secret'),'FAKE_SERVER_SIDE_SECRET');
      assert.equal(params.get('response'),'FAKE_TURNSTILE_TOKEN');
      return Response.json({success:turnstileGood,hostname:turnstileHostname,action:turnstileAction});
    }
    if(url.includes('api.tokenfactory.nebius.com/v1/chat/completions')){
      provider++;
      assert.equal(request.headers.Authorization,'Bearer FAKE_KEY_NOT_FOR_REAL_INFERENCE');
      const payload=JSON.parse(request.body);
      assert.equal(payload.model,MODEL);
      assert.equal(payload.stream,false);
      assert.equal(payload.messages[1].content.includes('fictional beginner workshop'),true);
      await onModel();
      return modelStatus===200
        ?Response.json({choices:[{message:{content:JSON.stringify(modelBody)}}]})
        :new Response('UPSTREAM_FAKE_PRIVATE_BODY',{status:modelStatus});
    }
    throw Error('No external network is permitted in a fake-transport test');
  };
  return {transport,counts:()=>({siteverify,provider})};
}
test('locked by default: no turnstile, database reservation or provider request',async()=>{
  const e=env();delete e.JUDGE_GATE_ENABLED;
  const network=fakeTransport();
  const handler=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const response=await handler.fetch(judgeRequest(),e);
  assert.equal(response.status,503);
  assert.equal(e.DB.used,0);
  assert.deepEqual(network.counts(),{siteverify:0,provider:0});
});
test('refuses activation if operator budget verification is missing',async()=>{
  const e=env();delete e.JUDGE_BILLING_HARD_CAP_CONFIRMED;
  const network=fakeTransport();
  const r=await createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME}).fetch(judgeRequest(),e);
  assert.equal(r.status,503);assert.equal(network.counts().provider,0);
});
test('model retirement ID cannot be configured even with flags enabled',async()=>{
  const e=env();e.JUDGE_MODEL_ID='nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';
  const network=fakeTransport();
  const r=await createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME}).fetch(judgeRequest(),e);
  assert.equal(r.status,503);assert.equal(network.counts().provider,0);
});
test('same-origin and format validation fail closed before challenges and inference',async()=>{
  const e=env(),network=fakeTransport();
  const handler=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const bad=[
    judgeRequest(JUDGE_PAYLOAD,{origin:'https://attacker.example'}),
    judgeRequest(JUDGE_PAYLOAD,{site:'cross-site'}),
    judgeRequest({...JUDGE_PAYLOAD,promptId:'private-user-text'}),
    judgeRequest({...JUDGE_PAYLOAD,confirmed:false}),
    judgeRequest({...JUDGE_PAYLOAD,rawIdea:'my phone is 916-555-0101'}),
    judgeRequest(JUDGE_PAYLOAD,{code:'bad'}),
    judgeRequest(JUDGE_PAYLOAD,{contentType:'text/plain'})
  ];
  for(const request of bad)assert.notEqual((await handler.fetch(request,e)).status,200);
  assert.equal(e.DB.used,0);
  assert.deepEqual(network.counts(),{siteverify:0,provider:0});
});
test('missing or invalid Turnstile result prevents D1 reservation and inference',async()=>{
  const e=env(),network=fakeTransport({turnstileGood:false});
  const handler=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const request=await approvedRequest(handler,e);
  assert.equal((await handler.fetch(request,e)).status,403);
  assert.equal(e.DB.used,0);
  assert.deepEqual(network.counts(),{siteverify:1,provider:0});
});
test('good invite and challenge reserve one request then return four inert drafts',async()=>{
  const e=env(),network=fakeTransport();
  const handler=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const request=await approvedRequest(handler,e);
  const r=await handler.fetch(request,e);
  assert.equal(r.status,200);
  const json=await r.json();
  assert.equal(json.ok,true);assert.equal(json.reviewRequired,true);
  assert.equal(json.autoPublished,false);
  assert.deepEqual(Object.keys(json.drafts),['facebook','instagram','linkedin','tiktok']);
  assert.equal(e.DB.used,1);assert.equal(e.DB.active,0);
  assert.deepEqual(network.counts(),{siteverify:1,provider:1});
  assert.equal(r.headers.get('Cache-Control'),'no-store, max-age=0');
  assert.equal(JSON.stringify(json).includes('FAKE_KEY'),false);
});
test('revoked invite, exhausted quota and expired access deny after challenge',async()=>{
  for(const change of [
    d=>d.invites.get(HASH).enabled=0,
    d=>d.used=d.max,
    d=>d.invites.get(HASH).expiry=d.start
  ]){
    const d=new FakeD1();change(d);
    const network=fakeTransport();
    const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
    const e=env(d);
    const prepare=await gateway.fetch(previewRequest(),e);
    if(prepare.status===200){
      const body=await prepare.json();
      const r=await gateway.fetch(judgeRequest({...JUDGE_PAYLOAD,ticket:body.ticket}),e);
      assert.equal(r.status,429);
    }else assert.equal(prepare.status,429);
    assert.equal(network.counts().provider,0);
  }
});
test('concurrent judge submissions cannot both contact Nebius',async()=>{
  let unblock;
  let started;
  const during=new Promise(resolve=>started=resolve);
  const pause=new Promise(resolve=>unblock=resolve);
  const e=env(),network=fakeTransport({onModel:async()=>{started();await pause;}});
  const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const requestOne=await approvedRequest(gateway,e);
  const requestTwo=await approvedRequest(gateway,e);
  const first=gateway.fetch(requestOne,e);
  await during;
  const second=await gateway.fetch(requestTwo,e);
  assert.equal(second.status,429);assert.equal(network.counts().provider,1);
  unblock();
  assert.equal((await first).status,200);
  assert.equal(e.DB.used,1);assert.equal(e.DB.active,0);
});
test('provider failure burns reservation, is not retried and exposes no provider body',async()=>{
  const e=env(),network=fakeTransport({modelStatus:404});
  const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const request=await approvedRequest(gateway,e);
  const r=await gateway.fetch(request,e);
  assert.equal(r.status,502);
  assert.equal(e.DB.used,1);assert.equal(e.DB.active,0);
  assert.equal(network.counts().provider,1);
  assert.equal((await r.text()).includes('UPSTREAM_FAKE_PRIVATE_BODY'),false);
});
test('unsafe AI output cannot bypass local validation',async()=>{
  const e=env(),network=fakeTransport({
    modelBody:{...FIXTURE_DRAFTS,facebook:'Call 916-555-0111 now!'}
  });
  const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const request=await approvedRequest(gateway,e);
  const r=await gateway.fetch(request,e);
  assert.equal(r.status,502);assert.equal(e.DB.used,1);
});
test('owner exposure cutoff blocks requests after December 15 Pacific time',async()=>{
  const e=env(),network=fakeTransport();
  const cutoff=Date.parse('2026-12-16T08:00:00.000Z');
  const r=await createJudgeGateway({transport:network.transport,clock:()=>cutoff})
    .fetch(judgeRequest(),e);
  assert.equal(r.status,503);assert.equal(network.counts().provider,0);
});
test('page contains no secret, no persisted invite and has CSP with challenge host',async()=>{
  const e=env(),network=fakeTransport();
  const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const page=await gateway.fetch(new Request(ORIGIN+'/'),e);
  const html=await page.text();
  assert.equal(page.status,200);
  assert.match(html,/Judge Evaluation/);
  assert.match(html,/data-action="judge_generate"/);
  assert.match(page.headers.get('Content-Security-Policy'),/frame-src https:\/\/challenges.cloudflare.com/);
  assert.doesNotMatch(html,/FAKE_KEY_NOT_FOR_REAL_INFERENCE|FAKE_SERVER_SIDE_SECRET|a{64}/);
  const script=await gateway.fetch(new Request(ORIGIN+'/judge.js'),e);
  const js=await script.text();
  assert.match(js,/textContent=value/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|document.cookie/);
});

test('single-use ticket is bound to original judge, prompt and tone, and cannot replay',async()=>{
  const e=env(),network=fakeTransport();
  const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const request=await approvedRequest(gateway,e);
  const original=JSON.parse(await request.clone().text());
  const mismatched=await gateway.fetch(judgeRequest({...original,tone:'playful'}),e);
  assert.equal(mismatched.status,429);
  assert.equal(e.DB.used,0);
  const first=await gateway.fetch(request,e);
  assert.equal(first.status,200);
  const replay=await gateway.fetch(judgeRequest(original),e);
  assert.equal(replay.status,429);
  assert.equal(e.DB.used,1);
  assert.equal(network.counts().provider,1);
});
test('preparing does not spend request quota or invoke Nebius',async()=>{
  const e=env(),network=fakeTransport();
  const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  await approvedRequest(gateway,e);
  assert.equal(e.DB.used,0);
  assert.deepEqual(network.counts(),{siteverify:0,provider:0});
});

test('an expired two-minute ticket cannot spend or call the model',async()=>{
  let tick=GOOD_TIME;
  const e=env(),network=fakeTransport();
  const gateway=createJudgeGateway({transport:network.transport,clock:()=>tick});
  const request=await approvedRequest(gateway,e);
  tick+=121000;
  const r=await gateway.fetch(request,e);
  assert.equal(r.status,429);
  assert.equal(e.DB.used,0);
  assert.equal(network.counts().provider,0);
});
test('a challenge finishing after the owner cutoff cannot start billable inference',async()=>{
  let tick=GOOD_TIME;
  const e=env(),network=fakeTransport();
  const transport=async (url,opts)=>{
    const response=await network.transport(url,opts);
    if(url.includes('turnstile/v0/siteverify'))tick=Date.parse('2026-12-16T08:00:00Z');
    return response;
  };
  const gateway=createJudgeGateway({transport,clock:()=>tick});
  const request=await approvedRequest(gateway,e);
  const r=await gateway.fetch(request,e);
  assert.equal(r.status,503);
  assert.equal(e.DB.used,0);
  assert.equal(network.counts().provider,0);
});
test('quota release failure exposes no validated output and leaves system locked',async()=>{
  const d=new FakeD1();
  const prior=d.execute.bind(d);
  d.execute=async (sql,args)=>{
    if(sql.includes('SET request_active=0'))throw Error('simulated database outage');
    return prior(sql,args);
  };
  const e=env(d),network=fakeTransport();
  const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const request=await approvedRequest(gateway,e);
  const r=await gateway.fetch(request,e);
  assert.equal(r.status,503);
  assert.equal(e.DB.used,1);assert.equal(e.DB.active,1);
  assert.equal(network.counts().provider,1);
  assert.equal((await r.text()).includes('facebook'),false);
});

test('a validly formatted but unknown judge token cannot cause even a Turnstile call',async()=>{
  const e=env(),network=fakeTransport();
  const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const prepared=await gateway.fetch(previewRequest(),e);
  assert.equal(prepared.status,200);
  const ticket=(await prepared.json()).ticket;
  const response=await gateway.fetch(
    judgeRequest({...JUDGE_PAYLOAD,ticket},{code:'b'.repeat(64)}),e);
  assert.equal(response.status,403);
  assert.equal(e.DB.used,0);
  assert.deepEqual(network.counts(),{siteverify:0,provider:0});
});
test('generated client JavaScript parses without browser execution',()=>{
  assert.doesNotThrow(()=>new Script(JUDGE_CLIENT_SCRIPT));
});

test('siteverify refuses successful challenges from the wrong hostname or action',async()=>{
  for(const variant of [
    {turnstileHostname:'another-gateway.example'},
    {turnstileAction:'unrelated_action'}
  ]){
    const e=env(),network=fakeTransport(variant);
    const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
    const request=await approvedRequest(gateway,e);
    const response=await gateway.fetch(request,e);
    assert.equal(response.status,403);
    assert.equal(e.DB.used,0);
    assert.deepEqual(network.counts(),{siteverify:1,provider:0});
  }
});
test('oversized JSON request cannot invoke siteverify or reserve spending',async()=>{
  const e=env(),network=fakeTransport();
  const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const request=await approvedRequest(gateway,e);
  const body=JSON.parse(await request.text());
  body.extra='z'.repeat(4000);
  const response=await gateway.fetch(judgeRequest(body),e);
  assert.equal(response.status,400);
  assert.equal(e.DB.used,0);
  assert.deepEqual(network.counts(),{siteverify:0,provider:0});
});
test('revoked invite gets denied before contacting Turnstile',async()=>{
  const e=env(),network=fakeTransport();
  const gateway=createJudgeGateway({transport:network.transport,clock:()=>GOOD_TIME});
  const request=await approvedRequest(gateway,e);
  e.DB.invites.get(HASH).enabled=0;
  const response=await gateway.fetch(request,e);
  assert.equal(response.status,403);
  assert.equal(e.DB.used,0);
  assert.deepEqual(network.counts(),{siteverify:0,provider:0});
});
