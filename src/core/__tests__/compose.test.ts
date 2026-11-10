import { describe, expect, it } from 'vitest';
import { composePlacements } from '../compose.ts';
import { templateById } from '../layout.ts';

describe('composePlacements', () => {
  it('lays two objects on the active template in the current format', () => {
    const placed = composePlacements(
      [
        { objectId: 'headphones', count: 1 },
        { objectId: 'flowers', count: 1 },
      ],
      { format: 'portrait', templateId: 'offset', seed: 1 },
    );
    expect(placed.templateId).toBe('offset');
    expect(placed.scale).toBeCloseTo(templateById('offset', 'portrait').scale);
    expect(placed.objects.map((object) => object.objectId).sort()).toEqual([
      'flowers',
      'headphones',
    ]);
    expect(placed.objects.every((object) => object.role === 'main')).toBe(true);
  });

  it('picks a wider template instead of dropping objects', () => {
    const placed = composePlacements(
      [
        { objectId: 'book', count: 1 },
        { objectId: 'phone', count: 1 },
        { objectId: 'puzzle', count: 1 },
      ],
      { format: 'square', templateId: 'under-title', seed: 2 },
    );
    expect(placed.templateId).toBe('compact');
    expect(placed.objects).toHaveLength(3);
    expect(placed.objects.every((object) => object.role === 'main')).toBe(true);
    expect(
      placed.objects.find((object) => object.objectId === 'book')?.role,
    ).toBe('main');
  });

  it('makes objects beyond the main slots background and keeps overflow', () => {
    const four = composePlacements(
      [
        { objectId: 'book', count: 1 },
        { objectId: 'phone', count: 1 },
        { objectId: 'puzzle', count: 1 },
        { objectId: 'pen', count: 1 },
      ],
      { format: 'landscape', seed: 1 },
    );
    expect(four.objects).toHaveLength(4);
    expect(
      four.objects.filter((object) => object.role === 'main'),
    ).toHaveLength(3);
    expect(four.objects.find((object) => object.objectId === 'pen')?.role).toBe(
      'background',
    );

    const six = composePlacements([{ objectId: 'coin', count: 6 }], {
      format: 'landscape',
      templateId: 'compact',
      seed: 3,
    });
    expect(six.objects).toHaveLength(6);
    expect(new Set(six.objects.map((object) => object.uid)).size).toBe(6);
  });

  it('uses the smallest fitting template when none is active', () => {
    expect(
      composePlacements([{ objectId: 'book', count: 1 }], {
        format: 'landscape',
        seed: 1,
      }).templateId,
    ).toBe('under-title');
    expect(
      composePlacements(
        [
          { objectId: 'book', count: 1 },
          { objectId: 'phone', count: 1 },
        ],
        { format: 'landscape', seed: 1 },
      ).templateId,
    ).toBe('offset');
  });
});
