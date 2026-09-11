/**
 * Fel-svaret som ska visas på ett falskt kort.
 *
 * Uppgiften på ett svepkort är inte talet utan paret (tal, fel-svar): `7 × 8 =
 * 54` och `7 × 8 = 58` är två olika frågor. Den första är den förväxling barn
 * faktiskt gör och kräver att man kan tabellen; den andra går att avfärda på
 * sifferkänsla. Därför är distraktortypen en egen svårighetsaxel, skild från
 * hur stora talen är.
 *
 * Fördelningen är hämtad ur `ranked-questions.reference.json`, där 120 av 138
 * handplockade fel-svar (87 %) själva är produkter i tabellen. Andelen
 * tabellrimliga fel hålls därför konstant på 85 % på alla nivåer — det som
 * ändras med nivån är *vilken sorts* tabellrimligt fel som visas.
 *
 * Mätt som "är en produkt i 10×10-tabellen" landar det några punkter lägre,
 * eftersom ett radfel ibland kliver utanför tabellen: `9 × 11 = 99` är ett
 * äkta feltänk men ingen produkt i tabellen. Referensdatan innehåller samma
 * sorts fel-svar.
 */
import { Fact, MAX_FACTOR, MIN_FACTOR, isTableProduct } from './fact-catalog';

export type DistractorKind = 'row-neighbour' | 'table-twin' | 'near-number' | 'unit-trap';

export interface Distractor {
  shown: number;
  kind: DistractorKind;
}

/** Hur långt ifrån svaret en tabellprodukt får ligga och ändå kännas nära. */
function twinTolerance(answer: number): number {
  return Math.max(4, Math.round(answer * 0.15));
}

/**
 * Grannraden i tabellen: `(a±d) × b` och `a × (b±d)` för ett eller två steg.
 * Den klassiska missen att hamna fel när man räknar sig uppåt. Två steg är inte
 * påhittat — referensfilen ger `3 × 7 = 27` och `9 × 9 = 99`, båda hopp om två
 * rader. Faktorn får gå ett snäpp utanför tabellen, `10 × 10 = 110` är ett äkta
 * feltänk, men aldrig ner till noll.
 */
function rowNeighbours(fact: Fact): number[] {
  const values = new Set<number>();
  for (const delta of [-2, -1, 1, 2]) {
    for (const [x, y] of [
      [fact.a + delta, fact.b],
      [fact.a, fact.b + delta],
    ]) {
      if (x >= MIN_FACTOR && y >= MIN_FACTOR && x <= MAX_FACTOR + 1 && y <= MAX_FACTOR + 1) {
        values.add(x * y);
      }
    }
  }
  values.delete(fact.answer);
  return [...values];
}

/**
 * Ett annat tal i tabellen som ligger nära: 54 för 7 × 8. Svårast av alla,
 * eftersom svaret både ser rimligt ut och går att härleda till fel faktorer.
 */
function tableTwins(fact: Fact, neighbours: ReadonlySet<number>): number[] {
  const tolerance = twinTolerance(fact.answer);
  const values = new Set<number>();
  for (let x = MIN_FACTOR; x <= MAX_FACTOR; x++) {
    for (let y = x; y <= MAX_FACTOR; y++) {
      const product = x * y;
      if (product === fact.answer || neighbours.has(product)) {
        continue;
      }
      if (Math.abs(product - fact.answer) <= tolerance) {
        values.add(product);
      }
    }
  }
  return [...values];
}

/**
 * Ett tal strax bredvid som *inte* går att få fram genom någon multiplikation i
 * tabellen. Testar sifferkänsla snarare än tabellkunskap, och hålls därför till
 * en minoritet.
 */
function nearNumbers(fact: Fact): number[] {
  const values = new Set<number>();
  for (const delta of [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]) {
    const value = fact.answer + delta;
    if (value > 0 && !isTableProduct(value)) {
      values.add(value);
    }
  }
  return [...values];
}

/** Nybörjarmissen att produkten blir samma som den lilla faktorn: `1 × 4 = 1`. */
function unitTrap(fact: Fact): number[] {
  const hasUnit = fact.a === 1 || fact.b === 1;
  return hasUnit && fact.answer !== 1 ? [1] : [];
}

/**
 * Hur stor del av de falska korten som testar sifferkänsla i stället för
 * tabellkunskap. Referensdatan ligger på 13 %; resten är tabellrimliga fel.
 */
export const NEAR_NUMBER_WEIGHT = 15;
export const PLAUSIBLE_WEIGHT = 100 - NEAR_NUMBER_WEIGHT;

/**
 * Typfördelningen per nivå. De tabellrimliga typerna summerar alltid till
 * `PLAUSIBLE_WEIGHT`; det som stiger med nivån är hur stor del av dem som är
 * `table-twin`, alltså hur rimligt fel-svaret ser ut — inte hur stora talen är.
 */
export function kindWeights(level: number): Record<DistractorKind, number> {
  if (level <= 3) {
    return {
      'row-neighbour': 60,
      'table-twin': 15,
      'near-number': NEAR_NUMBER_WEIGHT,
      'unit-trap': 10,
    };
  }
  if (level <= 7) {
    return {
      'row-neighbour': 45,
      'table-twin': 35,
      'near-number': NEAR_NUMBER_WEIGHT,
      'unit-trap': 5,
    };
  }
  return {
    'row-neighbour': 30,
    'table-twin': 55,
    'near-number': NEAR_NUMBER_WEIGHT,
    'unit-trap': 0,
  };
}

/** Alla fel-svar vi någonsin skulle kunna visa för ett tal. */
export function poolsFor(fact: Fact): Record<DistractorKind, number[]> {
  const neighbours = rowNeighbours(fact);
  return {
    'row-neighbour': neighbours,
    'table-twin': tableTwins(fact, new Set(neighbours)),
    'near-number': nearNumbers(fact),
    'unit-trap': unitTrap(fact),
  };
}

const KINDS: DistractorKind[] = ['row-neighbour', 'table-twin', 'near-number', 'unit-trap'];

/**
 * Hur många olika fel-svar ett tal alls kan visa. En rond på fyrtio kort når
 * aldrig slutet av förrådet, men en som pågår tills spelaren själv slutar gör
 * det — och då behöver ronden veta om att det är dags att börja om.
 */
export function distractorPoolSize(fact: Fact): number {
  const pools = poolsFor(fact);
  return new Set(KINDS.flatMap((kind) => pools[kind])).size;
}

/**
 * Drar ett fel-svar för `fact`. `used` är de fel-svar talet redan visat den här
 * ronden — samma falska kort får inte komma igen, ett felaktigt påstående ska
 * inte hinna nötas in.
 */
export function pickDistractor(
  fact: Fact,
  level: number,
  used: ReadonlySet<number> = new Set(),
  rng: () => number = Math.random,
): Distractor {
  const pools = poolsFor(fact);
  const weights = kindWeights(level);

  const available = KINDS.map((kind) => ({
    kind,
    values: pools[kind].filter((value) => !used.has(value)),
    weight: weights[kind],
  })).filter((entry) => entry.values.length > 0 && entry.weight > 0);

  // Andelen tabellrimliga fel är modellens kärnlöfte och får inte bero på
  // vilket tal som råkade dras. Saknar ett tal `table-twin` — 9 × 10 och
  // 10 × 10 har inga nära produkter som inte redan är grannar — går vikten
  // till de andra tabellrimliga typerna, inte till `near-number`.
  const plausible = available.filter((entry) => entry.kind !== 'near-number');
  const plausibleWeight = plausible.reduce((sum, entry) => sum + entry.weight, 0);
  if (plausibleWeight > 0) {
    for (const entry of plausible) {
      entry.weight = (entry.weight / plausibleWeight) * PLAUSIBLE_WEIGHT;
    }
  }

  if (available.length === 0) {
    // Talet har visat allt det kan visa — hellre en upprepning än inget kort.
    const fallback = KINDS.flatMap((kind) => pools[kind]);
    return {
      shown: fallback.length ? fallback[Math.floor(rng() * fallback.length)] : fact.answer + 1,
      kind: 'near-number',
    };
  }

  const total = available.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = rng() * total;
  let chosen = available[available.length - 1];
  for (const entry of available) {
    threshold -= entry.weight;
    if (threshold < 0) {
      chosen = entry;
      break;
    }
  }

  return {
    shown: chosen.values[Math.floor(rng() * chosen.values.length)],
    kind: chosen.kind,
  };
}
