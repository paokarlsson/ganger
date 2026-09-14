/** Håller ett värde inom ett spann. Låg förut i fyra handskrivna former. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
