/** Draft-only policy for the planned HTTPS gateway. No HTTP endpoint invokes it.
 * No CORS, GET query text, browser API key, or client Boolean as consent.
 */
import {timingSafeEqual} from 'node:crypto';
const fail=code=>Object.freeze({ok:false,code});
const fixedEqual=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
};
export function inspectFutureAIRequest(request, {expectedOrigin, expectedCsrf, maxBytes=8192}={}) {
 if(!request||typeof request!=='object'||Array.isArray(request))return fail('bad-request');
 if(typeof expectedOrigin!=='string'||!/^https:\/\/[^/?#]+$/i.test(expectedOrigin))return fail('server-origin-not-configured');
 if(typeof expectedCsrf!=='string'||expectedCsrf.length<32)return fail('server-session-not-configured');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<512||maxBytes>16384)return fail('invalid-size-limit');
 if(request.method!=='POST')return fail('unsupported-method');
 if(request.origin!==expectedOrigin)return fail('cross-origin');
 if(request.fetchSite!=='same-origin')return fail('untrusted-fetch-context');
 if(request.contentType!=='application/json')return fail('wrong-media-type');
 if(!Number.isSafeInteger(request.contentLength)||request.contentLength<2||request.contentLength>maxBytes)return fail('bad-body-size');
 if(!fixedEqual(request.csrf,expectedCsrf))return fail('invalid-csrf');
 return Object.freeze({ok:true,code:'request-boundary-only'});
}
