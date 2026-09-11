import { beforeEach, describe, expect, it } from 'vitest';
import { PracticeStatsService } from './practice-stats.service';

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
