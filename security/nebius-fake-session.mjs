/**
 * Local simulation of the provider path. Fixed fictional content only. It makes
 * NO network request and never reads a real key or environment variables.
 */
import {createConsentLedger} from './ai-consent-ledger.mjs';
import {requestNebiusDrafts} from './nebius-draft-adapter.mjs';

export const FIXTURE_IDEA='Invite people to a fictional beginner workshop.';
export const FIXTURE_DRAFTS=Object.freeze({
  facebook:'Join our fictional beginner workshop! Everyone is welcome. What would you like to learn?',
  instagram:'A friendly beginner workshop is coming! ✨ #Community #Learning',
  linkedin:'We are hosting a fictional beginner-friendly workshop open to everyone.',
  tiktok:'New to this? 🌟 Join our fictional beginner workshop! What would you ask? #LearnTogether'
});

export async function runFictionalNebiusRehearsal({onTransport=()=>{}}={}) {
  const ledger=createConsentLedger();
  const prepared=ledger.prepare({maskedText:FIXTURE_IDEA,revision:1,tone:'friendly'});
  if (!prepared.ok) return Object.freeze({ok:false,code:prepared.code});
  // This is a test harness that simulates the trusted controller's separate
  // user interaction. It does not grant real consent for any live transmission.
  const approved=ledger.approve({ticket:prepared.ticket,maskedText:FIXTURE_IDEA,revision:1,tone:'friendly'});
  if (!approved.ok) return Object.freeze({ok:false,code:approved.code});
  const consumed=ledger.consume({ticket:prepared.ticket,approvalToken:approved.approvalToken,maskedText:FIXTURE_IDEA,revision:1,tone:'friendly'});
  if (!consumed.ok) return Object.freeze({ok:false,code:consumed.code});
  let requests=0;
  const result=await requestNebiusDrafts({
    payload:consumed.payload,tone:consumed.tone,serverAuthorization:true,providerApproval:true,
    key:'FICTIONAL_TEST_KEY_NEVER_LIVE',model:'nvidia/test-model',
    fetchImpl:async(url,request)=>{
      requests++;
      onTransport(url,request);
      const text=JSON.stringify({choices:[{message:{content:JSON.stringify(FIXTURE_DRAFTS)}}]});
      return {ok:true,body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(text));controller.close();}})};
    }
  });
  return Object.freeze({ok:result.ok,code:result.code,platformCount:result.ok?Object.keys(result.drafts).length:0,simulatedProviderCalls:requests,realNetworkCalls:0,creditsSpent:0,replayBlocked:!ledger.consume({ticket:prepared.ticket,approvalToken:approved.approvalToken,maskedText:FIXTURE_IDEA,revision:1,tone:'friendly'}).ok});
}
