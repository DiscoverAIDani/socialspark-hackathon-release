/** Locked, developer-only local browser trial. Intentionally not auto-started.
 * Not production authentication, an account-wide cost cap, or a public deployment.
 */
import {createInterface} from 'node:readline/promises';
import {access} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAppServer} from '../server.mjs';
import {inspectOperatorKey,NANO_MODEL} from '../security/fictional-live-test.mjs';
import {OWNER_LIVE_IDEA} from '../security/owner-live-scenario.mjs';

const lockPath=join(dirname(fileURLToPath(import.meta.url)),'..','.socialspark-browser-owner-live-request.lock');
const fail=msg=>{process.stderr.write(`${msg}\n`);process.exitCode=1;};
async function hiddenInput(prompt){
  if(!process.stdin.isTTY||!process.stdin.setRawMode)throw Error('interactive-required');
  process.stdout.write(prompt);
  let value='';process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
  try {return await new Promise((resolve,reject)=>{
    const cleanup=()=>{process.stdin.removeListener('data',onData);process.stdin.setRawMode(false);process.stdin.pause();};
    const onData=part=>{for(const ch of part){
      if(ch==='\u0003'){cleanup();reject(Error('cancelled'));return;}
      if(ch==='\r'||ch==='\n'){cleanup();process.stdout.write('\n');resolve(value);return;}
      if(ch==='\b'||ch==='\u007f'){value=value.slice(0,-1);continue;}
      if(value.length<512&&ch>=' '&&ch<='~')value+=ch;
    }};process.stdin.on('data',onData);
  });} finally {if(process.stdin.isRaw)process.stdin.setRawMode(false);}
}
async function main(){
  if(process.env.SOCIALSPARK_OWNER_LIVE_UNLOCK!=='SEPARATELY_AUTHORIZED_BROWSER_TRIAL'||!process.stdin.isTTY||!process.stdout.isTTY){
    fail('Owner live browser trial LOCKED. Requires a new, separately authorized test and interactive startup. No provider request.');return;
  }
  try {await access(lockPath);fail('A browser live attempt was reserved in this copy already. Do not delete the lock.');return;}
  catch(e){if(e.code!=='ENOENT'){fail('Unable to check request reservation.');return;}}
  process.stdout.write(`\nSOCIALSPARK: SEPARATELY AUTHORIZED, POTENTIALLY BILLABLE BROWSER TRIAL\nModel: ${NANO_MODEL}\nExact user text: ${OWNER_LIVE_IDEA}\nOne attempt only. No automatic retry. Local lock is NOT a Nebius spending cap.\n`);
  const rl=createInterface({input:process.stdin,output:process.stdout});
  let response;
  try {response=await rl.question('Type exactly ENABLE NEW POTENTIALLY BILLABLE BROWSER TRIAL to continue: ');}finally{rl.close();}
  if(response!=='ENABLE NEW POTENTIALLY BILLABLE BROWSER TRIAL'){fail('Cancelled, no provider request.');return;}
  let key,second;
  try{key=await hiddenInput('Paste your Nebius API key ONCE (hidden, not saved): ');
    if(!inspectOperatorKey(key).ok){fail('API key did not pass local format checks.');return;}
    second=await hiddenInput('Paste the SAME API key ONCE more (hidden, not saved): ');
    if(key!==second||!inspectOperatorKey(second).ok){fail('Entries did not match. No provider request.');return;}
  } catch{fail('Cancelled.');return;}
  second='';
  const server=createAppServer({ownerLiveTrial:{key,lockPath}});
  key='';
  server.listen(4173,'127.0.0.1',()=>{
    process.stdout.write('Owner-only fictional browser trial ready at http://127.0.0.1:4173\nNo external request made yet. Confirm exact preview and consent in browser. Do not rerun or remove lock after attempting.\n');
  });
}
main().catch(()=>fail('Owner trial unavailable. No automatic retry.'));
