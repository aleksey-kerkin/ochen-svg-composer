import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNvidiaKey } from '../readApiKey.ts';

const roots: string[] = [];
const saved = process.env.NVIDIA_API_KEY;

afterEach(() => {
  if (saved === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = saved;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ochen-key-'));
  roots.push(root);
  return root;
}

describe('readNvidiaKey', () => {
  it('prefers the process environment over .env.local', () => {
    const root = tempRoot();
    writeFileSync(join(root, '.env.local'), 'NVIDIA_API_KEY=from-file\n');
    process.env.NVIDIA_API_KEY = 'from-env';
    expect(readNvidiaKey(root)).toBe('from-env');
  });

  it('reads .env.local and then .env, and ignores other names', () => {
    const root = tempRoot();
    delete process.env.NVIDIA_API_KEY;
    writeFileSync(
      join(root, '.env'),
      'VITE_NVIDIA_API_KEY=leaked\nNVIDIA_API_KEY="from-dotenv"\n',
    );
    expect(readNvidiaKey(root)).toBe('from-dotenv');
    writeFileSync(join(root, '.env.local'), "NVIDIA_API_KEY='from-local'\n");
    expect(readNvidiaKey(root)).toBe('from-local');
  });

  it('is not referenced from the browser sources', () => {
    const files = [
      'src/core/llm.ts',
      'src/ui/Toolbar.tsx',
      'src/ui/PromptBar.tsx',
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toContain('NVIDIA_API_KEY');
      expect(text).not.toContain('readNvidiaKey');
    }
  });
});
