import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Root `pnpm test` also runs tools/**/*.test.ts, which import tools/ dependencies
// (e.g. @anthropic-ai/sdk). Print a clear hint up front; the affected suites then fail with
// a "Failed to resolve import" error that is easy to connect to it.
export default function setup() {
  const sdk = fileURLToPath(new URL('./tools/node_modules/@anthropic-ai/sdk', import.meta.url));
  if (!existsSync(sdk)) {
    console.error(
      'tools/ dependencies are not installed. Run `pnpm install` in tools/ (cd tools && pnpm install) before `pnpm test`.',
    );
  }
}
