#!/usr/bin/env node
// Offline-only invitation minting. Generates a 256-bit random code once.
// Never invokes Cloudflare, Nebius or GitHub and never writes the code to disk.
// Run only on the owner's trusted terminal after deployment has been approved.
import {randomBytes,createHash} from 'node:crypto';

const [label,expiry] = process.argv.slice(2);
if(process.argv.length!==4||!label||!/^[A-Za-z0-9_-]{1,32}$/.test(label)){
  process.stderr.write('Usage: node judge-gateway/mint-invite.mjs judge_a 2026-12-15T23:59:00-08:00\n');
  process.exitCode=2;
}else{
  const expiryMs=Date.parse(expiry||'');
  const hardEnd=Date.parse('2026-12-16T08:00:00.000Z');
  if(!Number.isFinite(expiryMs)||expiryMs<=Date.now()||expiryMs>hardEnd){
    process.stderr.write('Expiry must be a future ISO timestamp on/before 2026-12-15 23:59 PST.\n');
    process.exitCode=2;
  }else{
    const code=randomBytes(32).toString('hex');
    const digest=createHash('sha256').update(code).digest('hex');
    const seconds=Math.floor(expiryMs/1000);
    process.stdout.write('INVITE CODE (show privately once; NEVER paste into GitHub/chat/logs): '+code+'\n\n');
    process.stdout.write('D1 admin SQL (hash only, not the invite code):\n');
    process.stdout.write("INSERT INTO judge_invites(token_sha256,enabled,expires_at_utc,label) VALUES('"+
      digest+"',1,"+seconds+",'"+label+"');\n");
    process.stdout.write('Disable invite: UPDATE judge_invites SET enabled=0 WHERE token_sha256='+
      "'"+digest+"';\n");
  }
}
