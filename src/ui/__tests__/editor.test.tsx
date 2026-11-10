/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App.tsx';
import { useComposition } from '../../store/useComposition.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

  it('«Со смещением» keeps two main objects, sets templateId offset, and presses the template button', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    fireEvent.click(screen.getByRole('button', { name: 'Телефон' }));
    fireEvent.click(screen.getByRole('button', { name: 'Со смещением' }));
    const state = useComposition.getState();
    expect(state.templateId).toBe('offset');
    expect(
      state.objects.filter((object) => object.role === 'main'),
    ).toHaveLength(2);
    expect(state.objects.some((object) => object.role === 'background')).toBe(
      true,
    );
    expect(
      screen
        .getByRole('button', { name: 'Со смещением' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: 'Под заголовком' })
        .getAttribute('aria-pressed'),
    ).not.toBe('true');
  });

  it('«Под заголовком» keeps both main objects and sets templateId under-title', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Книга' }));
    fireEvent.click(screen.getByRole('button', { name: 'Телефон' }));
    fireEvent.click(screen.getByRole('button', { name: 'Под заголовком' }));
    const state = useComposition.getState();
    expect(state.templateId).toBe('under-title');
    expect(
      state.objects
        .filter((object) => object.role === 'main')
        .map((object) => object.objectId)
        .sort(),
    ).toEqual(['book', 'phone']);
  });

  it('compose prompt «книга, телефон и пазлы» adds book, phone, puzzle and shows chips', () => {
    render(<App />);
    const prompt = screen.getByRole('textbox', { name: 'Собрать из объектов' });
    fireEvent.change(prompt, {
      target: { value: 'книга, телефон и пазлы' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Собрать' }));
    const objects = useComposition.getState().objects;
    expect(
      objects
        .filter((object) => object.role === 'main')
        .map((object) => object.objectId)
        .sort(),
    ).toEqual(['book', 'phone', 'puzzle']);
    expect(objects.some((object) => object.role === 'background')).toBe(true);
    expect(screen.getByText('Книга')).toBeTruthy();
    expect(screen.getByText('Телефон')).toBeTruthy();
    expect(screen.getByText('Пазлы')).toBeTruthy();
  });

  it('unknown compose word shows «Не распознано» and keeps existing objects', () => {
    render(<App />);
    const prompt = screen.getByRole('textbox', { name: 'Собрать из объектов' });
    fireEvent.change(prompt, {
      target: { value: 'книга, телефон и пазлы' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Собрать' }));
    fireEvent.change(prompt, { target: { value: 'хрюндель' } });
    fireEvent.click(screen.getByRole('button', { name: 'Собрать' }));
    expect(screen.getByText(/Не распознано/)).toBeTruthy();
    const objects = useComposition.getState().objects;
    expect(
      objects
        .filter((object) => object.role === 'main')
        .map((object) => object.objectId)
        .sort(),
    ).toEqual(['book', 'phone', 'puzzle']);
    expect(objects.some((object) => object.role === 'background')).toBe(true);
  });

  it('turns background companions off and back on', () => {
    render(<App />);
    const toggle = screen.getByRole('button', {
      name: 'С фоновыми объектами',
    });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    const prompt = screen.getByRole('textbox', { name: 'Собрать из объектов' });
    fireEvent.change(prompt, {
      target: { value: 'книга, телефон и пазлы' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Собрать' }));
    expect(
      useComposition
        .getState()
        .objects.some((object) => object.role === 'background'),
    ).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(
      useComposition
        .getState()
        .objects.every((object) => object.role === 'main'),
    ).toBe(true);
    fireEvent.click(toggle);
    expect(
      useComposition
        .getState()
        .objects.some((object) => object.role === 'background'),
    ).toBe(true);
    expect(
      useComposition
        .getState()
        .objects.filter((object) => object.role === 'main')
        .map((object) => object.objectId)
        .sort(),
    ).toEqual(['book', 'phone', 'puzzle']);
  });

  it('meaning mode «учёба» falls back to tags when the server is down', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Смысл' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Метафора или заголовок' }),
      { target: { value: 'учёба' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Собрать' }));
    await waitFor(() => {
      expect(screen.getByText(/по тегам/i)).toBeTruthy();
    });
    expect(
      useComposition
        .getState()
        .objects.filter((object) => object.role === 'main')
        .map((object) => object.objectId)
        .sort(),
    ).toEqual(['book', 'pen']);
    expect(useComposition.getState().metaphor?.source).toBe('tags');
  });

  it('meaning mode shows «модель» when the server returns a model pick', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            main: ['headphones'],
            background: ['lamp'],
            template: 'compact',
            source: 'model',
            model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
            reason: 'музыка',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Смысл' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Метафора или заголовок' }),
      { target: { value: 'музыка для работы' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Собрать' }));
    await waitFor(() => {
      expect(screen.getByText(/модель/)).toBeTruthy();
    });
    const state = useComposition.getState();
    expect(state.metaphor?.source).toBe('model');
    expect(
      state.objects.find((object) => object.objectId === 'lamp')?.role,
    ).toBe('background');
    expect(
      state.objects.find((object) => object.objectId === 'headphones')?.role,
    ).toBe('main');
  });

  it('library search «ваза» hides Книга but keeps Цветы', () => {
    render(<App />);
    const search = screen.getByRole('textbox', { name: 'Поиск по библиотеке' });
    fireEvent.change(search, { target: { value: 'ваза' } });
    expect(screen.queryByRole('button', { name: 'Книга' })).toBeNull();
    expect(screen.getByRole('button', { name: /Цветы/ })).toBeTruthy();
  });
});
