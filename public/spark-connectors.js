/** SocialSpark v0.22 — decorative four-route SVG connector geometry.
 * Reads only layout rectangles, never ideas/drafts, never network or storage.
 * No event handlers are installed on SVG; all overlay elements ignore pointers.
 */
export const PLATFORM_IDS = Object.freeze(['facebook','instagram','linkedin','tiktok']);

const round = value => Math.round(value * 10) / 10;
const make = (...parts) => parts.map((n, i) => typeof n === 'number' ? round(n) : n).join(' ');

/** Pure geometry function (coordinates are relative to the workspace). */
export function computeDesktopRoutes({width, height, center, cards}) {
  if (![width,height,center.x,center.y,center.radius].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  for (const id of PLATFORM_IDS) {
    const c=cards[id];
    if (!c || ![c.x,c.y,c.width,c.height].every(Number.isFinite)) return null;
  }
  const facebook=cards.facebook, instagram=cards.instagram, linkedin=cards.linkedin, tiktok=cards.tiktok;
  // Between 851px and 1349px the destination cards stack vertically.
  // Every connector must arrive at its OWN left edge: never route Instagram
  // over Facebook's text or TikTok through LinkedIn's card.
  if (Math.abs(instagram.y - facebook.y) > 32) {
    const routes={};
    for (const [index,id] of PLATFORM_IDS.entries()) {
      const c=cards[id];
      const end={x:c.x+1,y:c.y+Math.min(64,c.height*.32)};
      const xStart=center.x+center.radius*.72-index*2;
      const yStart=center.y+(index-1.5)*15;
      const rail=c.x-13-index*4;
      const near=end.y-19;
      const d=make('M',xStart,yStart,'C',rail-9,yStart+Math.sign(end.y-yStart)*33,rail-6,near-26,rail,near,
        'l',-5,7,'l',9,5,'L',end.x,end.y);
      routes[id]={d,end};
    }
    return routes;
  }
  const xStart=center.x+center.radius*.79;
  const gutterX=facebook.x-13;
  const topRail=Math.min(facebook.y,instagram.y)-9;
  const bottomRail=Math.max(linkedin.y+linkedin.height,tiktok.y+tiktok.height)+10;
  // All paths leave the physical ring and finish on the correct card edge.
  // The right-column paths go ABOVE and BELOW the other cards, not across their content.
  const routes={};
  {
    const end={x:facebook.x+1,y:facebook.y+facebook.height*.33};
    const d=make('M',xStart,center.y-22,'C',gutterX-16,center.y-40,gutterX-8,end.y+30,gutterX,end.y+22,'l',-6,-7,'l',10,-9,'L',end.x,end.y);
    routes.facebook={d,end};
  }
  {
    const end={x:instagram.x+Math.min(47,instagram.width*.18),y:instagram.y+1};
    const d=make('M',xStart-4,center.y-36,'C',gutterX-24,center.y-88,gutterX-4,topRail+30,gutterX,topRail,
      'L',end.x-23,topRail,'l',8,-3,'l',7,3,'L',end.x,topRail,'L',end.x,end.y);
    routes.instagram={d,end};
  }
  {
    const end={x:linkedin.x+1,y:linkedin.y+linkedin.height*.40};
    const d=make('M',xStart,center.y+20,'C',gutterX-15,center.y+34,gutterX-7,end.y-24,gutterX,end.y-18,
      'l',-5,8,'l',9,4,'L',end.x,end.y);
    routes.linkedin={d,end};
  }
  {
    const end={x:tiktok.x+Math.min(51,tiktok.width*.20),y:tiktok.y+tiktok.height-1};
    const d=make('M',xStart-8,center.y+40,'C',gutterX-26,center.y+100,gutterX-8,bottomRail-34,gutterX,bottomRail,
      'L',end.x-27,bottomRail,'l',9,3,'l',7,-3,'L',end.x,bottomRail,'L',end.x,end.y);
    routes.tiktok={d,end};
  }
  return routes;
}

export function setupSparkConnectors(root=document) {
  const workspace=root.querySelector('.spark-workspace');
  const overlay=root.querySelector('#spark-connectors');
  const hubCore=root.querySelector('.spark-hub .spark-center');
  if (!workspace || !overlay || !hubCore) return;
  const cards=Object.fromEntries(PLATFORM_IDS.map(id=>[id,root.querySelector(`.spark-platform[data-platform="${id}"]`)]));
  if (Object.values(cards).some(card=>!card)) return;
  const toRelative=(elem,outer)=>{
    const rect=elem.getBoundingClientRect();
    return {x:rect.left-outer.left,y:rect.top-outer.top,width:rect.width,height:rect.height};
  };
  const draw=()=>{
    if (window.matchMedia('(max-width:850px)').matches) return;
    const wr=workspace.getBoundingClientRect();
    const ring=toRelative(hubCore,wr);
    const geometry=computeDesktopRoutes({width:wr.width,height:wr.height,
      center:{x:ring.x+ring.width/2,y:ring.y+ring.height/2,radius:ring.width/2},
      cards:Object.fromEntries(PLATFORM_IDS.map(id=>[id,toRelative(cards[id],wr)]))});
    if (!geometry) return;
    overlay.setAttribute('viewBox',`0 0 ${round(wr.width)} ${round(wr.height)}`);
    for (const id of PLATFORM_IDS) {
      const {d,end}=geometry[id];
      for(const type of ['blur','wire','charge']) overlay.querySelector(`[data-route-${type}="${id}"]`).setAttribute('d',d);
      overlay.querySelector(`[data-route-terminal="${id}"]`).setAttribute('cx',round(end.x));
      overlay.querySelector(`[data-route-terminal="${id}"]`).setAttribute('cy',round(end.y));
      const bolt=overlay.querySelector(`[data-route-bolt="${id}"]`);
      bolt.setAttribute('d',make('M',end.x+1,end.y-4,'l',-4,5,'h',3,'l',-1,4,'l',5,-6,'h',-3,'z'));
    }
  };
  let pending=false;
  const schedule=()=>{
    if (pending) return;
    pending=true;
    requestAnimationFrame(()=>{pending=false;draw();});
  };
  const observer=typeof ResizeObserver==='function' ? new ResizeObserver(schedule) : null;
  if(observer) for (const e of [workspace,hubCore,...Object.values(cards)]) observer.observe(e);
  window.addEventListener('resize',schedule,{passive:true});
  schedule();
}
if(typeof document !== 'undefined') setupSparkConnectors();
