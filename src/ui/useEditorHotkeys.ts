import { useEffect } from 'react';
import { useComposition } from '../store/useComposition.ts';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

export function useEditorHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const state = useComposition.getState();
      const { selectedUid } = state;

      if (
        (event.key === 'd' || event.key === 'D') &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        if (selectedUid) state.duplicate(selectedUid);
        return;
      }

      if (!selectedUid) return;

      const step = event.shiftKey ? 10 : 1;

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          state.remove(selectedUid);
          event.preventDefault();
          break;
        case '[':
          state.sendBackward(selectedUid);
          break;
        case ']':
          state.bringForward(selectedUid);
          break;
        case 'ArrowLeft':
          state.move(selectedUid, -step, 0);
          event.preventDefault();
          break;
        case 'ArrowRight':
          state.move(selectedUid, step, 0);
          event.preventDefault();
          break;
        case 'ArrowUp':
          state.move(selectedUid, 0, -step);
          event.preventDefault();
          break;
        case 'ArrowDown':
          state.move(selectedUid, 0, step);
          event.preventDefault();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
