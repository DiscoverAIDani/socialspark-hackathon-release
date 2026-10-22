import {defineConfig} from 'vitest/config';
import {cloudflareTest} from '@cloudflare/vitest-plugin';

/** Runs exclusively inside LOCAL workerd. Not a deployment configuration. */
export default defineConfig({
  plugins:[cloudflareTest({
    wrangler:{configPath:'./runtime-security/wrangler.runtime.jsonc'}
  })],
  test:{
    include:['runtime-security/cloudflare-checks.mjs'],
    maxWorkers:1,
    testTimeout:30_000
  }
});
