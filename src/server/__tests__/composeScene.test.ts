import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../../library/manifest.json' with { type: 'json' };
import type { Manifest } from '../../model/types.ts';
import { validatePick } from '../../core/pick.ts';
import {
  DEFAULT_MODELS,
  FALLBACK_MODEL,
  NVIDIA_URL,
  PRIMARY_MODEL,
  clearModelCooldowns,
  composeScene,
  modelChain,
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

function messageResponse(message: unknown, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message }] }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function timeoutError(): Error {
  const error = new Error('timeout');
  error.name = 'TimeoutError';
  return error;
}

function modelOf(init: RequestInit | undefined): string {
  return (JSON.parse(String(init?.body)) as { model: string }).model;
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
    expect(pick?.main).toEqual(['book', 'pen', 'phone', 'coin']);
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

describe('modelChain', () => {
  it('keeps the built-in order and accepts a comma list', () => {
    expect(modelChain(undefined)).toEqual([...DEFAULT_MODELS]);
    expect(modelChain('')).toEqual([...DEFAULT_MODELS]);
    expect(modelChain(' , ')).toEqual([...DEFAULT_MODELS]);
    expect(modelChain(' reserve/one, reserve/two ,, reserve/three ')).toEqual([
      'reserve/one',
      'reserve/two',
      'reserve/three',
    ]);
  });
});

describe('composeScene', () => {
  beforeEach(() => {
    clearModelCooldowns();
    vi.stubEnv('NVIDIA_MODELS', '');
  });

  afterEach(() => {
    clearModelCooldowns();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

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
      main: ['book', 'pen'],
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
    expect(body.messages[0]?.content).toContain('от 2 до 4');
    expect(body.messages[0]?.content).toContain('wallet');
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
    expect(rateLimited.main).toEqual(['pen', 'book']);

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
    expect(timed.main).toEqual(['folder', 'book']);
    expect(timed.background).toEqual(['coin']);
  });

  it('falls back to tags when every model fails', async () => {
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

  it('reads JSON from reasoning_content when content is null', async () => {
    const result = await composeScene(
      { text: 'учёба', format: 'square' },
      {
        apiKey: secret,
        items,
        models: [PRIMARY_MODEL],
        fetch: () =>
          Promise.resolve(
            messageResponse({
              content: null,
              reasoning_content:
                '{"main":["book"],"background":[],"template":"compact","reason":"учёба"}',
            }),
          ),
      },
    );
    expect(result.source).toBe('model');
    expect(result.model).toBe(PRIMARY_MODEL);
    expect(result.main).toEqual(['book', 'pen']);
  });

  it('ignores think tags and keeps the JSON after them', async () => {
    const result = await composeScene(
      { text: 'учёба', format: 'square' },
      {
        apiKey: secret,
        items,
        models: [PRIMARY_MODEL],
        fetch: () =>
          Promise.resolve(
            jsonResponse(
              '<think>maybe {"main":["coin"]}</think>\n{"main":["book"],"background":[],"template":"compact","reason":"книга"}',
            ),
          ),
      },
    );
    expect(result.model).toBe(PRIMARY_MODEL);
    expect(result.main).toEqual(['book', 'pen']);
    expect(result.background).toEqual([]);
  });

  it('skips invalid JSON and uses the next reserve', async () => {
    const seen: string[] = [];
    const ultra = DEFAULT_MODELS[2];
    const result = await composeScene(
      { text: 'учёба', format: 'landscape' },
      {
        apiKey: secret,
        items,
        models: [PRIMARY_MODEL, FALLBACK_MODEL, ultra],
        fetch: (_url, init) => {
          const model = modelOf(init);
          seen.push(model);
          if (model === ultra) {
            return Promise.resolve(
              jsonResponse(
                '{"main":["pen"],"background":[],"template":"compact","reason":"ручка"}',
              ),
            );
          }
          return Promise.resolve(jsonResponse('not json'));
        },
      },
    );
    expect(seen).toEqual([PRIMARY_MODEL, FALLBACK_MODEL, ultra]);
    expect(result).toMatchObject({
      source: 'model',
      model: ultra,
      main: ['pen', 'book'],
    });
  });

  it('stops when the deadline is spent and returns tags', async () => {
    const seen: string[] = [];
    let clock = 5_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    const result = await composeScene(
      { text: 'учёба', format: 'square' },
      {
        apiKey: secret,
        items,
        models: ['slow/a', 'slow/b', 'slow/c'],
        timeoutMs: 400,
        deadlineMs: 1_000,
        fetch: (_url, init) => {
          seen.push(modelOf(init));
          clock += 800;
          return Promise.reject(timeoutError());
        },
      },
    );
    expect(seen).toEqual(['slow/a']);
    expect(result.source).toBe('tags');
    expect(result.main).toEqual(['book', 'pen']);
    expect(result.model).toBeUndefined();
  });

  it('skips a model that just timed out and tries it again after the cooldown', async () => {
    const seen: string[] = [];
    let clock = 20_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    const fetch = (_url: string | URL | Request, init?: RequestInit) => {
      const model = modelOf(init);
      seen.push(model);
      if (model === PRIMARY_MODEL) {
        clock += 20;
        return Promise.reject(timeoutError());
      }
      return Promise.resolve(
        jsonResponse(
          '{"main":["folder"],"background":[],"template":"compact","reason":"папка"}',
        ),
      );
    };
    const first = await composeScene(
      { text: 'учёба', format: 'landscape' },
      {
        apiKey: secret,
        items,
        models: [PRIMARY_MODEL, FALLBACK_MODEL],
        deadlineMs: 30_000,
        cooldownMs: 1_000,
        fetch,
      },
    );
    expect(first.model).toBe(FALLBACK_MODEL);
    expect(seen).toEqual([PRIMARY_MODEL, FALLBACK_MODEL]);

    seen.length = 0;
    const second = await composeScene(
      { text: 'учёба', format: 'landscape' },
      {
        apiKey: secret,
        items,
        models: [PRIMARY_MODEL, FALLBACK_MODEL],
        deadlineMs: 30_000,
        cooldownMs: 1_000,
        fetch,
      },
    );
    expect(second.model).toBe(FALLBACK_MODEL);
    expect(seen).toEqual([FALLBACK_MODEL]);

    clock += 1_001;
    seen.length = 0;
    await composeScene(
      { text: 'учёба', format: 'landscape' },
      {
        apiKey: secret,
        items,
        models: [PRIMARY_MODEL, FALLBACK_MODEL],
        deadlineMs: 30_000,
        cooldownMs: 1_000,
        fetch,
      },
    );
    expect(seen[0]).toBe(PRIMARY_MODEL);
  });

  it('asks MiniMax with reasoning disabled and a larger token budget', async () => {
    const minimax = DEFAULT_MODELS[4];
    const bodies: {
      max_tokens?: number;
      reasoning_effort?: string;
      chat_template_kwargs?: { thinking_mode?: string };
    }[] = [];
    const result = await composeScene(
      { text: 'деньги', format: 'square' },
      {
        apiKey: secret,
        items,
        models: [minimax],
        fetch: (_url, init) => {
          bodies.push(JSON.parse(String(init?.body)));
          return Promise.resolve(
            messageResponse({
              content: null,
              reasoning_content:
                '<think>wallet</think>{"main":["wallet"],"background":[],"template":"compact","reason":"деньги"}',
            }),
          );
        },
      },
    );
    expect(result).toMatchObject({
      source: 'model',
      model: minimax,
      main: ['wallet', 'coin'],
    });
    expect(bodies[0]?.max_tokens).toBe(1600);
    expect(bodies[0]?.reasoning_effort).toBe('none');
    expect(bodies[0]?.chat_template_kwargs).toEqual({
      thinking_mode: 'disabled',
    });
  });

  it('turns GLM thinking off', async () => {
    const bodies: {
      model: string;
      reasoning_effort?: string;
      chat_template_kwargs?: { enable_thinking?: boolean };
    }[] = [];
    await composeScene(
      { text: 'учёба', format: 'landscape' },
      {
        apiKey: secret,
        items,
        models: [FALLBACK_MODEL],
        fetch: (_url, init) => {
          bodies.push(JSON.parse(String(init?.body)));
          return Promise.resolve(
            jsonResponse(
              '{"main":["book"],"background":[],"template":"compact","reason":"книга"}',
            ),
          );
        },
      },
    );
    expect(bodies[0]?.model).toBe(FALLBACK_MODEL);
    expect(bodies[0]?.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(bodies[0]?.reasoning_effort).toBe('none');
  });

  it('uses NVIDIA_MODELS instead of the built-in chain', async () => {
    vi.stubEnv('NVIDIA_MODELS', ' custom/one, custom/two ');
    const seen: string[] = [];
    const result = await composeScene(
      { text: 'учёба', format: 'portrait' },
      {
        apiKey: secret,
        items,
        fetch: (_url, init) => {
          const model = modelOf(init);
          seen.push(model);
          if (model === 'custom/one') {
            return Promise.resolve(new Response('missing', { status: 404 }));
          }
          return Promise.resolve(
            jsonResponse(
              '{"main":["lamp","folder"],"background":[],"template":"compact","reason":"свет"}',
            ),
          );
        },
      },
    );
    expect(seen).toEqual(['custom/one', 'custom/two']);
    expect(result).toMatchObject({
      source: 'model',
      model: 'custom/two',
      main: ['lamp', 'folder'],
    });
  });
});
