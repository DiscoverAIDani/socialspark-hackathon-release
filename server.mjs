/**
 * Local development server for the SocialSpark local review (development).
 * No request bodies are accepted, posts are never sent to this server,
 * and no AI endpoint is enabled in this stage. v0.5 adds host and URL guards.
 */
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {createConsentLedger} from './security/ai-consent-ledger.mjs';
import {validateGeneratedDrafts} from './security/nebius-draft-adapter.mjs';
import {FIXTURE_IDEA,FIXTURE_DRAFTS} from './security/nebius-fake-session.mjs';
import {createOwnerLiveController} from './security/owner-live-controller.mjs';
import {OWNER_LIVE_IDEA} from './security/owner-live-scenario.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const projectDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(projectDirectory, 'public');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/socialspark-mark.svg', ['socialspark-mark.svg', 'image/svg+xml']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/studio.js', ['studio.js', 'text/javascript; charset=utf-8']],
  ['/studio-scheduler.js', ['studio-scheduler.js', 'text/javascript; charset=utf-8']],
  ['/schedule-core.js', ['schedule-core.js', 'text/javascript; charset=utf-8']],
  ['/studio-ai-bridge.js', ['studio-ai-bridge.js', 'text/javascript; charset=utf-8']],
  ['/studio-owner-live.js', ['studio-owner-live.js', 'text/javascript; charset=utf-8']],
  ['/spark-connectors.js', ['spark-connectors.js', 'text/javascript; charset=utf-8']],
  ['/platform-drafts.js', ['platform-drafts.js', 'text/javascript; charset=utf-8']],
  ['/privacy.js', ['privacy.js', 'text/javascript; charset=utf-8']],
  ['/masking.js', ['masking.js', 'text/javascript; charset=utf-8']],
  ['/text-integrity.js', ['text-integrity.js', 'text/javascript; charset=utf-8']],
  ['/language-coverage.js', ['language-coverage.js', 'text/javascript; charset=utf-8']],
  ['/ai-response-validation.js', ['ai-response-validation.js', 'text/javascript; charset=utf-8']],
  ['/suggestion-workflow.js', ['suggestion-workflow.js', 'text/javascript; charset=utf-8']],
  ['/demo-availability.js', ['demo-availability.js', 'text/javascript; charset=utf-8']],
  ['/copy-availability.js', ['copy-availability.js', 'text/javascript; charset=utf-8']]
]);

const baseHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-DNS-Prefetch-Control': 'off'
};

export function createAppServer({offlineBridge=false,ownerLiveTrial=null}={}) {
  if (offlineBridge && ownerLiveTrial) throw new TypeError('Cannot combine offline mock and owner live trial');
  const live=ownerLiveTrial?createOwnerLiveController(ownerLiveTrial):null;
  // Separate development-only rehearsal process. Normal npm start never accepts POST.
  const ledger=createConsentLedger({ttlMs:120_000});
  const csrf=randomBytes(32).toString('hex');
  let finished=false;
  return http.createServer(async (request, response) => {
    const headers=(offlineBridge||live) ? { ...baseHeaders, 'Content-Security-Policy': baseHeaders['Content-Security-Policy'].replace("connect-src 'none'", "connect-src 'self'") } : baseHeaders;
    // Reject DNS rebinding/non-local hosts. Only local development is supported.
    const host = request.headers.host ?? '';
    if (!/^(?:localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(host)) {
      response.writeHead(400, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid local host');
      return;
    }
    // Reject URL query strings, where drafts must never be placed.
    if ((request.url ?? '').includes('?')) {
      response.writeHead(400, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('URL query parameters are not supported');
      return;
    }
    // Owner-only, separately started one-shot LIVE path. Never available in npm start.
    if(live && ['/api/owner-live/session','/api/owner-live/prepare','/api/owner-live/complete'].includes(request.url)){
      const respond=(status,data)=>{
        const body=Buffer.from(JSON.stringify(data));
        response.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8','Content-Length':body.length});
        response.end(body);
      };
      if(request.url==='/api/owner-live/session'){
        if(request.method!=='GET')return respond(405,{ok:false,code:'method-not-allowed'});
        return respond(200,{ok:true,mode:'owner-live',scenario:OWNER_LIVE_IDEA,csrf,used:live.used()});
      }
      const expectedOrigin=`http://${host}`;
      if(request.method!=='POST'||request.headers.origin!==expectedOrigin||request.headers['sec-fetch-site']!=='same-origin'||request.headers['x-socialspark-csrf']!==csrf||request.headers['content-type']!=='application/json')return respond(403,{ok:false,code:'request-not-authorized'});
      let input;
      try {
        let size=0,parts=[];
        for await (const part of request){
          size+=part.length;if(size>4096)return respond(413,{ok:false,code:'body-too-large'});
          parts.push(part);
        }
        input=JSON.parse(Buffer.concat(parts).toString('utf8'));
      }catch{return respond(400,{ok:false,code:'invalid-body'});}
      if(!input||typeof input!=='object'||Array.isArray(input))return respond(400,{ok:false,code:'invalid-body'});
      const outcome=request.url==='/api/owner-live/prepare'?live.prepare(input):await live.complete(input);
      if(!outcome.ok)return respond(409,{ok:false,code:outcome.code});
      return respond(200,outcome);
    }
    // Only a separate explicitly started OFFLINE rehearsal supports local POSTs.
    if (offlineBridge && (request.url === '/api/mock/session' || request.url === '/api/mock/prepare' || request.url === '/api/mock/complete')) {
      const respond=(status,data) => {
        const body=Buffer.from(JSON.stringify(data));
        response.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8','Content-Length':body.length});
        response.end(body);
      };
      if (request.url === '/api/mock/session') {
        if (request.method !== 'GET') return respond(405,{ok:false,code:'method-not-allowed'});
        return respond(200,{ok:true,mode:'offline-mock',scenario:FIXTURE_IDEA,csrf,externalRequests:0});
      }
      const expectedOrigin=`http://${host}`;
      if (request.method !== 'POST' || request.headers.origin !== expectedOrigin || request.headers['sec-fetch-site'] !== 'same-origin' || request.headers['x-socialspark-csrf'] !== csrf || request.headers['content-type'] !== 'application/json') return respond(403,{ok:false,code:'request-not-authorized'});
      if (finished) return respond(409,{ok:false,code:'rehearsal-already-used'});
      let body;
      try {
        let size=0,parts=[];
        for await (const part of request) {
          size+=part.length;
          if(size>4096) return respond(413,{ok:false,code:'body-too-large'});
          parts.push(part);
        }
        body=JSON.parse(Buffer.concat(parts).toString('utf8'));
      } catch {return respond(400,{ok:false,code:'invalid-body'});}
      if(!body || Object.getPrototypeOf(body)!==Object.prototype || body.maskedText!==FIXTURE_IDEA || body.revision!==1 || body.tone!=='friendly') return respond(400,{ok:false,code:'fictional-example-only'});
      if(request.url==='/api/mock/prepare') {
        if(Object.keys(body).sort().join(',')!=='maskedText,revision,tone')return respond(400,{ok:false,code:'unexpected-field'});
        const prepared=ledger.prepare({maskedText:body.maskedText,revision:body.revision,tone:body.tone});
        return respond(prepared.ok?200:422, prepared.ok?{ok:true,ticket:prepared.ticket,mode:'offline-mock'}:{ok:false,code:prepared.code});
      }
      if(request.url==='/api/mock/complete') {
        if(Object.keys(body).sort().join(',')!=='confirm,maskedText,revision,ticket,tone' || body.confirm!=='OFFLINE MOCK ONLY')return respond(400,{ok:false,code:'separate-confirmation-required'});
        const approved=ledger.approve({ticket:body.ticket,maskedText:body.maskedText,revision:body.revision,tone:body.tone});
        if(!approved.ok)return respond(409,{ok:false,code:approved.code});
        const consumed=ledger.consume({ticket:body.ticket,approvalToken:approved.approvalToken,maskedText:body.maskedText,revision:body.revision,tone:body.tone});
        if(!consumed.ok)return respond(409,{ok:false,code:consumed.code});
        finished=true; // One demo per server process; prevents accidental repeated submissions.
        const checked=validateGeneratedDrafts(JSON.stringify(FIXTURE_DRAFTS),FIXTURE_IDEA);
        if(!checked.ok)return respond(422,{ok:false,code:'mock-validation-failed'});
        return respond(200,{ok:true,mode:'offline-mock',drafts:checked.drafts,providerRequests:0,creditsSpent:0});
      }
      return respond(404,{ok:false,code:'not-found'});
    }
    // No other body-bearing requests are supported; no real AI endpoint exists.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { ...headers, Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed');
      return;
    }

    let path;
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      path = url.pathname;
    } catch {
      response.writeHead(400, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid request');
      return;
    }
    const asset = assets.get(path);
    if (!asset) {
      response.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const [filename, contentType] = asset;
    try {
      let body = await readFile(join(publicDirectory, filename));
      if(live&&filename==='index.html') {
        const html=body.toString('utf8').replace('<html lang="en">','<html lang="en" data-socialspark-owner-live="yes">');
        body=Buffer.from(html);
      }
      response.writeHead(200, { ...headers, 'Content-Type': contentType, 'Content-Length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      // Do not expose internal file paths or post content in errors.
      response.writeHead(500, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Application resource unavailable');
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number.parseInt(process.env.PORT || '4173', 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    process.stderr.write('PORT must be an integer from 1024 to 65535.\n');
    process.exit(1);
  }
  // Bind only to loopback: public HTTPS hosting will be designed and tested later.
  createAppServer().listen(port, '127.0.0.1', () => {
    process.stdout.write(`SocialSpark local studio: http://127.0.0.1:${port}\n`);
  });
}
