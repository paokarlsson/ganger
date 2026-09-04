/** Ett genererat påstående, redo att visas på kortet. */
export interface GeneratedStatement {
  n1: number;
  n2: number;
  shown: number;
  isTrue: boolean;
}

/** Måltider spelaren kan välja mellan innan start. */
export const TARGET_TIMES = [1, 2, 5] as const;
export type TargetTime = (typeof TARGET_TIMES)[number];
export const DEFAULT_TARGET_TIME: TargetTime = 2;

/** Antal kort per rond. */
export const QUESTION_COUNTS = [10, 20, 30, 40] as const;
export const DEFAULT_QUESTION_COUNT = 20;

/** Långsamt = så här många gånger måltiden. Samma roll som i Mästaren, men
 *  lägre — ett svep ska kännas snabbare att bedöma än att skriva ett svar. */
export const SLOW_TIME_MULTIPLIER = 2.5;

/** Nivåskalan brasan rör sig på. Stiger försiktigt, sjunker snabbt — samma
 *  princip som auto-läget i Mästaren, fast som en direkt knuff per svar i
 *  stället för streaks, eftersom en rond bara är 10–40 kort lång. */
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 10;
export const START_LEVEL = 5;
export const LEVEL_UP_STEP = 1;
export const LEVEL_DOWN_STEP = 2;

/** Högsta faktorn som får förekomma på varje nivå. Högre nivå = större tal,
 *  inte bara knivigare val — det ger nivåhöjning en konkret mening. */
const LEVEL_MAX_FACTOR: Record<number, number> = {
  1: 5,
  2: 5,
  3: 8,
  4: 8,
  5: 10,
  6: 10,
  7: 12,
  8: 12,
  9: 15,
  10: 15,
};

/** Sannolikheten att en fel siffra blir en "nära numeriskt"-distraktor
 *  (svår att avslöja) i stället för en "granntabell"-distraktor (lättare).
 *  Stiger med nivån, precis som i den kuraterade datan där bara de svåra
 *  tabellerna (rank 56+) har flera, tätt liggande fel-alternativ. */
function closeDistractorProbability(level: number): number {
  return Math.min(0.85, 0.15 + (level - 1) * 0.08);
}

/** Faktakombinationens svåraste tänkbara fel-svar: samma två mönster som
 *  finns handplockade i ranked-questions.reference.json — verifierat mot
 *  filen, se README-diskussionen. `n1===1`/`n2===1` är specialfallet, där
 *  kuraterarna valt ettan själv som fel svar (`1 × 4 = 1`): det klassiska
 *  nybörjarmisstaget att tro att produkten blir samma som den lilla
 *  faktorn. Mönstret "den andra faktorn" hör till `0 × n` i datan, och
 *  nollor genereras aldrig här. `1 × 1` har ingen annan etta att erbjuda
 *  och faller igenom till den vanliga logiken. */
function pickWrong(n1: number, n2: number, answer: number, level: number, rng: () => number): number {
  if ((n1 === 1 || n2 === 1) && answer !== 1) {
    return 1;
  }

  const neighbor = new Set<number>();
  for (const d of [-1, 1]) {
    if (n1 + d >= 1) neighbor.add((n1 + d) * n2);
    if (n2 + d >= 1) neighbor.add(n1 * (n2 + d));
  }
  neighbor.delete(answer);

  const close = new Set<number>();
  for (const d of [-4, -2, -1, 1, 2, 4]) {
    const v = answer + d;
    if (v > 0) close.add(v);
  }
  close.delete(answer);

  const preferClose = rng() < closeDistractorProbability(level);
  const primary = preferClose ? close : neighbor;
  const fallback = preferClose ? neighbor : close;
  const pool = primary.size ? primary : fallback;
  const values = [...pool];
  return values.length ? values[Math.floor(rng() * values.length)] : answer + 1;
}

/** Genererar ett nytt påstående för given nivå. `rng` går att peka om i
 *  tester, annars `Math.random`. */
export function generateStatement(level: number, rng: () => number = Math.random): GeneratedStatement {
  const maxFactor = LEVEL_MAX_FACTOR[level] ?? LEVEL_MAX_FACTOR[LEVEL_MAX];
  const n1 = 1 + Math.floor(rng() * maxFactor);
  const n2 = 1 + Math.floor(rng() * maxFactor);
  const answer = n1 * n2;
  const isTrue = rng() < 0.5;
  const shown = isTrue ? answer : pickWrong(n1, n2, answer, level, rng);
  return { n1, n2, shown, isTrue };
}
