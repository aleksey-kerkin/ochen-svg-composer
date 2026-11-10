/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAsset, getBackgroundAsset } from '../../library/registry.ts';
import {
  FORMATS,
  coverPlacement,
  coverTransform,
} from '../../model/formats.ts';
import { renderScale } from '../../model/scale.ts';
import { useComposition } from '../../store/useComposition.ts';
import { Canvas } from '../Canvas.tsx';
import { objectTransform } from '../transforms.ts';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useComposition.setState(useComposition.getInitialState(), true);
});

describe('Canvas', () => {
  it('clips portrait content to the 2:3 frame', () => {
    useComposition.getState().setFormat('portrait');
    useComposition.getState().add('book', 'main');
    const view = render(<Canvas />);
    const clip = view.container.querySelector('#frame rect');
    expect(clip?.getAttribute('width')).toBe('1080');
    expect(clip?.getAttribute('height')).toBe('1620');
    const group = view.container.querySelector('g[clip-path="url(#frame)"]');
    const object = view.container.querySelector('[data-object="book"]');
    expect(group?.contains(object ?? null)).toBe(true);
  });

  it('clips the frame and cover-fits the scheme background', () => {
    const view = render(<Canvas />);
    const svg = view.container.querySelector('svg');
    const frame = FORMATS.landscape;
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${frame.w} ${frame.h}`);
    expect(view.container.querySelector('#frame')).not.toBeNull();
    const background = view.container.querySelector(
      '[data-layer="background"]',
    );
    const placed = coverPlacement(
      frame.w,
      frame.h,
      getBackgroundAsset('lilac', 'L').svgSize.w,
    );
    expect(background?.getAttribute('transform')).toBe(coverTransform(placed));
  });

  it('draws each object with one shared scale and a uid prefix', () => {
    useComposition.getState().add('book', 'main');
    useComposition.getState().add('pen', 'background');
    const view = render(<Canvas />);
    const nodes = Array.from(view.container.querySelectorAll('[data-object]'));
    expect(nodes.map((node) => node.getAttribute('data-object'))).toEqual([
      'book',
      'pen',
    ]);
    const state = useComposition.getState();
    for (const object of state.objects) {
      const node = view.container.querySelector(`[id="obj-${object.uid}"]`);
      const asset = getAsset(object.objectId, state.size, object.role);
      expect(node?.getAttribute('transform')).toBe(
        objectTransform(object, state.scale, asset.svgSize),
      );
      expect(node?.innerHTML).toContain(`${object.uid}-${object.objectId}-`);
      expect(node?.innerHTML).not.toMatch(/<svg[\s>]/);
    }
  });

  it('selects an object and drags it in SVG units', () => {
    useComposition.getState().add('coin', 'main');
    const view = render(<Canvas />);
    const svg = view.container.querySelector('svg') as SVGSVGElement;
    svg.getScreenCTM = () =>
      ({
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        e: 0,
        f: 0,
      }) as DOMMatrix;
    const node = view.container.querySelector('[data-object="coin"]');
    expect(node).not.toBeNull();
    fireEvent.pointerDown(node as Element, {
      clientX: 600,
      clientY: 315,
      pointerId: 1,
    });
    expect(useComposition.getState().selectedUid).toBe('obj-1');
    fireEvent.pointerMove(svg, { clientX: 640, clientY: 300, pointerId: 1 });
    const moved = useComposition.getState().objects[0];
    expect(moved?.x).toBeCloseTo(640);
    expect(moved?.y).toBeCloseTo(300);
    fireEvent.pointerDown(svg);
    expect(useComposition.getState().selectedUid).toBeUndefined();
  });

  it('draws S and L at the same visible size', () => {
    useComposition.getState().add('book', 'main');
    useComposition.getState().setSize('S');
    const view = render(<Canvas />);
    const state = useComposition.getState();
    const object = state.objects[0];
    expect(object).toBeDefined();
    const asset = getAsset('book', 'S', 'main');
    const node = view.container.querySelector('[data-object="book"]');
    expect(node?.getAttribute('transform')).toBe(
      objectTransform(
        object ?? { x: 0, y: 0, rotation: 0 },
        renderScale(state.scale, 'S'),
        asset.svgSize,
      ),
    );
    expect(node?.getAttribute('transform')).not.toContain(
      `scale(${state.scale})`,
    );
  });

  it('repaints the scene into peach without leftover lilac colors', () => {
    useComposition.getState().setPalette('peach');
    useComposition.getState().add('book', 'main');
    useComposition.getState().add('book', 'background');
    const view = render(<Canvas />);
    const html = view.container.innerHTML.toLowerCase();
    for (const color of [
      '#d7cdf5',
      '#aa9bf0',
      '#7864d7',
      '#f9a3aa',
      '#ffe3e1',
    ]) {
      expect(html).not.toContain(color);
    }
    expect(html).toContain('#fdd7b9');
    expect(html).toContain('#80dada');
    expect(html).toContain('#d27532');
  });

  it('recolors the lilac frame for a loaded palette', () => {
    useComposition
      .getState()
      .addPalette(
        [
          '#112233',
          '#223344',
          '#334455',
          '#181817',
          '#aabbcc',
          '#bbccdd',
          '#ccddee',
          '#ffffff',
        ].join('\n'),
      );
    const view = render(<Canvas />);
    const html = view.container.innerHTML.toLowerCase();
    expect(html).toContain('#112233');
    expect(html).not.toContain('#d7cdf5');
  });

  it('swaps the background asset when the scheme changes', () => {
    useComposition.getState().setPalette('peach');
    const view = render(<Canvas />);
    const background = view.container.querySelector(
      '[data-layer="background"]',
    );
    expect(background?.innerHTML).toContain('bg-peach-L-clip0_0_4');
  });
});
