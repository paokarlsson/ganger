import { Injectable } from '@angular/core';
import { DEFAULT_FAST_TIME, SLOW_TIME_MULTIPLIER } from '../master-view/levels';

/** Statistiken för ett enskilt tal. `times` håller de fem senaste svaren i ms,
 *  med straffet inräknat, så att en gammal miss inte färgar värmekartan för evigt. */
export interface QuestionStat {
  times: number[];
  correct: number;
  total: number;
}

/** Äldre versioner sparade summan av alla tider i stället för de senaste. */
interface LegacyQuestionStat {
  totalTime?: number;
  count?: number;
  correct?: number;
  times?: number[];
}

const STATS_KEY = 'mult-heatmap';
const CALIBRATION_KEY = 'mult-calibration';

/** Hur många tider per tal som sparas. */
const MAX_TIMES = 5;

/** Kalibrerad tid utanför det här spannet säger mer om ett tappat svar än om
 *  spelarens snabbhet. */
const MIN_CALIBRATED_TIME = 0.8;
const MAX_CALIBRATED_TIME = 4.0;

/**
 * Sparar hur snabbt spelaren svarar på varje tal, samt den kalibrerade
 * snabbhetstiden allt annat mäts mot. Allt ligger i localStorage — spelet har
 * ingen backend, och statistiken hör till webbläsaren den övats i.
 */
@Injectable({ providedIn: 'root' })
export class PracticeStatsService {
  private stats: Record<string, QuestionStat> = {};
  private fastTime: number | null = null;

  constructor() {
    this.stats = this.migrate(this.read<Record<string, LegacyQuestionStat>>(STATS_KEY) ?? {});
    const stored = this.readRaw(CALIBRATION_KEY);
    const parsed = stored === null ? NaN : Number.parseFloat(stored);
    this.fastTime = Number.isFinite(parsed) ? parsed : null;
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

  /** Om spelaren hunnit svara på något alls. */
  get hasPractice(): boolean {
    return Object.keys(this.stats).length > 0;
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

  record(a: number, b: number, correct: boolean, effectiveTimeMs: number): void {
    const key = `${a}_${b}`;
    const stat = (this.stats[key] ??= { times: [], correct: 0, total: 0 });

    stat.times.push(effectiveTimeMs);
    if (stat.times.length > MAX_TIMES) {
      stat.times.shift();
    }
    stat.total += 1;
    if (correct) {
      stat.correct += 1;
    }
    this.write(STATS_KEY, JSON.stringify(this.stats));
  }

  reset(): void {
    this.stats = {};
    this.fastTime = null;
    this.remove(STATS_KEY);
    this.remove(CALIBRATION_KEY);
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
        };
        changed = true;
      } else {
        stats[key] = {
          times: data.times ?? [],
          correct: data.correct ?? 0,
          total: data.count ?? (data as QuestionStat).total ?? 0,
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
