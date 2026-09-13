import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_OBSERVATIONS,
  MatchPairObservation,
  OBSERVATIONS_KEY,
  OBSERVATIONS_SCHEMA_VERSION,
  ObservationLog,
} from './observation-log';

function pair(key: string, at = 1): MatchPairObservation {
  return {
    source: 'match',
    kind: 'pair',
    key,
    firstTry: true,
    attempts: 0,
    msSinceRoundStart: 1200,
    msSinceLastResolved: 900,
    msSinceFirstTouch: 400,
    resolvedBefore: 0,
    remaining: 5,
    startedFrom: 'question',
    flipped: false,
    at,
  };
}

async function hydrated(): Promise<ObservationLog> {
  const log = new ObservationLog();
  await log.hydrate();
  return log;
}

describe('ObservationLog', () => {
  beforeEach(() => localStorage.clear());

  it('behåller händelserna i den ordning de kom', async () => {
    const log = await hydrated();
    log.append(pair('mul:2x3'));
    log.append(pair('mul:7x8'));

    expect(log.all().map((o) => o.key)).toEqual(['mul:2x3', 'mul:7x8']);
  });

  it('rullar ut de äldsta när bufferten är full', async () => {
    const log = await hydrated();
    for (let i = 0; i < MAX_OBSERVATIONS + 10; i++) {
      log.append(pair(`mul:${i}`, i));
    }

    expect(log.all().length).toBe(MAX_OBSERVATIONS);
    expect(log.all()[0].at).toBe(10);
  });

  it('överlever en omstart', async () => {
    const log = await hydrated();
    log.append(pair('mul:7x8'));
    log.flush();

    expect((await hydrated()).all().map((o) => o.key)).toEqual(['mul:7x8']);
  });

  it('lägger till i stället för att skriva över det som redan finns', async () => {
    // Det är därför loggen hydreras vid uppstart och inte bara skrivs.
    const first = await hydrated();
    first.append(pair('mul:2x3'));
    first.flush();

    const second = await hydrated();
    second.append(pair('mul:7x8'));
    second.flush();

    expect((await hydrated()).all().length).toBe(2);
  });

  it('skriver ett versionsnummer', async () => {
    const log = await hydrated();
    log.append(pair('mul:7x8'));
    log.flush();

    const stored = JSON.parse(localStorage.getItem(OBSERVATIONS_KEY)!);
    expect(stored.schemaVersion).toBe(OBSERVATIONS_SCHEMA_VERSION);
  });

  it('ligger under en egen nyckel, skild från framstegen', async () => {
    const log = await hydrated();
    log.append(pair('mul:7x8'));
    log.flush();

    // Framstegsdokumentet serialiseras om vid varje kort; händelserna får inte
    // göra den skrivningen dyrare.
    expect(localStorage.getItem('ganger-progress')).toBeNull();
  });

  it('rensas helt', async () => {
    const log = await hydrated();
    log.append(pair('mul:7x8'));
    log.flush();

    log.clear();

    expect(log.all()).toEqual([]);
    expect(localStorage.getItem(OBSERVATIONS_KEY)).toBeNull();
    expect((await hydrated()).all()).toEqual([]);
  });

  it('bortser från skräp i lagret i stället för att stoppa uppstarten', async () => {
    localStorage.setItem(OBSERVATIONS_KEY, 'inte json');
    expect((await hydrated()).all()).toEqual([]);

    localStorage.setItem(OBSERVATIONS_KEY, JSON.stringify({ observations: 'inte en lista' }));
    expect((await hydrated()).all()).toEqual([]);
  });

  it('sållar bort poster som inte är händelser', async () => {
    localStorage.setItem(
      OBSERVATIONS_KEY,
      JSON.stringify({
        schemaVersion: 1,
        observations: [pair('mul:7x8'), { source: 'okänt' }, null, { source: 'match' }],
      }),
    );

    expect((await hydrated()).all().map((o) => o.key)).toEqual(['mul:7x8']);
  });
});
