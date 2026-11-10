import manifest from '../library/manifest.json' with { type: 'json' };
import type { FormatId, Manifest, Size } from '../model/types.ts';
import { useComposition } from '../store/useComposition.ts';

const { schemes } = manifest as Manifest;

const FORMATS: { id: FormatId; label: string }[] = [
  { id: 'landscape', label: 'Горизонталь' },
  { id: 'square', label: 'Квадрат' },
  { id: 'portrait', label: 'Вертикаль' },
];

const SIZES: Size[] = ['S', 'L'];

export function Toolbar() {
  const format = useComposition((state) => state.format);
  const size = useComposition((state) => state.size);
  const paletteId = useComposition((state) => state.paletteId);
  const scale = useComposition((state) => state.scale);
  const setFormat = useComposition((state) => state.setFormat);
  const setSize = useComposition((state) => state.setSize);
  const setScale = useComposition((state) => state.setScale);
  const setPalette = useComposition((state) => state.setPalette);

  return (
    <header className="toolbar panel">
      <div className="toolbar__group" role="group" aria-label="Формат кадра">
        {FORMATS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="seg"
            aria-pressed={format === entry.id}
            onClick={() => setFormat(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="toolbar__group" role="group" aria-label="Размер">
        {SIZES.map((entry) => (
          <button
            key={entry}
            type="button"
            className="seg"
            aria-pressed={size === entry}
            onClick={() => setSize(entry)}
          >
            {entry}
          </button>
        ))}
      </div>
      <label className="toolbar__scale">
        Масштаб
        <input
          type="range"
          min={0.15}
          max={1.2}
          step={0.01}
          aria-label="Масштаб"
          value={scale}
          onChange={(event) => setScale(Number(event.currentTarget.value))}
        />
      </label>
      <div className="toolbar__group" role="group" aria-label="Цветовая схема">
        {schemes.map((scheme) => (
          <button
            key={scheme.id}
            type="button"
            className="seg"
            aria-pressed={paletteId === scheme.id}
            onClick={() => setPalette(scheme.id)}
          >
            {scheme.name}
          </button>
        ))}
      </div>
    </header>
  );
}
