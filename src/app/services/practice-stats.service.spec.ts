import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SWIPE_BASELINE, PracticeStatsService } from './practice-stats.service';

/** Tjänsten läser localStorage i konstruktorn, så den byggs efter varje uppsättning. */
function serviceWith(stored: Record<string, unknown>): PracticeStatsService {
  localStorage.clear();
  for (const [key, value] of Object.entries(stored)) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return new PracticeStatsService();
}

describe('PracticeStatsService', () => {
  beforeEach(() => localStorage.clear());

  describe('kanaler', () => {
    it('håller svep utanför värmekartans tider', () => {
      const stats = serviceWith({});
      stats.record(7, 8, true, 900, 'swipe');

      // Värmekartan och behärskningsmåttet mäter skrivna svar; ett svep är
      // igenkänning och går systematiskt snabbare.
      expect(stats.statFor(7, 8)!.times).toEqual([]);
      expect(stats.statFor(7, 8)!.swipe!.times).toEqual([900]);
      expect(stats.masteredCount()).toBe(0);
    });

    it('skriver skrivna svar som förut', () => {
      const stats = serviceWith({});
      stats.record(7, 8, true, 900);

      expect(stats.statFor(7, 8)!.times).toEqual([900]);
      expect(stats.statFor(7, 8)!.swipe).toBeUndefined();
      expect(stats.masteredCount()).toBe(1);
    });
  });

  describe('performanceFor', () => {
    it('slår ihop 7 × 8 och 8 × 7', () => {
      const stats = serviceWith({});
      stats.record(7, 8, true, 1000);
      stats.record(8, 7, false, 5000);

      const performance = stats.performanceFor(7, 8)!;
      expect(performance.averageSeconds).toBe(3);
      expect(performance.accuracy).toBe(0.5);
      expect(stats.performanceFor(8, 7)).toEqual(performance);
    });

    it('faller tillbaka på svep när skrivna svar saknas', () => {
      const stats = serviceWith({});
      stats.record(3, 4, true, 800, 'swipe');

      expect(stats.performanceFor(3, 4)!.averageSeconds).toBe(0.8);
    });

    it('låter skrivna svar gå före svep', () => {
      const stats = serviceWith({});
      stats.record(3, 4, true, 2000);
      stats.record(3, 4, true, 400, 'swipe');

      expect(stats.performanceFor(3, 4)!.averageSeconds).toBe(2);
    });

    it('ger undefined för ett tal som aldrig övats', () => {
      expect(serviceWith({}).performanceFor(9, 9)).toBeUndefined();
    });
  });

  describe('migrering', () => {
    it('läser gammalt format utan svepfält', () => {
      const stats = serviceWith({
        'mult-heatmap': { '2_3': { totalTime: 4000, count: 2, correct: 2 } },
        'mult-calibration': '2.0',
      });

      expect(stats.statFor(2, 3)!.times).toEqual([2000]);
      expect(stats.statFor(2, 3)!.total).toBe(2);
      expect(stats.masteredCount()).toBe(1);
    });

    it('behåller svepdata genom migreringen', () => {
      const stats = serviceWith({
        'mult-heatmap': {
          '2_3': { times: [1500], correct: 1, total: 1, swipe: { times: [700], correct: 1, total: 1 } },
        },
      });

      expect(stats.statFor(2, 3)!.swipe!.times).toEqual([700]);
    });
  });

  describe('nollställning', () => {
    it('rensar allt spelet minns om spelaren', () => {
      const stats = serviceWith({});
      stats.record(7, 8, true, 900);
      stats.record(3, 4, true, 700, 'swipe');
      stats.calibrate([1800, 2000, 2200]);
      stats.swipeLevel = 9;

      stats.reset();

      // Inget får överleva — nästa barn ska börja från noll.
      expect(stats.hasStoredProgress).toBe(false);
      expect(stats.hasPractice).toBe(false);
      expect(stats.masteredCount()).toBe(0);
      expect(stats.statFor(7, 8)).toBeUndefined();
      expect(stats.statFor(3, 4)).toBeUndefined();
      expect(stats.calibratedFastTime).toBeNull();
      expect(stats.swipeLevel).toBeNull();
      expect(new PracticeStatsService().hasStoredProgress).toBe(false);
    });

    it('räknar svep som sparat men inte som skriven övning', () => {
      // Framstegsmätaren mäter skrivna svar. Den som bara svept ska mötas av
      // välkomsttexten, inte av "0 av 100 tal sitter" — men ska ändå kunna
      // nollställas.
      const stats = serviceWith({});
      stats.record(3, 4, true, 700, 'swipe');

      expect(stats.hasPractice).toBe(false);
      expect(stats.hasStoredProgress).toBe(true);
    });

    it('ser en sparad svepnivå som något att rensa', () => {
      const stats = serviceWith({});
      stats.swipeLevel = 6;

      expect(stats.hasStoredProgress).toBe(true);
    });
  });

  describe('sveptakt', () => {
    it('faller tillbaka på grundtakten innan den mätts', () => {
      const stats = serviceWith({});

      expect(stats.hasSwipeBaseline).toBe(false);
      expect(stats.swipeBaselineSeconds).toBe(DEFAULT_SWIPE_BASELINE);
    });

    it('tar medianen av mätningarna, inte snittet', () => {
      // Ett tappat kort ska inte kunna dra takten med sig.
      const stats = serviceWith({});
      for (const seconds of [1.0, 1.1, 1.2, 1.3, 9.0]) {
        stats.recordSwipeBaseline(seconds);
      }

      expect(stats.hasSwipeBaseline).toBe(true);
      expect(stats.swipeBaselineSeconds).toBe(1.2);
    });

    it('rullar fönstret så att takten följer med när spelaren blir snabbare', () => {
      const stats = serviceWith({});
      for (let i = 0; i < 8; i++) {
        stats.recordSwipeBaseline(2.0);
      }
      for (let i = 0; i < 8; i++) {
        stats.recordSwipeBaseline(1.0);
      }

      expect(stats.swipeBaselineSeconds).toBe(1.0);
    });

    it('klipper orimliga tider i båda ändar', () => {
      const fast = serviceWith({});
      const slow = serviceWith({});
      for (let i = 0; i < 3; i++) {
        fast.recordSwipeBaseline(0.05);
        slow.recordSwipeBaseline(30);
      }

      expect(fast.swipeBaselineSeconds).toBe(0.5);
      expect(slow.swipeBaselineSeconds).toBe(3.0);
    });

    it('struntar i tider som inte är tider', () => {
      const stats = serviceWith({});
      stats.recordSwipeBaseline(Number.NaN);
      stats.recordSwipeBaseline(0);
      stats.recordSwipeBaseline(-2);

      expect(stats.hasSwipeBaseline).toBe(false);
    });

    it('överlever en omstart och nollställs med resten', () => {
      const stats = serviceWith({});
      for (const seconds of [1.0, 1.2, 1.4]) {
        stats.recordSwipeBaseline(seconds);
      }

      expect(new PracticeStatsService().swipeBaselineSeconds).toBe(1.2);
      expect(stats.hasStoredProgress).toBe(true);

      stats.reset();
      expect(stats.hasSwipeBaseline).toBe(false);
      expect(new PracticeStatsService().hasSwipeBaseline).toBe(false);
    });

    it('bortser från skräp i lagret', () => {
      const stats = serviceWith({ 'swipe-baseline': '{"inte":"en lista"}' });

      expect(stats.hasSwipeBaseline).toBe(false);
    });
  });

  describe('svepkanalens mått', () => {
    /** Sveptakt 1,0 s ger en snabbtröskel på 1,3 s. */
    function withBaseline(): PracticeStatsService {
      const stats = serviceWith({});
      for (let i = 0; i < 5; i++) {
        stats.recordSwipeBaseline(1);
      }
      return stats;
    }

    it('mäter svep mot sveptakten och inte mot skrivna svars tröskel', () => {
      const stats = withBaseline();
      stats.calibrate([3000, 3000, 3000]);

      // De två tiderna är inte jämförbara, och får inte råka bli det.
      expect(stats.swipeFastSeconds).toBeCloseTo(1.3, 10);
      expect(stats.fastSeconds).toBe(3.6);
      expect(stats.swipeSlowSeconds).toBeCloseTo(1.95, 10);
    });

    it('hittar talet oavsett vilken väg det lagrats', () => {
      const stats = withBaseline();
      stats.record(10, 3, true, 900, 'swipe');

      expect(stats.swipeStatFor(3, 10)!.times).toEqual([900]);
      expect(stats.swipeStatFor(10, 3)!.times).toEqual([900]);
      expect(stats.swipeStatFor(3, 9)).toBeUndefined();
    });

    it('låter skrivna svar vara i fred', () => {
      const stats = withBaseline();
      stats.record(7, 8, true, 4000);

      expect(stats.swipeStatFor(7, 8)).toBeUndefined();
      expect(stats.swipeMasteredCount()).toBe(0);
    });

    it('räknar till 55, och bara det som svepts snabbt nog', () => {
      const stats = withBaseline();
      stats.record(7, 8, true, 1100, 'swipe');
      stats.record(6, 6, true, 1100, 'swipe');
      stats.record(9, 9, true, 2500, 'swipe');

      expect(stats.swipeMasteredCount()).toBe(2);
    });

    it('vet om spelaren svept något alls', () => {
      const stats = serviceWith({});
      expect(stats.hasSwipePractice).toBe(false);

      stats.record(7, 8, true, 4000);
      expect(stats.hasSwipePractice).toBe(false);

      stats.record(7, 8, true, 900, 'swipe');
      expect(stats.hasSwipePractice).toBe(true);
    });
  });

  describe('swipeBestStreak', () => {
    it('börjar på noll och sparas över en omstart', () => {
      const stats = serviceWith({});
      expect(stats.swipeBestStreak).toBe(0);

      stats.swipeBestStreak = 12;
      expect(new PracticeStatsService().swipeBestStreak).toBe(12);
    });

    it('är något att rensa, och nollställs med resten', () => {
      const stats = serviceWith({});
      stats.swipeBestStreak = 7;

      expect(stats.hasStoredProgress).toBe(true);

      stats.reset();
      expect(stats.swipeBestStreak).toBe(0);
    });
  });

  describe('swipeLevel', () => {
    it('sparar och läser tillbaka nivån', () => {
      const stats = serviceWith({});
      expect(stats.swipeLevel).toBeNull();

      stats.swipeLevel = 8;
      expect(stats.swipeLevel).toBe(8);
      expect(new PracticeStatsService().swipeLevel).toBe(8);
    });

    it('nollställs med resten', () => {
      const stats = serviceWith({});
      stats.swipeLevel = 8;
      stats.reset();

      expect(stats.swipeLevel).toBeNull();
    });
  });
});
