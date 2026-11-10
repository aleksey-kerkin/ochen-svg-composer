import { useState } from 'react';
import manifest from '../library/manifest.json' with { type: 'json' };
import { getAsset } from '../library/registry.ts';
import type { Manifest, Role } from '../model/types.ts';
import { useComposition } from '../store/useComposition.ts';

const { items } = manifest as Manifest;

export function Library() {
  const [activeRole, setActiveRole] = useState<Role>('main');
  const size = useComposition((state) => state.size);
  const add = useComposition((state) => state.add);

  return (
    <aside className="library panel">
      <h2 className="panel__title">Библиотека</h2>
      <div className="library__filters" role="group" aria-label="Роль объекта">
        <button
          type="button"
          className="seg"
          aria-pressed={activeRole === 'main'}
          onClick={() => setActiveRole('main')}
        >
          Главные
        </button>
        <button
          type="button"
          className="seg"
          aria-pressed={activeRole === 'background'}
          onClick={() => setActiveRole('background')}
        >
          Фоновые
        </button>
      </div>
      <ul className="library__grid">
        {items.map((item) => {
          const asset = getAsset(item.objectId, size, activeRole);
          return (
            <li key={item.objectId}>
              <button
                type="button"
                className="library__item"
                onClick={() => {
                  add(item.objectId, activeRole);
                  const created = useComposition.getState().objects.at(-1);
                  if (created) useComposition.getState().select(created.uid);
                }}
              >
                <span className="library__thumb" aria-hidden="true">
                  <svg
                    viewBox={`0 0 ${asset.svgSize.w} ${asset.svgSize.h}`}
                    dangerouslySetInnerHTML={{ __html: asset.inner }}
                  />
                </span>
                <span className="library__label">{item.name.ru}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
