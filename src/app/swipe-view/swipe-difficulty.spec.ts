import { describe, expect, it } from 'vitest';
import { generateStatement, LEVEL_MAX, LEVEL_MIN } from './swipe-difficulty';

/** En deterministisk "slump" så att en körning går att upprepa. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe('generateStatement', () => {
  it('visar produkten själv när påståendet är sant', () => {
    const rng = seeded(1);
    for (let i = 0; i < 500; i++) {
      const s = generateStatement(5, rng);
      if (s.isTrue) {
        expect(s.shown).toBe(s.n1 * s.n2);
      }
    }
  });

  it('visar aldrig produkten när påståendet är falskt', () => {
    // Ett falskt påstående som råkar stämma straffar spelaren för rätt svep.
    for (let seed = 1; seed <= 20; seed++) {
      const rng = seeded(seed);
      for (let level = LEVEL_MIN; level <= LEVEL_MAX; level++) {
        for (let i = 0; i < 200; i++) {
          const s = generateStatement(level, rng);
          if (!s.isTrue) {
            expect(s.shown, `${s.n1} × ${s.n2}`).not.toBe(s.n1 * s.n2);
            expect(s.shown).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('håller faktorerna inom nivåns tak på alla nivåer', () => {
    const rng = seeded(3);
    let previousMax = 0;
    for (let level = LEVEL_MIN; level <= LEVEL_MAX; level++) {
      let levelMax = 0;
      for (let i = 0; i < 300; i++) {
        const s = generateStatement(level, rng);
        expect(s.n1).toBeGreaterThanOrEqual(1);
        expect(s.n2).toBeGreaterThanOrEqual(1);
        levelMax = Math.max(levelMax, s.n1, s.n2);
      }
      // Taket får aldrig krympa när nivån stiger.
      expect(levelMax).toBeGreaterThanOrEqual(previousMax);
      previousMax = levelMax;
    }
  });
});
