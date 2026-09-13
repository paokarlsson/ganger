import { Injectable } from '@angular/core';
import { FACTS } from '../facts/fact-catalog';
import { FactPerformance } from '../facts/fact-selector';
import { DEFAULT_FAST_TIME, SLOW_TIME_MULTIPLIER } from '../master-view/levels';
import {
  FAST_FACTOR,
  SLOW_TIME_MULTIPLIER as SWIPE_SLOW_MULTIPLIER,
} from '../swipe-view/swipe-difficulty';
import {
  ChannelStat,
  LocalStorageProgressRepository,
  MAX_TIMES,
  ProgressDocument,
  ProgressRepository,
  emptyDocument,
  emptyRecord,
  hasContent,
  progressKeyFor,
} from './progress-store';

export type { ChannelStat } from './progress-store';

/** Skrivet svar eller svep. Tiderna är inte jämförbara mellan de två. */
export type Channel = 'typed' | 'swipe';

/** Hur länge skrivningar får samlas på hög. Varje skrivning serialiserar hela
 *  dokumentet, och en rond utan slut kan ge hundratals kort. */
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
 * Vad spelet vet om den som övar, och vad det gör av den kunskapen.
 *
 * Lagringen ligger inte här utan i `ProgressRepository`. Den här tjänsten
 * håller dokumentet i minnet, för mallarna läser det synkront vid varje
 * ändringsdetektering och får inte vänta på ett löfte.
 */
@Injectable({ providedIn: 'root' })
export class PracticeStatsService {
  /**
   * Sömmen mot lagringen. Byts den mot en implementation som talar med en
   * backend behöver ingenting annat i appen ändras.
   */
  private repository: ProgressRepository = new LocalStorageProgressRepository();

  private progress: ProgressDocument = emptyDocument();
  private writeTimer?: ReturnType<typeof setTimeout>;
  private dirty = false;

  constructor() {
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

  /**
   * Läser in framstegen. Anropas en gång vid uppstart, före första vyn ritas,
   * se `app.config.ts`. Allt efter det läser den hydrerade kopian i minnet.
   */
  async hydrate(): Promise<void> {
    this.progress = await this.repository.load();
  }

  /** Pekar om lagringen. Finns för testerna och för den dag lagret byts ut. */
  useRepository(repository: ProgressRepository): void {
    this.repository = repository;
  }

  /** Skriver ned det som väntar. Anropas när en rond tar slut och när sidan
   *  läggs undan; däremellan sköter fördröjningen det. */
  flush(): void {
    clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    if (this.dirty) {
      this.dirty = false;
      void this.repository.save(this.progress);
    }
  }

  /** Antalet tal spelet känner till — det `masteredCount()` räknar mot. */
  get factCount(): number {
    return FACTS.length;
  }

  /** `null` innan spelaren kalibrerat sig. */
  get calibratedFastTime(): number | null {
    return this.progress.typedCalibration;
  }

  /** Tiden ett skrivet svar ska hålla sig under för att räknas som automatiserat. */
  get fastSeconds(): number {
    return this.progress.typedCalibration ?? DEFAULT_FAST_TIME;
  }

  get slowSeconds(): number {
    return this.fastSeconds * SLOW_TIME_MULTIPLIER;
  }

  /** Median av mätningarna plus 20 % marginal, klippt till ett rimligt spann. */
  calibrate(timesMs: number[]): void {
    const sorted = [...timesMs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] / 1000;
    const withMargin = Math.round(median * 1.2 * 10) / 10;
    this.progress.typedCalibration = Math.max(
      MIN_CALIBRATED_TIME,
      Math.min(withMargin, MAX_CALIBRATED_TIME),
    );
    this.scheduleWrite();
    this.flush();
  }

  /** Används när spelaren hoppar över kalibreringen. */
  useDefaultCalibration(): void {
    this.progress.typedCalibration = DEFAULT_FAST_TIME;
    this.scheduleWrite();
    this.flush();
  }

  /**
   * De skrivna svaren på ett tal. 7 × 8 och 8 × 7 är ett och samma tal och
   * lagras under en nyckel, så ordningen spelar ingen roll.
   */
  statFor(a: number, b: number): ChannelStat | undefined {
    return this.channel(a, b, 'typed');
  }

  /** Svepen på ett tal, på samma villkor. */
  swipeStatFor(a: number, b: number): ChannelStat | undefined {
    return this.channel(a, b, 'swipe');
  }

  /**
   * Om spelaren hunnit skriva några svar. Styr framstegsmätaren, som räknar
   * skrivna svar — den som bara svept har inget att visa där ännu, och ska
   * mötas av välkomsttexten och inte av "0 tal sitter".
   */
  get hasPractice(): boolean {
    return Object.values(this.progress.facts).some((entry) => entry.typed.times.length > 0);
  }

  /** Om spelaren svept något alls — styr om Svepets värmekarta har något att
   *  visa. Skild från `hasPractice`, som räknar skrivna svar. */
  get hasSwipePractice(): boolean {
    return Object.values(this.progress.facts).some((entry) => entry.swipe.times.length > 0);
  }

  /** Om det finns något sparat om spelaren alls — det som `reset()` rensar. */
  get hasStoredProgress(): boolean {
    return hasContent(this.progress);
  }

  /**
   * Hur många av tabellens tal som i snitt svaras på inom den snabba tiden —
   * måttet både värmekartan och startsidan visar.
   *
   * Räknar till 55 och inte till 100: 7 × 8 och 8 × 7 är samma kunskap, och
   * sedan nycklarna kanoniserats är de också en enda rad i lagret. Att räkna
   * dem som två skulle vara att räkna samma sak två gånger.
   */
  masteredCount(): number {
    const fast = this.fastSeconds;
    let mastered = 0;
    for (const fact of FACTS) {
      const average = this.averageSeconds(this.statFor(fact.a, fact.b));
      if (average !== null && average <= fast) {
        mastered += 1;
      }
    }
    return mastered;
  }

  /** Samma mått för svepen, mot svepens egen tröskel. */
  swipeMasteredCount(): number {
    const fast = this.swipeFastSeconds;
    let mastered = 0;
    for (const fact of FACTS) {
      const average = this.averageSeconds(this.swipeStatFor(fact.a, fact.b));
      if (average !== null && average <= fast) {
        mastered += 1;
      }
    }
    return mastered;
  }

  /** Snittid i sekunder, eller `null` för ett tal som aldrig övats. */
  averageSeconds(stat: ChannelStat | undefined): number | null {
    if (!stat || stat.times.length === 0) {
      return null;
    }
    return stat.times.reduce((sum, t) => sum + t, 0) / stat.times.length / 1000;
  }

  /**
   * Ett svep är igenkänning och går systematiskt snabbare än ett skrivet svar.
   * Svepen har därför en egen kanal: `typed` innehåller bara skrivna svar, så
   * värmekartan och `masteredCount()` mäter samma sak som förut och
   * `fastSeconds` — som kalibrerats på skrivna svar — jämförs bara med
   * skrivna svar.
   */
  record(
    a: number,
    b: number,
    correct: boolean,
    effectiveTimeMs: number,
    channel: Channel = 'typed',
  ): void {
    const entry = (this.progress.facts[progressKeyFor(a, b)] ??= emptyRecord());
    const target = entry[channel];

    target.times.push(effectiveTimeMs);
    if (target.times.length > MAX_TIMES) {
      target.times.shift();
    }
    target.total += 1;
    if (correct) {
      target.correct += 1;
    }
    this.scheduleWrite();
  }

  /**
   * Vad ett svep ska hålla sig under för att räknas som automatiserat.
   *
   * Skild från `fastSeconds`, som gäller skrivna svar: ett svep är igenkänning
   * och går systematiskt snabbare, och de två tiderna är inte jämförbara.
   *
   * Tröskeln är den för ett sant kort. Halva korten i en rond är falska och
   * tar drygt en tredjedel längre, så en behärskad rutas snitt hamnar en bit
   * över sveptakten — men fortfarande under den här tröskeln.
   */
  get swipeFastSeconds(): number {
    return this.swipeBaselineSeconds * FAST_FACTOR;
  }

  get swipeSlowSeconds(): number {
    return this.swipeFastSeconds * SWIPE_SLOW_MULTIPLIER;
  }

  /**
   * Spelarens läge på ett tal. Skrivna svar går före svep när båda finns,
   * eftersom de mäter framplockning och inte bara igenkänning.
   */
  performanceFor(a: number, b: number): FactPerformance | undefined {
    const entry = this.progress.facts[progressKeyFor(a, b)];
    if (!entry) {
      return undefined;
    }
    const source = entry.typed.times.length > 0 ? entry.typed : entry.swipe;
    if (source.times.length === 0) {
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
    const sorted = [...this.progress.swipeBaseline].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return Math.max(MIN_SWIPE_BASELINE, Math.min(median, MAX_SWIPE_BASELINE));
  }

  /** Om sveptakten vilar på tillräckligt många mätningar för att tro på. */
  get hasSwipeBaseline(): boolean {
    return this.progress.swipeBaseline.length >= MIN_BASELINE_SAMPLES;
  }

  /** Lägger till en mätning. Fönstret rullar, så takten följer med när
   *  spelaren blir snabbare i stället för att frysa vid första ronden. */
  recordSwipeBaseline(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }
    this.progress.swipeBaseline.push(seconds);
    if (this.progress.swipeBaseline.length > BASELINE_WINDOW) {
      this.progress.swipeBaseline.shift();
    }
    this.scheduleWrite();
    this.flush();
  }

  /** Längsta räcka snabba rätt spelaren haft. Rekordet att jaga i en rond
   *  utan slut, som annars saknar mål. */
  get swipeBestStreak(): number {
    return this.progress.swipeBestStreak;
  }

  set swipeBestStreak(streak: number) {
    this.progress.swipeBestStreak = streak;
    this.scheduleWrite();
    this.flush();
  }

  /** Nivån Svep senast landade på, så brasan börjar där den slutade. */
  get swipeLevel(): number | null {
    return this.progress.swipeLevel;
  }

  set swipeLevel(level: number) {
    this.progress.swipeLevel = level;
    this.scheduleWrite();
    this.flush();
  }

  async reset(): Promise<void> {
    clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    this.dirty = false;
    this.progress = emptyDocument();
    await this.repository.clear();
  }

  private channel(a: number, b: number, channel: Channel): ChannelStat | undefined {
    const stat = this.progress.facts[progressKeyFor(a, b)]?.[channel];
    return stat && stat.total > 0 ? stat : undefined;
  }

  private scheduleWrite(): void {
    this.dirty = true;
    this.writeTimer ??= setTimeout(() => this.flush(), STATS_WRITE_DELAY);
  }
}
