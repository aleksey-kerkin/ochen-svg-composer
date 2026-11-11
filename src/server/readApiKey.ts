import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Server-only. Reads NVIDIA_API_KEY from the process environment (Vercel)
 * and, for local runs, from .env.local then .env. Never use a VITE_ prefix:
 * Vite would ship that value to the browser.
 */
export function readNvidiaKey(root = process.cwd()): string | undefined {
  const fromProcess = process.env.NVIDIA_API_KEY?.trim();
  if (fromProcess) return fromProcess;
  for (const file of ['.env.local', '.env']) {
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    const value = keyFromFile(readFileSync(path, 'utf8'));
    if (value) return value;
  }
  return undefined;
}

function keyFromFile(text: string): string | undefined {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq).trim() !== 'NVIDIA_API_KEY') continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    const key = value.trim();
    if (key) return key;
  }
  return undefined;
}
