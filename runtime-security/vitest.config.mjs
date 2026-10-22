import {defineConfig} from 'vitest/config';
import {cloudflareTest} from '@cloudflare/vitest-plugin';

/** Runs exclusively inside LOCAL workerd. Not a deployment configuration. */
export default defineConfig({
  plugins:[cloudflareTest({
    wrangler:{configPath:'./wrangler.runtime.jsonc'}
  })],
  test:{
    include:['cloudflare-checks.mjs','judge-full-flow-checks.mjs','judge-http-flow-checks.mjs','emergency-stop-checks.mjs','emergency-gated-flow-checks.mjs','canonical-do-rpc-checks.mjs'],
    maxWorkers:1,
    testTimeout:30_000
  }
});
