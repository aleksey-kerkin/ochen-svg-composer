import { afterEach, describe, expect, it } from 'vitest';
import handler from '../composeHandler.ts';

interface Reply {
  code: number;
  body: unknown;
}

const saved = process.env.NVIDIA_API_KEY;

afterEach(() => {
  if (saved === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = saved;
});

async function call(body: unknown, method = 'POST'): Promise<Reply> {
  const reply: Reply = { code: 0, body: undefined };
  const res = {
    status(code: number) {
      reply.code = code;
      return this;
    },
    json(payload: unknown) {
      reply.body = payload;
    },
  };
  await handler({ method, body }, res);
  return reply;
}

describe('compose handler', () => {
  it('rejects anything but POST and an empty text', async () => {
    delete process.env.NVIDIA_API_KEY;
    expect((await call({ text: 'учёба' }, 'GET')).code).toBe(405);
    expect((await call({ text: '  ' })).code).toBe(400);
  });

  it('picks by tags when the server has no key', async () => {
    delete process.env.NVIDIA_API_KEY;
    const reply = await call({ text: 'учёба', format: 'landscape' });
    expect(reply.code).toBe(200);
    expect(reply.body).toMatchObject({
      source: 'tags',
      main: ['book', 'pen'],
    });
  });
});
