import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const outfile = 'api/compose.js';

await build({
  entryPoints: ['src/server/composeHandler.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  target: 'node20',
  legalComments: 'none',
  logLevel: 'info',
});

const out = readFileSync(outfile, 'utf8');
const specifiers = [
  ...out.matchAll(/^import\s.+from\s+['"]([^'"]+)['"]/gm),
].map((match) => match[1]);
if (
  specifiers.length === 0 ||
  specifiers.some((spec) => !spec.startsWith('node:'))
) {
  throw new Error(
    `${outfile} should only import node builtins, got: ${specifiers.join(', ') || 'none'}`,
  );
}
if (!out.includes('nemotron-3.5-lightning-30b-a3b')) {
  throw new Error(`${outfile} is missing the compose chain`);
}
if (!out.includes('/src/assets/library/L/main/book.svg')) {
  throw new Error(`${outfile} did not inline the library manifest`);
}

console.log(`bundled ${outfile} (${out.length} bytes, no .ts imports)`);
