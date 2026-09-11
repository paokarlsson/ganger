import { describe, expect, it } from 'vitest';
import reference from '../swipe-view/ranked-questions.reference.json';
import {
  FACTOR_ORDER,
  FACTS,
  MAX_FACTOR,
  MIN_FACTOR,
  deriveOrder,
  factFor,
  factKey,
  isTableProduct,
} from './fact-catalog';

/** Referensfilens ordning, med kommuterade dubbletter borttagna. */
function referenceOrder(): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const entry of reference) {
    const key = factKey(entry.number1, entry.number2);
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }
  return order;
}

describe('deriveOrder', () => {
  it('återskapar referensfilens ranking ur en enda array', () => {
    // Filens 746 rader innehåller egentligen bara den här ordningen plus de
    // handplockade fel-svaren. Går den här testen sönder har antingen regeln
    // eller referensdatan ändrats — och då är det ett medvetet beslut.
    const derived = deriveOrder([0, 1, 2, 5, 10, 3, 4, 6, 7, 8, 9]).map(([a, b]) =>
      factKey(a, b),
    );
    expect(derived).toEqual(referenceOrder());
  });

  it('tar med varje oordnat par exakt en gång', () => {
    const keys = deriveOrder(FACTOR_ORDER).map(([a, b]) => factKey(a, b));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('FACTS', () => {
  it('täcker hela tabellen, en gång per oordnat par', () => {
    expect(FACTS).toHaveLength(55);
    const keys = new Set(FACTS.map((fact) => factKey(fact.a, fact.b)));
    for (let a = MIN_FACTOR; a <= MAX_FACTOR; a++) {
      for (let b = MIN_FACTOR; b <= MAX_FACTOR; b++) {
        expect(keys.has(factKey(a, b))).toBe(true);
      }
    }
  });

  it('håller sig inom tabellen', () => {
    for (const fact of FACTS) {
      expect(fact.a).toBeGreaterThanOrEqual(MIN_FACTOR);
      expect(fact.b).toBeGreaterThanOrEqual(MIN_FACTOR);
      expect(fact.a).toBeLessThanOrEqual(MAX_FACTOR);
      expect(fact.b).toBeLessThanOrEqual(MAX_FACTOR);
      expect(fact.answer).toBe(fact.a * fact.b);
    }
  });

  it('rankar stigande utan luckor', () => {
    expect(FACTS.map((fact) => fact.rank)).toEqual(
      FACTS.map((_, index) => index + 1),
    );
  });

  it('delar in banden efter den lättaste faktorn', () => {
    const counts = { anchor: 0, bridge: 0, core: 0 };
    for (const fact of FACTS) {
      counts[fact.band] += 1;
      if (fact.a === 1 || fact.a === 10) {
        expect(fact.band).toBe('anchor');
      } else if (fact.a === 2 || fact.a === 5) {
        expect(fact.band).toBe('bridge');
      } else {
        expect(fact.band).toBe('core');
      }
    }
    // Ettans rad (10) plus tians egna tal (7 — 10 × 2 och 10 × 5 hör till
    // tvåans och femmans block), tvåans 9 plus femmans 8, och de 21 tal där
    // ingen faktor bär en regel.
    expect(counts).toEqual({ anchor: 17, bridge: 17, core: 21 });
  });

  it('lägger alla ankartal före kärntalen', () => {
    const firstCore = FACTS.findIndex((fact) => fact.band === 'core');
    const lastAnchor = FACTS.map((fact) => fact.band).lastIndexOf('anchor');
    expect(lastAnchor).toBeLessThan(firstCore);
  });

  it('rankar 7 × 8 svårare än 1 × 9 trots mindre faktorer', () => {
    expect(factFor(7, 8)!.rank).toBeGreaterThan(factFor(1, 9)!.rank);
  });
});

describe('factFor', () => {
  it('är kommutativ', () => {
    expect(factFor(7, 8)).toBe(factFor(8, 7));
    expect(factFor(3, 10)).toBe(factFor(10, 3));
  });

  it('ger undefined utanför tabellen', () => {
    expect(factFor(0, 4)).toBeUndefined();
    expect(factFor(11, 2)).toBeUndefined();
  });
});

describe('isTableProduct', () => {
  it('känner igen produkter i tabellen', () => {
    expect(isTableProduct(56)).toBe(true);
    expect(isTableProduct(54)).toBe(true);
    expect(isTableProduct(58)).toBe(false);
    expect(isTableProduct(0)).toBe(false);
  });
});
