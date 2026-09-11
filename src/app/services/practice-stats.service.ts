import { Injectable } from '@angular/core';
import { FactPerformance } from '../facts/fact-selector';
import { DEFAULT_FAST_TIME, SLOW_TIME_MULTIPLIER } from '../master-view/levels';

/** Statistiken för ett enskilt tal. `times` håller de fem senaste svaren i ms,
 *  med straffet inräknat, så att en gammal miss inte färgar värmekartan för evigt. */
export interface QuestionStat {
  times: number[];
  correct: number;
  total: number;
  /** Svep mäts för sig, se `record()`. */
  swipe?: ChannelStat;
}

export interface ChannelStat {
  times: number[];
  correct: number;
  total: number;
}

/** Skrivet svar eller svep. Tiderna är inte jämförbara mellan de två. */
export type Channel = 'typed' | 'swipe';

/** Äldre versioner sparade summan av alla tider i stället för de senaste. */
interface LegacyQuestionStat {
  totalTime?: number;
  count?: number;
  correct?: number;
  times?: number[];
  swipe?: ChannelStat;
}

const STATS_KEY = 'mult-heatmap';
const CALIBRATION_KEY = 'mult-calibration';
const SWIPE_LEVEL_KEY = 'swipe-level';
const SWIPE_BASELINE_KEY = 'swipe-baseline';

/** Hur många tider per tal som sparas. */
const MAX_TIMES = 5;

/** Hur länge skrivningar får samlas på hög. Varje skrivning serialiserar hela
 *  statistiken, och en rond utan slut kan ge hundratals kort. */
const STATS_WRITE_DELAY = 1000;

/** Kalibrerad tid utanför det här spannet säger mer om ett tappat svar än om
 *  spelarens snabbhet. */
const MIN_CALIBRATED_TIME = 0.8;
const MAX_CALIBRATED_TIME = 4.0;

/** Så många svepmätningar sveptakten vilar på. Median över dem, så att ett
 *  tappat kort inte drar iväg den. */
const BASELINE_WINDOW = 8;

/** Färre mätningar än så säger mer om slumpen än om spelaren. */
const MIN_BASELINE_SAMPLES = 3;

/** Sveptakt utanför det här spannet säger mer om ett tappat kort än om
 *  spelarens fart. Golvet ligger lägre än för skrivna svar — ett svep är ett
 *  finger, inte en siffra. */
const MIN_SWIPE_BASELINE = 0.5;
const MAX_SWIPE_BASELINE = 3.0;

/** Sveptakten för en spelare vi ännu inte mätt.
 *
 *  ANTAGANDE: satt på känsla, strax under Mästarens 2 s eftersom igenkänning
 *  går fortare än att skriva ett svar. Den gäller bara de första korten innan
 *  mätningen finns, och bör kollas mot riktiga ronder. */
export const DEFAULT_SWIPE_BASELINE = 1.5;

/**
 * Sparar hur snabbt spelaren svarar på varje tal, samt den kalibrerade
 * snabbhetstiden allt annat mäts mot. Allt ligger i localStorage — spelet har
 * ingen backend, och statistiken hör till webbläsaren den övats i.
 */
@Injectable({ providedIn: 'root' })
export class PracticeStatsService {
  private stats: Record<string, QuestionStat> = {};
  private fastTime: number | null = null;
  private baselineSamples: number[] = [];
  private statsWriteTimer?: ReturnType<typeof setTimeout>;
  private statsDirty = false;

  constructor() {
    this.stats = this.migrate(this.read<Record<string, LegacyQuestionStat>>(STATS_KEY) ?? {});
    const stored = this.readRaw(CALIBRATION_KEY);
    const parsed = stored === null ? NaN : Number.parseFloat(stored);
    this.fastTime = Number.isFinite(parsed) ? parsed : null;
    const samples = this.read<unknown>(SWIPE_BASELINE_KEY);
    this.baselineSamples = Array.isArray(samples)
      ? samples.filter((value): value is number => typeof value === 'number' && value > 0)
      : [];

    // Ett besvarat kort får inte gå förlorat för att fliken läggs undan innan
    // nästa skrivning hunnit.
    if (typeof addEventListener === 'function') {
      addEventListener('pagehide', () => this.flush());
      addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flush();
        }
      });
    }
  }

  /** Skriver ned det som väntar. Anropas när en rond tar slut och när sidan
   *  läggs undan; däremellan sköter fördröjningen det. */
  flush(): void {
    clearTimeout(this.statsWriteTimer);
    this.statsWriteTimer = undefined;
    if (this.statsDirty) {
      this.statsDirty = false;
      this.write(STATS_KEY, JSON.stringify(this.stats));
    }
  }

  /** `null` innan spelaren kalibrerat sig. */
  get calibratedFastTime(): number | null {
    return this.fastTime;
  }

  /** Tiden ett svar ska hålla sig under för att räknas som automatiserat. */
  get fastSeconds(): number {
    return this.fastTime ?? DEFAULT_FAST_TIME;
  }

  get slowSeconds(): number {
    return this.fastSeconds * SLOW_TIME_MULTIPLIER;
  }

  /** Median av mätningarna plus 20 % marginal, klippt till ett rimligt spann. */
  calibrate(timesMs: number[]): void {
    const sorted = [...timesMs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] / 1000;
    const withMargin = Math.round(median * 1.2 * 10) / 10;
    this.fastTime = Math.max(MIN_CALIBRATED_TIME, Math.min(withMargin, MAX_CALIBRATED_TIME));
    this.write(CALIBRATION_KEY, String(this.fastTime));
  }

  /** Används när spelaren hoppar över kalibreringen. */
  useDefaultCalibration(): void {
    this.fastTime = DEFAULT_FAST_TIME;
    this.write(CALIBRATION_KEY, String(this.fastTime));
  }

  statFor(a: number, b: number): QuestionStat | undefined {
    return this.stats[`${a}_${b}`];
  }

  /**
   * Om spelaren hunnit skriva några svar. Styr framstegsmätaren, som räknar
   * skrivna svar — den som bara svept har inget att visa där ännu, och ska
   * mötas av välkomsttexten och inte av "0 av 100 tal sitter".
   */
  get hasPractice(): boolean {
    return Object.values(this.stats).some((stat) => stat.times.length > 0);
  }

  /** Om det finns något sparat om spelaren alls — det som `reset()` rensar. */
  get hasStoredProgress(): boolean {
    return (
      Object.keys(this.stats).length > 0 ||
      this.fastTime !== null ||
      this.baselineSamples.length > 0 ||
      this.swipeLevel !== null
    );
  }

  /** Hur många av de hundra talen i tabellen som i snitt svaras på inom den
   *  snabba tiden — måttet både värmekartan och startsidan visar. */
  masteredCount(): number {
    let mastered = 0;
    for (let a = 1; a <= 10; a++) {
      for (let b = 1; b <= 10; b++) {
        const average = this.averageSeconds(this.statFor(a, b));
        if (average !== null && average <= this.fastSeconds) {
          mastered += 1;
        }
      }
    }
    return mastered;
  }

  /** Snittid i sekunder, eller `null` för ett tal som aldrig övats. */
  averageSeconds(stat: QuestionStat | undefined): number | null {
    if (!stat || stat.times.length === 0) {
      return null;
    }
    return stat.times.reduce((sum, t) => sum + t, 0) / stat.times.length / 1000;
  }

  /**
   * Ett svep är igenkänning och går systematiskt snabbare än ett skrivet svar.
   * Svepen får därför en egen kanal: `times` fortsätter att bara innehålla
   * skrivna svar, så värmekartan och `masteredCount()` mäter samma sak som
   * förut och `fastSeconds` — som kalibrerats på skrivna svar — jämförs bara
   * med skrivna svar.
   */
  record(
    a: number,
    b: number,
    correct: boolean,
    effectiveTimeMs: number,
    channel: Channel = 'typed',
  ): void {
    const key = `${a}_${b}`;
    const stat = (this.stats[key] ??= { times: [], correct: 0, total: 0 });
    const target: ChannelStat =
      channel === 'swipe' ? (stat.swipe ??= { times: [], correct: 0, total: 0 }) : stat;

    target.times.push(effectiveTimeMs);
    if (target.times.length > MAX_TIMES) {
      target.times.shift();
    }
    target.total += 1;
    if (correct) {
      target.correct += 1;
    }
    this.scheduleStatsWrite();
  }

  /**
   * Spelarens läge på ett tal, oberoende av faktorernas ordning — 7 × 8 och
   * 8 × 7 är samma kunskap även om de lagras var för sig. Skrivna svar går
   * före svep när båda finns, eftersom de mäter framplockning och inte bara
   * igenkänning.
   */
  performanceFor(a: number, b: number): FactPerformance | undefined {
    const merged = this.mergedStat(a, b);
    if (!merged) {
      return undefined;
    }

    const typed = { times: merged.times, correct: merged.correct, total: merged.total };
    const source = typed.times.length > 0 ? typed : merged.swipe;
    if (!source || source.times.length === 0) {
      return undefined;
    }

    return {
      averageSeconds: source.times.reduce((sum, t) => sum + t, 0) / source.times.length / 1000,
      accuracy: source.total > 0 ? source.correct / source.total : null,
    };
  }

  /**
   * Spelarens sveptakt i sekunder: mediantiden för ett ankartal hen redan kan.
   *
   * Det är Svepets motsvarighet till Mästarens kalibrering — tröskeln ska
   * beskriva *spelaren* och inte uppgiften, så den mäts bara på de tal vars
   * svar bär en regel (×1, ×10). Mäts den på vilket kort som helst stiger den
   * med nivån, och då jagar tröskeln sin egen svans.
   */
  get swipeBaselineSeconds(): number {
    if (!this.hasSwipeBaseline) {
      return DEFAULT_SWIPE_BASELINE;
    }
    const sorted = [...this.baselineSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return Math.max(MIN_SWIPE_BASELINE, Math.min(median, MAX_SWIPE_BASELINE));
  }

  /** Om sveptakten vilar på tillräckligt många mätningar för att tro på. */
  get hasSwipeBaseline(): boolean {
    return this.baselineSamples.length >= MIN_BASELINE_SAMPLES;
  }

  /** Lägger till en mätning. Fönstret rullar, så takten följer med när
   *  spelaren blir snabbare i stället för att frysa vid första ronden. */
  recordSwipeBaseline(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }
    this.baselineSamples.push(seconds);
    if (this.baselineSamples.length > BASELINE_WINDOW) {
      this.baselineSamples.shift();
    }
    this.write(SWIPE_BASELINE_KEY, JSON.stringify(this.baselineSamples));
  }

  /** Nivån Svep senast landade på, så brasan börjar där den slutade. */
  get swipeLevel(): number | null {
    const raw = this.readRaw(SWIPE_LEVEL_KEY);
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  set swipeLevel(level: number) {
    this.write(SWIPE_LEVEL_KEY, String(level));
  }

  private scheduleStatsWrite(): void {
    this.statsDirty = true;
    this.statsWriteTimer ??= setTimeout(() => this.flush(), STATS_WRITE_DELAY);
  }

  private mergedStat(a: number, b: number): QuestionStat | undefined {
    const one = this.statFor(a, b);
    const other = a === b ? undefined : this.statFor(b, a);
    if (!one) {
      return other;
    }
    if (!other) {
      return one;
    }
    return {
      times: [...one.times, ...other.times],
      correct: one.correct + other.correct,
      total: one.total + other.total,
      swipe: this.mergeChannel(one.swipe, other.swipe),
    };
  }

  private mergeChannel(
    one: ChannelStat | undefined,
    other: ChannelStat | undefined,
  ): ChannelStat | undefined {
    if (!one || !other) {
      return one ?? other;
    }
    return {
      times: [...one.times, ...other.times],
      correct: one.correct + other.correct,
      total: one.total + other.total,
    };
  }

  reset(): void {
    clearTimeout(this.statsWriteTimer);
    this.statsWriteTimer = undefined;
    this.statsDirty = false;
    this.stats = {};
    this.fastTime = null;
    this.baselineSamples = [];
    this.remove(STATS_KEY);
    this.remove(CALIBRATION_KEY);
    this.remove(SWIPE_LEVEL_KEY);
    this.remove(SWIPE_BASELINE_KEY);
  }

  private migrate(stored: Record<string, LegacyQuestionStat>): Record<string, QuestionStat> {
    const stats: Record<string, QuestionStat> = {};
    let changed = false;

    for (const [key, data] of Object.entries(stored)) {
      if (data.times === undefined && data.totalTime !== undefined) {
        const count = data.count ?? 0;
        stats[key] = {
          times: [count > 0 ? Math.round(data.totalTime / count) : 2000],
          correct: data.correct ?? 0,
          total: count,
          swipe: data.swipe,
        };
        changed = true;
      } else {
        stats[key] = {
          times: data.times ?? [],
          correct: data.correct ?? 0,
          total: data.count ?? (data as QuestionStat).total ?? 0,
          swipe: data.swipe,
        };
      }
    }
    if (changed) {
      this.write(STATS_KEY, JSON.stringify(stats));
    }
    return stats;
  }

  // localStorage kan kasta i privat läge och när sajtdata är avstängt. Spelet
  // ska gå att spela ändå, bara utan att statistiken följer med.
  private readRaw(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private read<T>(key: string): T | null {
    const raw = this.readRaw(key);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Statistiken får leva kvar i minnet under sessionen.
    }
  }

  private remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Se write().
    }
  }
}
