import { Component, ElementRef, OnDestroy, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { HeatmapComponent } from '../heatmap/heatmap.component';
import { ObservationLog } from '../services/observation-log';
import { ProgressExporter } from '../services/progress-export';
import { timeColor } from '../services/time-color';
import { shuffle } from '../shared/random';
import { AutoDifficultyState, initialAutoDifficulty } from '../training/auto-difficulty';
import { Thresholds, TrainingEngine } from '../training/training-engine';
import {
  CALIBRATION_QUESTIONS,
  DIFFICULTY,
  LEVELS,
  LEVEL_BUTTONS,
  Level,
  PENALTY_TIME,
  Pair,
} from './levels';

/** Skärmarna inom Mästaren. Att slå ihop den med Sveps vore frestande men
 *  skulle ge en typ som tillåter 'calibration' där. */
type MasterScreen = 'menu' | 'calibration' | 'game' | 'result' | 'heatmap';

interface Answer {
  a: number;
  b: number;
  correct: boolean;
  /** Svarstiden med straffet inräknat — det är den som mäts och sparas. */
  timeMs: number;
  penalty: number;
  userAnswer: number;
  correctAnswer: number;
}

interface BreakdownRow {
  text: string;
  time: string;
  penalty: string;
  color: string;
}

/** Hur länge facit står kvar innan nästa fråga kommer. */
const NEXT_QUESTION_DELAY_MS = { correct: 800, wrong: 1700 };

/** Snabba svar i rad innan hejaropet visas. */
const STREAK_VISIBLE_FROM = 3;

@Component({
  selector: 'app-master-view',
  imports: [HeatmapComponent],
  templateUrl: './master-view.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './master-view.component.scss',
})
export class MasterViewComponent implements OnDestroy {
  @ViewChild('answerInput') private answerInput?: ElementRef<HTMLInputElement>;
  @ViewChild('calibrationInput') private calibrationInput?: ElementRef<HTMLInputElement>;

  readonly levelButtons = LEVEL_BUTTONS;
  readonly questionCounts = [10, 20, 30];
  readonly calibrationQuestions = CALIBRATION_QUESTIONS;
  readonly penaltyTime = PENALTY_TIME;

  screen: MasterScreen = 'menu';
  selectedLevel: Level = 'auto';
  selectedQuestionCount = 10;

  // Rundan
  questionText = '';
  timerDisplay = '0.0';
  feedbackText = '';
  feedbackKind: '' | 'correct' | 'wrong' = '';
  answerState: '' | 'correct' | 'wrong' = '';
  isAnswering = false;
  showAbortModal = false;
  results: Answer[] = [];
  currentQuestion = 0;

  // Kalibrering
  calibrationQuestionText = '';
  calibrationIndex = 0;
  calibrationWrong = false;

  // Resultat
  resultTitle = '';
  resultCorrect = '';
  resultAvgTime = '';
  resultBestTime = '';
  breakdown: BreakdownRow[] = [];

  // Värmekarta — rutnätet ligger i <app-heatmap>; kvar här är bara exporten.
  /** Kvittens efter en export. Tom när inget exporterats den här gången. */
  exportNotice = '';

  private readonly engine = inject(TrainingEngine);
  private readonly observations = inject(ObservationLog);
  private readonly exporter = inject(ProgressExporter);
  private questions: Pair[] = [];
  private questionStartTime = 0;
  private timerHandle?: ReturnType<typeof setInterval>;
  private advanceHandle?: ReturnType<typeof setTimeout>;
  private calibrationHandle?: ReturnType<typeof setTimeout>;
  private calibrationTimes: number[] = [];
  /** Auto-lägets läge i skalan, och räknarna som flyttar det. Ett värde i
   *  stället för tre fält — se `training/auto-difficulty.ts`. Mallen läser
   *  räckan härifrån; `streakVisible` äger tröskeln för när den syns. */
  protected auto: AutoDifficultyState = initialAutoDifficulty('easy');
  private gameAborted = false;

  /** Mästaren mäter bara skrivna svar, så det är den kanalens tider som gäller. */
  private get thresholds(): Thresholds {
    return this.engine.thresholdsFor('typed');
  }

  ngOnDestroy(): void {
    clearInterval(this.timerHandle);
    clearTimeout(this.advanceHandle);
    clearTimeout(this.calibrationHandle);
  }

  // --- Meny -----------------------------------------------------------------

  get progressDots(): number[] {
    return Array.from({ length: this.selectedQuestionCount }, (_, i) => i);
  }

  /** Prickraderna bär sin information i färg. Etiketterna säger samma sak. */
  get progressLabel(): string {
    const correct = this.results.filter((r) => r.correct).length;
    const at = Math.min(this.currentQuestion + 1, this.selectedQuestionCount);
    return `Fråga ${at} av ${this.selectedQuestionCount}, ${correct} rätt hittills`;
  }

  get calibrationProgressLabel(): string {
    const total = this.calibrationQuestions.length;
    return `Fråga ${Math.min(this.calibrationIndex + 1, total)} av ${total}`;
  }

  get streakVisible(): boolean {
    return this.auto.consecutiveFast >= STREAK_VISIBLE_FROM;
  }

  get calibratedTimeDisplay(): string {
    return this.thresholds.fast.toFixed(1) + 's';
  }

  get baselineDisplay(): string {
    const { baseline } = this.thresholds;
    return baseline === null ? '—' : `${baseline.toFixed(1)}s`;
  }

  selectLevel(level: Level): void {
    this.selectedLevel = level;
  }

  selectQuestionCount(count: number): void {
    this.selectedQuestionCount = count;
  }

  /** Utan en mätt snabbhetstid har spelet inget att jämföra svaren mot. */
  start(): void {
    if (this.thresholds.baseline === null) {
      this.startCalibration();
    } else {
      this.startGame();
    }
  }

  showMenu(): void {
    this.screen = 'menu';
  }

  // --- Kalibrering ----------------------------------------------------------

  startCalibration(): void {
    this.calibrationIndex = 0;
    this.calibrationTimes = [];
    this.calibrationWrong = false;
    this.screen = 'calibration';
    this.nextCalibrationQuestion();
  }

  skipCalibration(): void {
    this.engine.useDefaultCalibration();
    this.startGame();
  }

  /** Tillståndsklasserna kommer från stilmallens .ui-dot. */
  calibrationDotState(index: number): 'is-done' | 'is-current' | '' {
    if (index < this.calibrationIndex) {
      return 'is-done';
    }
    return index === this.calibrationIndex ? 'is-current' : '';
  }

  /** Svaret prövas medan det skrivs, så snart det är lika långt som facit. */
  checkCalibrationAnswer(): void {
    const input = this.calibrationInput?.nativeElement;
    if (!input || this.calibrationIndex >= CALIBRATION_QUESTIONS.length) {
      return;
    }
    const [a, b] = CALIBRATION_QUESTIONS[this.calibrationIndex];
    const correctAnswer = a * b;
    const userAnswer = Number.parseInt(input.value, 10);

    if (Number.isNaN(userAnswer) || input.value.length < String(correctAnswer).length) {
      return;
    }

    if (userAnswer === correctAnswer) {
      this.calibrationTimes.push(Date.now() - this.questionStartTime);
      this.calibrationIndex += 1;
      this.calibrationHandle = setTimeout(() => this.nextCalibrationQuestion(), 300);
    } else {
      this.calibrationWrong = true;
      this.calibrationHandle = setTimeout(() => {
        this.calibrationWrong = false;
        this.clearAndFocus('calibration');
      }, 500);
    }
  }

  private nextCalibrationQuestion(): void {
    if (this.calibrationIndex >= CALIBRATION_QUESTIONS.length) {
      this.engine.calibrate(this.calibrationTimes);
      this.startGame();
      return;
    }
    const [a, b] = CALIBRATION_QUESTIONS[this.calibrationIndex];
    this.calibrationQuestionText = `${a} × ${b}`;
    this.questionStartTime = Date.now();
    this.clearAndFocus('calibration');
  }

  // --- Rundan ---------------------------------------------------------------

  startGame(): void {
    this.questions = this.buildQuestions();
    this.currentQuestion = 0;
    this.results = [];
    this.gameAborted = false;
    this.showAbortModal = false;
    this.screen = 'game';
    this.nextQuestion();
  }

  dotState(index: number): 'is-correct' | 'is-wrong' | 'is-current' | '' {
    if (index < this.results.length) {
      return this.results[index].correct ? 'is-correct' : 'is-wrong';
    }
    return index === this.currentQuestion ? 'is-current' : '';
  }

  onAnswerInput(): void {
    const input = this.answerInput?.nativeElement;
    if (!input || !this.isAnswering) {
      return;
    }
    const [a, b] = this.questions[this.currentQuestion];
    if (input.value.length >= String(a * b).length) {
      this.checkAnswer();
    }
  }

  checkAnswer(): void {
    const input = this.answerInput?.nativeElement;
    if (!input || !this.isAnswering) {
      return;
    }
    const [a, b] = this.questions[this.currentQuestion];
    const correctAnswer = a * b;
    const userAnswer = Number.parseInt(input.value, 10);
    if (Number.isNaN(userAnswer)) {
      return;
    }

    const isCorrect = userAnswer === correctAnswer;
    // Ett fel svar kostar tid i stället för att bara räknas som fel — det är
    // tiden värmekartan färgas efter.
    const timeMs = Date.now() - this.questionStartTime + (isCorrect ? 0 : PENALTY_TIME * 1000);
    const timeSec = timeMs / 1000;

    this.isAnswering = false;
    clearInterval(this.timerHandle);
    this.engine.record(a, b, isCorrect, timeMs);

    this.results.push({
      a,
      b,
      correct: isCorrect,
      timeMs,
      penalty: isCorrect ? 0 : PENALTY_TIME,
      userAnswer,
      correctAnswer,
    });

    if (isCorrect) {
      this.answerState = 'correct';
      this.feedbackKind = 'correct';
      const { fast } = this.thresholds;
      if (timeSec < fast) {
        this.feedbackText = '⚡ Blixtsnabbt!';
      } else if (timeSec < fast * 1.5) {
        this.feedbackText = '✓ Snyggt!';
      } else {
        this.feedbackText = '✓ Rätt!';
      }
    } else {
      this.answerState = 'wrong';
      this.feedbackKind = 'wrong';
      this.feedbackText = `✗ ${a} × ${b} = ${correctAnswer} (+${PENALTY_TIME}s)`;
    }

    this.adjustDifficulty();
    this.currentQuestion += 1;
    this.advanceHandle = setTimeout(
      () => this.nextQuestion(),
      isCorrect ? NEXT_QUESTION_DELAY_MS.correct : NEXT_QUESTION_DELAY_MS.wrong,
    );
  }

  // --- Avbryt ---------------------------------------------------------------

  openAbortModal(): void {
    this.showAbortModal = true;
    clearInterval(this.timerHandle);
  }

  cancelAbort(): void {
    this.showAbortModal = false;
    if (this.isAnswering) {
      this.startTimer();
      this.focus('answer');
    }
  }

  confirmAbort(): void {
    this.showAbortModal = false;
    this.gameAborted = true;
    this.endGame();
  }

  // --- Värmekarta -----------------------------------------------------------

  openHeatmap(): void {
    this.screen = 'heatmap';
  }

  /**
   * Lägger allt spelet samlat i urklippet, eller som en fil när urklippet
   * nekas. Knappen står här och ingen annanstans: det här är skärmen för den
   * som vill titta på siffror, och exporten läses av `observation-analysis.ts`
   * och inte av spelet.
   */
  exportProgress(): void {
    this.exportNotice = '';
    void this.exporter.share().then(
      (how) => {
        this.exportNotice =
          how === 'clipboard' ? 'Kopierat till urklipp ✓' : 'Nedladdat som fil ✓';
      },
      () => (this.exportNotice = 'Det gick inte att exportera.'),
    );
  }

  get canExport(): boolean {
    return this.exporter.hasSomethingToExport;
  }

  resetStats(): void {
    if (!confirm('Vill du verkligen nollställa all statistik och kalibrering?')) {
      return;
    }
    this.observations.clear();
    // Tillbaka till menyn: kartan är tom nu, och menyn är där man ser det.
    void this.engine.reset().then(() => (this.screen = 'menu'));
  }

  // --- Internt --------------------------------------------------------------

  private nextQuestion(): void {
    if (this.currentQuestion >= this.selectedQuestionCount || this.gameAborted) {
      this.endGame();
      return;
    }
    if (this.selectedLevel === 'auto' && this.currentQuestion > 0) {
      this.questions.push(this.nextAdaptiveQuestion());
    }

    const [a, b] = this.questions[this.currentQuestion];
    this.questionText = `${a} × ${b}`;
    this.feedbackText = '';
    this.feedbackKind = '';
    this.answerState = '';
    this.isAnswering = true;
    this.timerDisplay = '0.0';
    this.questionStartTime = Date.now();
    this.startTimer();
    this.clearAndFocus('answer');
  }

  private startTimer(): void {
    clearInterval(this.timerHandle);
    this.timerHandle = setInterval(() => {
      if (this.isAnswering) {
        this.timerDisplay = ((Date.now() - this.questionStartTime) / 1000).toFixed(1);
      }
    }, 100);
  }

  private endGame(): void {
    clearInterval(this.timerHandle);
    clearTimeout(this.advanceHandle);
    this.isAnswering = false;

    const correctTimes = this.results.filter((r) => r.correct).map((r) => r.timeMs);
    const average = correctTimes.length
      ? correctTimes.reduce((sum, t) => sum + t, 0) / correctTimes.length / 1000
      : 0;
    const best = correctTimes.length ? Math.min(...correctTimes) / 1000 : 0;

    this.resultTitle = this.gameAborted ? 'Avbrutet' : 'Rundan klar!';
    this.resultCorrect = `${correctTimes.length}/${this.results.length}`;
    this.resultAvgTime = average.toFixed(1) + 's';
    this.resultBestTime = best.toFixed(1) + 's';
    this.breakdown = this.results.map((r) => ({
      text: `${r.correct ? '✓' : '✗'} ${r.a} × ${r.b} = ${
        r.correct ? r.correctAnswer : `${r.userAnswer} (${r.correctAnswer})`
      }`,
      time: (r.timeMs / 1000).toFixed(1) + 's',
      penalty: r.penalty ? ` (+${r.penalty}s)` : '',
      color: this.timeColor(r.timeMs / 1000),
    }));
    this.screen = 'result';
  }

  private buildQuestions(): Pair[] {
    if (this.selectedLevel === 'auto') {
      this.auto = initialAutoDifficulty(this.engine.startDifficulty());
      // I auto-läget väljs varje fråga utifrån hur den förra gick, så bara
      // den första kan bestämmas på förhand. Den dras jämnt ur gruppen och
      // inte efter träningsvärde — ronden ska inte öppna med det svåraste
      // spelaren har.
      return [shuffle(DIFFICULTY[this.auto.difficulty])[0]];
    }

    this.auto = initialAutoDifficulty('medium');
    const tables = LEVELS[this.selectedLevel];
    const pool: Pair[] = [];
    for (const table of tables) {
      for (let i = 1; i <= 10; i++) {
        pool.push([table, i]);
        if (table !== i) {
          pool.push([i, table]);
        }
      }
    }

    // En enskild tabell ger 19 tal, alltså färre än 20 och 30 frågor. Rundan
    // fylls då på med en ny blandning i stället för att ta slut i förtid.
    const round: Pair[] = [];
    while (round.length < this.selectedQuestionCount) {
      round.push(...shuffle(pool));
    }
    return round.slice(0, this.selectedQuestionCount);
  }

  private nextAdaptiveQuestion(): Pair {
    const previous = this.questions[this.questions.length - 1];
    return this.engine.nextAutoQuestion(this.auto.difficulty, previous);
  }

  /** Svårigheten stiger först vid ihållande snabbhet, men sjunker snabbt. */
  private adjustDifficulty(): void {
    const last = this.results[this.results.length - 1];
    if (!last) {
      return;
    }
    this.auto = this.engine.nextDifficulty(this.auto, {
      correct: last.correct,
      timeSec: last.timeMs / 1000,
    });
  }

  /** Grönt upp till den kalibrerade tiden, sedan gult mot rött. Färgar
   *  resultatskärmens uppdelning; värmekartan färgar sig själv. */
  private timeColor(seconds: number): string {
    const { fast, slow } = this.thresholds;
    return timeColor(seconds, fast, slow);
  }

  /** Fälten ligger bakom @if och finns först när vyn ritats om, så de slås
   *  upp inifrån timeouten i stället för att skickas in. */
  private clearAndFocus(which: 'answer' | 'calibration'): void {
    setTimeout(() => {
      const input = this.inputFor(which);
      if (input) {
        input.value = '';
        input.focus();
      }
    });
  }

  private focus(which: 'answer' | 'calibration'): void {
    setTimeout(() => this.inputFor(which)?.focus());
  }

  private inputFor(which: 'answer' | 'calibration'): HTMLInputElement | undefined {
    const ref = which === 'answer' ? this.answerInput : this.calibrationInput;
    return ref?.nativeElement;
  }
}
