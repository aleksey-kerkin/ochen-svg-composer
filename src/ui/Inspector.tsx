import manifest from '../library/manifest.json' with { type: 'json' };
import type { Manifest } from '../model/types.ts';
import { useComposition } from '../store/useComposition.ts';

const { items } = manifest as Manifest;

function wrapAngle(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function itemNameRu(objectId: string): string {
  return items.find((item) => item.objectId === objectId)?.name.ru ?? objectId;
}

export function Inspector() {
  const objects = useComposition((state) => state.objects);
  const selectedUid = useComposition((state) => state.selectedUid);
  const rotate = useComposition((state) => state.rotate);
  const duplicate = useComposition((state) => state.duplicate);
  const remove = useComposition((state) => state.remove);
  const bringForward = useComposition((state) => state.bringForward);
  const sendBackward = useComposition((state) => state.sendBackward);
  const toggleRole = useComposition((state) => state.toggleRole);

  const selected = objects.find((object) => object.uid === selectedUid);

  return (
    <aside className="inspector panel">
      <h2 className="panel__title">Свойства</h2>
      {!selected ? (
        <p className="inspector__empty">Объект не выбран</p>
      ) : (
        <div className="inspector__body">
          <p className="inspector__name">{itemNameRu(selected.objectId)}</p>
          <label className="inspector__field">
            <span className="inspector__field-label">Поворот</span>
            <input
              type="range"
              min={-180}
              max={180}
              value={wrapAngle(selected.rotation)}
              onInput={(event) =>
                rotate(selected.uid, Number(event.currentTarget.value))
              }
            />
            <span className="inspector__angle">
              {wrapAngle(selected.rotation)}°
            </span>
          </label>
          <div className="inspector__row">
            <button
              type="button"
              onClick={() => rotate(selected.uid, selected.rotation - 15)}
            >
              −15°
            </button>
            <button
              type="button"
              onClick={() => rotate(selected.uid, selected.rotation + 15)}
            >
              +15°
            </button>
          </div>
          <div className="inspector__actions">
            <button type="button" onClick={() => duplicate(selected.uid)}>
              Дублировать
            </button>
            <button type="button" onClick={() => remove(selected.uid)}>
              Удалить
            </button>
            <button type="button" onClick={() => sendBackward(selected.uid)}>
              Ниже
            </button>
            <button type="button" onClick={() => bringForward(selected.uid)}>
              Выше
            </button>
            <button type="button" onClick={() => toggleRole(selected.uid)}>
              {selected.role === 'main' ? 'Главный' : 'Фоновый'}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
