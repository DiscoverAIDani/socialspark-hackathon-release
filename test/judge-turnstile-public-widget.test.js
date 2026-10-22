import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  JUDGE_TURNSTILE_PUBLIC,isExpectedJudgePageOrigin
} from '../judge-preview/turnstile-public-config.mjs';
import {
  createOfflineJudgeTurnstileController
} from '../judge-preview/turnstile-browser-controller.mjs';
import {TURNSTILE_JUDGE_ACTION}
  from '../cloudflare/judge-turnstile-core.mjs';

const ORIGIN='https://'+JUDGE_TURNSTILE_PUBLIC.hostname;
function fakeTurnstile({synchronousToken=null}={}){
  const records={renderCalls:0,resets:0,removes:0,config:null,element:null};
  const api={
    render(element,options){
      records.renderCalls++;records.element=element;records.config=options;
      if(synchronousToken!==null)options.callback(synchronousToken);
      return 'widget-fake-id-1';
    },
    reset(id){assert.equal(id,'widget-fake-id-1');records.resets++;},
    remove(id){assert.equal(id,'widget-fake-id-1');records.removes++;}
  };
  return {api,records};
}

test('public site key and server action match the exact configured hostname',()=>{
  assert.equal(JUDGE_TURNSTILE_PUBLIC.siteKey,'0x4AAAAAAFgWEGHuwe3pfZTO');
  assert.equal(JUDGE_TURNSTILE_PUBLIC.hostname,
    'socialspark-hackathon-release.daniellewilcott.workers.dev');
  assert.equal(JUDGE_TURNSTILE_PUBLIC.action,TURNSTILE_JUDGE_ACTION);
  assert.equal(JUDGE_TURNSTILE_PUBLIC.liveAiEnabled,false);
  assert.match(JUDGE_TURNSTILE_PUBLIC.turnstileScript,
    /^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit$/);
  assert.equal(isExpectedJudgePageOrigin(ORIGIN),true);
  for(const origin of [
    'http://'+JUDGE_TURNSTILE_PUBLIC.hostname,
    'https://attacker.invalid',
    ORIGIN+'.attacker.invalid',
    ORIGIN+':444',
    ORIGIN+'/path',
    ORIGIN+'?x=1',
    ORIGIN+'#x',
    'https://user:pass@'+JUDGE_TURNSTILE_PUBLIC.hostname,
    'localhost',undefined
  ]){
    assert.equal(isExpectedJudgePageOrigin(origin),false,String(origin));
  }
});

test('single-use browser token handoff never authorizes paid AI or stores post text',()=>{
  let now=1000;
  const fixture=fakeTurnstile();
  const events=[];
  const ctl=createOfflineJudgeTurnstileController({
    turnstile:fixture.api,element:{id:'fake-el'},pageOrigin:ORIGIN,
    clock:()=>now,onStatus:status=>events.push(status)
  });
  assert.equal(ctl.status(),'not-mounted');
  assert.equal(ctl.mount().ok,true);
  assert.equal(fixture.records.config.sitekey,JUDGE_TURNSTILE_PUBLIC.siteKey);
  assert.equal(fixture.records.config.action,TURNSTILE_JUDGE_ACTION);
  assert.equal(fixture.records.config.execution,'render');
  assert.equal(ctl.status(),'verification-pending');
  const token='FAKE_JUDGE_CHALLENGE_TOKEN_DO_NOT_USE';
  fixture.records.config.callback(token);
  assert.equal(ctl.status(),'verification-token-ready');
  const handed=ctl.takeToken();
  assert.equal(handed.ok,true);
  assert.equal(handed.token,token);
  assert.equal(handed.providerCallsAuthorized,false);
  assert.equal(ctl.takeToken().ok,false);
  // Replaying a callback without a fresh reset is ignored.
  fixture.records.config.callback(token);
  assert.equal(ctl.status(),'token-consumed-awaiting-new-check');
  assert.equal(ctl.takeToken().ok,false);
  assert.equal(ctl.reset().ok,true);
  assert.equal(fixture.records.resets,1);
  fixture.records.config.callback('FRESH_FAKE_TOKEN');
  assert.equal(ctl.takeToken().ok,true);
  assert.equal(ctl.dispose().ok,true);
  assert.equal(fixture.records.removes,1);
  assert.equal(ctl.mount().ok,false);
  assert.equal(ctl.reset().ok,false);
  assert.equal(ctl.status(),'unmounted');
  assert.equal(events.includes(token),false);
  assert.equal(events.every(x=>!x.includes('FAKE_JUDGE')),true);
});

test('expired token, clock skew, and error/timeout all fail closed',()=>{
  let now=10000;
  const f=fakeTurnstile();
  const ctl=createOfflineJudgeTurnstileController({
    turnstile:f.api,element:{},pageOrigin:ORIGIN,clock:()=>now
  });
  assert.equal(ctl.mount().ok,true);
  f.records.config.callback('FAKE_ISSUED_TOKEN');
  now+=300000;
  assert.equal(ctl.status(),'verification-expired');
  assert.equal(ctl.takeToken().ok,false);
  assert.equal(ctl.reset().ok,true);
  f.records.config.callback('FAKE_ISSUED_AGAIN');
  now-=4000;
  assert.equal(ctl.takeToken().ok,false); // backward local clock denied
  assert.equal(ctl.reset().ok,true);
  now+=4000;
  f.records.config.callback('FAKE_NEW_TOKEN');
  f.records.config['error-callback']();
  assert.equal(ctl.takeToken().ok,false);
  assert.equal(ctl.reset().ok,true);
  f.records.config.callback('FAKE_YET_AGAIN');
  f.records.config['timeout-callback']();
  assert.equal(ctl.takeToken().ok,false);
  assert.equal(ctl.reset().ok,true);
  f.records.config.callback('FAKE_FINALLY_READY');
  f.records.config['expired-callback']();
  assert.equal(ctl.takeToken().ok,false);
});

test('malformed challenge, bad origin or widget exceptions cannot become a grant',()=>{
  assert.throws(()=>createOfflineJudgeTurnstileController({
    turnstile:fakeTurnstile().api,element:{},pageOrigin:'http://evil.invalid'
  }),/configuration-unavailable/);
  assert.throws(()=>createOfflineJudgeTurnstileController({
    turnstile:{},element:{},pageOrigin:ORIGIN
  }),/configuration-unavailable/);
  const f=fakeTurnstile();
  const ctl=createOfflineJudgeTurnstileController({
    turnstile:f.api,element:{},pageOrigin:ORIGIN,
    clock:()=>Number.NaN
  });
  assert.equal(ctl.mount().ok,true);
  f.records.config.callback('FAKE');
  assert.equal(ctl.takeToken().ok,false);
  const invalid=fakeTurnstile();
  const ctl2=createOfflineJudgeTurnstileController({
    turnstile:invalid.api,element:{},pageOrigin:ORIGIN,
    clock:()=>1000
  });
  assert.equal(ctl2.mount().ok,true);
  invalid.records.config.callback('INVALID TOKEN WITH SPACES');
  // Space is an ASCII printable character, so use an invalid control character.
  assert.equal(ctl2.takeToken().ok,true);
  ctl2.reset();
  invalid.records.config.callback('HAS_NEWLINE\nNO');
  assert.equal(ctl2.takeToken().ok,false);
  ctl2.reset();
  invalid.records.config.callback('x'.repeat(2049));
  assert.equal(ctl2.takeToken().ok,false);
  const broken=createOfflineJudgeTurnstileController({
    turnstile:{
      render(){throw Error('script blocked by CSP')},
      reset(){},remove(){}
    },element:{},pageOrigin:ORIGIN
  });
  assert.equal(broken.mount().ok,false);
  assert.equal(broken.takeToken().ok,false);
});

test('synchronous verification during render is handled once without token in status',()=>{
  let observed=null;
  const f=fakeTurnstile({synchronousToken:'SYNCHRONOUS_TEST_TOKEN'});
  const ctl=createOfflineJudgeTurnstileController({
    turnstile:f.api,element:{},pageOrigin:ORIGIN,
    clock:()=>1000,onStatus:x=>{observed=x;}
  });
  assert.equal(ctl.mount().ok,true);
  assert.equal(observed,'verification-token-ready');
  assert.equal(ctl.takeToken().token,'SYNCHRONOUS_TEST_TOKEN');
  assert.equal(ctl.takeToken().ok,false);
});

test('production keeps static-only, no connected Turnstile or public token issuer',async()=>{
  const root=new URL('../',import.meta.url);
  const production=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  const headers=await readFile(new URL('public/_headers',root),'utf8');
  const site=await readFile(new URL('public/index.html',root),'utf8');
  assert.equal(Object.hasOwn(production,'main'),false);
  assert.equal(Object.hasOwn(production,'durable_objects'),false);
  assert.match(headers,/connect-src 'none'/);
  assert.match(headers,/script-src 'self'/);
  assert.doesNotMatch(headers,/challenges\.cloudflare\.com/);
  assert.doesNotMatch(site,/challenges\.cloudflare\.com|turnstile-browser-controller/);
  // Nothing here is the real secret, and the config is outside public/.
  const config=await readFile(new URL('judge-preview/turnstile-public-config.mjs',root),'utf8');
  assert.doesNotMatch(config,/TURNSTILE_SECRET_KEY|NEBIUS_API_KEY/);
});
