import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {computeDesktopRoutes,PLATFORM_IDS} from '../public/spark-connectors.js';
import {createAppServer} from '../server.mjs';
const read=name=>readFile(new URL('../public/'+name,import.meta.url),'utf8');

function endMatches(a,b){ assert.ok(Math.abs(a-b)<.0001,`${a} differs from ${b}`); }
test('wide 2x2 layout has FOUR unique routes ending on their own correct card edges',()=>{
 const cards={
  facebook:{x:700,y:20,width:280,height:220},instagram:{x:990,y:20,width:280,height:220},
  linkedin:{x:700,y:250,width:280,height:220},tiktok:{x:990,y:250,width:280,height:220}
 };
 const routes=computeDesktopRoutes({width:1310,height:510,center:{x:625,y:240,radius:55},cards});
 assert.deepEqual(Object.keys(routes),PLATFORM_IDS);
 const uniq=new Set(Object.values(routes).map(({d})=>d));
 assert.equal(uniq.size,4);
 for (const [id,{d,end}] of Object.entries(routes)) {
   assert.match(d,/^M .* C .* [lL] /);
   assert.ok(end.x>=cards[id].x&&end.x<=cards[id].x+cards[id].width);
   assert.ok(end.y>=cards[id].y&&end.y<=cards[id].y+cards[id].height);
 }
 endMatches(routes.facebook.end.x,cards.facebook.x+1);
 endMatches(routes.linkedin.end.x,cards.linkedin.x+1);
 endMatches(routes.instagram.end.y,cards.instagram.y+1);
 endMatches(routes.tiktok.end.y,cards.tiktok.y+cards.tiktok.height-1);
 assert.ok(routes.instagram.d.includes(`L ${routes.instagram.end.x-23} ${cards.instagram.y-9}`),'Instagram travels across the top gap, not over Facebook text');
 assert.ok(routes.tiktok.d.includes(`L ${routes.tiktok.end.x-27} ${cards.tiktok.y+cards.tiktok.height+10}`),'TikTok travels underneath LinkedIn, not over its text');
});

test('stacked narrow desktop routes all terminate on their own LEFT edges (no text crossings)',()=>{
 const cards={
  facebook:{x:500,y:20,width:420,height:195},instagram:{x:500,y:225,width:420,height:195},
  linkedin:{x:500,y:430,width:420,height:195},tiktok:{x:500,y:635,width:420,height:195}
 };
 const routes=computeDesktopRoutes({width:960,height:850,center:{x:435,y:280,radius:55},cards});
 assert.deepEqual(Object.keys(routes),PLATFORM_IDS);
 for(const [id,{d,end}] of Object.entries(routes)) {
  endMatches(end.x,cards[id].x+1);
  assert.ok(end.y>cards[id].y && end.y<cards[id].y+cards[id].height);
  assert.ok(d.endsWith(`L ${end.x} ${end.y}`),id);
 }
 assert.notEqual(routes.instagram.d,routes.facebook.d);
});

test('decorative routes honor strict CSP, reduced motion, isolated copy, and exact 4-card coverage',async()=>{
 const html=await read('index.html'), css=await read('styles.css'), js=await read('spark-connectors.js');
 assert.match(html,/src="\/spark-connectors.js"/);
 assert.match(html,/id="spark-connectors" aria-hidden="true"/);
 assert.match(html,/class="spark-center"/);
 for (const id of PLATFORM_IDS) {
  for(const attr of ['blur','wire','charge','terminal','bolt']) assert.match(html,new RegExp(`data-route-${attr}="${id}"`));
  assert.match(css,new RegExp(`.spark-route-${id}\\{--route-color:`));
 }
 assert.doesNotMatch(html,/<g[^>]*data-spark-route[^>]*style=/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.spark-workspace > \.spark-connectors \{display:none;\}/);
 assert.doesNotMatch(js,/\bfetch\s*\(|localStorage|sessionStorage|\.innerHTML\s*=/);
});

test('strict local server serves geometry module without enabling any AI requests',async()=>{
 const server=createAppServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const base=`http://127.0.0.1:${server.address().port}`;
  const res=await fetch(base+'/spark-connectors.js');
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-type'),/javascript/);
  assert.match(res.headers.get('content-security-policy'),/connect-src 'none'/);
  assert.match(await res.text(),/computeDesktopRoutes/);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
