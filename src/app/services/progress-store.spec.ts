import { beforeEach, describe, expect, it } from 'vitest';
import { FACTS } from '../facts/fact-catalog';
import {
  ALL_PROGRESS_KEYS,
  LocalStorageProgressRepository,
  PROGRESS_KEY,
  SCHEMA_VERSION,
  emptyDocument,
  emptyRecord,
  hasContent,
  migrateFromVersion1,
  progressKeyFor,
} from './progress-store';

describe('progressKeyFor', () => {
  it('ger samma nyckel oavsett faktorernas ordning', () => {
    expect(progressKeyFor(7, 8)).toBe('mul:7x8');
    expect(progressKeyFor(8, 7)).toBe('mul:7x8');
  });

  it('namnrymden lämnar plats för andra räknesätt', () => {
    // Poängen med prefixet: `add:7+8` och `div:56/7` ska kunna läggas till
    // utan att dokumentet behöver göras om.
    expect(progressKeyFor(7, 8).startsWith('mul:')).toBe(true);
  });

  it('täcker katalogen med en nyckel per tal', () => {
    expect(new Set(ALL_PROGRESS_KEYS).size).toBe(FACTS.length);
  });
});

describe('migrateFromVersion1', () => {
  const empty = { stats: null, calibration: null, baseline: null, level: null, streak: null };

  it('sätter versionsnumret', () => {
    expect(migrateFromVersion1(empty).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('slår ihop de två ordningarna av samma tal', () => {
    const document = migrateFromVersion1({
      ...empty,
      stats: {
        '7_8': { times: [1000], correct: 1, total: 1 },
        '8_7': { times: [3000, 4000], correct: 1, total: 2 },
      },
    });

    const record = document.facts['mul:7x8'];
    expect(record.typed.times).toEqual([1000, 3000, 4000]);
    expect(record.typed.correct).toBe(2);
    expect(record.typed.total).toBe(3);
    expect(Object.keys(document.facts)).toEqual(['mul:7x8']);
  });

  it('behåller bara de fem senaste tiderna när de slås ihop', () => {
    const document = migrateFromVersion1({
      ...empty,
      stats: {
        '7_8': { times: [1, 2, 3, 4, 5], correct: 5, total: 5 },
        '8_7': { times: [6, 7, 8], correct: 3, total: 3 },
      },
    });

    expect(document.facts['mul:7x8'].typed.times).toEqual([4, 5, 6, 7, 8]);
  });

  it('räddar snittet ur den allra äldsta formen', () => {
    const document = migrateFromVersion1({
      ...empty,
      stats: { '2_3': { totalTime: 4000, count: 2, correct: 2 } },
    });

    expect(document.facts['mul:2x3'].typed.times).toEqual([2000]);
    expect(document.facts['mul:2x3'].typed.total).toBe(2);
  });

  it('håller kanalerna isär', () => {
    const document = migrateFromVersion1({
      ...empty,
      stats: {
        '2_3': { times: [1500], correct: 1, total: 1, swipe: { times: [700], correct: 1, total: 1 } },
      },
    });

    expect(document.facts['mul:2x3'].typed.times).toEqual([1500]);
    expect(document.facts['mul:2x3'].swipe.times).toEqual([700]);
  });

  it('flyttar över kalibrering, nivå, takt och rekord', () => {
    const document = migrateFromVersion1({
      stats: null,
      calibration: '1.8',
      baseline: [1.0, 1.2],
      level: '7',
      streak: '12',
    });

    expect(document.typedCalibration).toBe(1.8);
    expect(document.swipeBaseline).toEqual([1.0, 1.2]);
    expect(document.swipeLevel).toBe(7);
    expect(document.swipeBestStreak).toBe(12);
  });

  it('bortser från nycklar och värden som inte går att tyda', () => {
    const document = migrateFromVersion1({
      ...empty,
      stats: { 'inte en nyckel': { times: [1] }, '2_3': 'inte ett objekt' },
      baseline: '{"inte":"en lista"}',
      level: 'kanske',
    });

    expect(document.facts).toEqual({});
    expect(document.swipeBaseline).toEqual([]);
    expect(document.swipeLevel).toBeNull();
  });

  it('släpper tal som aldrig gav en mätning', () => {
    // Ett tal utan försök säger inget om spelaren och ska inte hålla
    // dokumentet vid liv.
    const document = migrateFromVersion1({
      ...empty,
      stats: { '2_3': { times: [], correct: 0, total: 0 } },
    });

    expect(hasContent(document)).toBe(false);
  });
});

describe('LocalStorageProgressRepository', () => {
  beforeEach(() => localStorage.clear());

  it('läser tillbaka det den skrivit', async () => {
    const repository = new LocalStorageProgressRepository();
    const document = emptyDocument();
    document.facts['mul:7x8'] = emptyRecord();
    document.facts['mul:7x8'].typed = { times: [1200], correct: 1, total: 1 };
    document.typedCalibration = 1.9;

    await repository.save(document);

    expect(await repository.load()).toEqual(document);
  });

  it('ger ett tomt dokument när ingenting är sparat', async () => {
    expect(await new LocalStorageProgressRepository().load()).toEqual(emptyDocument());
  });

  it('migrerar version 1 vid första läsningen och städar upp efter sig', async () => {
    localStorage.setItem('mult-heatmap', JSON.stringify({ '7_8': { times: [900], correct: 1, total: 1 } }));
    localStorage.setItem('mult-calibration', '2.0');
    const repository = new LocalStorageProgressRepository();

    const document = await repository.load();

    expect(document.schemaVersion).toBe(SCHEMA_VERSION);
    expect(document.facts['mul:7x8'].typed.times).toEqual([900]);
    expect(localStorage.getItem('mult-heatmap')).toBeNull();
    expect(localStorage.getItem(PROGRESS_KEY)).not.toBeNull();
  });

  it('överlever skräp under den nya nyckeln', async () => {
    localStorage.setItem(PROGRESS_KEY, 'inte json');

    expect(await new LocalStorageProgressRepository().load()).toEqual(emptyDocument());
  });

  it('överlever ett dokument där fälten har fel form', async () => {
    // En användare kan ha redigerat lagret, och en annan version av spelet kan
    // ha skrivit det. Spelet ska starta ändå.
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        schemaVersion: 2,
        facts: { 'mul:7x8': { typed: 'nej', swipe: { times: ['a', 2], correct: null, total: 1 } } },
        typedCalibration: 'snabbt',
        swipeBaseline: 17,
        swipeLevel: [],
        swipeBestStreak: undefined,
      }),
    );

    const document = await new LocalStorageProgressRepository().load();

    expect(document.facts['mul:7x8'].typed).toEqual({ times: [], correct: 0, total: 0 });
    expect(document.facts['mul:7x8'].swipe.times).toEqual([2]);
    expect(document.typedCalibration).toBeNull();
    expect(document.swipeBaseline).toEqual([]);
    expect(document.swipeLevel).toBeNull();
    expect(document.swipeBestStreak).toBe(0);
  });

  it('känner igen ett version 1-dokument som råkat skrivas under den nya nyckeln', () => {
    // Utan ett versionsnummer i version 1 är formen det enda som skiljer dem.
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ '7_8': { times: [900], correct: 1, total: 1 } }));

    return expect(
      new LocalStorageProgressRepository().load().then((d) => d.facts['mul:7x8'].typed.times),
    ).resolves.toEqual([900]);
  });

  it('rensar både det nya dokumentet och version 1:s nycklar', async () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(emptyDocument()));
    localStorage.setItem('mult-heatmap', '{}');
    localStorage.setItem('swipe-best-streak', '5');

    await new LocalStorageProgressRepository().clear();

    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
    expect(localStorage.getItem('mult-heatmap')).toBeNull();
    expect(localStorage.getItem('swipe-best-streak')).toBeNull();
  });
});
