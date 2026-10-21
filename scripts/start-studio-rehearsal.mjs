/** Opt-in LOCAL OFFLINE browser-to-server mock. No provider or API keys used. */
import {createAppServer} from '../server.mjs';
const port=4173;
createAppServer({offlineBridge:true}).listen(port,'127.0.0.1',()=>{
  process.stdout.write(`SocialSpark OFFLINE simulated browser bridge: http://127.0.0.1:${port}\nNo external AI calls. No API keys. No credit spending. One rehearsal until restart.\n`);
});
