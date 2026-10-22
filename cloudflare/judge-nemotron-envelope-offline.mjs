/**
 * OFFLINE ONLY: construct a reviewed fixed Nemotron request envelope.
 *
 * This module cannot send a request: no outbound network transport, API endpoint, secrets,
 * provider client, retries, HTTP handler, billing or activation. The request
 * is a TEST ARTIFACT only. Never treat {ok:true} as provider authorization.
 *
 * Only the one approved, fictional example is permitted. No user post text,
 * client model choice, client token count, custom prompt, or extra fields.
 * Token counting must come from a separately vetted server-side model
 * tokenizer; this module accepts an injected mock callback only for tests.
 */
import {
  JUDGE_DEMO_POLICY,getApprovedJudgeExample,checkProposedTokenLimits
} from '../security/judge-demo-policy.mjs';
import {createNebiusMessages}
  from '../security/nebius-draft-adapter.mjs';

const reject=reason=>Object.freeze({
  ok:false,reason,providerCallsAuthorized:false
});

export async function buildOfflineNemotronEnvelope({
  request,
  countTrustedTokens
}={}){
  if(!request||Object.getPrototypeOf(request)!==Object.prototype||
     Object.keys(request).length!==1||
     !Object.hasOwn(request,'exampleId')||
     typeof request.exampleId!=='string')
    return reject('unapproved-request-shape');
  const example=getApprovedJudgeExample(request.exampleId);
  if(!example)return reject('unapproved-example');
  if(typeof countTrustedTokens!=='function')
    return reject('trusted-tokenizer-unavailable');
  try{
    const messages=createNebiusMessages(example.idea,example.tone);
    const body={
      model:JUDGE_DEMO_POLICY.model,
      messages,
      temperature:0.45,
      max_tokens:JUDGE_DEMO_POLICY.maximumOutputTokensPerAttempt,
      stream:false
    };
    const measured=await countTrustedTokens({
      model:body.model,
      messages:body.messages,
      maxOutputTokens:body.max_tokens
    });
    const decision=checkProposedTokenLimits({
      serverMeasuredInputTokens:measured,
      requestedMaxOutputTokens:body.max_tokens
    });
    if(!decision.allowed)return reject(decision.reason);
    const bytes=new TextEncoder().encode(JSON.stringify(body)).length;
    if(bytes<=0||bytes>16_384)
      return reject('provider-envelope-too-large');
    return Object.freeze({
      ok:true,
      mode:'offline-fixed-request-only',
      exampleId:request.exampleId,
      measuredInputTokens:measured,
      requestBody:Object.freeze({
        ...body,messages:Object.freeze(
          messages.map(x=>Object.freeze({...x}))
        )
      }),
      providerCallsAuthorized:false
    });
  }catch{
    return reject('request-preparation-unavailable');
  }
}
