import { describe, expect, it } from 'vitest';
import { composePick, composePlacements } from '../compose.ts';
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
    const mains = placed.objects.filter((object) => object.role === 'main');
    expect(mains.map((object) => object.objectId).sort()).toEqual([
      'flowers',
      'headphones',
    ]);
    const backgrounds = placed.objects.filter(
      (object) => object.role === 'background',
    );
    expect(backgrounds.length).toBeGreaterThanOrEqual(1);
    expect(backgrounds.length).toBeLessThanOrEqual(2);
    expect(
      backgrounds.every(
        (object) =>
          object.objectId !== 'flowers' && object.objectId !== 'headphones',
      ),
    ).toBe(true);
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
    const mains = placed.objects.filter((object) => object.role === 'main');
    expect(mains).toHaveLength(3);
    expect(mains.every((object) => object.role === 'main')).toBe(true);
    expect(
      placed.objects.find((object) => object.objectId === 'book')?.role,
    ).toBe('main');
  });

  it('keeps every named object main and adds background companions', () => {
    const four = composePlacements(
      [
        { objectId: 'book', count: 1 },
        { objectId: 'phone', count: 1 },
        { objectId: 'puzzle', count: 1 },
        { objectId: 'pen', count: 1 },
      ],
      { format: 'landscape', seed: 1 },
    );
    const mains = four.objects.filter((object) => object.role === 'main');
    expect(mains.map((object) => object.objectId).sort()).toEqual([
      'book',
      'pen',
      'phone',
      'puzzle',
    ]);
    expect(
      four.objects.filter((object) => object.role === 'background').length,
    ).toBeGreaterThanOrEqual(1);

    const six = composePlacements([{ objectId: 'coin', count: 6 }], {
      format: 'landscape',
      templateId: 'compact',
      seed: 3,
      withBackgrounds: false,
    });
    expect(six.objects).toHaveLength(6);
    expect(new Set(six.objects.map((object) => object.uid)).size).toBe(6);
    expect(six.objects.every((object) => object.role === 'main')).toBe(true);
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

  it('lays a metaphor pick out without inventing extra backgrounds', () => {
    const placed = composePick(
      {
        main: ['book', 'pen'],
        background: [],
        template: 'offset',
      },
      { format: 'square', seed: 1 },
    );
    expect(placed.templateId).toBe('offset');
    expect(placed.objects.map((object) => object.role)).toEqual([
      'main',
      'main',
    ]);
    const withLamp = composePick(
      {
        main: ['headphones'],
        background: ['lamp'],
        template: 'compact',
      },
      { format: 'landscape', seed: 2 },
    );
    const lamp = withLamp.objects.find((object) => object.objectId === 'lamp');
    const phones = withLamp.objects.find(
      (object) => object.objectId === 'headphones',
    );
    expect(lamp?.role).toBe('background');
    expect(phones?.role).toBe('main');
    expect(lamp && phones && lamp.z < phones.z).toBe(true);
  });
});
