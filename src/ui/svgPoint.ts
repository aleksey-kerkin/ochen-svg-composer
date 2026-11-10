export interface SvgMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** Client pixels to SVG user units via the inverse of `getScreenCTM()`. */
export function applyInverse(
  matrix: SvgMatrix,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const det = matrix.a * matrix.d - matrix.b * matrix.c;
  if (det === 0) {
    throw new Error('SVG screen CTM cannot be inverted');
  }
  const ia = matrix.d / det;
  const ib = -matrix.b / det;
  const ic = -matrix.c / det;
  const id = matrix.a / det;
  const ie = (matrix.c * matrix.f - matrix.d * matrix.e) / det;
  const if_ = (matrix.b * matrix.e - matrix.a * matrix.f) / det;
  return {
    x: ia * clientX + ic * clientY + ie,
    y: ib * clientX + id * clientY + if_,
  };
}
