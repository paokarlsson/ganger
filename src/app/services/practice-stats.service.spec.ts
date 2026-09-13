import { beforeEach, describe, expect, it } from 'vitest';
import { FACTS } from '../facts/fact-catalog';
import { DEFAULT_SWIPE_BASELINE, PracticeStatsService } from './practice-stats.service';

/** Lagringen är asynkron, så tjänsten är inte klar förrän den hydrerats. */
async function serviceWith(stored: Record<string, unknown>): Promise<PracticeStatsService> {
  localStorage.clear();
  for (const [key, value] of Object.entries(stored)) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return restarted();
}

/** Som att ladda om sidan: en ny tjänst som läser det som ligger i lagret. */
async function restarted(): Promise<PracticeStatsService> {
  const stats = new PracticeStatsService();
  await stats.hydrate();
  return stats;
}

describe('PracticeStatsService', () => {
  beforeEach(() => localStorage.clear());

  describe('kanaler', () => {
    it('håller svep utanför värmekartans tider', async () => {
      const stats = await serviceWith({});
      stats.record(7, 8, true, 900, 'swipe');

      // Värmekartan och behärskningsmåttet mäter skrivna svar; ett svep är
      // igenkänning och går systematiskt snabbare.
      expect(stats.statFor(7, 8)).toBeUndefined();
      expect(stats.swipeStatFor(7, 8)!.times).toEqual([900]);
      expect(stats.masteredCount()).toBe(0);
    });

    it('skriver skrivna svar som förut', async () => {
      const stats = await serviceWith({});
      stats.record(7, 8, true, 900);

      expect(stats.statFor(7, 8)!.times).toEqual([900]);
      expect(stats.swipeStatFor(7, 8)).toBeUndefined();
      expect(stats.masteredCount()).toBe(1);
    });
  });

  describe('kanoniska nycklar', () => {
    it('lagrar 7 × 8 och 8 × 7 som ett enda tal', async () => {
      const stats = await serviceWith({});
      stats.record(7, 8, true, 1000);
      stats.record(8, 7, true, 2000);

      // Ett tal, två mätningar — inte två tal med en mätning var.
      expect(stats.statFor(7, 8)!.times).toEqual([1000, 2000]);
      expect(stats.statFor(8, 7)).toBe(stats.statFor(7, 8));
    });

    it('räknar ett behärskat tal en gång, inte en gång per ordning', async () => {
      const stats = await serviceWith({});
      stats.calibrate([2000, 2000, 2000]);
      stats.record(7, 8, true, 500);
      stats.record(8, 7, true, 500);

      expect(stats.masteredCount()).toBe(1);
      expect(stats.factCount).toBe(FACTS.length);
    });

    it('överlever en omstart', async () => {
      const stats = await serviceWith({});
      stats.record(6, 9, true, 1200, 'swipe');
      stats.flush();

      expect((await restarted()).swipeStatFor(9, 6)!.times).toEqual([1200]);
    });
  });

  describe('performanceFor', () => {
    it('slår ihop 7 × 8 och 8 × 7', async () => {
      const stats = await serviceWith({});
      stats.record(7, 8, true, 1000);
      stats.record(8, 7, false, 5000);

      const performance = stats.performanceFor(7, 8)!;
      expect(performance.averageSeconds).toBe(3);
      expect(performance.accuracy).toBe(0.5);
      expect(stats.performanceFor(8, 7)).toEqual(performance);
    });

    it('faller tillbaka på svep när skrivna svar saknas', async () => {
      const stats = await serviceWith({});
      stats.record(3, 4, true, 800, 'swipe');

      expect(stats.performanceFor(3, 4)!.averageSeconds).toBe(0.8);
    });

    it('låter skrivna svar gå före svep', async () => {
      const stats = await serviceWith({});
      stats.record(3, 4, true, 2000);
      stats.record(3, 4, true, 400, 'swipe');

      expect(stats.performanceFor(3, 4)!.averageSeconds).toBe(2);
    });

    it('ger undefined för ett tal som aldrig övats', async () => {
      expect((await serviceWith({})).performanceFor(9, 9)).toBeUndefined();
    });
  });

  describe('migrering från version 1', () => {
    it('läser gammalt format utan svepfält', async () => {
      const stats = await serviceWith({
        'mult-heatmap': { '2_3': { totalTime: 4000, count: 2, correct: 2 } },
        'mult-calibration': '2.0',
      });

      expect(stats.statFor(2, 3)!.times).toEqual([2000]);
      expect(stats.statFor(2, 3)!.total).toBe(2);
      expect(stats.masteredCount()).toBe(1);
    });

    it('behåller svepdata genom migreringen', async () => {
      const stats = await serviceWith({
        'mult-heatmap': {
          '2_3': { times: [1500], correct: 1, total: 1, swipe: { times: [700], correct: 1, total: 1 } },
        },
      });

      expect(stats.swipeStatFor(2, 3)!.times).toEqual([700]);
    });

    it('slår ihop de två ordningarna till ett tal', async () => {
      // Version 1 lagrade dem var för sig och slog ihop dem vid varje läsning.
      // Nu görs det en gång, vid migreringen.
      const stats = await serviceWith({
        'mult-heatmap': {
          '7_8': { times: [1000], correct: 1, total: 1 },
          '8_7': { times: [3000], correct: 0, total: 1 },
        },
      });

      const stat = stats.statFor(7, 8)!;
      expect(stat.times).toEqual([1000, 3000]);
      expect(stat.total).toBe(2);
      expect(stat.correct).toBe(1);
    });

    it('flyttar över resten av det spelet mindes', async () => {
      const stats = await serviceWith({
        'mult-calibration': '1.8',
        'swipe-level': '7',
        'swipe-baseline': [1.0, 1.2, 1.4],
        'swipe-best-streak': '12',
      });

      expect(stats.calibratedFastTime).toBe(1.8);
      expect(stats.swipeLevel).toBe(7);
      expect(stats.swipeBaselineSeconds).toBe(1.2);
      expect(stats.swipeBestStreak).toBe(12);
    });

    it('städar bort de gamla nycklarna när de lästs', async () => {
      await serviceWith({
        'mult-heatmap': { '2_3': { times: [1500], correct: 1, total: 1 } },
        'mult-calibration': '2.0',
        'swipe-level': '4',
      });

      // Annars lever två sanningar vidare sida vid sida.
      expect(localStorage.getItem('mult-heatmap')).toBeNull();
      expect(localStorage.getItem('mult-calibration')).toBeNull();
      expect(localStorage.getItem('swipe-level')).toBeNull();
      expect(localStorage.getItem('ganger-progress')).not.toBeNull();
    });

    it('gör om jobbet bara en gång', async () => {
      const stats = await serviceWith({
        'mult-heatmap': { '2_3': { times: [1500], correct: 1, total: 1 } },
      });
      stats.record(2, 3, true, 1500);
      stats.flush();

      expect((await restarted()).statFor(2, 3)!.times).toEqual([1500, 1500]);
    });
  });

  describe('nollställning', () => {
    it('rensar allt spelet minns om spelaren', async () => {
      const stats = await serviceWith({});
      stats.record(7, 8, true, 900);
      stats.record(3, 4, true, 700, 'swipe');
      stats.calibrate([1800, 2000, 2200]);
      stats.swipeLevel = 9;

      await stats.reset();

      // Inget får överleva — nästa barn ska börja från noll.
      expect(stats.hasStoredProgress).toBe(false);
      expect(stats.hasPractice).toBe(false);
      expect(stats.masteredCount()).toBe(0);
      expect(stats.statFor(7, 8)).toBeUndefined();
      expect(stats.statFor(3, 4)).toBeUndefined();
      expect(stats.calibratedFastTime).toBeNull();
      expect(stats.swipeLevel).toBeNull();
      expect((await restarted()).hasStoredProgress).toBe(false);
    });

    it('rensar också en version 1 som aldrig hunnit migreras', async () => {
      const stats = await serviceWith({});
      localStorage.setItem('mult-heatmap', JSON.stringify({ '2_3': { times: [1500] } }));

      await stats.reset();

      expect(localStorage.getItem('mult-heatmap')).toBeNull();
      expect((await restarted()).hasStoredProgress).toBe(false);
    });

    it('räknar svep som sparat men inte som skriven övning', async () => {
      // Framstegsmätaren mäter skrivna svar. Den som bara svept ska mötas av
      // välkomsttexten, inte av "0 tal sitter" — men ska ändå kunna nollställas.
      const stats = await serviceWith({});
      stats.record(3, 4, true, 700, 'swipe');

      expect(stats.hasPractice).toBe(false);
      expect(stats.hasStoredProgress).toBe(true);
    });

    it('ser en sparad svepnivå som något att rensa', async () => {
      const stats = await serviceWith({});
      stats.swipeLevel = 6;

      expect(stats.hasStoredProgress).toBe(true);
    });
  });

  describe('sveptakt', () => {
    it('faller tillbaka på grundtakten innan den mätts', async () => {
      const stats = await serviceWith({});

      expect(stats.hasSwipeBaseline).toBe(false);
      expect(stats.swipeBaselineSeconds).toBe(DEFAULT_SWIPE_BASELINE);
    });

    it('tar medianen av mätningarna, inte snittet', async () => {
      // Ett tappat kort ska inte kunna dra takten med sig.
      const stats = await serviceWith({});
      for (const seconds of [1.0, 1.1, 1.2, 1.3, 9.0]) {
        stats.recordSwipeBaseline(seconds);
      }

      expect(stats.hasSwipeBaseline).toBe(true);
      expect(stats.swipeBaselineSeconds).toBe(1.2);
    });

    it('rullar fönstret så att takten följer med när spelaren blir snabbare', async () => {
      const stats = await serviceWith({});
      for (let i = 0; i < 8; i++) {
        stats.recordSwipeBaseline(2.0);
      }
      for (let i = 0; i < 8; i++) {
        stats.recordSwipeBaseline(1.0);
      }

      expect(stats.swipeBaselineSeconds).toBe(1.0);
    });

    it('klipper orimliga tider i båda ändar', async () => {
      const fast = await serviceWith({});
      const slow = await serviceWith({});
      for (let i = 0; i < 3; i++) {
        fast.recordSwipeBaseline(0.05);
        slow.recordSwipeBaseline(30);
      }

      expect(fast.swipeBaselineSeconds).toBe(0.5);
      expect(slow.swipeBaselineSeconds).toBe(3.0);
    });

    it('struntar i tider som inte är tider', async () => {
      const stats = await serviceWith({});
      stats.recordSwipeBaseline(Number.NaN);
      stats.recordSwipeBaseline(0);
      stats.recordSwipeBaseline(-2);

      expect(stats.hasSwipeBaseline).toBe(false);
    });

    it('överlever en omstart och nollställs med resten', async () => {
      const stats = await serviceWith({});
      for (const seconds of [1.0, 1.2, 1.4]) {
        stats.recordSwipeBaseline(seconds);
      }

      expect((await restarted()).swipeBaselineSeconds).toBe(1.2);
      expect(stats.hasStoredProgress).toBe(true);

      await stats.reset();
      expect(stats.hasSwipeBaseline).toBe(false);
      expect((await restarted()).hasSwipeBaseline).toBe(false);
    });

    it('bortser från skräp i lagret', async () => {
      const stats = await serviceWith({ 'swipe-baseline': '{"inte":"en lista"}' });

      expect(stats.hasSwipeBaseline).toBe(false);
    });
  });

  describe('svepkanalens mått', () => {
    /** Sveptakt 1,0 s ger en snabbtröskel på 1,3 s. */
    async function withBaseline(): Promise<PracticeStatsService> {
      const stats = await serviceWith({});
      for (let i = 0; i < 5; i++) {
        stats.recordSwipeBaseline(1);
      }
      return stats;
    }

    it('mäter svep mot sveptakten och inte mot skrivna svars tröskel', async () => {
      const stats = await withBaseline();
      stats.calibrate([3000, 3000, 3000]);

      // De två tiderna är inte jämförbara, och får inte råka bli det.
      expect(stats.swipeFastSeconds).toBeCloseTo(1.3, 10);
      expect(stats.fastSeconds).toBe(3.6);
      expect(stats.swipeSlowSeconds).toBeCloseTo(1.95, 10);
    });

    it('hittar talet oavsett vilken väg det lagrats', async () => {
      const stats = await withBaseline();
      stats.record(10, 3, true, 900, 'swipe');

      expect(stats.swipeStatFor(3, 10)!.times).toEqual([900]);
      expect(stats.swipeStatFor(10, 3)!.times).toEqual([900]);
      expect(stats.swipeStatFor(3, 9)).toBeUndefined();
    });

    it('låter skrivna svar vara i fred', async () => {
      const stats = await withBaseline();
      stats.record(7, 8, true, 4000);

      expect(stats.swipeStatFor(7, 8)).toBeUndefined();
      expect(stats.swipeMasteredCount()).toBe(0);
    });

    it('räknar till 55, och bara det som svepts snabbt nog', async () => {
      const stats = await withBaseline();
      stats.record(7, 8, true, 1100, 'swipe');
      stats.record(6, 6, true, 1100, 'swipe');
      stats.record(9, 9, true, 2500, 'swipe');

      expect(stats.swipeMasteredCount()).toBe(2);
    });

    it('lägger alla 55 tal ovanför diagonalen och inget två gånger', async () => {
      // Det är antagandet Svepets värmekarta vilar på: raden är den mindre
      // faktorn, kolumnen den större, och då ska varje tal finnas precis en
      // gång. Katalogen lagrar dem efter lättaste faktor, inte efter storlek.
      const stats = await withBaseline();
      for (const fact of FACTS) {
        stats.record(fact.a, fact.b, true, 1000, 'swipe');
      }

      let found = 0;
      for (let row = 1; row <= 10; row++) {
        for (let col = row; col <= 10; col++) {
          if (stats.swipeStatFor(row, col)) {
            found += 1;
          }
        }
      }

      expect(found).toBe(FACTS.length);
      expect(stats.swipeMasteredCount()).toBe(FACTS.length);
    });

    it('vet om spelaren svept något alls', async () => {
      const stats = await serviceWith({});
      expect(stats.hasSwipePractice).toBe(false);

      stats.record(7, 8, true, 4000);
      expect(stats.hasSwipePractice).toBe(false);

      stats.record(7, 8, true, 900, 'swipe');
      expect(stats.hasSwipePractice).toBe(true);
    });
  });

  describe('swipeBestStreak', () => {
    it('börjar på noll och sparas över en omstart', async () => {
      const stats = await serviceWith({});
      expect(stats.swipeBestStreak).toBe(0);

      stats.swipeBestStreak = 12;
      expect((await restarted()).swipeBestStreak).toBe(12);
    });

    it('är något att rensa, och nollställs med resten', async () => {
      const stats = await serviceWith({});
      stats.swipeBestStreak = 7;

      expect(stats.hasStoredProgress).toBe(true);

      await stats.reset();
      expect(stats.swipeBestStreak).toBe(0);
    });
  });

  describe('swipeLevel', () => {
    it('sparar och läser tillbaka nivån', async () => {
      const stats = await serviceWith({});
      expect(stats.swipeLevel).toBeNull();

      stats.swipeLevel = 8;
      expect(stats.swipeLevel).toBe(8);
      expect((await restarted()).swipeLevel).toBe(8);
    });

    it('nollställs med resten', async () => {
      const stats = await serviceWith({});
      stats.swipeLevel = 8;
      await stats.reset();

      expect(stats.swipeLevel).toBeNull();
    });
  });
});
