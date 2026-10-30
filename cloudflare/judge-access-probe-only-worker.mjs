/**
 * SocialSpark - isolated Cloudflare Access authentication probe.
 *
 * SAFE FOR A SEPARATE AUTHENTICATION TEST WORKER ONLY.
 * No Nebius/NVIDIA credentials, upstream network calls, model integrations,
 * storage, Turnstile, telemetry or secret binding. Does not use or import
 * the real SocialSpark application. Never deploy over the public demo.
 *
 * Requires real Cloudflare Worker-level Access protection on ALL TRAFFIC.
 * A request header does NOT prove identity. ctx.access is populated by
 * Cloudflare's Access integration, not by arbitrary incoming HTTP headers.
 * If Access is missing/misconfigured, deny all probe requests.
 *
 * This is NOT the live judge gateway. It only tests that a browser can log in.
 */
const HEADERS=Object.freeze({
  'Cache-Control':'no-store, max-age=0',
  'Content-Type':'application/json; charset=utf-8',
  'Content-Security-Policy':"default-src 'none'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff'
});
const reply=(status,code)=>new Response(JSON.stringify({
  ok:status===200,
  code,
  inferenceEnabled:false,
  providerCallsAuthorized:false
}),{status,headers:HEADERS});

export default {
  async fetch(request,env,ctx){
    if(!(request instanceof Request))return reply(403,'access-unavailable');
    let url;
    try{url=new URL(request.url);}catch{return reply(403,'access-unavailable');}
    if(request.method!=='GET' ||
      (url.pathname!=='/'&&url.pathname!=='/health') ||
      url.search!=='' || url.hash!=='')
      return reply(404,'not-found');
    if(!ctx?.access || typeof ctx.access.getIdentity!=='function')
      return reply(403,'access-unavailable');
    try{
      const identity=await ctx.access.getIdentity();
      if(!identity || typeof identity.email!=='string' ||
        identity.email.length>254 ||
        !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(identity.email))
        return reply(403,'access-identity-not-verified');
      return reply(200,'access-authenticated-test-only');
    }catch{
      return reply(403,'access-identity-unavailable');
    }
  }
};
