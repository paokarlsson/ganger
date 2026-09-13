/**
 * Färgen en svarstid får i en värmekarta: grön upp till den snabba tiden,
 * sedan bärnsten mot rött fram till den långsamma.
 *
 * Gränserna skickas in i stället för att slås upp, eftersom de skiljer sig åt
 * mellan spelen — ett svep är igenkänning och går systematiskt snabbare än ett
 * skrivet svar. Skalan ska ändå vara densamma, så att en grön ruta betyder
 * samma sak i båda värmekartorna.
 *
 * Skalan svänger i oklch och inte i hsl, och det är hela skillnaden mot förr.
 * hsl höll ljusheten på 45 % hela vägen, men 45 % betyder inte samma ljushet
 * åt gult som åt rött: den gula änden lyste och den röda mörknade, och den
 * vita siffran i rutan låg på 2.2:1 mot gult där den behöver 4.5:1. I oklch är
 * det första talet den ljushet ögat ser. Håller man det stilla — L 0.72 här —
 * väger varje steg på skalan lika mycket, och bläcket i rutan ligger på
 * 6.7:1 eller bättre över hela rampen.
 */

/** Rampens ljushet. Vald så att --card-ink bär över hela nyansvarvet. */
const RAMP_L = 0.72;
/** Så mycket kroma som ryms i sRGB för varje nyans mellan bärnsten och rött. */
const RAMP_C = 0.145;
/** Bärnsten vid den snabba änden, rött vid den långsamma. */
const RAMP_FROM_HUE = 85;
const RAMP_TO_HUE = 25;
/** Grönt är ingen punkt på rampen utan ett eget omdöme: snabbt nog. */
const FAST_GREEN = 'oklch(0.72 0.155 152)';

export function timeColor(seconds: number, fastSeconds: number, slowSeconds: number): string {
  if (seconds <= fastSeconds) {
    return FAST_GREEN;
  }
  const span = Math.max(slowSeconds - fastSeconds, Number.EPSILON);
  const t = Math.max(0, Math.min(1, (seconds - fastSeconds) / span));
  const hue = RAMP_FROM_HUE + (RAMP_TO_HUE - RAMP_FROM_HUE) * t;
  // Avrundad: annars faller flyttalsskräp som oklch(... 47.00000000000001) ut,
  // och två lika lägen på skalan ger olika strängar.
  return `oklch(${RAMP_L} ${RAMP_C} ${Math.round(hue * 10) / 10})`;
}
