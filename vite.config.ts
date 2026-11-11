import type { IncomingMessage } from 'node:http';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import type { FormatId } from './src/model/types.ts';
import { composeScene } from './src/server/composeScene.ts';
import { readNvidiaKey } from './src/server/readApiKey.ts';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Same handler as the Vercel function, so `pnpm dev` does not need the CLI. */
function composeApi(): Plugin {
  return {
    name: 'compose-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/api/compose') {
          next();
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Только POST' }));
          return;
        }
        void (async () => {
          try {
            const raw = await readBody(req);
            const body = JSON.parse(raw) as {
              text?: unknown;
              format?: unknown;
            };
            const text = typeof body.text === 'string' ? body.text : '';
            const formats = ['landscape', 'square', 'portrait'] as const;
            const format = formats.includes(body.format as FormatId)
              ? (body.format as FormatId)
              : 'landscape';
            if (!text.trim()) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'Нужен текст' }));
              return;
            }
            const result = await composeScene(
              { text, format },
              { apiKey: readNvidiaKey() },
            );
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(result));
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Нужен JSON' }));
          }
        })();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), composeApi()],
});
