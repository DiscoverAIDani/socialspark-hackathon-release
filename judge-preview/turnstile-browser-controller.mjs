/**
 * NOT DEPLOYED: dependency-injected Turnstile browser controller for a
 * future restricted SocialSpark judge page.
 *
 * No network requests, post text, storage APIs, logging, or AI calls here.
 * The real Turnstile script must only be loaded by a later separately approved
 * same-origin page. This module does not load external scripts itself.
 *
 * Tokens are ephemeral, single-consumption and expire after 5 minutes.
 * An actual server must independently redeem them via Siteverify and validate
 * the Cloudflare verified hostname, action and timestamp. Widget success alone
 * is NEVER authority to issue a session or spend money.
 */
import {
  JUDGE_TURNSTILE_PUBLIC,isExpectedJudgePageOrigin
} from './turnstile-public-config.mjs';

const VALID_TOKEN=/^[\x21-\x7e]{1,2048}$/;
const invalid=reason=>Object.freeze({ok:false,reason});
const ok=()=>Object.freeze({ok:true});
const STATUS=Object.freeze({
  unmounted:'not-mounted',
  waiting:'verification-pending',
  ready:'verification-token-ready',
  used:'token-consumed-awaiting-new-check',
  expired:'verification-expired',
  error:'verification-failed',
  disposed:'unmounted'
});

/** @param {object} options All dependencies injected, no browser globals. */
export function createOfflineJudgeTurnstileController({
  turnstile,element,pageOrigin,clock=()=>Date.now(),onStatus=()=>{}
}={}){
  if(!isExpectedJudgePageOrigin(pageOrigin)||
     !turnstile||typeof turnstile.render!=='function'||
     typeof turnstile.reset!=='function'||
     typeof turnstile.remove!=='function'||
     !element||typeof clock!=='function'||
     typeof onStatus!=='function')
    throw new TypeError('judge-widget-configuration-unavailable');

  let widgetId=null,token=null,receivedAt=0,disposed=false;
  let status=STATUS.unmounted;

  const clear=next=>{
    token=null;
    receivedAt=0;
    status=next;
    // Status callback is deliberately never passed credentials or tokens.
    try {onStatus(status);} catch {}
  };
  const hasFreshToken=()=>{
    if(!token)return false;
    let now;
    try{now=clock();}catch{return false;}
    return Number.isSafeInteger(now) &&
      now>=receivedAt &&
      now-receivedAt<JUDGE_TURNSTILE_PUBLIC.maxAgeMs;
  };
  const acceptToken=value=>{
    if(disposed||status!==STATUS.waiting)return;
    let now;
    try{now=clock();}catch{clear(STATUS.error);return;}
    if(typeof value!=='string'||!VALID_TOKEN.test(value)||
       !Number.isSafeInteger(now)||now<=0){
      clear(STATUS.error);
      return;
    }
    token=value;
    receivedAt=now;
    status=STATUS.ready;
    try{onStatus(status);}catch{}
  };
  const callback=value=>{
    // A real Turnstile callback may fire synchronously during render()
    // before render() has returned its widget ID. Allow that only during mount.
    if(disposed)return;
    if(status!==STATUS.waiting)return;
    acceptToken(value);
  };

  return Object.freeze({
    mount(){
      if(disposed||widgetId!==null)return invalid('widget-already-mounted-or-closed');
      clear(STATUS.waiting);
      try{
        const returned=turnstile.render(element,{
          sitekey:JUDGE_TURNSTILE_PUBLIC.siteKey,
          action:JUDGE_TURNSTILE_PUBLIC.action,
          theme:'auto',
          size:'normal',
          execution:'render',
          appearance:'always',
          callback,
          'expired-callback':()=>{
            if(!disposed)clear(STATUS.expired);
          },
          'timeout-callback':()=>{
            if(!disposed)clear(STATUS.error);
          },
          'error-callback':()=>{
            if(!disposed)clear(STATUS.error);
          }
        });
        if((typeof returned!=='string'&&typeof returned!=='number')||
           String(returned).length===0)
          throw Error('invalid-widget-id');
        widgetId=returned;
        return ok();
      }catch{
        widgetId=null;
        clear(STATUS.error);
        return invalid('widget-render-failed');
      }
    },
    status(){
      if(disposed)return STATUS.disposed;
      if(status===STATUS.ready&&!hasFreshToken()){
        clear(STATUS.expired);
      }
      return status;
    },
    /** Single-use browser handoff; DOES NOT send it to the server. */
    takeToken(){
      if(disposed||status!==STATUS.ready||!hasFreshToken()){
        if(status===STATUS.ready)clear(STATUS.expired);
        return invalid('turnstile-token-not-ready-or-expired');
      }
      const value=token;
      clear(STATUS.used);
      return Object.freeze({ok:true,token:value,providerCallsAuthorized:false});
    },
    reset(){
      if(disposed||widgetId===null)return invalid('widget-unavailable');
      clear(STATUS.waiting);
      try{
        turnstile.reset(widgetId);
        return ok();
      }catch{
        clear(STATUS.error);
        return invalid('widget-reset-failed');
      }
    },
    dispose(){
      if(disposed)return ok();
      disposed=true;
      const oldId=widgetId;
      widgetId=null;
      clear(STATUS.disposed);
      if(oldId!==null){
        try{turnstile.remove(oldId);}catch{}
      }
      return ok();
    }
  });
}
