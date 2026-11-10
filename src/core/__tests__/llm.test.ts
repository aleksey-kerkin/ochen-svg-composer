import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestMetaphor } from '../llm.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestMetaphor', () => {
  it('keeps only library ids from the server payload', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            main: ['dragon', 'book'],
            background: ['lamp', 'nope'],
            template: 'compact',
            source: 'model',
            model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
            reason: 'ok',
          }),
          { status: 200 },
        ),
      ),
    );
    const pick = await requestMetaphor('учёба', 'square');
    expect(pick.main).toEqual(['book', 'pen']);
    expect(pick.background).toEqual(['lamp']);
    expect(pick.source).toBe('model');
    expect(pick.model).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
  });
});
