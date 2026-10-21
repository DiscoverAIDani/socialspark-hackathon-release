import {runFictionalNebiusRehearsal} from '../security/nebius-fake-session.mjs';
const state=await runFictionalNebiusRehearsal();
process.stdout.write(`SocialSpark Nebius mock gateway rehearsal\n`);
process.stdout.write(`Fictional consent-bound request: ${state.ok?'PASS':'FAIL'}\n`);
process.stdout.write(`Validated platform drafts: ${state.platformCount??0}\n`);
process.stdout.write(`One-time approval replay blocked: ${state.replayBlocked?'YES':'NO'}\n`);
process.stdout.write(`Real external requests: ${state.realNetworkCalls??0}\n`);
process.stdout.write(`Nebius credits spent: $0\n`);
if(!state.ok||!state.replayBlocked||state.platformCount!==4)process.exitCode=1;
