/**
 * Step 14O — LOCAL ONLY: tests actual Wrangler static assets in Chromium.
 * NEVER runs 'wrangler deploy', no Cloudflare credentials, no Nebius API.
 * This script owns its disposable local server and closes it on completion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const origin='http://127.0.0.1:8791';
const wrangler=join(here,'node_modules','.bin','wrangler');

async function waitForStaticServer(child,log){
  for(let attempt=0;attempt<90;attempt++){
    if(child.exitCode!==null)throw Error('Local Wrangler exited: '+log().slice(-1600));
    try {
      const result=await fetch(origin+'/',{signal:AbortSignal.timeout(1500)});
      if(result.ok)return;
    }catch{/* local server not started */}
    await delay(1000);
  }
  throw Error('Local Wrangler did not start: '+log().slice(-2400));
}
async function get(path,options={}){
  return fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(10_000),...options});
}

test('local Wrangler static assets + real Chromium smoke; no deployment', {timeout:210_000},async t=>{
  let logText='';
  const child=spawn(wrangler,['dev','--local','--config','wrangler.jsonc',
    '--ip','127.0.0.1','--port','8791'],{
    cwd:root,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'},
    stdio:['ignore','pipe','pipe']
  });
  for(const pipe of [child.stdout,child.stderr])
    pipe.on('data',chunk=>{logText=(logText+chunk.toString()).slice(-10_000);});
  let browser;
  try{
    await waitForStaticServer(child,()=>logText);
    await t.test('Cloudflare returns HTML, modules and restrictive security headers',async()=>{
      const home=await get('/');
      assert.equal(home.status,200);
      const html=await home.text();
      assert.match(html,/SocialSpark — AI Social Media Content Studio/);
      assert.match(html,/Offline examples only — real AI is not enabled/);
      const csp=home.headers.get('content-security-policy')||'';
      assert.match(csp,/default-src 'none'/);
      assert.match(csp,/script-src 'self'/);
      assert.match(csp,/connect-src 'none'/);
      assert.match(csp,/frame-ancestors 'none'/);
      assert.equal(home.headers.get('x-content-type-options'),'nosniff');
      assert.equal(home.headers.get('referrer-policy'),'no-referrer');
      assert.equal(home.headers.get('x-robots-tag'),'noindex');
      assert.match(home.headers.get('cache-control')||'',/no-store/);
      for(const path of ['/app.js','/studio.js','/privacy.js',
          '/styles.css','/socialspark-mark.svg']){
        const result=await get(path);
        assert.equal(result.status,200,path);
        assert.match(result.headers.get('content-security-policy')||'',/connect-src 'none'/);
        assert.ok((await result.text()).length>20,path);
      }
    });

    await t.test('no server source, secret files, API, or ledger exposed',async()=>{
      for(const path of [
        '/server.mjs','/package.json','/wrangler.jsonc',
        '/security/judge-demo-policy.mjs',
        '/cloudflare/judge-gateway-core.mjs',
        '/.env','/.github/workflows/tests.yml',
        '/api/judge-demo/session','/api/judge-demo/generate',
        '/api/activate','/_headers'
      ]){
        const r=await get(path);
        assert.ok(r.status===404||r.status===405,
          path+' unexpectedly returned HTTP '+r.status);
      }
      const r=await get('/api/judge-demo/generate',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({exampleId:'fictional-beginner-workshop'})
      });
      assert.ok(r.status>=400,'no public AI endpoint');
    });

    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1365,height:850}});
    const page=await context.newPage();
    const pageErrors=[],outbound=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('request',request=>{
      if(!request.url().startsWith(origin+'/')&&!request.url().startsWith('data:')&&
         !request.url().startsWith('blob:'))
        outbound.push(request.url());
    });

    await t.test('desktop browser produces four distinct OFFLINE examples, no external fetch',async()=>{
      await page.goto(origin+'/',{waitUntil:'load'});
      assert.equal(await page.title(),
        'SocialSpark — AI Social Media Content Studio (Electric Spark Network)');
      await page.locator('#studio-idea').fill('Invite people to a fictional beginner workshop.');
      await page.locator('#studio-create').click();
      const texts=[];
      for(const platform of ['facebook','instagram','linkedin','tiktok']){
        const textarea=page.locator('#studio-preview-'+platform);
        assert.equal(await textarea.isDisabled(),false);
        const value=await textarea.inputValue();
        assert.ok(value.length>20,platform);
        texts.push(value);
      }
      assert.equal(new Set(texts).size,4,'platform drafts should differ');
      assert.match(await page.locator('#studio-status').innerText(),/offline example drafts created/i);
      assert.equal(await page.locator('#studio-request-ai').isDisabled(),true);
      assert.equal(outbound.length,0,'browser must not contact external services');
      assert.deepEqual(pageErrors,[]);
    });

    await t.test('privacy warning blocks copying until acknowledgement, then resets on edit',async()=>{
      await page.locator('#privacy-lab > summary').click();
      assert.equal(await page.locator('#privacy-lab').getAttribute('open'),'');
      const draft=page.locator('#draft');
      await draft.fill('Call me at 916-555-0198.');
      assert.equal(await page.locator('#copy').isDisabled(),true);
      const ack=page.locator('#acknowledge');
      await ack.check();
      assert.equal(await page.locator('#copy').isDisabled(),false);
      await draft.fill('Call me at 916-555-0198 tomorrow.');
      assert.equal(await ack.isChecked(),false);
      assert.equal(await page.locator('#copy').isDisabled(),true);
      assert.equal(outbound.length,0);
      assert.deepEqual(pageErrors,[]);
    });

    await t.test('editor draft remains temporary across browser reload',async()=>{
      await page.reload({waitUntil:'load'});
      assert.equal(await page.locator('#draft').inputValue(),'');
      assert.equal(await page.locator('#copy').isDisabled(),true);
      assert.equal(await page.locator('#studio-request-ai').isDisabled(),true);
      assert.deepEqual(pageErrors,[]);
      assert.equal(outbound.length,0);
    });

    await t.test('narrow mobile viewport loads and keeps draft controls available',async()=>{
      await page.setViewportSize({width:390,height:844});
      await page.reload({waitUntil:'load'});
      assert.equal(await page.locator('#studio-idea').isVisible(),true);
      assert.equal(await page.locator('#privacy-lab > summary').isVisible(),true);
      await page.locator('#privacy-lab > summary').click();
      assert.equal(await page.locator('#draft').isVisible(),true);
      assert.equal(await page.locator('#studio-create').isVisible(),true);
      assert.deepEqual(pageErrors,[]);
      assert.equal(outbound.length,0);
    });
  }finally {
    if(browser)await browser.close();
    child.kill('SIGTERM');
    await delay(250);
    if(child.exitCode===null)child.kill('SIGKILL');
  }
});
