import { describe, expect, it } from 'vitest';
import { poolsFor } from '../facts/distractors';
import { factKey, isTableProduct } from '../facts/fact-catalog';
import { LEVEL_MAX, LEVEL_MIN } from '../facts/fact-selector';
import {
  DEFAULT_START_LEVEL,
  createRoundMemory,
  nextLevel,
  nextStatement,
  rememberMiss,
  startLevel,
} from './swipe-difficulty';

/** En deterministisk "slump" så att en körning går att upprepa. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('nextStatement', () => {
  it('visar produkten själv när påståendet är sant', () => {
    const rng = seeded(1);
    const memory = createRoundMemory();
    for (let i = 0; i < 500; i++) {
      const statement = nextStatement(5, memory, undefined, rng);
      if (statement.isTrue) {
        expect(statement.shown).toBe(statement.n1 * statement.n2);
      }
    }
  });

  it('visar aldrig produkten när påståendet är falskt', () => {
    // Ett falskt påstående som råkar stämma straffar spelaren för rätt svep.
    for (let seed = 1; seed <= 20; seed++) {
      const rng = seeded(seed);
      for (let level = LEVEL_MIN; level <= LEVEL_MAX; level++) {
        const memory = createRoundMemory();
        for (let i = 0; i < 200; i++) {
          const statement = nextStatement(level, memory, undefined, rng);
          if (!statement.isTrue) {
            expect(statement.shown, `${statement.n1} × ${statement.n2}`).not.toBe(
              statement.n1 * statement.n2,
            );
            expect(statement.shown).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('håller faktorerna inom tabellen på alla nivåer', () => {
    const rng = seeded(3);
    for (let level = LEVEL_MIN; level <= LEVEL_MAX; level++) {
      const memory = createRoundMemory();
      for (let i = 0; i < 300; i++) {
        const statement = nextStatement(level, memory, undefined, rng);
        expect(statement.n1).toBeGreaterThanOrEqual(1);
        expect(statement.n2).toBeGreaterThanOrEqual(1);
        expect(statement.n1).toBeLessThanOrEqual(10);
        expect(statement.n2).toBeLessThanOrEqual(10);
      }
    }
  });

  it('upprepar aldrig samma falska kort i en rond', () => {
    // Ett felaktigt påstående som nöts in riskerar att fastna som kunskap.
    // Undantaget är ett tal vars hela fel-svarsförråd redan är förbrukat — då
    // är en upprepning bättre än inget kort, och en rond är kortare än så.
    for (let seed = 1; seed <= 10; seed++) {
      const rng = seeded(seed);
      const memory = createRoundMemory();
      const seen = new Map<string, Set<number>>();

      for (let i = 0; i < 400; i++) {
        const statement = nextStatement(7, memory, undefined, rng);
        if (statement.isTrue) {
          continue;
        }
        const key = factKey(statement.n1, statement.n2);
        const used = seen.get(key) ?? new Set<number>();
        const pools = poolsFor(statement.fact);
        const available = new Set([
          ...pools['row-neighbour'],
          ...pools['table-twin'],
          ...pools['near-number'],
          ...pools['unit-trap'],
        ]);

        if (used.size < available.size) {
          expect(used.has(statement.shown), `${key} = ${statement.shown}`).toBe(false);
        }
        used.add(statement.shown);
        seen.set(key, used);
      }
    }
  });

  it('håller fel-svaren tabellrimliga i verkligt spel', () => {
    // Testerna i distractors.spec drar jämnt över hela tabellen. Här går
    // korten genom selektorn, som koncentrerar sig på en del av tabellen —
    // det är den fördelningen spelaren faktiskt möter.
    for (const level of [1, 5, 10]) {
      const rng = seeded(level * 13);
      let memory = createRoundMemory();
      const shown: number[] = [];

      for (let i = 0; i < 20000; i++) {
        if (i % 30 === 0) {
          memory = createRoundMemory();
        }
        const statement = nextStatement(level, memory, undefined, rng);
        expect(statement.n1).toBeLessThanOrEqual(10);
        expect(statement.n2).toBeLessThanOrEqual(10);
        if (!statement.isTrue) {
          shown.push(statement.shown);
        }
      }

      const plausible = shown.filter((value) => isTableProduct(value)).length;
      expect(plausible / shown.length, `nivå ${level}`).toBeGreaterThan(0.75);
    }
  });

  it('låter ett tal man svarat fel på komma tillbaka som sant', () => {
    const rng = seeded(9);
    const memory = createRoundMemory();
    const missed = nextStatement(5, memory, undefined, rng);
    rememberMiss(memory, missed.fact);

    const key = factKey(missed.n1, missed.n2);
    for (let i = 0; i < 400; i++) {
      const statement = nextStatement(5, memory, undefined, rng);
      if (factKey(statement.n1, statement.n2) === key) {
        expect(statement.isTrue).toBe(true);
        return;
      }
    }
    throw new Error('talet kom aldrig tillbaka');
  });
});

describe('nextLevel', () => {
  it('stiger på snabbt rätt och sjunker dubbelt på fel', () => {
    expect(nextLevel(5, true, true, 1, 2)).toBe(6);
    expect(nextLevel(5, true, false, 1, 2)).toBe(3);
  });

  it('ligger still på rätt svar som varken är snabbt eller segt', () => {
    expect(nextLevel(5, true, true, 3, 2)).toBe(5);
  });

  it('ger falska kort mer tid än sanna', () => {
    // 2,4 s är för segt för ett sant kort men rymms på ett falskt, som kräver
    // att man räknar ut produkten innan man kan förkasta den.
    expect(nextLevel(5, true, true, 2.4, 2)).toBe(5);
    expect(nextLevel(5, false, true, 2.4, 2)).toBe(6);
  });

  it('håller sig inom skalan', () => {
    expect(nextLevel(LEVEL_MAX, true, true, 0.5, 2)).toBe(LEVEL_MAX);
    expect(nextLevel(LEVEL_MIN, true, false, 0.5, 2)).toBe(LEVEL_MIN);
  });

  it('sänker en gissare och lyfter den som kan tabellen', () => {
    // Ett enskilt kort bär bara en bit information och chansnivån är 50 %, så
    // påståendet gäller genomsnittet över många ronder — inte en enda.
    const meanLevelAfterRound = (accuracy: number, fastShare: number) => {
      let sum = 0;
      const rounds = 200;
      for (let seed = 1; seed <= rounds; seed++) {
        const rng = seeded(seed * 7919);
        let level = 5;
        for (let card = 0; card < 20; card++) {
          const correct = rng() < accuracy;
          const timeSec = rng() < fastShare ? 1 : 3;
          level = nextLevel(level, rng() < 0.5, correct, timeSec, 2);
        }
        sum += level;
      }
      return sum / rounds;
    };

    expect(meanLevelAfterRound(0.5, 1)).toBeLessThan(4);
    expect(meanLevelAfterRound(0.98, 0.9)).toBeGreaterThan(8);
  });
});

describe('startLevel', () => {
  it('plockar upp sparad nivå', () => {
    expect(startLevel(7, 0, true)).toBe(7);
  });

  it('håller sparad nivå inom skalan', () => {
    expect(startLevel(42, 0, true)).toBe(LEVEL_MAX);
    expect(startLevel(-3, 0, true)).toBe(LEVEL_MIN);
  });

  it('börjar mitt på skalan för en spelare vi inte vet något om', () => {
    expect(startLevel(null, 0, false)).toBe(DEFAULT_START_LEVEL);
  });

  it('utgår från vad spelaren behärskar när statistik finns', () => {
    expect(startLevel(null, 0, true)).toBe(LEVEL_MIN);
    expect(startLevel(null, 100, true)).toBe(LEVEL_MAX);
    expect(startLevel(null, 50, true)).toBeGreaterThan(LEVEL_MIN);
    expect(startLevel(null, 50, true)).toBeLessThan(LEVEL_MAX);
  });
});
