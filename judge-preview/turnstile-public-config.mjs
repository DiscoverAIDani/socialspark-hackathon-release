/**
 * SocialSpark judge Turnstile — PUBLIC browser configuration, NOT DEPLOYED.
 *
 * This file lives OUTSIDE public/ and is not imported by the deployed site.
 * The site key is intentionally public. NEVER put the Turnstile SECRET here.
 * A widget token is not authorization, billing protection, or a substitute
 * for a server-to-Cloudflare Siteverify check.
 *
 * Binding checked: Cloudflare widget "SocialSpark Judge Demo" created by the
 * owner on 2026-10-21 for the existing socialspark workers.dev hostname.
 */
export const JUDGE_TURNSTILE_PUBLIC=Object.freeze({
  siteKey:'0x4AAAAAAFgWEGHuwe3pfZTO',
  hostname:'socialspark-hackathon-release.daniellewilcott.workers.dev',
  action:'socialspark_judge_session',
  turnstileScript:'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
  maxAgeMs:300000,
  liveAiEnabled:false
});

/** The browser hostname is only a UI guard. Server must recheck all claims. */
export function isExpectedJudgePageOrigin(origin){
  if(typeof origin!=='string')return false;
  try{
    const url=new URL(origin);
    return url.protocol==='https:' &&
      url.hostname===JUDGE_TURNSTILE_PUBLIC.hostname &&
      url.port==='' && url.origin===origin &&
      url.username==='' && url.password==='' &&
      !url.search && !url.hash && url.pathname==='/';
  }catch{return false;}
}
