/** Explicitly opt-in browser-local schedule for manual publishing, not automatic posting. */
import {PLATFORMS} from './platform-drafts.js';
import {reviewText} from './privacy.js';
import {getCopyAvailability} from './copy-availability.js';
import {getSchedulingDrafts} from './studio.js';
import {STORAGE_KEY,MAX_ITEMS,PLATFORM_URLS,localDay,prepareScheduledItems,readScheduledItems,pendingState,createReminderICS} from './schedule-core.js';
const $=id=>document.getElementById(id);
const section=$('studio-scheduler'), dateInput=$('schedule-when'), consent=$('schedule-local-consent'),message=$('schedule-message');
const list=$('schedule-list'),days=$('schedule-days'),monthLabel=$('schedule-month-label'),count=$('schedule-count');
let items=[],month=new Date(new Date().getFullYear(),new Date().getMonth(),1),filter=null,unavailable=false;
const selected=()=>PLATFORMS.filter(p=>$(`schedule-check-${p.id}`).checked).map(p=>p.id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function announce(s){message.textContent=s;}
function safeStore(next){
  if(unavailable){announce('Browser storage is unavailable. No schedule was saved.');return false;}
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify(next));items=next;return true;}
  catch {announce('Saving failed (storage blocked or full). Nothing new was saved.');return false;}
}
function timestampText(item){return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.at));}
function downloadIcs(records){
  let url;
  try{
    const data=createReminderICS(records);
    url=URL.createObjectURL(new Blob([data],{type:'text/calendar;charset=utf-8'}));
    const anchor=document.createElement('a'); anchor.href=url;anchor.download='socialspark-manual-reminders.ics';
    document.body.append(anchor);anchor.click();anchor.remove(); announce('Calendar file prepared. Import it into your calendar app to receive reminders. The file contains no post text.');
  }catch {announce('Could not prepare the calendar file. Nothing was transmitted.');}
  finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),3000);}
}
function drawCalendar(){
  const year=month.getFullYear(),mon=month.getMonth();
  monthLabel.textContent=month.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  days.replaceChildren();
  for(const label of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']) days.append(node('span',label,'schedule-day-header'));
  const offset=new Date(year,mon,1).getDay(),length=new Date(year,mon+1,0).getDate();
  for(let i=0;i<offset;i++)days.append(node('span','','schedule-blank'));
  for(let i=1;i<=length;i++){
    const day=localDay(new Date(year,mon,i)),total=items.filter(x=>localDay(x.at)===day).length;
    const button=node('button',`${i}${total?' · '+total:''}`,'schedule-day');button.type='button';
    button.setAttribute('aria-label',`${day}: ${total} scheduled manual post${total===1?'':'s'}`);
    if(day===localDay(new Date()))button.classList.add('is-today');
    if(filter===day){button.classList.add('is-selected');button.setAttribute('aria-pressed','true');}
    else button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>{filter=filter===day?null:day;drawCalendar();drawList();});days.append(button);
  }
}
function makeRecord(item){
  const platform=PLATFORMS.find(p=>p.id===item.platform);
  const block=node('article',undefined,'schedule-entry');
  const top=node('div',undefined,'schedule-entry-top');
  top.append(node('strong',`${platform.label} · ${timestampText(item)}`));
  top.append(node('span',pendingState(item),'schedule-state'));block.append(top);
  const details=node('details',undefined,'schedule-entry-details');
  details.append(node('summary','Review saved post text'));
  const draft=node('pre',item.text,'schedule-saved-text');details.append(draft);
  let review;
  try{review=reviewText(item.text);}
  catch{review={complete:false,concerns:true,findings:[],limitations:['Local checks failed. Copy requires explicit review.']};}
  const needsReview=review.concerns||!review.complete;
  if(needsReview){
    const notice=node('p','Privacy concerns or incomplete checks detected. Review this saved text before copying. No safety guarantee.','schedule-warning');details.append(notice);
    const findings=node('ul');
    for(const finding of review.findings) {findings.append(node('li',finding.title));}
    for(const limit of review.limitations||[])findings.append(node('li',limit));
    details.append(findings);
  }else details.append(node('p','No known patterns detected; safety is not guaranteed.','schedule-help'));
  const buttons=node('div',undefined,'schedule-entry-buttons');
  const copy=node('button','Copy exact draft','outline');copy.type='button';
  const ack=node('input');ack.type='checkbox';
  if(needsReview){
    const label=node('label',undefined,'schedule-ack');label.append(ack,document.createTextNode(' I reviewed the privacy warnings and choose to copy this exact saved draft.'));details.append(label);
    copy.disabled=true;
    ack.addEventListener('change',()=>{copy.disabled=!ack.checked;});
  }
  copy.addEventListener('click',async()=>{
    if(!getCopyAvailability({text:item.text,review,currentRevision:1,reviewRevision:1,acknowledged:!needsReview||ack.checked}).enabled)return;
    try{await navigator.clipboard.writeText(item.text);announce(`Copied the exact ${platform.label} scheduled draft. Nothing was published.`);}
    catch{
      announce('Clipboard copy failed; select the visible saved text and use Ctrl+C.');
      const selection=window.getSelection();const range=document.createRange();range.selectNodeContents(draft);selection?.removeAllRanges();selection?.addRange(range);
    }
  });
  const open=node('button',`Open ${platform.label} ↗`,'outline');open.type='button';
  open.addEventListener('click',()=>{
    // Constant official homepage only. Never put draft in a URL or publish anything.
    window.open(PLATFORM_URLS[item.platform],'_blank','noopener,noreferrer');
    announce(`Opened ${platform.label}. You must still publish manually.`);
  });
  const reminder=node('button','Calendar reminder (.ics)','outline');reminder.type='button';reminder.addEventListener('click',()=>downloadIcs([item]));
  const remove=node('button','Delete saved draft','outline');remove.type='button';
  remove.addEventListener('click',()=>{if(!window.confirm(`Delete the locally saved ${platform.label} scheduled draft? This cannot be undone.`))return;
    if(safeStore(items.filter(x=>x.id!==item.id))){announce(`${platform.label} scheduled draft deleted from this browser.`);draw();}
  });
  buttons.append(copy,open,reminder,remove);details.append(buttons);block.append(details);
  return block;
}
function drawList(){
  list.replaceChildren();const showing=items.filter(x=>!filter||localDay(x.at)===filter).sort((a,b)=>a.at.localeCompare(b.at));
  count.textContent=filter?`Showing ${showing.length} on ${filter} · Click selected day to show all`:`${items.length} locally saved post${items.length===1?'':'s'} · None published automatically`;
  if(!showing.length){list.append(node('p',filter?'No saved posts on this date.':'No scheduled drafts saved in this browser yet.','schedule-help'));return;}
  for(const item of showing)list.append(makeRecord(item));
}
function draw(){drawCalendar();drawList();$('schedule-download-all').disabled=!items.length;}
$('schedule-prev-month').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);filter=null;draw();});
$('schedule-next-month').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);filter=null;draw();});
$('schedule-show-all').addEventListener('click',()=>{filter=null;draw();});
$('schedule-download-all').addEventListener('click',()=>downloadIcs(items));
$('schedule-save').addEventListener('click',()=>{
  if(!consent.checked){announce('Check the local-save acknowledgment before storing your post text.');return;}
  const draftMap=getSchedulingDrafts();
  if(!draftMap){announce('First generate, review, and finish editing the latest drafts.');return;}
  const platforms=selected();
  if(!platforms.length){announce('Choose at least one platform.');return;}
  for(const platform of platforms){
    if(!draftMap[platform]?.copyAllowed){announce(`${PLATFORMS.find(p=>p.id===platform).label} cannot be scheduled yet. Finish editing and resolve or acknowledge the card's privacy warnings.`);return;}
  }
  let additions;
  try{additions=prepareScheduledItems({drafts:Object.fromEntries(platforms.map(p=>[p,draftMap[p].text])),selected:platforms,when:dateInput.value});}
  catch(e){announce(e.message);return;}
  if(items.length+additions.length>MAX_ITEMS){announce(`This preview stores up to ${MAX_ITEMS} scheduled posts; delete some first.`);return;}
  if(safeStore([...items,...additions])){
    consent.checked=false; for(const platform of platforms)$(`schedule-check-${platform}`).checked=false;
    month=new Date(new Date(additions[0].at).getFullYear(),new Date(additions[0].at).getMonth(),1);
    filter=null;draw();announce(`${additions.length} post${additions.length===1?'':'s'} saved on this browser for manual publishing. No platform was contacted.`);
  }
});
try {items=readScheduledItems(localStorage.getItem(STORAGE_KEY));}
catch (e) {unavailable=true;announce(e.message+' Local saving is paused to protect existing records.');}
// Do not silently load saved draft content back into the main studio cards.
draw();
section.addEventListener('toggle',()=>{if(section.open)draw();});
