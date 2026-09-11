/**
 * Svepets rondlogik: vad som ska stå på nästa kort.
 *
 * Själva svårighetsmodellen ligger i `facts/` och delas med resten av appen —
 * här bestäms bara hur en rond använder den: sant eller falskt, vad ronden
 * minns, och hur nivån rör sig.
 */
import { DistractorKind, pickDistractor } from '../facts/distractors';
import { Fact, factKey } from '../facts/fact-catalog';
import { FactNeed, LEVEL_MAX, LEVEL_MIN, RECENT_MEMORY, selectFact } from '../facts/fact-selector';

export { LEVEL_MAX, LEVEL_MIN } from '../facts/fact-selector';

/** Ett genererat påstående, redo att visas på kortet. */
export interface GeneratedStatement {
  fact: Fact;
  n1: number;
  n2: number;
  shown: number;
  isTrue: boolean;
  /** Vilken sorts fel som visas. `undefined` på sanna kort. */
  kind?: DistractorKind;
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

/**
 * Att förkasta ett falskt påstående kräver att man räknar ut produkten och
 * jämför; ett sant går att känna igen direkt. Falska kort får därför mer tid
 * innan de räknas som långsamma — annars straffas spelaren för korttypen i
 * stället för för sin egen snabbhet.
 *
 * ANTAGANDE: 1,3 är satt på känsla och bör mätas på riktiga ronder.
 */
export const FALSE_CARD_TIME_FACTOR = 1.3;

/** Nivån stiger försiktigt, sjunker snabbt. */
export const LEVEL_UP_STEP = 1;
export const LEVEL_DOWN_STEP = 2;

/** Startnivå för en spelare vi inte vet något om. */
export const DEFAULT_START_LEVEL = 4;

/** Antal celler i värmekartan — `masteredCount()` räknar upp till den här. */
const HEATMAP_CELLS = 100;

/** Vad ronden minns om sig själv. */
export interface RoundMemory {
  /** Senast ställda tal, äldst först. */
  recent: Fact[];
  /** Fel-svar varje tal redan visat den här ronden. */
  shownFalse: Map<string, Set<number>>;
  /** Tal som svarats fel på och därför ska komma tillbaka som sanna. */
  owed: Set<string>;
}

export function createRoundMemory(): RoundMemory {
  return { recent: [], shownFalse: new Map(), owed: new Set() };
}

/**
 * Ett tal som svarats fel på ska nästa gång visas som ett *sant* påstående. Det
 * är den rätta kopplingen som ska nötas in, inte den felaktiga.
 */
export function rememberMiss(memory: RoundMemory, fact: Fact): void {
  memory.owed.add(factKey(fact.a, fact.b));
}

/** Genererar nästa kort. `rng` går att peka om i tester, annars `Math.random`. */
export function nextStatement(
  level: number,
  memory: RoundMemory,
  need?: FactNeed,
  rng: () => number = Math.random,
): GeneratedStatement {
  const fact = selectFact({ level, recent: memory.recent, need }, rng);
  const key = factKey(fact.a, fact.b);

  memory.recent.push(fact);
  if (memory.recent.length > RECENT_MEMORY) {
    memory.recent.shift();
  }

  const owed = memory.owed.has(key);
  const isTrue = owed || rng() < 0.5;
  if (owed) {
    memory.owed.delete(key);
  }

  if (isTrue) {
    return { fact, n1: fact.a, n2: fact.b, shown: fact.answer, isTrue: true };
  }

  const used = memory.shownFalse.get(key) ?? new Set<number>();
  const { shown, kind } = pickDistractor(fact, level, used, rng);
  used.add(shown);
  memory.shownFalse.set(key, used);

  return { fact, n1: fact.a, n2: fact.b, shown, isTrue: false, kind };
}

/**
 * Nivån efter ett svar. Stiger ett steg på ett snabbt rätt, sjunker två på ett
 * fel eller ett riktigt segt svar, ligger still däremellan — ett svep bär bara
 * en bit information, så det ska mycket till innan skalan rör sig långt.
 */
export function nextLevel(
  level: number,
  isTrueCard: boolean,
  correct: boolean,
  timeSec: number,
  targetTime: number,
): number {
  const target = targetTime * (isTrueCard ? 1 : FALSE_CARD_TIME_FACTOR);

  if (correct && timeSec <= target) {
    return clampLevel(level + LEVEL_UP_STEP);
  }
  if (!correct || timeSec > target * SLOW_TIME_MULTIPLIER) {
    return clampLevel(level - LEVEL_DOWN_STEP);
  }
  return level;
}

/**
 * Var brasan ska börja. En spelare som redan övat startar där kunskapen är, i
 * stället för mitt på skalan varje gång.
 */
export function startLevel(
  storedLevel: number | null,
  masteredCount: number,
  hasPractice: boolean,
): number {
  if (storedLevel !== null) {
    return clampLevel(storedLevel);
  }
  if (!hasPractice) {
    return DEFAULT_START_LEVEL;
  }
  const share = Math.min(1, masteredCount / HEATMAP_CELLS);
  return clampLevel(Math.round(LEVEL_MIN + share * (LEVEL_MAX - LEVEL_MIN)));
}

export function clampLevel(level: number): number {
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, level));
}
