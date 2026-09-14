import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FACTS } from '../facts/fact-catalog';
import { MIN_REMAINING } from '../training/observation-analysis';
import {
  MAX_OBSERVATIONS,
  MatchPairObservation,
  OBSERVATIONS_KEY,
  OBSERVATIONS_SCHEMA_VERSION,
  ObservationLog,
} from './observation-log';

/** Par per rond i Para ihop. Se `ROUND_SIZE` i match-view. */
const ROUND_SIZE = 5;

function storedObservations(): MatchPairObservation[] {
  const raw = localStorage.getItem(OBSERVATIONS_KEY);
  return raw === null ? [] : JSON.parse(raw).observations;
}

/** Låter skrivningen lyckas bara när nyttolasten är under `bytes`. */
function quotaOf(bytes: number): void {
  const real = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (value.length > bytes) {
      throw new DOMException('kvoten är full', 'QuotaExceededError');
    }
    real.call(this, key, value);
  });
}

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
  afterEach(() => vi.restoreAllMocks());

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

  it('rymmer det stickprov kalibreringen behöver', () => {
    // Testet låser inte 2000 — konstanten ska vara fri att justera. Det låser
    // att taket inte får sättas under vad en mätning kräver, vilket är vad det
    // gamla taket på 200 gjorde: det rymde inte en fjärdedel av en mätning, och
    // var därmed den bindande gränsen för steg 4 i docs/plan.md.
    //
    // Bara par som lämnade minst `MIN_REMAINING` kvar på brädet räknas som
    // evidens, och varje tal i tabellen ska hinna nå omkring fem sådana.
    const evidencePerFact = 5;
    const evidenceShare = (ROUND_SIZE - MIN_REMAINING + 1) / ROUND_SIZE;
    const needed = Math.ceil((FACTS.length * evidencePerFact) / evidenceShare);

    expect(MAX_OBSERVATIONS).toBeGreaterThanOrEqual(needed);
  });

  it('sparar de nyaste i stället för inga alls när lagret är fullt', async () => {
    const log = await hydrated();
    for (let i = 0; i < 400; i++) {
      log.append(pair('mul:7x8', i));
    }
    quotaOf(40_000);

    log.flush();

    // Nedtrappningen halverar tills det ryms: 400 → … → 125 händelser.
    const stored = storedObservations();
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.length).toBeLessThan(400);
    // Och det är de nyaste som blir kvar, inte de äldsta.
    expect(stored.at(-1)!.at).toBe(399);
    // Minnet behåller allt sessionen ut; taket gäller bara disken.
    expect(log.all().length).toBe(400);
  });

  it('ger upp tyst när inte ens det minsta ryms', async () => {
    const log = await hydrated();
    for (let i = 0; i < 400; i++) {
      log.append(pair('mul:7x8', i));
    }
    quotaOf(0);

    expect(() => log.flush()).not.toThrow();
    expect(localStorage.getItem(OBSERVATIONS_KEY)).toBeNull();
    expect(log.all().length).toBe(400);
  });

  it('börjar om från taket efter en rensning', async () => {
    const log = await hydrated();
    for (let i = 0; i < 400; i++) {
      log.append(pair('mul:7x8', i));
    }
    quotaOf(40_000);
    log.flush();

    // Rensningen kan mycket väl vara det som frigjorde kvoten.
    log.clear();
    vi.restoreAllMocks();
    log.append(pair('mul:2x3', 1));
    log.flush();

    expect(storedObservations().length).toBe(1);
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
