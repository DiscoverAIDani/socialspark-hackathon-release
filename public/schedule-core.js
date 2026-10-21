/** Manual local scheduler. Does not publish, send network requests or register background tasks. */
import { PLATFORMS } from './platform-drafts.js';

export const STORAGE_KEY = 'socialspark-manual-schedule-v1';
export const MAX_ITEMS = 60;
export const PLATFORM_URLS = Object.freeze({
  facebook:'https://www.facebook.com/', instagram:'https://www.instagram.com/',
  linkedin:'https://www.linkedin.com/feed/', tiktok:'https://www.tiktok.com/'
});
const PLATFORM_IDS = new Set(PLATFORMS.map(p=>p.id));
const DURATION = 30*60*1000;

export function localDateTime(value) {
  if(typeof value!=='string') return null;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if(!m) return null;
  const [y,mon,d,h,min]=m.slice(1).map(Number);
  const date=new Date(y,mon-1,d,h,min,0,0);
  if(!Number.isFinite(date.getTime()) || date.getFullYear()!==y || date.getMonth()!==mon-1 || date.getDate()!==d || date.getHours()!==h || date.getMinutes()!==min) return null;
  return date;
}
export function localDay(when) {
  const d=new Date(when);
  if(!Number.isFinite(d.getTime())) return '';
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
export function prepareScheduledItems({drafts,selected,when,now=new Date(),idFactory=()=>crypto.randomUUID()}) {
  const at=localDateTime(when);
  if(!at) throw new Error('Select a valid date and time on your device.');
  if(at.getTime() <= now.getTime()+59_000) throw new Error('Choose a future date and time (at least one minute from now).');
  if(at.getTime()>now.getTime()+366*86_400_000) throw new Error('For this preview, schedule no more than one year ahead.');
  if(!Array.isArray(selected)||selected.length===0) throw new Error('Choose at least one platform.');
  if(new Set(selected).size!==selected.length || selected.some(p=>!PLATFORM_IDS.has(p))) throw new Error('Unsupported or duplicate platform selection.');
  if(!drafts || typeof drafts!=='object') throw new Error('Create and review platform drafts before scheduling.');
  const timestamp=at.toISOString(),createdAt=now.toISOString();
  return selected.map(platform=>{
    const text=drafts[platform];
    if(typeof text!=='string'||!text.trim()||text.length>6000) throw new Error(`Invalid ${platform} draft. Please revise before scheduling.`);
    const id=idFactory();
    if(typeof id!=='string'|| !/^[\da-z-]{8,80}$/i.test(id)) throw new Error('Could not create a safe schedule identifier.');
    return {id,platform,text,at:timestamp,createdAt};
  });
}
export function readScheduledItems(raw) {
  if(!raw) return [];
  let data;
  try {data=JSON.parse(raw);} catch {throw new Error('Saved schedule data could not be read; it was not changed.');}
  if(!Array.isArray(data)||data.length>MAX_ITEMS) throw new Error('Saved schedule data exceeds the safe preview limit.');
  if(data.some(v=>!v || typeof v!=='object' || Array.isArray(v) || typeof v.id!=='string' || !/^[\da-z-]{8,80}$/i.test(v.id)
    || !PLATFORM_IDS.has(v.platform) || typeof v.text!=='string' || !v.text.trim() || v.text.length>6000
    || typeof v.at!=='string' || !Number.isFinite(Date.parse(v.at)) || new Date(v.at).toISOString()!==v.at
    || typeof v.createdAt!=='string' || !Number.isFinite(Date.parse(v.createdAt)) || new Date(v.createdAt).toISOString()!==v.createdAt))
    throw new Error('Saved schedule data failed validation. No saved draft was loaded.');
  if(new Set(data.map(x=>x.id)).size!==data.length) throw new Error('Saved schedule contains duplicate identifiers.');
  return data.map(({id,platform,text,at,createdAt})=>({id,platform,text,at,createdAt}));
}
export function pendingState(item,now=Date.now()) {
  return Date.parse(item.at)<=now?'Due for manual posting':'Awaiting manual posting';
}
function icsEscape(value) {
  return String(value).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
}
function utcIcs(value) {return new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function foldIcsLine(line) {
  // RFC 5545: 75 UTF-8 octets max per physical line, with space continuation.
  const encoder=new TextEncoder(); const output=[]; let part='',size=0;
  for(const point of line) {
    const count=encoder.encode(point).length;
    if(size+count>73) {output.push(part);part=' '+point;size=1+count;}
    else {part+=point;size+=count;}
  }
  output.push(part);return output;
}
/** Content deliberately omitted; importing calendar events may sync to a third party. */
export function createReminderICS(items,now=new Date()) {
  if(!Array.isArray(items)||!items.length||items.length>MAX_ITEMS) throw new Error('No valid calendar reminders to export.');
  const checked=readScheduledItems(JSON.stringify(items));
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SocialSpark//Manual reminder preview//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  for(const item of checked){
    const label=PLATFORMS.find(p=>p.id===item.platform).label;
    const id=icsEscape(item.id);
    lines.push('BEGIN:VEVENT',`UID:${id}@socialspark.local`,`DTSTAMP:${utcIcs(now)}`,`DTSTART:${utcIcs(item.at)}`,`DTEND:${utcIcs(new Date(Date.parse(item.at)+DURATION))}`,`SUMMARY:${icsEscape('SocialSpark: manually post to '+label)}`,`DESCRIPTION:${icsEscape('Reminder only. Open SocialSpark in the same browser to review and manually post. No post content is included in this calendar file.')}`,'BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY','DESCRIPTION:Review your SocialSpark draft for manual posting','END:VALARM','END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.flatMap(foldIcsLine).join('\r\n')+'\r\n';
}
