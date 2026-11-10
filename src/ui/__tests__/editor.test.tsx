/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../App.tsx';
import { useComposition } from '../../store/useComposition.ts';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useComposition.setState(useComposition.getInitialState(), true);
});

describe('editor', () => {
  it('clicking a library item adds that objectId with role main', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    const state = useComposition.getState();
    expect(state.objects).toHaveLength(1);
    expect(state.objects[0]?.objectId).toBe('book');
    expect(state.objects[0]?.role).toBe('main');
  });

  it('after switching to «Фоновые», a click adds role background', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Фоновые' }));
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    expect(useComposition.getState().objects[0]?.role).toBe('background');
  });

  it('«Квадрат» sets format square; «S» sets size S; «Персик» sets paletteId peach', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Квадрат' }));
    fireEvent.click(screen.getByRole('button', { name: 'S' }));
    fireEvent.click(screen.getByRole('button', { name: 'Персик' }));
    const state = useComposition.getState();
    expect(state.format).toBe('square');
    expect(state.size).toBe('S');
    expect(state.paletteId).toBe('peach');
  });

  it('with a selection, «+15°» sets rotation to 15; pressing it again sets 30', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    act(() => {
      useComposition.getState().select('obj-1');
    });
    fireEvent.click(screen.getByRole('button', { name: '+15°' }));
    expect(useComposition.getState().objects[0]?.rotation).toBe(15);
    fireEvent.click(screen.getByRole('button', { name: '+15°' }));
    expect(useComposition.getState().objects[0]?.rotation).toBe(30);
  });

  it('«Удалить» removes the object', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    act(() => {
      useComposition.getState().select('obj-1');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(useComposition.getState().objects).toHaveLength(0);
  });

  it('Delete removes the selection; ArrowRight moves x by 1; Shift+ArrowRight moves x by 10; ] increases z; Ctrl+D duplicates', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    act(() => {
      useComposition.getState().select('obj-1');
    });
    const startX = useComposition.getState().objects[0]!.x;

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(useComposition.getState().objects[0]!.x).toBe(startX + 1);

    fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true });
    expect(useComposition.getState().objects[0]!.x).toBe(startX + 11);

    fireEvent.click(screen.getByRole('button', { name: 'Ручка' }));
    act(() => {
      useComposition.getState().select('obj-1');
    });
    const bookBefore = useComposition
      .getState()
      .objects.find((object) => object.uid === 'obj-1')!;
    const penBefore = useComposition
      .getState()
      .objects.find((object) => object.uid === 'obj-2')!;
    expect(bookBefore.z).toBeLessThan(penBefore.z);

    fireEvent.keyDown(window, { key: ']' });
    const bookAfter = useComposition
      .getState()
      .objects.find((object) => object.uid === 'obj-1')!;
    const penAfter = useComposition
      .getState()
      .objects.find((object) => object.uid === 'obj-2')!;
    expect(bookAfter.z).toBeGreaterThan(penAfter.z);

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
    expect(useComposition.getState().objects).toHaveLength(3);

    fireEvent.keyDown(window, { key: 'Delete' });
    expect(useComposition.getState().objects).toHaveLength(2);
    expect(useComposition.getState().selectedUid).toBeUndefined();
  });

  it('the scale slider sets one scene scale', () => {
    render(<App />);
    const slider = screen.getByRole('slider', { name: 'Масштаб' });
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(useComposition.getState().scale).toBeCloseTo(0.5);
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ручка' }));
    for (const object of useComposition.getState().objects) {
      expect(object).not.toHaveProperty('scale');
    }
    expect(useComposition.getState().scale).toBeCloseTo(0.5);
  });

  it('names the role control as an action', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сделать фоновым' }));
    expect(useComposition.getState().objects[0]?.role).toBe('background');
    expect(
      screen.getByRole('button', { name: 'Сделать главным' }),
    ).toBeTruthy();
  });

  it('a keydown whose target is an input does not remove the selection', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    act(() => {
      useComposition.getState().select('obj-1');
    });
    const slider = screen.getByRole('slider', { name: /Поворот/ });
    fireEvent.keyDown(slider, { key: 'Delete' });
    expect(useComposition.getState().objects).toHaveLength(1);
    expect(useComposition.getState().selectedUid).toBe('obj-1');
  });

  it('loads eight hex colors and selects «Своя палитра»', () => {
    render(<App />);
    const paletteInput = screen.getByRole('textbox', { name: 'Палитра' });
    fireEvent.change(paletteInput, {
      target: {
        value: [
          '#112233',
          '#223344',
          '#334455',
          '#181817',
          '#aabbcc',
          '#bbccdd',
          '#ccddee',
          '#ffffff',
        ].join('\n'),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить' }));
    const custom = screen.getByRole('button', { name: 'Своя палитра' });
    expect(custom).toBeTruthy();
    expect(custom.getAttribute('aria-pressed')).toBe('true');
    const state = useComposition.getState();
    expect(state.customPalettes).toHaveLength(1);
    expect(state.paletteId).toBe(state.customPalettes[0]?.id);
  });

  it('shows an alert when palette text has only one hex', () => {
    render(<App />);
    const paletteInput = screen.getByRole('textbox', { name: 'Палитра' });
    fireEvent.change(paletteInput, { target: { value: '#112233' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Своя палитра' })).toBeNull();
    expect(useComposition.getState().customPalettes).toHaveLength(0);
  });

  it('cycles colorShift on «Другие цвета» for a main object', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    fireEvent.click(screen.getByRole('button', { name: 'Другие цвета' }));
    expect(useComposition.getState().objects[0]?.colorShift).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Другие цвета' }));
    expect(useComposition.getState().objects[0]?.colorShift).toBe(2);
  });

  it('hides «Другие цвета» after making the object background', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    expect(screen.getByRole('button', { name: 'Другие цвета' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Сделать фоновым' }));
    expect(screen.queryByRole('button', { name: 'Другие цвета' })).toBeNull();
  });
});
