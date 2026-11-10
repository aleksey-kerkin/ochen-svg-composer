/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAsset, getBackgroundAsset } from '../../library/registry.ts';
import {
  FORMATS,
  coverPlacement,
  coverTransform,
} from '../../model/formats.ts';
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

  it('swaps the background asset when the scheme changes', () => {
    useComposition.getState().setPalette('peach');
    const view = render(<Canvas />);
    const background = view.container.querySelector(
      '[data-layer="background"]',
    );
    expect(background?.innerHTML).toContain('bg-peach-L-clip0_0_4');
  });
});
