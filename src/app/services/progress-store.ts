/**
 * Lagret, och ingenting annat.
 *
 * Det här är den enda filen i appen som vet *var* framstegen ligger. Resten
 * ber om ett dokument och får ett tillbaka. Går spelet senare över till en
 * backend är det bara `ProgressRepository` som behöver en ny implementation —
 * pedagogiken, progressionen och UI:t ska kunna ligga kvar orörda.
 *
 * Gränssnittet är asynkront fast localStorage är synkront. Det är avsiktligt:
 * ett löfte går att uppfylla synkront, men en synkron signatur går inte att
 * göra asynkron i efterhand utan att varje anropare skrivs om.
 */
import { FACTS, factKey } from '../facts/fact-catalog';
import { readJson, readString, remove, writeJson } from './local-store';

/**
 * Formen på det som ligger i lagret. Höjs när dokumentet ändrar form, och
 * `migrate()` får då en gren till. Att den här raden inte fanns från början är
 * varför version 1 måste kännas igen på sina fält i stället för på sitt
 * nummer, se `isLegacyLayout()`.
 */
export const SCHEMA_VERSION = 2;

/** Allt spelet minns om den som övat, under en nyckel. */
export const PROGRESS_KEY = 'ganger-progress';

/** Nycklarna version 1 låg utspridda över. Läses en gång, sedan städas de bort. */
const LEGACY_KEYS = {
  stats: 'mult-heatmap',
  calibration: 'mult-calibration',
  swipeLevel: 'swipe-level',
  swipeBaseline: 'swipe-baseline',
  swipeBestStreak: 'swipe-best-streak',
} as const;

/** Hur många tider per tal och kanal som sparas. En gammal miss ska inte färga
 *  värmekartan för evigt. */
export const MAX_TIMES = 5;

/** Mätningarna i en kanal. Tiderna i två kanaler är inte jämförbara — ett svep
 *  är igenkänning, ett skrivet svar är framplockning. */
export interface ChannelStat {
  times: number[];
  correct: number;
  total: number;
}

/**
 * Vad spelet vet om ett tal. Kanalerna hålls isär eftersom de mäter olika
 * saker och mot olika trösklar.
 */
export interface FactRecord {
  typed: ChannelStat;
  swipe: ChannelStat;
}

export interface ProgressDocument {
  schemaVersion: number;
  /**
   * Nyckeln är maskinläsbar och stabil: `mul:7x8`, alltid med den mindre
   * faktorn först. Prefixet lämnar plats för `add:7+8` och `div:56/7` utan att
   * dokumentet behöver göras om, och kanoniseringen är vad som gör 7 × 8 och
   * 8 × 7 till *ett* tal i stället för två rader som måste slås ihop vid varje
   * läsning.
   */
  facts: Record<string, FactRecord>;
  /** Mästarens kalibrerade snabbhetstid i sekunder, `null` innan den mätts. */
  typedCalibration: number | null;
  /** Det rullande fönster sveptakten är medianen av. */
  swipeBaseline: number[];
  swipeLevel: number | null;
  swipeBestStreak: number;
}

/** Läser och skriver. Ingen pedagogik, inga trösklar, inga beslut. */
export interface ProgressRepository {
  load(): Promise<ProgressDocument>;
  save(document: ProgressDocument): Promise<void>;
  clear(): Promise<void>;
}

function emptyChannel(): ChannelStat {
  return { times: [], correct: 0, total: 0 };
}

export function emptyRecord(): FactRecord {
  return { typed: emptyChannel(), swipe: emptyChannel() };
}

export function emptyDocument(): ProgressDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    facts: {},
    typedCalibration: null,
    swipeBaseline: [],
    swipeLevel: null,
    swipeBestStreak: 0,
  };
}

/** Nyckeln ett tal lagras under, oavsett i vilken ordning faktorerna kommer. */
export function progressKeyFor(a: number, b: number): string {
  return `mul:${factKey(a, b)}`;
}

/** Om dokumentet innehåller något alls — det `clear()` har att rensa. */
export function hasContent(document: ProgressDocument): boolean {
  return (
    Object.keys(document.facts).length > 0 ||
    document.typedCalibration !== null ||
    document.swipeBaseline.length > 0 ||
    document.swipeLevel !== null ||
    document.swipeBestStreak > 0
  );
}

/**
 * Framstegen i webbläsaren de övats i.
 *
 * Att lagret kan vara otillgängligt eller fullt hanteras av `local-store.ts`;
 * det här är bara dokumentets väg in och ut. Nekas en skrivning får framstegen
 * leva kvar i minnet sessionen ut.
 */
export class LocalStorageProgressRepository implements ProgressRepository {
  async load(): Promise<ProgressDocument> {
    const stored = readJson(PROGRESS_KEY);
    if (stored !== null) {
      return normalize(stored);
    }

    const migrated = this.migrateLegacy();
    if (migrated === null) {
      return emptyDocument();
    }
    // Skrivs tillbaka direkt: nästa uppstart ska slippa gå den här vägen, och
    // de gamla nycklarna ska inte bli kvar och gå isär med dokumentet.
    await this.save(migrated);
    this.removeLegacy();
    return migrated;
  }

  async save(document: ProgressDocument): Promise<void> {
    writeJson(PROGRESS_KEY, document);
  }

  async clear(): Promise<void> {
    remove(PROGRESS_KEY);
    this.removeLegacy();
  }

  /** `null` när det inte finns någon version 1 att läsa. */
  private migrateLegacy(): ProgressDocument | null {
    // Tre av de gamla nycklarna höll ett blankt tal och inte JSON, och läses
    // därför som råsträng — `parseNumber()` tar hand om dem längre ned.
    const stats = readJson(LEGACY_KEYS.stats);
    const calibration = readString(LEGACY_KEYS.calibration);
    const baseline = readJson(LEGACY_KEYS.swipeBaseline);
    const level = readString(LEGACY_KEYS.swipeLevel);
    const streak = readString(LEGACY_KEYS.swipeBestStreak);

    if (
      stats === null &&
      calibration === null &&
      baseline === null &&
      level === null &&
      streak === null
    ) {
      return null;
    }

    return migrateFromVersion1({ stats, calibration, baseline, level, streak });
  }

  private removeLegacy(): void {
    for (const key of Object.values(LEGACY_KEYS)) {
      remove(key);
    }
  }
}

/** Version 1:s form: ett tal per ordnat faktorpar, under nyckeln `7_8`. */
interface LegacyFactStat {
  times?: unknown;
  /** Ännu äldre: summan av alla tider i stället för de senaste. */
  totalTime?: unknown;
  count?: unknown;
  correct?: unknown;
  total?: unknown;
  swipe?: { times?: unknown; correct?: unknown; total?: unknown };
}

interface Version1 {
  stats: unknown;
  calibration: string | null;
  baseline: unknown;
  level: string | null;
  streak: string | null;
}

/**
 * Version 1 → 2.
 *
 * Det som faktiskt ändras är nycklarna. Version 1 lagrade `7_8` och `8_7` var
 * för sig och slog ihop dem vid varje läsning; här slås de ihop en gång, och
 * det är den sammanslagningen som är hela poängen med migreringen.
 *
 * Tiderna från de två ordningarna läggs efter varandra utan att kunna sorteras
 * — version 1 sparade ingen tidpunkt per svar — och de fem senaste behålls.
 * För ett tal som bara övats åt ett håll, vilket är det vanliga, är det exakt
 * vad som stod där förut.
 */
export function migrateFromVersion1(stored: Version1): ProgressDocument {
  const document = emptyDocument();

  if (isRecord(stored.stats)) {
    for (const [key, value] of Object.entries(stored.stats)) {
      const pair = parseLegacyKey(key);
      if (pair === null || !isRecord(value)) {
        continue;
      }
      const legacy = value as LegacyFactStat;
      const target = (document.facts[progressKeyFor(pair[0], pair[1])] ??= emptyRecord());
      mergeInto(target.typed, legacyTyped(legacy));
      mergeInto(target.swipe, legacySwipe(legacy));
    }
  }

  document.typedCalibration = parseNumber(stored.calibration);
  document.swipeLevel = parseNumber(stored.level);
  document.swipeBestStreak = parseNumber(stored.streak) ?? 0;
  document.swipeBaseline = numberList(stored.baseline);

  // Ett tal som aldrig gav en mätning har inget att säga om spelaren, och ska
  // inte hålla dokumentet vid liv.
  for (const [key, record] of Object.entries(document.facts)) {
    if (record.typed.total === 0 && record.swipe.total === 0) {
      delete document.facts[key];
    }
  }
  return document;
}

/** `"7_8"` → `[7, 8]`, och `null` för allt annat. */
function parseLegacyKey(key: string): [number, number] | null {
  const match = /^(\d+)_(\d+)$/.exec(key);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2])];
}

function legacyTyped(legacy: LegacyFactStat): ChannelStat {
  const count = parseNumber(legacy.count) ?? parseNumber(legacy.total) ?? 0;
  const correct = parseNumber(legacy.correct) ?? 0;

  const times = numberList(legacy.times);
  if (times.length === 0) {
    // Den äldsta formen höll bara summan. Snittet är det enda som går att
    // rädda ur den, och det är bättre än att kasta bort mätningen.
    const totalTime = parseNumber(legacy.totalTime);
    if (totalTime !== null && count > 0) {
      return { times: [Math.round(totalTime / count)], correct, total: count };
    }
  }
  return { times, correct, total: count };
}

function legacySwipe(legacy: LegacyFactStat): ChannelStat {
  if (!isRecord(legacy.swipe)) {
    return emptyChannel();
  }
  return {
    times: numberList(legacy.swipe.times),
    correct: parseNumber(legacy.swipe.correct) ?? 0,
    total: parseNumber(legacy.swipe.total) ?? 0,
  };
}

function mergeInto(target: ChannelStat, addition: ChannelStat): void {
  target.times = [...target.times, ...addition.times].slice(-MAX_TIMES);
  target.correct += addition.correct;
  target.total += addition.total;
}

/**
 * Ett dokument som legat i en webbläsare är inte att lita på: en användare kan
 * ha redigerat det, och en äldre eller nyare version av spelet kan ha skrivit
 * det. Allt som inte går att känna igen ersätts med sitt tomma värde i stället
 * för att krascha spelet.
 */
function normalize(stored: unknown): ProgressDocument {
  if (!isRecord(stored)) {
    return emptyDocument();
  }
  if (isLegacyLayout(stored)) {
    // Ett version 1-dokument som råkat skrivas under den nya nyckeln.
    return migrateFromVersion1({
      stats: stored,
      calibration: null,
      baseline: null,
      level: null,
      streak: null,
    });
  }

  const document = emptyDocument();
  if (isRecord(stored['facts'])) {
    for (const [key, value] of Object.entries(stored['facts'])) {
      if (!isRecord(value)) {
        continue;
      }
      document.facts[key] = {
        typed: normalizeChannel(value['typed']),
        swipe: normalizeChannel(value['swipe']),
      };
    }
  }
  document.typedCalibration = parseNumber(stored['typedCalibration']);
  document.swipeLevel = parseNumber(stored['swipeLevel']);
  document.swipeBestStreak = parseNumber(stored['swipeBestStreak']) ?? 0;
  document.swipeBaseline = numberList(stored['swipeBaseline']);
  return document;
}

/** Version 1 hade inget versionsnummer, så den känns igen på sina nycklar. */
function isLegacyLayout(stored: Record<string, unknown>): boolean {
  return (
    stored['schemaVersion'] === undefined &&
    stored['facts'] === undefined &&
    Object.keys(stored).some((key) => /^\d+_\d+$/.test(key))
  );
}

function normalizeChannel(value: unknown): ChannelStat {
  if (!isRecord(value)) {
    return emptyChannel();
  }
  return {
    times: numberList(value['times']).slice(-MAX_TIMES),
    correct: parseNumber(value['correct']) ?? 0,
    total: parseNumber(value['total']) ?? 0,
  };
}

function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Alla tal spelet känner till, som lagringsnycklar. Exporterad för testet som
 *  låser fast att katalogen och dokumentet talar samma språk. */
export const ALL_PROGRESS_KEYS: readonly string[] = FACTS.map((fact) =>
  progressKeyFor(fact.a, fact.b),
);
