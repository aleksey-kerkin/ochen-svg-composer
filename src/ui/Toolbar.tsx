import { useState, type ChangeEvent } from 'react';
import { TEMPLATE_LABELS, templateIds } from '../core/layout.ts';
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
  const templateId = useComposition((state) => state.templateId);
  const size = useComposition((state) => state.size);
  const paletteId = useComposition((state) => state.paletteId);
  const scale = useComposition((state) => state.scale);
  const setFormat = useComposition((state) => state.setFormat);
  const setTemplate = useComposition((state) => state.setTemplate);
  const withBackgrounds = useComposition(
    (state) => state.withBackgrounds !== false,
  );
  const setWithBackgrounds = useComposition(
    (state) => state.setWithBackgrounds,
  );
  const setSize = useComposition((state) => state.setSize);
  const setScale = useComposition((state) => state.setScale);
  const setPalette = useComposition((state) => state.setPalette);
  const customPalettes = useComposition((state) => state.customPalettes);
  const paletteError = useComposition((state) => state.paletteError);
  const addPalette = useComposition((state) => state.addPalette);

  const [paletteText, setPaletteText] = useState('');

  function onPaletteFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPaletteText(reader.result);
      }
    };
    reader.readAsText(file);
    event.currentTarget.value = '';
  }

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
      <div className="toolbar__group" role="group" aria-label="Шаблон">
        {templateIds().map((id) => (
          <button
            key={id}
            type="button"
            className="seg"
            aria-pressed={templateId === id}
            onClick={() => setTemplate(id)}
          >
            {TEMPLATE_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="toolbar__group" role="group" aria-label="Фон">
        <button
          type="button"
          className="seg"
          aria-pressed={withBackgrounds}
          onClick={() => setWithBackgrounds(!withBackgrounds)}
        >
          С фоновыми объектами
        </button>
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
        {customPalettes.map((palette) => (
          <button
            key={palette.id}
            type="button"
            className="seg"
            aria-pressed={paletteId === palette.id}
            onClick={() => setPalette(palette.id)}
          >
            {palette.name}
          </button>
        ))}
      </div>
      <div className="toolbar__palette-upload">
        <label className="toolbar__palette-file">
          <span className="toolbar__palette-file-label">JSON</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={onPaletteFileChange}
          />
        </label>
        <textarea
          className="toolbar__palette-text"
          aria-label="Палитра"
          placeholder="JSON { name, colors } или 8 hex через пробел: bg.base, bg.mid, bg.dark, ink, obj.1, obj.2, obj.3, paper"
          value={paletteText}
          onChange={(event) => setPaletteText(event.currentTarget.value)}
          rows={2}
        />
        <button
          type="button"
          className="seg toolbar__palette-submit"
          onClick={() => addPalette(paletteText)}
        >
          Загрузить
        </button>
        {paletteError ? (
          <p className="toolbar__palette-error" role="alert">
            {paletteError}
          </p>
        ) : null}
      </div>
    </header>
  );
}
