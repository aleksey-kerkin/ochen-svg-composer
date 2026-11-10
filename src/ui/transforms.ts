export function objectTransform(
  object: { x: number; y: number; rotation: number },
  scale: number,
  svgSize: { w: number; h: number },
): string {
  const halfW = svgSize.w / 2;
  const halfH = svgSize.h / 2;
  return `translate(${object.x} ${object.y}) rotate(${object.rotation}) scale(${scale}) translate(${-halfW} ${-halfH})`;
}
