/**
 * Mitten och snittet av en mätserie.
 *
 * Båda returnerar `null` för en tom serie i stället för `NaN`: «ingen mätning»
 * är ett svar anroparen ska tvingas ta ställning till, och `NaN` smiter genom
 * varje jämförelse utan att någon märker det.
 */

/**
 * Medianen. Vid jämnt antal medelvärdet av de två mittersta.
 *
 * Konventionen är vald och inte råkad: motorn tog förut alltid det undre av de
 * två, och sveptaktens fönster är åtta mätningar brett — alltid jämnt när det
 * är fullt. Det undre mittenvärdet hade därmed systematiskt lagt takten under
 * spelarens uppmätta mitt, och tröskeln för «snabbt» hårdare än den ska vara.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Aritmetiskt medelvärde. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
