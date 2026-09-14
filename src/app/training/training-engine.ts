import { Injectable } from '@angular/core';
import { FACTS, Fact } from '../facts/fact-catalog';
import { FactPerformance, needWeight } from '../facts/fact-selector';
import {
  DEFAULT_FAST_TIME,
  DIFFICULTY,
  Difficulty,
  Pair,
  SLOW_TIME_MULTIPLIER,
} from '../master-view/levels';
import {
  FAST_FACTOR,
  GeneratedStatement,
  SLOW_TIME_MULTIPLIER as SWIPE_SLOW_MULTIPLIER,
  baselineSample,
  isFastAnswer,
  nextLevel,
  startLevel,
} from '../swipe-view/swipe-difficulty';
import { shuffle } from '../shared/random';
import { AnswerPace, AutoDifficultyState, nextAutoDifficulty } from './auto-difficulty';
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
} from '../services/progress-store';

export type { ChannelStat } from '../services/progress-store';

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

/** Så stor andel av en grupp som ska sitta för att spelaren ska räknas som
 *  hemma där, och flyttas upp.
 *
 *  ANTAGANDE: satt på känsla. Se docs/plan.md. */
const AT_HOME_SHARE = 0.7;

/** Färre svar än så säger för lite för att kalla ett tal automatiserat.
 *
 *  ANTAGANDE: satt på känsla. Tre svar är lite för en dom som styr vilka tal
 *  spelaren möter härnäst. */
const MIN_MASTERY_SAMPLES = 3;

/** Hur många av de mest träningsvärda talen auto-läget slumpar bland.
 *
 *  ANTAGANDE: satt på känsla. Bredden avgör hur förutsägbar ordningen blir,
 *  och hur hårt ronden lutar mot det svåraste spelaren har. */
const AUTO_CANDIDATES = 10;

/** Sveptakten för en spelare vi ännu inte mätt.
 *
 *  ANTAGANDE: satt på känsla, strax under Mästarens 2 s eftersom igenkänning
 *  går fortare än att skriva ett svar. Den gäller bara de första korten innan
 *  mätningen finns, och bör kollas mot riktiga ronder. */
export const DEFAULT_SWIPE_BASELINE = 1.5;

/**
 * Pedagogiken. Vad spelet tror att spelaren kan, och vad det gör av den tron.
 *
 * Lagret ligger inte här utan bakom `ProgressRepository`, och UI:t ska inte
 * innehålla någon av besluten nedan. Principen är densamma överallt:
 *
 *     gammalt tillstånd + ny händelse = nytt tillstånd
 *
 * Motorn håller dokumentet i minnet, för mallarna läser det synkront vid varje
 * ändringsdetektering och får inte vänta på ett löfte.
 *
 * De rena delarna av pedagogiken ligger kvar i egna moduler och testas där:
 * `facts/fact-selector.ts` väljer tal, `swipe-view/swipe-difficulty.ts` rör
 * Svepets nivå, `training/auto-difficulty.ts` rör Mästarens svårighetsgrupp.
 * Motorn är det som kopplar ihop dem med vad spelaren faktiskt gjort.
 */
@Injectable({ providedIn: 'root' })
export class TrainingEngine {
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

  /** Median av mätningarna plus 20 % marginal, klippt till ett rimligt spann.
   *
   *  ANTAGANDE: marginalen är satt på känsla. Den är skillnaden mellan att
   *  mäta spelarens toppfart och att mäta en fart hen kan hålla. Se
   *  docs/plan.md. */
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
   * Mätningarna på ett tal i en kanal. 7 × 8 och 8 × 7 är ett och samma tal
   * och lagras under en nyckel, så ordningen spelar ingen roll.
   */
  statFor(a: number, b: number, channel: Channel = 'typed'): ChannelStat | undefined {
    const stat = this.progress.facts[progressKeyFor(a, b)]?.[channel];
    return stat && stat.total > 0 ? stat : undefined;
  }

  /**
   * Om spelaren gjort något alls i en kanal. Styr om det finns en värmekarta
   * att visa, och om startsidan ska säga "0 tal sitter" eller hälsa.
   */
  hasPracticeIn(channel: Channel): boolean {
    return Object.values(this.progress.facts).some((entry) => entry[channel].times.length > 0);
  }

  /** Skrivna svar. Framstegsmätaren räknar dem — den som bara svept har inget
   *  att visa där ännu. */
  get hasPractice(): boolean {
    return this.hasPracticeIn('typed');
  }

  /** Om någon kanal har något att visa. Styr om värmekartan går att öppna:
   *  den visar båda, så det räcker att en av dem är övad. */
  get hasAnyPractice(): boolean {
    return this.hasPracticeIn('typed') || this.hasPracticeIn('swipe');
  }

  /** Om det finns något sparat om spelaren alls — det som `reset()` rensar. */
  get hasStoredProgress(): boolean {
    return hasContent(this.progress);
  }

  /**
   * Hur många av tabellens tal som i snitt besvaras inom den snabba tiden i en
   * kanal — måttet värmekartan och startsidan visar.
   *
   * Räknar till 55 och inte till 100: 7 × 8 och 8 × 7 är samma kunskap, och
   * sedan nycklarna kanoniserats är de också en enda rad i lagret. Att räkna
   * dem som två skulle vara att räkna samma sak två gånger.
   *
   * Varje kanal mäts mot sin egen tröskel. Ett svep är igenkänning och går
   * systematiskt snabbare än ett skrivet svar; att jämföra dem mot samma tid
   * vore att kalla halva tabellen behärskad på fel grund.
   */
  masteredCount(channel: Channel = 'typed'): number {
    const fast = this.fastSecondsFor(channel);
    let mastered = 0;
    for (const fact of FACTS) {
      const average = this.averageSeconds(this.statFor(fact.a, fact.b, channel));
      if (average !== null && average <= fast) {
        mastered += 1;
      }
    }
    return mastered;
  }

  /** Tröskeln för «automatiserat» i en kanal. Aldrig jämförbar mellan två. */
  fastSecondsFor(channel: Channel): number {
    return channel === 'swipe' ? this.swipeFastSeconds : this.fastSeconds;
  }

  /** Var «segt» börjar i en kanal. Färgskalans andra ände. */
  slowSecondsFor(channel: Channel): number {
    return channel === 'swipe' ? this.swipeSlowSeconds : this.slowSeconds;
  }

  /**
   * Takten kanalens tröskel vilar på, som text. Skrivna svar mäts mot en
   * kalibrering, svep mot sveptakten, och de två är olika saker — därför har
   * de olika etikett i kartan.
   */
  baselineSecondsFor(channel: Channel): number | null {
    return channel === 'swipe' ? this.swipeBaselineSeconds : this.calibratedFastTime;
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

  // --- Vad som ska komma härnäst -------------------------------------------

  /**
   * Hur mycket ett tal behöver övas, som en vikt till urvalet. Låg i Svep, som
   * frågar per kort; det är den här kopplingen mellan spelarens modell och
   * `selectFact()` som gör att svaga och obeprövade tal kommer oftare.
   */
  needFor(fact: Fact): number {
    return needWeight(this.performanceFor(fact.a, fact.b), this.fastSeconds);
  }

  /** Var Svepets brasa ska börja: där kunskapen är, inte mitt på skalan. */
  swipeStartLevel(): number {
    return startLevel(this.swipeLevel, this.masteredCount(), this.hasPractice);
  }

  /** Om ett svep var rätt *och* snabbt för just den här spelaren. */
  isFastSwipe(statement: GeneratedStatement, correct: boolean, timeSec: number): boolean {
    return isFastAnswer(statement.isTrue, correct, timeSec, this.swipeBaselineSeconds);
  }

  /**
   * Nivån efter ett svep. Tröskeln läses ur spelarens egen takt här inne, så
   * att vyn inte behöver känna till att det finns en sådan.
   */
  nextSwipeLevel(level: number, statement: GeneratedStatement, correct: boolean, timeSec: number): number {
    return nextLevel(level, statement.isTrue, correct, timeSec, this.swipeBaselineSeconds);
  }

  /**
   * Vad ett kalibreringskort bidrar med till sveptakten. Bara rätt svepta kort
   * räknas — ett barn som svepar på måfå ska inte kunna sätta en omöjlig ribba
   * åt sig själv.
   */
  recordSwipeCalibration(statement: GeneratedStatement, correct: boolean, timeSec: number): void {
    if (correct) {
      this.recordSwipeBaseline(baselineSample(timeSec, statement.isTrue));
    }
  }

  // --- Mästarens auto-läge --------------------------------------------------

  /** Gruppen att börja i: den lägsta där spelaren inte redan är hemma. */
  startDifficulty(): Difficulty {
    if (this.masteredShare('easy') < AT_HOME_SHARE) {
      return 'easy';
    }
    return this.masteredShare('medium') >= AT_HOME_SHARE ? 'hard' : 'medium';
  }

  /** Svårighetsgruppen efter ett svar, mätt mot spelarens egna trösklar. */
  nextDifficulty(
    state: AutoDifficultyState,
    answer: Pick<AnswerPace, 'correct' | 'timeSec'>,
  ): AutoDifficultyState {
    return nextAutoDifficulty(state, {
      ...answer,
      fastSeconds: this.fastSeconds,
      slowSeconds: this.slowSeconds,
    });
  }

  /**
   * Nästa fråga i auto-läget: slumpad bland de mest träningsvärda i gruppen,
   * så att ordningen inte blir förutsägbar, och aldrig samma tal två gånger i
   * rad.
   */
  nextAutoQuestion(
    difficulty: Difficulty,
    previous: Pair | undefined,
    rng: () => number = Math.random,
  ): Pair {
    const pool = this.questionsForDifficulty(difficulty);
    const filtered = previous
      ? pool.filter((q) => !(q[0] === previous[0] && q[1] === previous[1]))
      : pool;
    const candidates = shuffle(filtered.slice(0, AUTO_CANDIDATES), rng);
    return candidates[0] ?? filtered[0] ?? pool[0];
  }

  /** Talen inom en svårighet, de som behöver mest träning först. */
  private questionsForDifficulty(difficulty: Difficulty): Pair[] {
    return [...DIFFICULTY[difficulty]].sort((a, b) => this.trainingScore(b) - this.trainingScore(a));
  }

  /**
   * Hur träningsvärt ett tal är. Grövre än `needFor()` med flit: Mästaren
   * sorterar en lista, Svep viktar en dragning, och en trappa är lättare att
   * läsa av i en sortering än en glidande skala.
   */
  trainingScore(pair: Pair): number {
    const stat = this.statFor(pair[0], pair[1]);
    const average = this.averageSeconds(stat);
    if (!stat || average === null) {
      return 5; // Aldrig testad.
    }
    const accuracy = stat.total > 0 ? stat.correct / stat.total : 0;
    if (accuracy < 0.7) {
      return 10;
    }
    if (average > this.slowSeconds) {
      return 9;
    }
    if (average > this.fastSeconds * 2) {
      return 7;
    }
    if (average > this.fastSeconds) {
      return 4;
    }
    return 1; // Redan automatiserad.
  }

  /** Andelen tal i en grupp som sitter. */
  private masteredShare(difficulty: Difficulty): number {
    const pairs = DIFFICULTY[difficulty];
    let mastered = 0;
    for (const [a, b] of pairs) {
      const stat = this.statFor(a, b);
      const average = this.averageSeconds(stat);
      // Färre än tre svar är för lite för att kalla ett tal automatiserat.
      if (stat && stat.times.length >= MIN_MASTERY_SAMPLES && average !== null && average <= this.fastSeconds) {
        mastered += 1;
      }
    }
    return mastered / pairs.length;
  }

  private scheduleWrite(): void {
    this.dirty = true;
    this.writeTimer ??= setTimeout(() => this.flush(), STATS_WRITE_DELAY);
  }
}
