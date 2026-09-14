/**
 * Väljer vilket tal som ska ställas härnäst.
 *
 * Tre vikter multipliceras ihop: var på svårighetsskalan nivån ligger, hur väl
 * spelaren kan just det talet, och om talet nyss varit uppe. Ingen vikt blir
 * någonsin noll av de två första — hela tabellen ska vara nåbar på varje nivå,
 * annars går det inte att upptäcka att ett "behärskat" tal tappats bort.
 */
import { clamp } from '../shared/numbers';
import { FACTS, Fact } from './fact-catalog';

/** Nivåskalan brasan rör sig på. */
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 10;

/** Var på rankskalan nivå 1 respektive nivå 10 lägger sitt fokus. */
const FOCUS_AT_MIN_LEVEL = 4;
const FOCUS_AT_MAX_LEVEL = FACTS.length;

/** Hur brett fönstret är. Bredare = mer blandning mellan nivåerna.
 *
 *  ANTAGANDE: satt på känsla. Bredden avgör hur mycket av tabellen en nivå
 *  släpper fram, och därmed hur ofta ett för svårt tal dyker upp. Se
 *  docs/plan.md. */
const FOCUS_SPREAD = 9;

/** Golvet som håller varje tal möjligt, hur långt från fokus det än ligger.
 *
 *  ANTAGANDE: satt på känsla. Att det finns ett golv är en princip — annars
 *  märks det aldrig att ett behärskat tal rostat — men just 0,02 är en
 *  gissning om hur sällan «sällan» ska vara. */
const WEIGHT_FLOOR = 0.02;

/** Så många kort bakåt ett tal hålls borta för att inte komma igen direkt.
 *
 *  ANTAGANDE: satt på känsla. Ett svårt tal ska återkomma efter några andra
 *  uppgifter, inte omedelbart — men spärren slåss med en framtida kvot för
 *  nya tal, som kan kräva ett nytt tal oftare än spärren släpper fram det.
 *  Se docs/plan.md. */
export const RECENT_MEMORY = 8;

/** Vad spelaren presterat på ett tal. `null` betyder "aldrig övat". */
export interface FactPerformance {
  averageSeconds: number | null;
  accuracy: number | null;
}

/** Hämtar spelarens vikt för ett tal. Utelämnas i tester och för en ny spelare. */
export type FactNeed = (fact: Fact) => number;

interface SelectionContext {
  level: number;
  /** Senast ställda tal, nyast först eller sist spelar ingen roll. */
  recent: readonly Fact[];
  need?: FactNeed;
}

/** Nivåns fokuspunkt på rankskalan. */
export function focusRank(level: number): number {
  const clamped = clamp(level, LEVEL_MIN, LEVEL_MAX);
  const t = (clamped - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN);
  return FOCUS_AT_MIN_LEVEL + (FOCUS_AT_MAX_LEVEL - FOCUS_AT_MIN_LEVEL) * t;
}

/** Klockformad kring nivåns fokus, plus golvet. */
export function windowWeight(rank: number, level: number): number {
  const distance = (rank - focusRank(level)) / FOCUS_SPREAD;
  return Math.exp(-(distance * distance)) + WEIGHT_FLOOR;
}

/**
 * Hur mycket ett tal behöver övas. Ett obeprövat tal är värt att mäta, ett
 * långsamt eller felstavat värt att nöta, ett behärskat får komma sällan — men
 * aldrig aldrig, annars märks det inte när det rostar.
 *
 * ANTAGANDE: hela trappan nedan är satt på känsla — 0,15 för ett behärskat
 * tal, taket på 3 för seghet, gränsen 0,9 rätt. Formen är resonerad, siffrorna
 * är inte mätta. Se docs/plan.md.
 */
export function needWeight(
  performance: FactPerformance | undefined,
  fastSeconds: number,
): number {
  if (!performance || performance.averageSeconds === null) {
    return 1;
  }

  const { averageSeconds, accuracy } = performance;
  const mastered = averageSeconds <= fastSeconds && (accuracy ?? 1) >= 0.9;
  if (mastered) {
    return 0.15;
  }

  const slowness = Math.min(3, averageSeconds / fastSeconds);
  const missFactor = 1 + 2 * (1 - (accuracy ?? 1));
  return Math.max(0.15, slowness * missFactor);
}

/** Drar ett tal enligt vikterna. `rng` går att peka om i tester. */
export function selectFact(ctx: SelectionContext, rng: () => number = Math.random): Fact {
  const recent = new Set(ctx.recent.slice(-RECENT_MEMORY).map((fact) => fact.rank));
  const weights = FACTS.map((fact) => {
    if (recent.has(fact.rank)) {
      return 0;
    }
    return windowWeight(fact.rank, ctx.level) * (ctx.need ? ctx.need(fact) : 1);
  });

  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    // Kan bara hända om hela tabellen ligger i färskhetsspärren.
    return FACTS[Math.floor(rng() * FACTS.length)];
  }

  let threshold = rng() * total;
  for (let i = 0; i < FACTS.length; i++) {
    threshold -= weights[i];
    if (threshold < 0) {
      return FACTS[i];
    }
  }
  return FACTS[FACTS.length - 1];
}
