/**
 * Färgen en svarstid får i en värmekarta: grön upp till den snabba tiden,
 * sedan gult mot rött fram till den långsamma.
 *
 * Gränserna skickas in i stället för att slås upp, eftersom de skiljer sig åt
 * mellan spelen — ett svep är igenkänning och går systematiskt snabbare än ett
 * skrivet svar. Skalan ska ändå vara densamma, så att en grön ruta betyder
 * samma sak i båda värmekartorna.
 */
export function timeColor(seconds: number, fastSeconds: number, slowSeconds: number): string {
  if (seconds <= fastSeconds) {
    return 'hsl(140, 80%, 35%)';
  }
  const span = Math.max(slowSeconds - fastSeconds, Number.EPSILON);
  const t = Math.max(0, Math.min(1, (seconds - fastSeconds) / span));
  // Avrundad: annars faller flyttalsskräp som hsl(25.000000000000007) ut, och
  // två lika lägen på skalan ger olika strängar.
  return `hsl(${Math.round(50 * (1 - t) * 10) / 10}, 75%, 45%)`;
}
