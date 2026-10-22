/**
 * Step 14P - disabled, test-only deployment-shaped Worker.
 *
 * This Worker is NOT referenced by root wrangler.jsonc, never makes network
 * requests to Nebius, has no model credentials, and has no live authorization.
 * Cloudflare Static Assets serve the interface. Only /api/* runs this Worker
 * first and every API route is disabled / rejected.
 */
import {JUDGE_API_PATH,disabledJudgeGatewayResponse} from './judge-gateway-core.mjs';

const headers=Object.freeze({
  'Content-Type':'text/plain; charset=utf-8',
  'Cache-Control':'no-store, max-age=0',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; connect-src 'none'; frame-ancestors 'none'"
});

export default {
  async fetch(request,env){
    let url;
    try{url=new URL(request.url);}catch{
      return new Response('Not found',{status:404,headers});
    }
    if(url.pathname===JUDGE_API_PATH)return disabledJudgeGatewayResponse();
    if(url.pathname.startsWith('/api/'))return new Response('Not found',{status:404,headers});
    if(request.method!=='GET'&&request.method!=='HEAD')
      return new Response('Method not allowed',{status:405,headers});
    if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function')
      return new Response('Preview assets unavailable',{status:503,headers});
    return env.ASSETS.fetch(request);
  }
};
