/**
 * Den enda sanningen om hur svårt ett tal är.
 *
 * Principen är hämtad ur `ranked-questions.reference.json`: ett tal är så svårt
 * som dess *lättaste* faktor. 1 × 9 är lätt fast nian är sen i tabellen, för
 * ettan bär en regel. 7 × 8 är svårt för att ingen av faktorerna gör det. Den
 * ordningen går att härleda ur en enda array, se `deriveOrder()` — hela
 * referensfilens ranking faller ut ur `deriveOrder([0, 1, 2, 5, 10, 3, 4, 6, 7,
 * 8, 9])`, vilket en test i `fact-catalog.spec.ts` låser fast.
 */

/**
 * Faktorernas inbördes svårighet — den array allt annat härleds ur.
 *
 * Skiljer sig från referensfilen på en punkt: nian ligger före 6, 7 och 8 i
 * stället för sist. Referensfilen rankar den efter storlek, men `levels.ts`
 * lägger den tidigt (nivå 7 av 10) eftersom den har både fingertricket och
 * siffersumman att luta sig mot, och det argumentet väger tyngre. Vill man ha
 * referensfilens ordning är det den här raden man ändrar.
 */
export const FACTOR_ORDER = [1, 2, 5, 10, 3, 4, 9, 6, 7, 8] as const;

/** Tabellen spelet håller sig inom. Samma spann som värmekartan i Mästaren. */
export const MIN_FACTOR = 1;
export const MAX_FACTOR = 10;

/**
 * Grovindelningen, härledd ur den lättaste faktorn:
 * `anchor` bär en regel som gör talet nästan gratis (×1, ×10),
 * `bridge` går att nå med dubblering eller halvering (×2, ×5),
 * `core` är de tal som måste sitta i minnet.
 */
export type Band = 'anchor' | 'bridge' | 'core';

export interface Fact {
  /** Den lättaste faktorn — den som bestämmer talets svårighet. */
  a: number;
  /** Partnern. Kan vara mindre än `a`: 10 × 3 är ett ankartal, inte ett kärntal. */
  b: number;
  answer: number;
  /** 1 och uppåt, stigande svårighet. */
  rank: number;
  band: Band;
}

/**
 * Parar ihop faktorerna i svårighetsordning: först alla tal som ankras i den
 * lättaste faktorn, inom varje sådan grupp med partnern i stigande ordning.
 * Varje oordnat par kommer med exakt en gång, eftersom en partner som ligger
 * tidigare i ordningen redan har tagit hand om paret.
 *
 * Exporterad för testet mot referensfilen — annars använder man `FACTS`.
 */
export function deriveOrder(order: readonly number[]): [number, number][] {
  const place = new Map(order.map((factor, index) => [factor, index]));
  const pairs: [number, number][] = [];

  for (const easier of order) {
    const partners = order
      .filter((factor) => place.get(factor)! >= place.get(easier)!)
      .sort((x, y) => x - y);
    for (const harder of partners) {
      pairs.push([easier, harder]);
    }
  }
  return pairs;
}

function bandFor(easier: number): Band {
  if (easier === 1 || easier === 10) {
    return 'anchor';
  }
  return easier === 2 || easier === 5 ? 'bridge' : 'core';
}

/** Alla 55 tal i tabellen, i stigande svårighet. Kommuterade par är samma tal. */
export const FACTS: readonly Fact[] = deriveOrder(FACTOR_ORDER).map(([a, b], index) => ({
  a,
  b,
  answer: a * b,
  rank: index + 1,
  band: bandFor(a),
}));

/** Nyckeln som gör 7 × 8 och 8 × 7 till samma tal. */
export function factKey(a: number, b: number): string {
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}

const BY_KEY = new Map(FACTS.map((fact) => [factKey(fact.a, fact.b), fact]));

/** Slår upp ett tal oavsett i vilken ordning faktorerna kommer. */
export function factFor(a: number, b: number): Fact | undefined {
  return BY_KEY.get(factKey(a, b));
}

/** Alla produkter som går att bilda i tabellen — vad som är ett *rimligt* svar. */
export const TABLE_PRODUCTS: ReadonlySet<number> = new Set(
  FACTS.flatMap((fact) => [fact.answer]),
);

export function isTableProduct(value: number): boolean {
  return TABLE_PRODUCTS.has(value);
}
