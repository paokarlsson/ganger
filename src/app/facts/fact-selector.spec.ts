import { describe, expect, it } from 'vitest';
import { FACTS, Fact, factFor } from './fact-catalog';
import {
  LEVEL_MAX,
  LEVEL_MIN,
  RECENT_MEMORY,
  focusRank,
  needWeight,
  selectFact,
  windowWeight,
} from './fact-selector';

/** En deterministisk "slump" så att en körning går att upprepa. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Drar `count` tal på given nivå, med färskhetsspärren påslagen. */
function draw(level: number, count: number, seed = 1, need?: (fact: Fact) => number): Fact[] {
  const rng = seeded(seed);
  const drawn: Fact[] = [];
  for (let i = 0; i < count; i++) {
    drawn.push(selectFact({ level, recent: drawn.slice(-RECENT_MEMORY), need }, rng));
  }
  return drawn;
}

describe('focusRank', () => {
  it('spänner från tabellens lätta ände till hela dess bredd', () => {
    // Nivå 1 siktar på de allra lättaste talen, nivå 10 på de svåraste.
    expect(focusRank(LEVEL_MIN)).toBe(4);
    expect(focusRank(LEVEL_MAX)).toBe(FACTS.length);
  });

  it('stiger med varje nivå', () => {
    for (let level = LEVEL_MIN; level < LEVEL_MAX; level++) {
      expect(focusRank(level + 1), `nivå ${level}`).toBeGreaterThan(focusRank(level));
    }
  });

  it('klipper nivåer utanför skalan i stället för att sikta utanför tabellen', () => {
    expect(focusRank(0)).toBe(focusRank(LEVEL_MIN));
    expect(focusRank(42)).toBe(focusRank(LEVEL_MAX));
  });
});

describe('windowWeight', () => {
  const level = 5;
  const focus = focusRank(level);

  it('väger tyngst vid nivåns fokus och lättare med avståndet', () => {
    expect(windowWeight(focus, level)).toBeGreaterThan(windowWeight(focus + 5, level));
    expect(windowWeight(focus + 5, level)).toBeGreaterThan(windowWeight(focus + 15, level));
  });

  it('väger lika åt båda håll från fokus', () => {
    // Fönstret är en klocka, inte en tröskel: ett för lätt tal är lika nära
    // som ett lika mycket för svårt.
    expect(windowWeight(focus - 7, level)).toBeCloseTo(windowWeight(focus + 7, level), 10);
  });

  it('håller varje tal möjligt på varje nivå', () => {
    // Golvet är en princip: kommer ett behärskat tal aldrig upp igen märks
    // det aldrig att det rostat.
    for (let each = LEVEL_MIN; each <= LEVEL_MAX; each++) {
      for (const fact of FACTS) {
        expect(windowWeight(fact.rank, each), `rank ${fact.rank}, nivå ${each}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('selectFact', () => {
  it('stannar inom tabellen på varje nivå', () => {
    for (let level = LEVEL_MIN; level <= LEVEL_MAX; level++) {
      for (const fact of draw(level, 500, level)) {
        expect(fact.a).toBeLessThanOrEqual(10);
        expect(fact.b).toBeLessThanOrEqual(10);
      }
    }
  });

  it('flyttar tyngdpunkten uppåt när nivån stiger', () => {
    let previous = 0;
    for (let level = LEVEL_MIN; level <= LEVEL_MAX; level++) {
      const drawn = draw(level, 3000, 7);
      const mean = drawn.reduce((sum, fact) => sum + fact.rank, 0) / drawn.length;
      expect(mean, `nivå ${level}`).toBeGreaterThan(previous);
      previous = mean;
    }
  });

  it('övar den lätta änden på nivå 1 och kärntalen på nivå 10', () => {
    const low = draw(1, 4000, 3);
    const high = draw(10, 4000, 3);
    const coreShare = (facts: Fact[]) =>
      facts.filter((fact) => fact.band === 'core').length / facts.length;

    // Banden ligger inte i en obruten följd — tvåans och femmans tal ligger
    // mellan ettans och tians — så nivå 1 mäts på rank, inte på band.
    const easyEnd = low.filter((fact) => fact.rank <= 20).length / low.length;
    expect(easyEnd).toBeGreaterThan(0.7);
    expect(coreShare(low)).toBeLessThan(0.1);

    expect(coreShare(high)).toBeGreaterThan(0.7);
  });

  it('håller hela tabellen nåbar även på ytterkanterna', () => {
    for (const level of [LEVEL_MIN, LEVEL_MAX]) {
      const seen = new Set(draw(level, 20000, 11).map((fact) => fact.rank));
      expect(seen.size, `nivå ${level}`).toBe(FACTS.length);
    }
  });

  it('upprepar inte ett tal inom färskhetsspärren', () => {
    const drawn = draw(5, 2000, 5);
    for (let i = RECENT_MEMORY; i < drawn.length; i++) {
      const window = drawn.slice(i - RECENT_MEMORY, i).map((fact) => fact.rank);
      expect(window).not.toContain(drawn[i].rank);
    }
  });

  it('drar svaga tal oftare än behärskade', () => {
    const weak = factFor(7, 8)!;
    const strong = factFor(6, 7)!;
    const need = (fact: Fact) => {
      if (fact === weak) {
        return needWeight({ averageSeconds: 6, accuracy: 0.4 }, 2);
      }
      if (fact === strong) {
        return needWeight({ averageSeconds: 1, accuracy: 1 }, 2);
      }
      return 1;
    };

    const drawn = draw(10, 20000, 13, need);
    const weakCount = drawn.filter((fact) => fact === weak).length;
    const strongCount = drawn.filter((fact) => fact === strong).length;

    expect(weakCount).toBeGreaterThan(strongCount * 4);
    // Behärskade tal ska bli sällsynta, inte omöjliga — annars märks det inte
    // när de rostar.
    expect(strongCount).toBeGreaterThan(0);
  });
});

describe('needWeight', () => {
  const fast = 2;

  it('ger obeprövade tal normal vikt', () => {
    expect(needWeight(undefined, fast)).toBe(1);
    expect(needWeight({ averageSeconds: null, accuracy: null }, fast)).toBe(1);
  });

  it('trycker ner behärskade tal utan att nolla dem', () => {
    const weight = needWeight({ averageSeconds: 1.5, accuracy: 1 }, fast);
    expect(weight).toBeLessThan(0.2);
    expect(weight).toBeGreaterThan(0);
  });

  it('lyfter långsamma och felade tal', () => {
    expect(needWeight({ averageSeconds: 5, accuracy: 1 }, fast)).toBeGreaterThan(1);
    expect(needWeight({ averageSeconds: 5, accuracy: 0.5 }, fast)).toBeGreaterThan(
      needWeight({ averageSeconds: 5, accuracy: 1 }, fast),
    );
  });

  it('räknar snabbt men slarvigt som ett tal att öva', () => {
    // Snabbt svar med låg träffsäkerhet är inte behärskat.
    expect(needWeight({ averageSeconds: 1, accuracy: 0.5 }, fast)).toBeGreaterThan(0.15);
  });
});
