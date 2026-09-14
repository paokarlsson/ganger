import { describe, expect, it } from 'vitest';
import { MatchMispairObservation, MatchPairObservation, Observation } from '../services/observation-log';
import { ProgressDocument, emptyDocument, emptyRecord } from '../services/progress-store';
import {
  MIN_FACTS_FOR_CORRELATION,
  analyseObservations,
  formatReport,
  rank,
  readableKey,
  spearman,
} from './observation-analysis';

function pair(over: Partial<MatchPairObservation> & { key: string }): MatchPairObservation {
  return {
    source: 'match',
    kind: 'pair',
    firstTry: true,
    attempts: 0,
    msSinceRoundStart: 3000,
    msSinceLastResolved: 1200,
    msSinceFirstTouch: 800,
    resolvedBefore: 0,
    remaining: 5,
    startedFrom: 'question',
    flipped: false,
    at: 1_000_000,
    ...over,
  };
}

function mispair(
  over: Partial<MatchMispairObservation> & { key: string; pairedWith: string },
): MatchMispairObservation {
  return {
    source: 'match',
    kind: 'mispair',
    chosenAnswer: 54,
    msSinceRoundStart: 2000,
    resolvedBefore: 0,
    remaining: 5,
    at: 1_000_000,
    ...over,
  };
}

/** Ett framstegsdokument med svepen satta per tal, i ms. */
function withSwipes(times: Record<string, number[]>): ProgressDocument {
  const document = emptyDocument();
  for (const [key, values] of Object.entries(times)) {
    document.facts[key] = emptyRecord();
    document.facts[key].swipe = { times: values, correct: values.length, total: values.length };
  }
  return document;
}

describe('rank', () => {
  it('rangordnar från ett', () => {
    expect(rank([30, 10, 20])).toEqual([3, 1, 2]);
  });

  it('ger lika värden medelrang', () => {
    // Annars skulle ordningen mellan två identiska tider avgöra korrelationen.
    expect(rank([10, 10, 30])).toEqual([1.5, 1.5, 3]);
  });
});

describe('spearman', () => {
  it('ger +1 när ordningen är densamma', () => {
    expect(spearman([[1, 10], [2, 20], [3, 30], [4, 40]])).toBeCloseTo(1, 10);
  });

  it('ger −1 när ordningen är omvänd', () => {
    expect(spearman([[1, 40], [2, 30], [3, 20], [4, 10]])).toBeCloseTo(-1, 10);
  });

  it('mäter ordning och inte form', () => {
    // Samma ordning men starkt krökt: Pearson hade gett mindre än 1.
    expect(spearman([[1, 1], [2, 100], [3, 10_000]])).toBeCloseTo(1, 10);
  });

  it('ger null när det inte finns någon ordning att korrelera', () => {
    expect(spearman([[5, 1], [5, 2], [5, 3]])).toBeNull();
    expect(spearman([[1, 1], [2, 2]])).toBeNull();
  });
});

describe('analyseObservations', () => {
  it('räknar händelser, tal och felparningar', () => {
    const report = analyseObservations(
      [
        pair({ key: 'mul:2x3' }),
        pair({ key: 'mul:7x8' }),
        mispair({ key: 'mul:7x8', pairedWith: 'mul:2x3' }),
      ],
      emptyDocument(),
    );

    expect(report.observations).toBe(3);
    expect(report.pairs).toBe(2);
    expect(report.mispairs).toBe(1);
    expect(report.factsSeen).toBe(2);
    expect(report.factsTotal).toBe(55);
  });

  it('räknar en felparning på båda talen som var inblandade', () => {
    const report = analyseObservations(
      [mispair({ key: 'mul:7x8', pairedWith: 'mul:2x3' })],
      emptyDocument(),
    );

    expect(report.byFact.find((f) => f.key === 'mul:7x8')!.mispairs).toBe(1);
    expect(report.byFact.find((f) => f.key === 'mul:2x3')!.mispairs).toBe(1);
  });

  it('håller par med för litet uteslutningsrum utanför mätningen', () => {
    // Med ett par kvar på brädet är svaret gratis. Tiden säger då något om
    // hur fort ett finger rör sig, inte om vad barnet kan.
    const report = analyseObservations(
      [
        pair({ key: 'mul:7x8', remaining: 5, msSinceFirstTouch: 2000 }),
        pair({ key: 'mul:7x8', remaining: 1, msSinceFirstTouch: 100 }),
      ],
      emptyDocument(),
    );

    const fact = report.byFact.find((f) => f.key === 'mul:7x8')!;
    expect(fact.pairs).toBe(2);
    expect(fact.medianSinceFirstTouch).toBe(2000);
  });

  it('håller fumlade par utanför mätningen men räknar dem', () => {
    const report = analyseObservations(
      [
        pair({ key: 'mul:7x8', msSinceFirstTouch: 900 }),
        pair({ key: 'mul:7x8', firstTry: false, attempts: 2, msSinceFirstTouch: 9000 }),
      ],
      emptyDocument(),
    );

    const fact = report.byFact.find((f) => f.key === 'mul:7x8')!;
    expect(fact.pairs).toBe(2);
    expect(fact.firstTry).toBe(1);
    expect(fact.medianSinceFirstTouch).toBe(900);
  });

  it('visar tiden per storlek på uteslutningsrummet', () => {
    const report = analyseObservations(
      [
        pair({ key: 'mul:2x3', remaining: 5, msSinceFirstTouch: 2000 }),
        pair({ key: 'mul:3x4', remaining: 5, msSinceFirstTouch: 3000 }),
        pair({ key: 'mul:7x8', remaining: 1, msSinceFirstTouch: 200 }),
      ],
      emptyDocument(),
    );

    // Störst rum först — det är den ände som mäter kunskap.
    expect(report.eliminationBuckets.map((b) => b.remaining)).toEqual([5, 1]);
    expect(report.eliminationBuckets[0].medianSinceFirstTouch).toBe(2500);
    expect(report.eliminationBuckets[1].medianSinceFirstTouch).toBe(200);
  });

  it('rangordnar förväxlingarna efter hur ofta de sker', () => {
    const report = analyseObservations(
      [
        mispair({ key: 'mul:7x8', pairedWith: 'mul:6x9', chosenAnswer: 54 }),
        mispair({ key: 'mul:7x8', pairedWith: 'mul:6x9', chosenAnswer: 54 }),
        mispair({ key: 'mul:2x3', pairedWith: 'mul:1x6', chosenAnswer: 6 }),
      ],
      emptyDocument(),
    );

    expect(report.confusions[0]).toEqual({
      key: 'mul:7x8',
      pairedWith: 'mul:6x9',
      chosenAnswer: 54,
      times: 2,
    });
    expect(report.confusions[1].times).toBe(1);
  });

  it('skiljer på vilken spalt spelaren började i', () => {
    const report = analyseObservations(
      [
        pair({ key: 'mul:2x3', startedFrom: 'question', msSinceFirstTouch: 500 }),
        pair({ key: 'mul:3x4', startedFrom: 'answer', msSinceFirstTouch: 1500 }),
      ],
      emptyDocument(),
    );

    expect(report.startedFrom.question.medianSinceFirstTouch).toBe(500);
    expect(report.startedFrom.answer.medianSinceFirstTouch).toBe(1500);
  });

  describe('kärnfrågan', () => {
    /** Tio tal där match och svep är eniga om ordningen. */
    function agreeing(): { observations: Observation[]; progress: ProgressDocument } {
      const keys = ['mul:1x2', 'mul:1x3', 'mul:2x2', 'mul:2x3', 'mul:3x3',
                    'mul:3x4', 'mul:4x6', 'mul:6x7', 'mul:7x8', 'mul:8x9'];
      const observations = keys.map((key, i) =>
        pair({ key, msSinceFirstTouch: 500 + i * 200 }),
      );
      const swipes: Record<string, number[]> = {};
      keys.forEach((key, i) => (swipes[key] = [600 + i * 150]));
      return { observations, progress: withSwipes(swipes) };
    }

    it('hittar en koppling när tiderna är eniga om ordningen', () => {
      const { observations, progress } = agreeing();
      const report = analyseObservations(observations, progress);

      const correlation = report.matchVersusSwipe.sinceFirstTouch;
      expect(correlation.rho).toBeCloseTo(1, 10);
      expect(correlation.facts).toBe(10);
      expect(correlation.trustworthy).toBe(true);
    });

    it('hittar ingen koppling när svepen går åt andra hållet', () => {
      const { observations, progress } = agreeing();
      const keys = [...Object.keys(progress.facts)];
      keys.forEach((key, i) => {
        progress.facts[key].swipe.times = [600 + (keys.length - i) * 150];
      });

      expect(analyseObservations(observations, progress).matchVersusSwipe.sinceFirstTouch.rho)
        .toBeCloseTo(-1, 10);
    });

    it('vägrar lita på ett tunt underlag', () => {
      const report = analyseObservations(
        [pair({ key: 'mul:7x8' }), pair({ key: 'mul:2x3' }), pair({ key: 'mul:3x4' })],
        withSwipes({ 'mul:7x8': [900], 'mul:2x3': [600], 'mul:3x4': [700] }),
      );

      const correlation = report.matchVersusSwipe.sinceFirstTouch;
      expect(correlation.facts).toBeLessThan(MIN_FACTS_FOR_CORRELATION);
      expect(correlation.trustworthy).toBe(false);
    });

    it('räknar bara tal som har båda måtten', () => {
      const report = analyseObservations(
        [pair({ key: 'mul:7x8' }), pair({ key: 'mul:2x3' })],
        withSwipes({ 'mul:7x8': [900] }),
      );

      expect(report.matchVersusSwipe.sinceFirstTouch.facts).toBe(1);
    });

    it('mäter alla tre nollpunkterna var för sig', () => {
      // Det är hela skälet till att loggen sparar tre tider: vilken som bär
      // signal går inte att avgöra på förhand.
      const { observations, progress } = agreeing();
      const report = analyseObservations(observations, progress);

      expect(report.matchVersusSwipe.sinceFirstTouch.facts).toBe(10);
      expect(report.matchVersusSwipe.sinceLastResolved.facts).toBe(10);
      expect(report.matchVersusSwipe.sinceRoundStart.facts).toBe(10);
    });
  });

  it('klarar en tom logg', () => {
    const report = analyseObservations([], emptyDocument());

    expect(report.observations).toBe(0);
    expect(report.span).toBeNull();
    expect(report.byFact).toEqual([]);
    expect(report.matchVersusSwipe.sinceFirstTouch.rho).toBeNull();
    expect(() => formatReport(report)).not.toThrow();
  });
});

describe('formatReport', () => {
  it('säger vad siffrorna betyder, inte bara vad de är', () => {
    const keys = Array.from({ length: 10 }, (_, i) => `mul:1x${i + 1}`);
    const observations = keys.map((key, i) => pair({ key, msSinceFirstTouch: 500 + i * 200 }));
    const swipes: Record<string, number[]> = {};
    keys.forEach((key, i) => (swipes[key] = [600 + i * 150]));

    const text = formatReport(analyseObservations(observations, withSwipes(swipes)));

    expect(text).toContain('KÄRNFRÅGAN');
    expect(text).toContain('Tydlig koppling');
    expect(text).toContain('UTESLUTNINGSRUMMET');
  });

  it('säger ifrån när underlaget är för tunt i stället för att tolka', () => {
    const text = formatReport(
      analyseObservations([pair({ key: 'mul:7x8' })], withSwipes({ 'mul:7x8': [900] })),
    );

    expect(text).toContain('Underlaget räcker inte ännu');
  });
});

describe('readableKey', () => {
  it('gör nyckeln läsbar', () => {
    expect(readableKey('mul:7x8')).toBe('7 × 8');
  });

  it('lämnar en okänd nyckel som den är', () => {
    expect(readableKey('add:7+8')).toBe('add:7+8');
  });
});
