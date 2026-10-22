/**
 * NOT REGISTERED IN WRANGLER. NOT DEPLOYED.
 *
 * A deliberately inert HTTP shell for a future restricted Cloudflare Worker.
 * Regardless of method, headers, body, credentials or client-provided flags,
 * this Worker NEVER authorizes or invokes NVIDIA/Nebius inference.
 *
 * Do not wire to the production route without separate owner approval and
 * complete replacement by a reviewed, enabled gateway implementation.
 */
import {JUDGE_API_PATH,disabledJudgeGatewayResponse} from './judge-gateway-core.mjs';

const safeHeaders={
  'Cache-Control':'no-store, max-age=0',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; connect-src 'none'; frame-ancestors 'none'"
};
export default {
  async fetch(request) {
    let url;
    try {url=new URL(request.url);} catch {
      return new Response('Not found',{status:404,headers:safeHeaders});
    }
    if(url.pathname===JUDGE_API_PATH) return disabledJudgeGatewayResponse();
    // No other API endpoints (including a remote activation switch) exist.
    return new Response('Not found',{status:404,headers:safeHeaders});
  }
};
