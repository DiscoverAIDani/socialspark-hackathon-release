import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'..');
const origin='http://127.0.0.1:8792';
const binary=join(dir,'node_modules','.bin','wrangler');
async function request(path,options){
  return fetch(origin+path,{signal:AbortSignal.timeout(10_000),redirect:'manual',...options});
}

test('disabled Worker actually serves offline assets and rejects ALL API use locally',
  {timeout:140_000},async()=>{
  let log='';
  const child=spawn(binary,['dev','--local','--config','wrangler.disabled-preview.jsonc',
    '--ip','127.0.0.1','--port','8792'],{
    cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'},
    stdio:['ignore','pipe','pipe']
  });
  for(const pipe of [child.stdout,child.stderr])
    pipe.on('data',x=>{log=(log+x.toString()).slice(-9000)});
  try{
    let ready=false;
    for(let n=0;n<90;n++){
      if(child.exitCode!==null)throw Error('Local Worker exited: '+log.slice(-1800));
      try{const r=await request('/');if(r.status===200){ready=true;break;}}catch{}
      await delay(750);
    }
    assert.equal(ready,true,'local disabled preview should start: '+log.slice(-1500));

    const html=await request('/');
    assert.equal(html.status,200);
    assert.match(await html.text(),/Offline examples only — real AI is not enabled/);
    assert.match(html.headers.get('content-security-policy')||'',/connect-src 'none'/);
    assert.equal(html.headers.get('x-content-type-options'),'nosniff');

    const js=await request('/studio.js');
    assert.equal(js.status,200);
    assert.match(js.headers.get('content-security-policy')||'',/connect-src 'none'/);

    for(const method of ['GET','POST','OPTIONS']){
      const ai=await request('/api/judge-demo/generate',{
        method,...(method==='POST'?{body:JSON.stringify({exampleId:'fictional-beginner-workshop'})}:{})
      });
      assert.equal(ai.status,503);
      assert.deepEqual(await ai.json(),{ok:false,code:'judge-live-ai-disabled'});
      assert.match(ai.headers.get('content-security-policy')||'',/connect-src 'none'/);
    }
    for(const path of ['/api/judge-demo/session','/api/activate','/api/owner',
      '/api/scan','/api/owner-live/complete']){
      const response=await request(path,{method:'POST',body:'fictional data'});
      assert.equal(response.status,404,path);
      assert.equal(response.headers.get('access-control-allow-origin'),null);
    }
    for(const path of ['/package.json','/security/judge-demo-policy.mjs','/server.mjs',
      '/wrangler.disabled-preview.jsonc','/cloudflare/judge-offline-pipeline.mjs']){
      assert.equal((await request(path)).status,404,path);
    }
  }finally{
    child.kill('SIGTERM');
    await delay(200);
    if(child.exitCode===null)child.kill('SIGKILL');
  }
});
