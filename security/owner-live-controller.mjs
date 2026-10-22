/** Owner-only one-shot browser route. No user text beyond the fixed fictional fixture.
 * The server must authenticate origin+CSRF before calling these methods.
 * Never store API keys, token text, or generated drafts in the lock file.
 */
import {open} from 'node:fs/promises';
import {createConsentLedger} from './ai-consent-ledger.mjs';
import {inspectOperatorKey,NANO_MODEL} from './fictional-live-test.mjs';
import {requestNebiusDrafts} from './nebius-draft-adapter.mjs';
import {OWNER_LIVE_IDEA} from './owner-live-scenario.mjs';

const fail=code=>({ok:false,code});
const inputOk=body=>body&&Object.getPrototypeOf(body)===Object.prototype&&body.maskedText===OWNER_LIVE_IDEA&&body.revision===1&&body.tone==='friendly';

export function createOwnerLiveController({key,lockPath,fetchImpl=fetch,model=NANO_MODEL}={}){
  if(!inspectOperatorKey(key).ok||typeof lockPath!=='string'||!lockPath.trim()||model!==NANO_MODEL||typeof fetchImpl!=='function')throw new TypeError('Owner live gateway not configured');
  const ledger=createConsentLedger({ttlMs:120000});
  let spent=false;
  let inFlight=false;
  const prepare=body=>{
    if(spent||inFlight)return fail('live-attempt-already-used');
    if(!inputOk(body)||Object.keys(body).sort().join(',')!=='maskedText,revision,tone')return fail('fictional-example-only');
    const result=ledger.prepare(body);
    return result.ok?{ok:true,ticket:result.ticket}:{ok:false,code:result.code};
  };
  const complete=async body=>{
    if(spent||inFlight)return fail('live-attempt-already-used');
    if(!inputOk(body)||Object.keys(body).sort().join(',')!=='confirm,maskedText,revision,ticket,tone'||body.confirm!=='LIVE OWNER FICTIONAL REQUEST')return fail('separate-live-consent-required');
    const approved=ledger.approve(body);
    if(!approved.ok)return fail(approved.code);
    const grant=ledger.consume({...body,approvalToken:approved.approvalToken});
    if(!grant.ok)return fail(grant.code);
    // Acquire in-process protection before any awaits; never retry or free it.
    inFlight=true;spent=true;
    let handle;
    try {
      // Exclusive filesystem reservation is persistent across process restarts.
      handle=await open(lockPath,'wx',0o600);
      await handle.writeFile('Owner browser test: one potentially billable fictional attempt reserved. DO NOT DELETE.\n');
      await handle.sync();
    } catch {return fail('one-use-lock-unavailable');}
    finally {await handle?.close();}
    const result=await requestNebiusDrafts({payload:grant.payload,tone:grant.tone,key,model,
       serverAuthorization:true,providerApproval:true,fetchImpl,timeoutMs:15000});
    if(!result.ok)return fail(result.code);
    return {ok:true,mode:'owner-live',drafts:result.drafts,providerAttempts:1};
  };
  return Object.freeze({prepare,complete,used:()=>spent});
}
