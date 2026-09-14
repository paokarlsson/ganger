/**
 * Svepets rondlogik: vad som ska stå på nästa kort.
 *
 * Själva svårighetsmodellen ligger i `facts/` och delas med resten av appen —
 * här bestäms bara hur en rond använder den: sant eller falskt, vad ronden
 * minns, och hur nivån rör sig.
 */
import { DistractorKind, distractorPoolSize, pickDistractor } from '../facts/distractors';
import { FACTS, Fact, factKey } from '../facts/fact-catalog';
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

/** Ronden som inte tar slut förrän spelaren själv säger till. */
export const ENDLESS = 0;

/** Antal kort per rond. */
export const QUESTION_COUNTS = [10, 20, 30, 40, ENDLESS] as const;
export const DEFAULT_QUESTION_COUNT = 20;

export function isEndless(questionCount: number): boolean {
  return questionCount === ENDLESS;
}

/**
 * Så många kort ronden öppnar med för att mäta spelarens sveptakt. Nivån står
 * still under dem — det är spelaren som mäts, inte tvärtom.
 *
 * ANTAGANDE: satt på känsla. Fler kort ger en stabilare takt men en längre
 * uppvärmning innan ronden känns som en rond. Se docs/plan.md.
 */
export const CALIBRATION_CARDS = 5;

/**
 * Snabbt = sveptakten gånger så här mycket. Över 1, annars vore bara ett svep
 * snabbare än spelarens egen medeltakt gott nog, och nivån skulle aldrig nå
 * över golvet.
 *
 * ANTAGANDE: 1,3 och 1,5 nedan är valda ur simulering, inte ur mätdata, och
 * bör kollas mot riktiga ronder.
 */
export const FAST_FACTOR = 1.3;

/**
 * Långsamt = så här många gånger den snabba tiden. Betydligt lägre än
 * Mästarens 4, för tröskeln ligger nu nära spelarens eget golv: skillnaden
 * mellan tabellens lättaste och svåraste tal är för en människa kring 1,5–2
 * gånger, så en vidare zon gör den seg-grenen omöjlig att nå. Blir den det
 * återstår bara felsvaren som nedåtkraft, och då hamnar jämvikten vid en
 * tredjedel fel — på ett svep där ren gissning ger hälften rätt.
 */
export const SWIPE_SLOW_MULTIPLIER = 1.5;

/**
 * Att förkasta ett falskt påstående kräver att man räknar ut produkten och
 * jämför; ett sant går att känna igen direkt. Falska kort får därför mer tid
 * innan de räknas som långsamma — annars straffas spelaren för korttypen i
 * stället för för sin egen snabbhet. Samma faktor räknar tillbaka ett falskt
 * kalibreringskort till vad ett sant hade kostat, se `baselineSample()`.
 *
 * ANTAGANDE: 1,3 är satt på känsla och bör mätas på riktiga ronder.
 */
export const FALSE_CARD_TIME_FACTOR = 1.3;

/**
 * Brasans steg, och hur många snabba rätt i rad vart och ett kräver.
 *
 * Nivån duger inte som mått på hur varm spelaren är just nu: den rör sig ett
 * steg i taget och mättar — den som kan tabellen ligger på 9 eller 10 nästan
 * jämt, och skulle då ha en maxad brasa hela tiden. Räckan gör det den inte
 * kan. Den stiger fort, slocknar på ett fel, och är i en rond utan slut det
 * enda som går att jaga.
 */
export interface HeatTier {
  /** Antal snabba rätt i rad steget kräver. */
  from: number;
  /** Namnet syns i toppraden — färg och storlek får inte bära ensamma. */
  name: string;
  /** Hur många gånger så stor brasan ritas. */
  scale: number;
}

export const HEAT_TIERS: readonly HeatTier[] = [
  { from: 0, name: 'Glöd', scale: 1 },
  { from: 3, name: 'Låga', scale: 1.5 },
  { from: 6, name: 'Brasa', scale: 2 },
  { from: 10, name: 'Eldstorm', scale: 2.6 },
];

export function heatTier(streak: number): HeatTier {
  let tier = HEAT_TIERS[0];
  for (const candidate of HEAT_TIERS) {
    if (streak >= candidate.from) {
      tier = candidate;
    }
  }
  return tier;
}

/**
 * Räckan efter ett svar. Ett fel släcker den — det är vad "on fire" betyder.
 * Ett rätt som inte var snabbt håller den vid liv utan att elda på, så att
 * ett tal man behövde tänka på inte straffas som en miss.
 */
export function nextStreak(streak: number, correct: boolean, fast: boolean): number {
  if (!correct) {
    return 0;
  }
  return fast ? streak + 1 : streak;
}

/** Nivån stiger försiktigt, sjunker snabbt.
 *
 *  ANTAGANDE: asymmetrin är rätt i stabilt läge men fel under uppvärmningen,
 *  som ska hitta spelarens nivå fort. Tanken är att uppsteget ska bero på
 *  räckan och falla tillbaka hit när fönstret är slut. Se docs/plan.md,
 *  öppen fråga 6. */
export const LEVEL_UP_STEP = 1;
export const LEVEL_DOWN_STEP = 2;

/** Startnivå för en spelare vi inte vet något om.
 *
 *  ANTAGANDE: satt på känsla, mitt på skalan och en gnutta under. Principen är
 *  att börja under det systemet tror och accelerera tills motstånd uppstår. */
export const DEFAULT_START_LEVEL = 4;

/** Antal tal `masteredCount()` räknar upp till. */
const MASTERY_TOTAL = FACTS.length;

/**
 * Talen kalibreringen mäter på: ankarbandet, alltså de tal vars lättaste
 * faktor bär en regel (×1, ×10). Motsvarar Mästarens CALIBRATION_QUESTIONS.
 */
const ANCHOR_FACTS = FACTS.filter((fact) => fact.band === 'anchor');

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

/** Vad nästa kort ska visa. */
export interface StatementRequest {
  level: number;
  memory: RoundMemory;
  /** Öppningens kalibreringskort dras ur ankarbandet och rör inte nivån. */
  calibration?: boolean;
  need?: FactNeed;
}

/** Drar ett ankartal som inte nyss varit uppe. */
function selectAnchorFact(memory: RoundMemory, rng: () => number): Fact {
  const recent = new Set(memory.recent.map((fact) => fact.rank));
  const fresh = ANCHOR_FACTS.filter((fact) => !recent.has(fact.rank));
  const pool = fresh.length > 0 ? fresh : ANCHOR_FACTS;
  return pool[Math.floor(rng() * pool.length)];
}

/** Genererar nästa kort. `rng` går att peka om i tester, annars `Math.random`. */
export function nextStatement(
  request: StatementRequest,
  rng: () => number = Math.random,
): GeneratedStatement {
  const { level, memory, need } = request;
  const fact = request.calibration
    ? selectAnchorFact(memory, rng)
    : selectFact({ level, recent: memory.recent, need }, rng);
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
  if (used.size >= distractorPoolSize(fact)) {
    // Talet har visat allt det kan visa. Att börja om genom förrådet är bättre
    // än att stanna kvar i `pickDistractor`s nödutgång, som drar helt fritt
    // och därför kan lägga samma falska kort två gånger i rad.
    used.clear();
  }
  const { shown, kind } = pickDistractor(fact, level, used, rng);
  used.add(shown);
  memory.shownFalse.set(key, used);

  return { fact, n1: fact.a, n2: fact.b, shown, isTrue: false, kind };
}

/** Tiden ett kort ska klaras på för att räknas som snabbt. */
export function fastSeconds(baselineSeconds: number, isTrueCard: boolean): number {
  return baselineSeconds * FAST_FACTOR * (isTrueCard ? 1 : FALSE_CARD_TIME_FACTOR);
}

/** Rätt, och snabbt för just den här spelaren. Både nivån och brasan mäts
 *  mot samma sak, så att de aldrig kan säga emot varandra. */
export function isFastAnswer(
  isTrueCard: boolean,
  correct: boolean,
  timeSec: number,
  baselineSeconds: number,
): boolean {
  return correct && timeSec <= fastSeconds(baselineSeconds, isTrueCard);
}

/**
 * Vad ett kalibreringskort bidrar med till sveptakten. Ett falskt kort kräver
 * att man räknar ut produkten, så tiden räknas tillbaka till vad ett sant hade
 * kostat. Alternativet — att bara mäta på sanna kort — vore att öppna varje
 * rond med fem kort som alla ska svepas åt höger, och det lär ut fel sak.
 */
export function baselineSample(timeSec: number, isTrueCard: boolean): number {
  return isTrueCard ? timeSec : timeSec / FALSE_CARD_TIME_FACTOR;
}

/**
 * Nivån efter ett svar. Stiger ett steg på ett snabbt rätt, sjunker två på ett
 * fel eller ett riktigt segt svar, ligger still däremellan — ett svep bär bara
 * en bit information, så det ska mycket till innan skalan rör sig långt.
 *
 * Tröskeln kommer ur spelarens egen sveptakt, inte ur en vald måltid. Nivån
 * mäter därmed vilka *tal* spelaren klarar i sitt eget tempo, och betyder
 * samma sak för den snabbe och den långsamme.
 */
export function nextLevel(
  level: number,
  isTrueCard: boolean,
  correct: boolean,
  timeSec: number,
  baselineSeconds: number,
): number {
  if (isFastAnswer(isTrueCard, correct, timeSec, baselineSeconds)) {
    return clampLevel(level + LEVEL_UP_STEP);
  }
  if (!correct || timeSec > fastSeconds(baselineSeconds, isTrueCard) * SWIPE_SLOW_MULTIPLIER) {
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
  const share = Math.min(1, masteredCount / MASTERY_TOTAL);
  return clampLevel(Math.round(LEVEL_MIN + share * (LEVEL_MAX - LEVEL_MIN)));
}

export function clampLevel(level: number): number {
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, level));
}
