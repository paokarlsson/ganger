import { afterEach, describe, expect, it } from 'vitest';
import { FACTS, factFor } from '../facts/fact-catalog';
import { DEFAULT_START_LEVEL, GeneratedStatement } from '../swipe-view/swipe-difficulty';
import { DIFFICULTY, Pair } from '../master-view/levels';
import { disposeEngines, engineOn, engineWith, freshEngine, restarted } from '../testing/engine';
import { InMemoryProgressRepository, RefusingProgressRepository } from '../testing/progress-repository';
import { initialAutoDifficulty } from './auto-difficulty';
import { DEFAULT_SWIPE_BASELINE, TrainingEngine } from './training-engine';

/** Svepkanalen för ett tal. Kortform, den läses ofta här. */
function swipeStatFor(engine: TrainingEngine, a: number, b: number) {
  return engine.statFor(a, b, 'swipe');
}

describe('TrainingEngine', () => {
  afterEach(disposeEngines);

  describe('kanaler', () => {
    it('håller svep utanför värmekartans tider', async () => {
      const engine = await freshEngine();
      engine.record(7, 8, true, 900, 'swipe');

      // Värmekartan och behärskningsmåttet mäter skrivna svar; ett svep är
      // igenkänning och går systematiskt snabbare.
      expect(engine.statFor(7, 8)).toBeUndefined();
      expect(swipeStatFor(engine, 7, 8)!.times).toEqual([900]);
      expect(engine.masteredCount()).toBe(0);
    });

    it('skriver skrivna svar som förut', async () => {
      const engine = await freshEngine();
      engine.record(7, 8, true, 900);

      expect(engine.statFor(7, 8)!.times).toEqual([900]);
      expect(swipeStatFor(engine, 7, 8)).toBeUndefined();
      expect(engine.masteredCount()).toBe(1);
    });
  });

  describe('kanoniska nycklar', () => {
    it('lagrar 7 × 8 och 8 × 7 som ett enda tal', async () => {
      const engine = await freshEngine();
      engine.record(7, 8, true, 1000);
      engine.record(8, 7, true, 2000);

      // Ett tal, två mätningar — inte två tal med en mätning var.
      expect(engine.statFor(7, 8)!.times).toEqual([1000, 2000]);
      expect(engine.statFor(8, 7)).toBe(engine.statFor(7, 8));
    });

    it('räknar ett behärskat tal en gång, inte en gång per ordning', async () => {
      const engine = await freshEngine();
      engine.calibrate([2000, 2000, 2000]);
      engine.record(7, 8, true, 500);
      engine.record(8, 7, true, 500);

      expect(engine.masteredCount()).toBe(1);
      expect(engine.factCount).toBe(FACTS.length);
    });

    it('överlever en omstart', async () => {
      const engine = await freshEngine();
      engine.record(6, 9, true, 1200, 'swipe');
      engine.flush();

      expect(swipeStatFor(await restarted(), 9, 6)!.times).toEqual([1200]);
    });
  });

  describe('lagringen', () => {
    it('samlar skrivningar på hög och lägger ned dem när ronden tar slut', async () => {
      const store = new InMemoryProgressRepository();
      const engine = await engineOn(store);

      engine.record(7, 8, true, 900);
      // Fördröjningen är hela poängen: ett kort ska inte kosta en skrivning.
      expect(store.saves).toBe(0);

      engine.flush();
      expect(store.saves).toBe(1);
      expect((await restarted()).statFor(7, 8)!.times).toEqual([900]);
    });

    it('spelar vidare fast lagringen nekar varje skrivning', async () => {
      const engine = await engineOn(new RefusingProgressRepository());
      engine.record(7, 8, true, 900);
      engine.flush();

      // Ett nekat lager är inget stopp: framstegen får leva i minnet sessionen
      // ut, precis som när localStorage är fullt.
      expect(engine.statFor(7, 8)!.times).toEqual([900]);
      expect(engine.hasStoredProgress).toBe(true);
    });
  });

  describe('performanceFor', () => {
    it('slår ihop 7 × 8 och 8 × 7', async () => {
      const engine = await freshEngine();
      engine.record(7, 8, true, 1000);
      engine.record(8, 7, false, 5000);

      const performance = engine.performanceFor(7, 8)!;
      expect(performance.averageSeconds).toBe(3);
      expect(performance.accuracy).toBe(0.5);
      expect(engine.performanceFor(8, 7)).toEqual(performance);
    });

    it('faller tillbaka på svep när skrivna svar saknas', async () => {
      const engine = await freshEngine();
      engine.record(3, 4, true, 800, 'swipe');

      expect(engine.performanceFor(3, 4)!.averageSeconds).toBe(0.8);
    });

    it('låter skrivna svar gå före svep', async () => {
      const engine = await freshEngine();
      engine.record(3, 4, true, 2000);
      engine.record(3, 4, true, 400, 'swipe');

      expect(engine.performanceFor(3, 4)!.averageSeconds).toBe(2);
    });

    it('ger undefined för ett tal som aldrig övats', async () => {
      expect((await freshEngine()).performanceFor(9, 9)).toBeUndefined();
    });
  });

  describe('migrering från version 1', () => {
    it('läser gammalt format utan svepfält', async () => {
      const engine = await engineWith({
        'mult-heatmap': { '2_3': { totalTime: 4000, count: 2, correct: 2 } },
        'mult-calibration': '2.0',
      });

      expect(engine.statFor(2, 3)!.times).toEqual([2000]);
      expect(engine.statFor(2, 3)!.total).toBe(2);
      expect(engine.masteredCount()).toBe(1);
    });

    it('behåller svepdata genom migreringen', async () => {
      const engine = await engineWith({
        'mult-heatmap': {
          '2_3': { times: [1500], correct: 1, total: 1, swipe: { times: [700], correct: 1, total: 1 } },
        },
      });

      expect(swipeStatFor(engine, 2, 3)!.times).toEqual([700]);
    });

    it('slår ihop de två ordningarna till ett tal', async () => {
      // Version 1 lagrade dem var för sig och slog ihop dem vid varje läsning.
      // Nu görs det en gång, vid migreringen.
      const engine = await engineWith({
        'mult-heatmap': {
          '7_8': { times: [1000], correct: 1, total: 1 },
          '8_7': { times: [3000], correct: 0, total: 1 },
        },
      });

      const stat = engine.statFor(7, 8)!;
      expect(stat.times).toEqual([1000, 3000]);
      expect(stat.total).toBe(2);
      expect(stat.correct).toBe(1);
    });

    it('flyttar över resten av det spelet mindes', async () => {
      const engine = await engineWith({
        'mult-calibration': '1.8',
        'swipe-level': '7',
        'swipe-baseline': [1.0, 1.2, 1.4],
        'swipe-best-streak': '12',
      });

      expect(engine.calibratedFastTime).toBe(1.8);
      expect(engine.swipeLevel).toBe(7);
      expect(engine.swipeBaselineSeconds).toBe(1.2);
      expect(engine.swipeBestStreak).toBe(12);
    });

    it('städar bort de gamla nycklarna när de lästs', async () => {
      await engineWith({
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
      const engine = await engineWith({
        'mult-heatmap': { '2_3': { times: [1500], correct: 1, total: 1 } },
      });
      engine.record(2, 3, true, 1500);
      engine.flush();

      expect((await restarted()).statFor(2, 3)!.times).toEqual([1500, 1500]);
    });
  });

  describe('nollställning', () => {
    it('rensar allt spelet minns om spelaren', async () => {
      const engine = await freshEngine();
      engine.record(7, 8, true, 900);
      engine.record(3, 4, true, 700, 'swipe');
      engine.calibrate([1800, 2000, 2200]);
      engine.swipeLevel = 9;

      await engine.reset();

      // Inget får överleva — nästa barn ska börja från noll.
      expect(engine.hasStoredProgress).toBe(false);
      expect(engine.hasPractice).toBe(false);
      expect(engine.masteredCount()).toBe(0);
      expect(engine.statFor(7, 8)).toBeUndefined();
      expect(engine.statFor(3, 4)).toBeUndefined();
      expect(engine.calibratedFastTime).toBeNull();
      expect(engine.swipeLevel).toBeNull();
      expect((await restarted()).hasStoredProgress).toBe(false);
    });

    it('rensar också en version 1 som aldrig hunnit migreras', async () => {
      // Om lagringsformatet, alltså om den riktiga vägen genom localStorage.
      const engine = await engineWith({});
      localStorage.setItem('mult-heatmap', JSON.stringify({ '2_3': { times: [1500] } }));

      await engine.reset();

      expect(localStorage.getItem('mult-heatmap')).toBeNull();
      expect((await restarted()).hasStoredProgress).toBe(false);
    });

    it('räknar svep som sparat men inte som skriven övning', async () => {
      // Framstegsmätaren mäter skrivna svar. Den som bara svept ska mötas av
      // välkomsttexten, inte av "0 tal sitter" — men ska ändå kunna nollställas.
      const engine = await freshEngine();
      engine.record(3, 4, true, 700, 'swipe');

      expect(engine.hasPractice).toBe(false);
      expect(engine.hasStoredProgress).toBe(true);
    });

    it('ser en sparad svepnivå som något att rensa', async () => {
      const engine = await freshEngine();
      engine.swipeLevel = 6;

      expect(engine.hasStoredProgress).toBe(true);
    });
  });

  describe('sveptakt', () => {
    it('faller tillbaka på grundtakten innan den mätts', async () => {
      const engine = await freshEngine();

      expect(engine.hasSwipeBaseline).toBe(false);
      expect(engine.swipeBaselineSeconds).toBe(DEFAULT_SWIPE_BASELINE);
    });

    it('tar medianen av mätningarna, inte snittet', async () => {
      // Ett tappat kort ska inte kunna dra takten med sig.
      const engine = await freshEngine();
      for (const seconds of [1.0, 1.1, 1.2, 1.3, 9.0]) {
        engine.recordSwipeBaseline(seconds);
      }

      expect(engine.hasSwipeBaseline).toBe(true);
      expect(engine.swipeBaselineSeconds).toBe(1.2);
    });

    it('rullar fönstret så att takten följer med när spelaren blir snabbare', async () => {
      const engine = await freshEngine();
      for (let i = 0; i < 8; i++) {
        engine.recordSwipeBaseline(2.0);
      }
      for (let i = 0; i < 8; i++) {
        engine.recordSwipeBaseline(1.0);
      }

      expect(engine.swipeBaselineSeconds).toBe(1.0);
    });

    it('klipper orimliga tider i båda ändar', async () => {
      const fast = await freshEngine();
      const slow = await freshEngine();
      for (let i = 0; i < 3; i++) {
        fast.recordSwipeBaseline(0.05);
        slow.recordSwipeBaseline(30);
      }

      expect(fast.swipeBaselineSeconds).toBe(0.5);
      expect(slow.swipeBaselineSeconds).toBe(3.0);
    });

    it('struntar i tider som inte är tider', async () => {
      const engine = await freshEngine();
      engine.recordSwipeBaseline(Number.NaN);
      engine.recordSwipeBaseline(0);
      engine.recordSwipeBaseline(-2);

      expect(engine.hasSwipeBaseline).toBe(false);
    });

    it('överlever en omstart och nollställs med resten', async () => {
      const engine = await freshEngine();
      for (const seconds of [1.0, 1.2, 1.4]) {
        engine.recordSwipeBaseline(seconds);
      }

      expect((await restarted()).swipeBaselineSeconds).toBe(1.2);
      expect(engine.hasStoredProgress).toBe(true);

      await engine.reset();
      expect(engine.hasSwipeBaseline).toBe(false);
      expect((await restarted()).hasSwipeBaseline).toBe(false);
    });

    it('bortser från skräp i lagret', async () => {
      const engine = await engineWith({ 'swipe-baseline': '{"inte":"en lista"}' });

      expect(engine.hasSwipeBaseline).toBe(false);
    });
  });

  describe('svepkanalens mått', () => {
    /** Sveptakt 1,0 s ger en snabbtröskel på 1,3 s. */
    async function withBaseline(): Promise<TrainingEngine> {
      const engine = await freshEngine();
      for (let i = 0; i < 5; i++) {
        engine.recordSwipeBaseline(1);
      }
      return engine;
    }

    it('mäter svep mot sveptakten och inte mot skrivna svars tröskel', async () => {
      const engine = await withBaseline();
      engine.calibrate([3000, 3000, 3000]);

      // De två tiderna är inte jämförbara, och får inte råka bli det.
      expect(engine.swipeFastSeconds).toBeCloseTo(1.3, 10);
      expect(engine.fastSeconds).toBe(3.6);
      expect(engine.swipeSlowSeconds).toBeCloseTo(1.95, 10);
    });

    it('hittar talet oavsett vilken väg det lagrats', async () => {
      const engine = await withBaseline();
      engine.record(10, 3, true, 900, 'swipe');

      expect(swipeStatFor(engine, 3, 10)!.times).toEqual([900]);
      expect(swipeStatFor(engine, 10, 3)!.times).toEqual([900]);
      expect(swipeStatFor(engine, 3, 9)).toBeUndefined();
    });

    it('låter skrivna svar vara i fred', async () => {
      const engine = await withBaseline();
      engine.record(7, 8, true, 4000);

      expect(swipeStatFor(engine, 7, 8)).toBeUndefined();
      expect(engine.masteredCount('swipe')).toBe(0);
    });

    it('räknar till 55, och bara det som svepts snabbt nog', async () => {
      const engine = await withBaseline();
      engine.record(7, 8, true, 1100, 'swipe');
      engine.record(6, 6, true, 1100, 'swipe');
      engine.record(9, 9, true, 2500, 'swipe');

      expect(engine.masteredCount('swipe')).toBe(2);
    });

    it('lägger alla 55 tal ovanför diagonalen och inget två gånger', async () => {
      // Det är antagandet Svepets värmekarta vilar på: raden är den mindre
      // faktorn, kolumnen den större, och då ska varje tal finnas precis en
      // gång. Katalogen lagrar dem efter lättaste faktor, inte efter storlek.
      const engine = await withBaseline();
      for (const fact of FACTS) {
        engine.record(fact.a, fact.b, true, 1000, 'swipe');
      }

      let found = 0;
      for (let row = 1; row <= 10; row++) {
        for (let col = row; col <= 10; col++) {
          if (swipeStatFor(engine, row, col)) {
            found += 1;
          }
        }
      }

      expect(found).toBe(FACTS.length);
      expect(engine.masteredCount('swipe')).toBe(FACTS.length);
    });

    it('vet om spelaren svept något alls', async () => {
      const engine = await freshEngine();
      expect(engine.hasPracticeIn('swipe')).toBe(false);

      engine.record(7, 8, true, 4000);
      expect(engine.hasPracticeIn('swipe')).toBe(false);

      engine.record(7, 8, true, 900, 'swipe');
      expect(engine.hasPracticeIn('swipe')).toBe(true);
    });
  });

  describe('swipeBestStreak', () => {
    it('börjar på noll och sparas över en omstart', async () => {
      const engine = await freshEngine();
      expect(engine.swipeBestStreak).toBe(0);

      engine.swipeBestStreak = 12;
      expect((await restarted()).swipeBestStreak).toBe(12);
    });

    it('är något att rensa, och nollställs med resten', async () => {
      const engine = await freshEngine();
      engine.swipeBestStreak = 7;

      expect(engine.hasStoredProgress).toBe(true);

      await engine.reset();
      expect(engine.swipeBestStreak).toBe(0);
    });
  });

  describe('swipeLevel', () => {
    it('sparar och läser tillbaka nivån', async () => {
      const engine = await freshEngine();
      expect(engine.swipeLevel).toBeNull();

      engine.swipeLevel = 8;
      expect(engine.swipeLevel).toBe(8);
      expect((await restarted()).swipeLevel).toBe(8);
    });

    it('nollställs med resten', async () => {
      const engine = await freshEngine();
      engine.swipeLevel = 8;
      await engine.reset();

      expect(engine.swipeLevel).toBeNull();
    });
  });

  describe('vad som ska komma härnäst', () => {
    /** Ett påstående att mata pedagogiken med. */
    function statement(isTrue: boolean): GeneratedStatement {
      const fact = factFor(7, 8)!;
      return { fact, a: fact.a, b: fact.b, shown: isTrue ? fact.answer : 54, isTrue };
    }

    it('drar ned vikten för ett tal som sitter och håller den uppe för ett obeprövat', async () => {
      const engine = await freshEngine();
      engine.calibrate([2000, 2000, 2000]);
      for (let i = 0; i < 3; i++) {
        engine.record(7, 8, true, 500);
      }

      // Aldrig noll: ett behärskat tal måste kunna komma upp igen, annars
      // märks det aldrig att det rostat.
      expect(engine.needFor(factFor(7, 8)!)).toBeGreaterThan(0);
      expect(engine.needFor(factFor(7, 8)!)).toBeLessThan(engine.needFor(factFor(6, 9)!));
    });

    it('börjar Svep där kunskapen är', async () => {
      const engine = await freshEngine();
      expect(engine.swipeStartLevel()).toBe(DEFAULT_START_LEVEL);

      engine.swipeLevel = 9;
      expect(engine.swipeStartLevel()).toBe(9);
    });

    it('mäter ett svep mot spelarens egen takt', async () => {
      const engine = await freshEngine();
      for (let i = 0; i < 5; i++) {
        engine.recordSwipeBaseline(1);
      }

      // Snabbtröskeln är 1,3 s för ett sant kort; ett falskt får mer tid,
      // eftersom det kräver att produkten räknas ut.
      expect(engine.isFastSwipe(statement(true), true, 1.2)).toBe(true);
      expect(engine.isFastSwipe(statement(true), true, 1.5)).toBe(false);
      expect(engine.isFastSwipe(statement(false), true, 1.5)).toBe(true);
      expect(engine.isFastSwipe(statement(true), false, 0.2)).toBe(false);
    });

    it('flyttar nivån ett steg upp och två ned', async () => {
      const engine = await freshEngine();
      for (let i = 0; i < 5; i++) {
        engine.recordSwipeBaseline(1);
      }

      expect(engine.nextSwipeLevel(5, statement(true), true, 1.0)).toBe(6);
      expect(engine.nextSwipeLevel(5, statement(true), false, 1.0)).toBe(3);
    });

    it('låter bara rätt svepta kalibreringskort sätta takten', async () => {
      const engine = await freshEngine();
      for (let i = 0; i < 3; i++) {
        engine.recordSwipeCalibration(statement(true), false, 0.9);
      }

      // Ett barn som svepar på måfå ska inte kunna sätta en omöjlig ribba.
      expect(engine.hasSwipeBaseline).toBe(false);

      for (let i = 0; i < 3; i++) {
        engine.recordSwipeCalibration(statement(true), true, 0.9);
      }
      expect(engine.swipeBaselineSeconds).toBeCloseTo(0.9, 10);
    });
  });

  describe('Mästarens auto-läge', () => {
    /** Övar en hel svårighetsgrupp snabbt och rätt. */
    function master(engine: TrainingEngine, pairs: readonly Pair[]): void {
      for (const [a, b] of pairs) {
        for (let i = 0; i < 3; i++) {
          engine.record(a, b, true, 500);
        }
      }
    }

    it('börjar i den lägsta grupp spelaren inte redan är hemma i', async () => {
      const engine = await freshEngine();
      engine.calibrate([2000, 2000, 2000]);
      expect(engine.startDifficulty()).toBe('easy');

      master(engine, DIFFICULTY.easy);
      expect(engine.startDifficulty()).toBe('medium');

      master(engine, DIFFICULTY.medium);
      expect(engine.startDifficulty()).toBe('hard');
    });

    it('kräver mer än ett enda snabbt svar för att kalla ett tal automatiserat', async () => {
      const engine = await freshEngine();
      engine.calibrate([2000, 2000, 2000]);
      for (const [a, b] of DIFFICULTY.easy) {
        engine.record(a, b, true, 300);
      }

      expect(engine.startDifficulty()).toBe('easy');
    });

    it('rankar ett tal efter hur träningsvärt det är', async () => {
      const engine = await freshEngine();
      engine.calibrate([2000, 2000, 2000]);
      engine.record(7, 8, false, 9000);
      engine.record(6, 9, true, 500);

      expect(engine.trainingScore([7, 8])).toBeGreaterThan(engine.trainingScore([3, 4]));
      expect(engine.trainingScore([3, 4])).toBeGreaterThan(engine.trainingScore([6, 9]));
    });

    it('ställer aldrig samma tal två gånger i rad', async () => {
      const engine = await freshEngine();
      const previous = DIFFICULTY.medium[0];

      for (let i = 0; i < 30; i++) {
        const next = engine.nextAutoQuestion('medium', previous);
        expect(next).not.toEqual(previous);
      }
    });

    it('håller sig inom gruppen', async () => {
      const engine = await freshEngine();
      const inside = new Set(DIFFICULTY.hard.map(([a, b]) => `${a}x${b}`));

      for (let i = 0; i < 30; i++) {
        const [a, b] = engine.nextAutoQuestion('hard', undefined);
        expect(inside.has(`${a}x${b}`)).toBe(true);
      }
    });

    it('flyttar gruppen med hur det går', async () => {
      const engine = await freshEngine();
      engine.calibrate([2000, 2000, 2000]);

      let state = initialAutoDifficulty('easy');
      for (let i = 0; i < 5; i++) {
        state = engine.nextDifficulty(state, { correct: true, timeSec: 0.5 });
      }

      // Trösklarna är spelarens egna, och motorn är den som känner dem.
      expect(state.difficulty).toBe('medium');
    });
  });
});
