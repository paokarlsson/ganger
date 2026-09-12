import { describe, expect, it } from 'vitest';
import { poolsFor } from '../facts/distractors';
import { FACTS, factKey, isTableProduct } from '../facts/fact-catalog';
import { LEVEL_MAX, LEVEL_MIN, RECENT_MEMORY } from '../facts/fact-selector';
import {
  CALIBRATION_CARDS,
  DEFAULT_QUESTION_COUNT,
  DEFAULT_START_LEVEL,
  ENDLESS,
  FALSE_CARD_TIME_FACTOR,
  HEAT_TIERS,
  baselineSample,
  createRoundMemory,
  heatTier,
  isEndless,
  isFastAnswer,
  nextLevel,
  nextStreak,
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
      const statement = nextStatement({ level: 5, memory }, rng);
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
          const statement = nextStatement({ level, memory }, rng);
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
        const statement = nextStatement({ level, memory }, rng);
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
        const statement = nextStatement({ level: 7, memory }, rng);
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
        const statement = nextStatement({ level, memory }, rng);
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
    const missed = nextStatement({ level: 5, memory }, rng);
    rememberMiss(memory, missed.fact);

    const key = factKey(missed.n1, missed.n2);
    for (let i = 0; i < 400; i++) {
      const statement = nextStatement({ level: 5, memory }, rng);
      if (factKey(statement.n1, statement.n2) === key) {
        expect(statement.isTrue).toBe(true);
        return;
      }
    }
    throw new Error('talet kom aldrig tillbaka');
  });
});

describe('nextLevel', () => {
  // Sveptakten i testerna: ett ankartal tar spelaren två sekunder. Snabbt är
  // då 2,6 s, segt över 3,9 s, och ett falskt kort får 1,3 gånger mer.
  const baseline = 2;

  it('stiger på snabbt rätt och sjunker dubbelt på fel', () => {
    expect(nextLevel(5, true, true, 1, baseline)).toBe(6);
    expect(nextLevel(5, true, false, 1, baseline)).toBe(3);
  });

  it('ligger still på rätt svar som varken är snabbt eller segt', () => {
    expect(nextLevel(5, true, true, 3, baseline)).toBe(5);
  });

  it('ger falska kort mer tid än sanna', () => {
    // 3,2 s är för segt för ett sant kort men rymms på ett falskt, som kräver
    // att man räknar ut produkten innan man kan förkasta den.
    expect(nextLevel(5, true, true, 3.2, baseline)).toBe(5);
    expect(nextLevel(5, false, true, 3.2, baseline)).toBe(6);
  });

  it('mäter mot spelarens egen takt och inte mot en klocka', () => {
    // Samma kort, samma två sekunder: ett lyft för den som svepar i den takten
    // annars, ett tapp för den som brukar vara dubbelt så snabb.
    expect(nextLevel(5, true, true, 2, 2)).toBe(6);
    expect(nextLevel(5, true, true, 2, 1)).toBe(3);
  });

  it('håller sig inom skalan', () => {
    expect(nextLevel(LEVEL_MAX, true, true, 0.5, baseline)).toBe(LEVEL_MAX);
    expect(nextLevel(LEVEL_MIN, true, false, 0.5, baseline)).toBe(LEVEL_MIN);
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
          level = nextLevel(level, rng() < 0.5, correct, timeSec, baseline);
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

describe('kalibreringen', () => {
  it('drar bara ankartal, även när nivån ligger högt', () => {
    // Utan det här mäter kalibreringen uppgiften i stället för spelaren: på
    // nivå 10 ligger ankartalen sju standardavvikelser från fönstrets mitt och
    // dras aldrig av selektorn.
    const rng = seeded(11);
    const memory = createRoundMemory();
    for (let i = 0; i < 200; i++) {
      const statement = nextStatement({ level: LEVEL_MAX, memory, calibration: true }, rng);
      expect(statement.fact.band, `${statement.n1} × ${statement.n2}`).toBe('anchor');
    }
  });

  it('räknar tillbaka ett falskt kort till vad ett sant hade kostat', () => {
    expect(baselineSample(2, true)).toBe(2);
    expect(baselineSample(2 * FALSE_CARD_TIME_FACTOR, false)).toBeCloseTo(2, 10);
  });

  it('öppnar med fler kort än vad ronden minns', () => {
    // Annars hinner samma ankartal komma igen under kalibreringen.
    expect(CALIBRATION_CARDS).toBeLessThan(RECENT_MEMORY);
  });
});

describe('nivån mot sveptakten', () => {
  /**
   * Nivån en spelare landar på efter en lång rond. `floor` är tiden på det
   * lättaste talet — spelarens grundfart — och `slope` hur mycket långsammare
   * det svåraste talet är, alltså hur illa kunskapen sitter.
   */
  function settledLevel(floor: number, slope: number, seed: number): number {
    const rng = seeded(seed);
    const memory = createRoundMemory();
    let level = DEFAULT_START_LEVEL;

    for (let card = 0; card < 400; card++) {
      const statement = nextStatement({ level, memory }, rng);
      const share = statement.fact.rank / FACTS.length;
      const timeSec =
        floor * (1 + slope * share) * (statement.isTrue ? 1 : FALSE_CARD_TIME_FACTOR);
      const correct = rng() > 0.03 + 0.25 * slope * share;
      level = nextLevel(level, statement.isTrue, correct, timeSec, floor);
    }
    return level;
  }

  it('landar likadant hur snabb spelaren än är i grunden', () => {
    // Det här är hela poängen med att mäta i stället för att välja måltid:
    // den långsamme och den snabbe med samma kunskap ska mötas av samma tal.
    for (const seed of [1, 2, 3]) {
      expect(settledLevel(0.7, 1.2, seed), `seed ${seed}`).toBe(settledLevel(2.0, 1.2, seed));
    }
  });

  it('följer kunskapen', () => {
    for (const seed of [1, 2, 3]) {
      expect(settledLevel(1, 0.3, seed), `seed ${seed}`).toBeGreaterThan(
        settledLevel(1, 2.2, seed),
      );
    }
  });
});

describe('en rond utan slut', () => {
  it('håller fel-svaren tabellrimliga hur länge ronden än pågår', () => {
    // En rond på fyrtio kort når aldrig slutet av ett tals fel-svarsförråd.
    // En som pågår tills spelaren själv slutar gör det, och då föll
    // `pickDistractor` förut ned i sin nödutgång, som drar fritt ur alla
    // sorter — också de som bara testar sifferkänsla.
    const rng = seeded(21);
    const memory = createRoundMemory();
    const shown: number[] = [];

    for (let i = 0; i < 20000; i++) {
      const statement = nextStatement({ level: 3, memory }, rng);
      expect(statement.shown).toBeGreaterThan(0);
      if (!statement.isTrue) {
        expect(statement.shown).not.toBe(statement.n1 * statement.n2);
        shown.push(statement.shown);
      }
    }

    const plausible = shown.filter((value) => isTableProduct(value)).length;
    expect(plausible / shown.length).toBeGreaterThan(0.75);
  });

  it('vet vad ett tomt förråd är', () => {
    expect(isEndless(ENDLESS)).toBe(true);
    expect(isEndless(DEFAULT_QUESTION_COUNT)).toBe(false);
  });
});

describe('brasan', () => {
  it('mäter snabbt på samma sätt som nivån gör', () => {
    // Brasan och nivån får aldrig säga emot varandra om vad som var snabbt.
    expect(isFastAnswer(true, true, 2.5, 2)).toBe(true);
    expect(isFastAnswer(true, true, 2.7, 2)).toBe(false);
    expect(isFastAnswer(true, false, 0.5, 2)).toBe(false);
  });

  it('stiger på snabba rätt och slocknar på ett fel', () => {
    expect(nextStreak(0, true, true)).toBe(1);
    expect(nextStreak(4, true, true)).toBe(5);
    expect(nextStreak(9, false, false)).toBe(0);
  });

  it('låter ett rätt man behövde tänka på hålla räckan vid liv', () => {
    expect(nextStreak(4, true, false)).toBe(4);
  });

  it('byter steg precis vid tröskeln, och växer med varje steg', () => {
    for (const tier of HEAT_TIERS) {
      expect(heatTier(tier.from), tier.name).toBe(tier);
    }
    for (let i = 1; i < HEAT_TIERS.length; i++) {
      expect(HEAT_TIERS[i].from).toBeGreaterThan(HEAT_TIERS[i - 1].from);
      expect(HEAT_TIERS[i].scale).toBeGreaterThan(HEAT_TIERS[i - 1].scale);
      expect(HEAT_TIERS[i].name).not.toBe(HEAT_TIERS[i - 1].name);
    }
  });

  it('stannar på det högsta steget', () => {
    expect(heatTier(1000)).toBe(HEAT_TIERS[HEAT_TIERS.length - 1]);
  });
});
