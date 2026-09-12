import { describe, expect, it } from 'vitest';
import reference from '../swipe-view/ranked-questions.reference.json';
import {
  DistractorKind,
  distractorPoolSize,
  kindWeights,
  pickDistractor,
  poolsFor,
} from './distractors';
import { FACTS, factFor, isTableProduct } from './fact-catalog';
import { LEVEL_MAX, LEVEL_MIN } from './fact-selector';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Drar ett fel-svar per tal, varv efter varv, på given nivå. */
function sample(level: number, rounds: number, seed = 1) {
  const rng = seeded(seed);
  const drawn: { answer: number; shown: number; kind: DistractorKind }[] = [];
  for (let round = 0; round < rounds; round++) {
    for (const fact of FACTS) {
      const { shown, kind } = pickDistractor(fact, level, new Set(), rng);
      drawn.push({ answer: fact.answer, shown, kind });
    }
  }
  return drawn;
}

describe('poolsFor', () => {
  it('täcker de handplockade fel-svaren i referensfilen', () => {
    // Datan är kuraterad av människor och fungerar som facit för modellen.
    // Enda undantaget är 0 som fel-svar: nollan ingår inte i katalogen, och
    // 0 × n genereras aldrig.
    const missed: string[] = [];
    for (const entry of reference) {
      const fact = factFor(entry.number1, entry.number2);
      if (!fact) {
        continue;
      }
      const pools = poolsFor(fact);
      const union = new Set<number>([
        ...pools['row-neighbour'],
        ...pools['table-twin'],
        ...pools['near-number'],
        ...pools['unit-trap'],
      ]);
      for (const wrong of entry.wrongs) {
        if (wrong !== 0 && !union.has(wrong)) {
          missed.push(`${fact.a}×${fact.b} → ${wrong}`);
        }
      }
    }
    expect(missed).toEqual([]);
  });

  it('ger varje tal minst ett fel-svar att välja på', () => {
    for (const fact of FACTS) {
      const pools = poolsFor(fact);
      const total =
        pools['row-neighbour'].length +
        pools['table-twin'].length +
        pools['near-number'].length +
        pools['unit-trap'].length;
      expect(total, `${fact.a}×${fact.b}`).toBeGreaterThan(0);
    }
  });

  it('skiljer nära tal från tabellprodukter', () => {
    for (const fact of FACTS) {
      const pools = poolsFor(fact);
      for (const value of pools['near-number']) {
        expect(isTableProduct(value), `${fact.a}×${fact.b} → ${value}`).toBe(false);
      }
      for (const value of pools['table-twin']) {
        expect(isTableProduct(value)).toBe(true);
      }
    }
  });
});

describe('pickDistractor', () => {
  it('visar aldrig det rätta svaret', () => {
    for (let level = LEVEL_MIN; level <= LEVEL_MAX; level++) {
      for (const { answer, shown } of sample(level, 20, level)) {
        expect(shown).not.toBe(answer);
        expect(shown).toBeGreaterThan(0);
      }
    }
  });

  it('håller fel-svaret tabellrimligt på alla nivåer', () => {
    // Kärnan i modellen: ett fel-svar ska vara en förväxling, inte ett
    // slumptal. Referensdatan ligger på 87 % — generatorn före omskrivningen
    // föll från 98 % på nivå 1 till 41 % på nivå 10.
    for (let level = LEVEL_MIN; level <= LEVEL_MAX; level++) {
      const drawn = sample(level, 40, level + 100);

      // Garantin ligger i konstruktionen: allt utom `near-number` är ett
      // tabellfel. Andelen är exakt och beror inte på vilka tal som dras.
      const byKind = drawn.filter((card) => card.kind !== 'near-number').length;
      expect(byKind / drawn.length, `nivå ${level}`).toBeGreaterThan(0.8);

      // Mätt i efterhand blir det några punkter lägre, se modulkommentaren.
      const products = drawn.filter((card) => isTableProduct(card.shown)).length;
      expect(products / drawn.length, `nivå ${level}`).toBeGreaterThan(0.75);
    }
  });

  it('gör fel-svaren rimligare, inte talen större, när nivån stiger', () => {
    const share = (level: number) => {
      const drawn = sample(level, 40, 21);
      return drawn.filter((card) => card.kind === 'table-twin').length / drawn.length;
    };
    expect(share(10)).toBeGreaterThan(share(5));
    expect(share(5)).toBeGreaterThan(share(1));
  });

  it('håller ettan som fel-svar till en minoritet, och släpper den högst upp', () => {
    const traps = (level: number) => {
      const drawn = sample(level, 40, 31);
      return drawn.filter((card) => card.kind === 'unit-trap').length / drawn.length;
    };
    expect(traps(1)).toBeLessThan(0.1);
    expect(traps(10)).toBe(0);
    expect(kindWeights(LEVEL_MAX)['unit-trap']).toBe(0);
  });

  it('visar inte ett fel-svar som redan varit uppe för samma tal', () => {
    const rng = seeded(17);
    for (const fact of FACTS) {
      const used = new Set<number>();
      const pools = poolsFor(fact);
      const distinct = new Set<number>([
        ...pools['row-neighbour'],
        ...pools['table-twin'],
        ...pools['near-number'],
        ...pools['unit-trap'],
      ]).size;

      for (let i = 0; i < distinct; i++) {
        const { shown } = pickDistractor(fact, 5, used, rng);
        expect(used.has(shown), `${fact.a}×${fact.b} upprepade ${shown}`).toBe(false);
        used.add(shown);
      }
    }
  });
});

describe('distractorPoolSize', () => {
  it('räknar de olika fel-svar ett tal kan visa', () => {
    for (const fact of FACTS) {
      const pools = poolsFor(fact);
      const values = new Set(Object.values(pools).flat());

      expect(distractorPoolSize(fact), `${fact.a} × ${fact.b}`).toBe(values.size);
      expect(distractorPoolSize(fact), `${fact.a} × ${fact.b}`).toBeGreaterThan(0);
    }
  });
});
