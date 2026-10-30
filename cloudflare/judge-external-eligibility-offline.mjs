/**
 * OFFLINE ONLY: exact-email eligibility guard for a FUTURE external judge
 * Access app. Never import this from the public SocialSpark Worker.
 *
 * Requires that Cloudflare Access has already authenticated the request,
 * provisioned ctx.access on the DIRECT Worker invocation, and populated
 * the actual Access application's audience. This is an ADDITIONAL
 * application-level defense, not an alternative to the Cloudflare policy.
 *
 * NO route, deployments, secrets, login invitations, Nebius transport,
 * billable provider action, browser-controlled auth headers or auto-enable.
 * It never returns judge email, user ID or login credentials.
 *
 * Cloudflare refs:
 * https://developers.cloudflare.com/workers/configuration/cloudflare-access/
 * https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
 * https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
 */
const EMAIL=/^[a-z0-9][a-z0-9._+-]{0,63}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const AUD=/^[A-Za-z0-9_-]{20,128}$/;
const deny=code=>Object.freeze({
  eligible:false,code,providerCallsAuthorized:false
});

function configuredJudges(list){
  if(!Array.isArray(list)||list.length===0||list.length>100)return false;
  const seen=new Set();
  for(const email of list){
    if(typeof email!=='string'||email.length>254||email!==email.trim()||
       email!==email.toLowerCase()||!EMAIL.test(email)||
       email.includes('..')||seen.has(email))return false;
    seen.add(email);
  }
  return true;
}

function validWindow(startMs,endMs,nowMs){
  return Number.isSafeInteger(startMs)&&startMs>0&&
    Number.isSafeInteger(endMs)&&endMs>startMs&&
    Number.isSafeInteger(nowMs)&&nowMs>0&&
    endMs-startMs<=31*24*60*60*1000;
}

/**
 * Server-only configuration is required: exact individual email list,
 * pinned Access audience and bounded approved evaluation window.
 * Unlike a general one-time-PIN login option, this does not allow ANY
 * recipient of an OTP to act as a judge.
 *
 * Caller MUST supply server-derived nowMs (Date.now()), never browser input.
 * This guard does not issue an inference authorization even when eligible.
 * Stable identity-to-session binding and provider spending limits are
 * separate mandatory production gates.
 */
export async function inspectOfflineExternalJudge(ctx,{
  approvedJudgeEmails,expectedAudience,opensAtMs,closesAtMs,nowMs
}={}){
  if(!configuredJudges(approvedJudgeEmails)||!AUD.test(expectedAudience)||
     !validWindow(opensAtMs,closesAtMs,nowMs))
    return deny('judge-eligibility-config-missing');
  if(nowMs<opensAtMs||nowMs>=closesAtMs)
    return deny('outside-judge-evaluation-window');
  if(!ctx?.access||typeof ctx.access.getIdentity!=='function'||
     ctx.access.aud!==expectedAudience)
    return deny('judge-access-unverified');
  try{
    const identity=await ctx.access.getIdentity();
    if(!identity||typeof identity.email!=='string'||
       identity.email.length>254||identity.email!==identity.email.trim())
      return deny('judge-identity-unavailable');
    const email=identity.email.toLowerCase();
    if(!EMAIL.test(email)||email.includes('..')||
       !approvedJudgeEmails.includes(email))
      return deny('judge-not-on-allowlist');
    return Object.freeze({
      eligible:true,code:'offline-external-judge-eligible-only',
      providerCallsAuthorized:false
    });
  }catch{return deny('judge-identity-unavailable');}
}
