import { describe, expect, it } from 'vitest';
import manifest from '../../library/manifest.json' with { type: 'json' };
import type { Manifest } from '../../model/types.ts';
import { validatePick } from '../../core/pick.ts';
import {
  FALLBACK_MODEL,
  NVIDIA_URL,
  PRIMARY_MODEL,
  composeScene,
} from '../composeScene.ts';

const items = (manifest as Manifest).items;
const ids = new Set(items.map((item) => item.objectId));
const secret = 'sk-test-nvidia-key-should-not-leak';

function jsonResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('validatePick', () => {
  it('drops unknown ids and duplicates and keeps a known background', () => {
    const pick = validatePick(
      {
        main: ['dragon', 'book', 'book', 'pen', 'phone', 'coin'],
        background: ['nope', 'lamp', 'lamp'],
        template: 'compact',
        reason: 'учёба',
      },
      ids,
    );
    expect(pick?.main).toEqual(['book', 'pen', 'phone']);
    expect(pick?.background).toEqual(['lamp']);
    expect(pick?.template).toBe('compact');
  });

  it('rejects a template that is not one of the three', () => {
    const pick = validatePick(
      { main: ['book'], background: [], template: 'spiral', reason: '' },
      ids,
    );
    expect(pick?.template).toBeUndefined();
    expect(pick?.main).toEqual(['book']);
  });
});

describe('composeScene', () => {
  it('picks by tags and does not call the model when the key is missing', async () => {
    let called = false;
    const result = await composeScene(
      { text: 'учёба', format: 'square' },
      {
        items,
        fetch: () => {
          called = true;
          return Promise.resolve(jsonResponse('{}'));
        },
      },
    );
    expect(called).toBe(false);
    expect(result.source).toBe('tags');
    expect(result.main).toEqual(['book', 'pen']);
    expect(result.model).toBeUndefined();
  });

  it('uses the primary model and does not echo the key', async () => {
    const bodies: unknown[] = [];
    const result = await composeScene(
      { text: 'учёба', format: 'portrait' },
      {
        apiKey: secret,
        items,
        fetch: (url, init) => {
          expect(url).toBe(NVIDIA_URL);
          expect(init?.headers).toMatchObject({
            Authorization: `Bearer ${secret}`,
          });
          bodies.push(JSON.parse(String(init?.body)));
          return Promise.resolve(
            jsonResponse(
              '```json\n{"main":["dragon","book"],"background":["lamp"],"template":"under-title","reason":"чтение"}\n```',
            ),
          );
        },
      },
    );
    expect(result).toMatchObject({
      source: 'model',
      model: PRIMARY_MODEL,
      main: ['book'],
      background: ['lamp'],
      template: 'under-title',
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    const body = bodies[0] as {
      model: string;
      chat_template_kwargs?: { enable_thinking?: boolean };
      response_format?: unknown;
      messages: { content: string }[];
    };
    expect(body.model).toBe(PRIMARY_MODEL);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.response_format).toBeUndefined();
    expect(body.messages[0]?.content).toContain('учёба');
    expect(body.messages[0]?.content).toContain('book');
  });

  it('tries the fallback model after a 429 and after a timeout', async () => {
    const seen: string[] = [];
    const rateLimited = await composeScene(
      { text: 'учёба', format: 'landscape' },
      {
        apiKey: secret,
        items,
        fetch: (_url, init) => {
          const model = (JSON.parse(String(init?.body)) as { model: string })
            .model;
          seen.push(model);
          if (model === PRIMARY_MODEL) {
            return Promise.resolve(new Response('busy', { status: 429 }));
          }
          return Promise.resolve(
            jsonResponse(
              '{"main":["pen"],"background":[],"template":"offset","reason":"ручка"}',
            ),
          );
        },
      },
    );
    expect(seen).toEqual([PRIMARY_MODEL, FALLBACK_MODEL]);
    expect(rateLimited.model).toBe(FALLBACK_MODEL);
    expect(rateLimited.main).toEqual(['pen']);

    const timed = await composeScene(
      { text: 'учёба', format: 'landscape' },
      {
        apiKey: secret,
        items,
        timeoutMs: 30,
        fetch: (_url, init) => {
          const model = (JSON.parse(String(init?.body)) as { model: string })
            .model;
          if (model === PRIMARY_MODEL) {
            return new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => {
                reject(new Error('aborted'));
              });
            });
          }
          return Promise.resolve(
            jsonResponse(
              '{"main":["folder"],"background":["coin"],"template":"compact","reason":"работа"}',
            ),
          );
        },
      },
    );
    expect(timed.model).toBe(FALLBACK_MODEL);
    expect(timed.main).toEqual(['folder']);
    expect(timed.background).toEqual(['coin']);
  });

  it('falls back to tags when both models fail', async () => {
    const result = await composeScene(
      { text: 'время - деньги', format: 'landscape' },
      {
        apiKey: secret,
        items,
        fetch: () => Promise.resolve(new Response('nope', { status: 500 })),
      },
    );
    expect(result.source).toBe('tags');
    expect(result.main).toEqual(['coin', 'wallet']);
    expect(result.model).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
