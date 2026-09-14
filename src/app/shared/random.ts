/**
 * Slumpen, på ett ställe.
 *
 * `rng` tas som parameter och inte som `Math.random` rakt av: resten av
 * pedagogiken (`selectFact`, `pickDistractor`, `nextStatement`) gör redan så,
 * och det är vad som gör dem körbara deterministiskt i ett test.
 */

/** Fisher-Yates på en kopia, så anroparens lista lämnas orörd. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
