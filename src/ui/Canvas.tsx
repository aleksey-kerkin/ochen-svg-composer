import {
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  getAsset,
  getBackgroundAsset,
  scopeAsset,
} from '../library/registry.ts';
import { FORMATS, coverPlacement, coverTransform } from '../model/formats.ts';
import { renderScale } from '../model/scale.ts';
import type { PlacedObject, Size } from '../model/types.ts';
import { useComposition } from '../store/useComposition.ts';
import { applyInverse } from './svgPoint.ts';
import { objectTransform } from './transforms.ts';
import './canvas.css';

type SchemeId = 'lilac' | 'peach' | 'teal';

function schemeIdOf(paletteId: string): SchemeId {
  if (paletteId === 'peach' || paletteId === 'teal' || paletteId === 'lilac') {
    return paletteId;
  }
  return 'lilac';
}

export function Canvas() {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ uid: string; x: number; y: number } | null>(null);
  const format = useComposition((state) => state.format);
  const size = useComposition((state) => state.size);
  const paletteId = useComposition((state) => state.paletteId);
  const scale = useComposition((state) => renderScale(state.scale, state.size));
  const objects = useComposition((state) => state.objects);
  const selectedUid = useComposition((state) => state.selectedUid);
  const select = useComposition((state) => state.select);
  const move = useComposition((state) => state.move);
  const frame = FORMATS[format];
  const background = getBackgroundAsset(schemeIdOf(paletteId), size);
  const cover = coverPlacement(frame.w, frame.h, background.svgSize.w);
  const ordered = [...objects].sort((left, right) => left.z - right.z);

  function locate(event: ReactPointerEvent<SVGElement>) {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    return applyInverse(
      { a: ctm.a, b: ctm.b, c: ctm.c, d: ctm.d, e: ctm.e, f: ctm.f },
      event.clientX,
      event.clientY,
    );
  }

  function onFramePointerDown() {
    drag.current = null;
    select(undefined);
  }

  function onFramePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current) return;
    const point = locate(event);
    if (!point) return;
    move(current.uid, point.x - current.x, point.y - current.y);
    drag.current = { uid: current.uid, x: point.x, y: point.y };
  }

  function onObjectPointerDown(
    event: ReactPointerEvent<SVGGElement>,
    uid: string,
  ) {
    event.stopPropagation();
    const svg = svgRef.current;
    if (svg && typeof svg.setPointerCapture === 'function') {
      try {
        svg.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is missing in some test environments.
      }
    }
    select(uid);
    const point = locate(event);
    drag.current = point ? { uid, x: point.x, y: point.y } : null;
  }

  return (
    <div className="canvas-stage">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${frame.w} ${frame.h}`}
        width={frame.w}
        height={frame.h}
        role="application"
        aria-label="Холст"
        onPointerDown={onFramePointerDown}
        onPointerMove={onFramePointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <defs>
          <clipPath id="frame">
            <rect width={frame.w} height={frame.h} />
          </clipPath>
        </defs>
        <g clipPath="url(#frame)">
          <g
            data-layer="background"
            transform={coverTransform(cover)}
            dangerouslySetInnerHTML={{ __html: background.inner }}
          />
          {ordered.map((object) => (
            <SceneObject
              key={object.uid}
              object={object}
              size={size}
              scale={scale}
              selected={object.uid === selectedUid}
              onPointerDown={onObjectPointerDown}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

function SceneObject({
  object,
  size,
  scale,
  selected,
  onPointerDown,
}: {
  object: PlacedObject;
  size: Size;
  scale: number;
  selected: boolean;
  onPointerDown: (event: ReactPointerEvent<SVGGElement>, uid: string) => void;
}) {
  const asset = scopeAsset(
    getAsset(object.objectId, size, object.role),
    object.uid,
  );
  const contentRef = useRef<SVGGElement>(null);
  const frameRef = useRef<SVGRectElement>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const frame = frameRef.current;
    if (!content || !frame || typeof content.getBBox !== 'function') return;
    try {
      const next = content.getBBox();
      const visible = next.width > 0 && next.height > 0;
      frame.setAttribute('x', String(next.x));
      frame.setAttribute('y', String(next.y));
      frame.setAttribute('width', String(next.width));
      frame.setAttribute('height', String(next.height));
      frame.setAttribute('visibility', visible ? 'visible' : 'hidden');
    } catch {
      frame.setAttribute('visibility', 'hidden');
    }
  }, [asset.inner, selected]);

  return (
    <g
      id={`obj-${object.uid}`}
      data-object={object.objectId}
      data-role={object.role}
      transform={objectTransform(object, scale, asset.svgSize)}
      onPointerDown={(event) => onPointerDown(event, object.uid)}
    >
      <g ref={contentRef} dangerouslySetInnerHTML={{ __html: asset.inner }} />
      {selected ? (
        <rect
          ref={frameRef}
          data-selection="true"
          fill="none"
          stroke="#181817"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          visibility="hidden"
        />
      ) : null}
    </g>
  );
}
