import { Component, ElementRef, OnDestroy, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { PracticeStatsService, QuestionStat } from '../services/practice-stats.service';
import {
  CALIBRATION_QUESTIONS,
  DIFFICULTY,
  DOWNGRADE_THRESHOLD,
  Difficulty,
  LEVELS,
  LEVEL_BUTTONS,
  Level,
  PENALTY_TIME,
  Pair,
  UPGRADE_THRESHOLD,
} from './levels';

type Screen = 'menu' | 'calibration' | 'game' | 'result' | 'heatmap';

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

interface HeatmapCell {
  text: string;
  color: string;
  title: string;
}

/** Hur länge facit står kvar innan nästa fråga kommer. */
const NEXT_QUESTION_DELAY_MS = { correct: 800, wrong: 1700 };

/** Snabba svar i rad innan hejaropet visas. */
const STREAK_VISIBLE_FROM = 3;

@Component({
  selector: 'app-master-view',
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

  screen: Screen = 'menu';
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

  // Värmekarta
  heatmapRows: { label: number; cells: HeatmapCell[] }[] = [];
  masteredCount = 0;

  private readonly stats = inject(PracticeStatsService);
  private questions: Pair[] = [];
  private questionStartTime = 0;
  private timerHandle?: ReturnType<typeof setInterval>;
  private advanceHandle?: ReturnType<typeof setTimeout>;
  private calibrationHandle?: ReturnType<typeof setTimeout>;
  private calibrationTimes: number[] = [];
  private currentDifficulty: Difficulty = 'easy';
  private consecutiveFast = 0;
  private consecutiveSlow = 0;
  private gameAborted = false;

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
    return this.consecutiveFast >= STREAK_VISIBLE_FROM;
  }

  get consecutiveFastDisplay(): number {
    return this.consecutiveFast;
  }

  get calibratedTimeDisplay(): string {
    return this.stats.fastSeconds.toFixed(1) + 's';
  }

  get baselineDisplay(): string {
    const calibrated = this.stats.calibratedFastTime;
    return calibrated === null ? '—' : `${calibrated.toFixed(1)}s`;
  }

  selectLevel(level: Level): void {
    this.selectedLevel = level;
  }

  selectQuestionCount(count: number): void {
    this.selectedQuestionCount = count;
  }

  /** Utan en mätt snabbhetstid har spelet inget att jämföra svaren mot. */
  start(): void {
    if (this.stats.calibratedFastTime === null) {
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
    this.stats.useDefaultCalibration();
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
      this.stats.calibrate(this.calibrationTimes);
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
    this.consecutiveFast = 0;
    this.consecutiveSlow = 0;
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
    this.stats.record(a, b, isCorrect, timeMs);

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
      if (timeSec < this.stats.fastSeconds) {
        this.feedbackText = '⚡ Blixtsnabbt!';
      } else if (timeSec < this.stats.fastSeconds * 1.5) {
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
    this.buildHeatmap();
    this.screen = 'heatmap';
  }

  resetStats(): void {
    if (!confirm('Vill du verkligen nollställa all statistik och kalibrering?')) {
      return;
    }
    this.stats.reset();
    this.buildHeatmap();
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
      this.currentDifficulty = this.startDifficulty();
      // I auto-läget väljs varje fråga utifrån hur den förra gick, så bara
      // den första kan bestämmas på förhand.
      return [this.shuffle(this.questionsForDifficulty(this.currentDifficulty))[0]];
    }

    this.currentDifficulty = 'medium';
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
      round.push(...this.shuffle(pool));
    }
    return round.slice(0, this.selectedQuestionCount);
  }

  /** Nivån att börja på: den lägsta där spelaren inte redan är hemma. */
  private startDifficulty(): Difficulty {
    if (this.masteredShare('easy') < 0.7) {
      return 'easy';
    }
    return this.masteredShare('medium') >= 0.7 ? 'hard' : 'medium';
  }

  private masteredShare(difficulty: Difficulty): number {
    const pairs = DIFFICULTY[difficulty];
    let mastered = 0;
    for (const [a, b] of pairs) {
      const stat = this.stats.statFor(a, b);
      const average = this.stats.averageSeconds(stat);
      // Färre än tre svar är för lite för att kalla ett tal automatiserat.
      if (stat && stat.times.length >= 3 && average !== null && average <= this.stats.fastSeconds) {
        mastered += 1;
      }
    }
    return mastered / pairs.length;
  }

  /** Talen inom en svårighet, de som behöver mest träning först. */
  private questionsForDifficulty(difficulty: Difficulty): Pair[] {
    return [...DIFFICULTY[difficulty]].sort(
      (a, b) => this.trainingScore(b) - this.trainingScore(a),
    );
  }

  private trainingScore(pair: Pair): number {
    const stat = this.stats.statFor(pair[0], pair[1]);
    const average = this.stats.averageSeconds(stat);
    if (!stat || average === null) {
      return 5; // Aldrig testad.
    }
    const accuracy = stat.total > 0 ? stat.correct / stat.total : 0;
    if (accuracy < 0.7) {
      return 10;
    }
    if (average > this.stats.slowSeconds) {
      return 9;
    }
    if (average > this.stats.fastSeconds * 2) {
      return 7;
    }
    if (average > this.stats.fastSeconds) {
      return 4;
    }
    return 1; // Redan automatiserad.
  }

  private nextAdaptiveQuestion(): Pair {
    const pool = this.questionsForDifficulty(this.currentDifficulty);
    const last = this.questions[this.questions.length - 1];
    const filtered = pool.filter((q) => !(q[0] === last[0] && q[1] === last[1]));

    // Slumpa bland de tio mest träningsvärda så att ordningen inte blir
    // förutsägbar.
    const candidates = this.shuffle(filtered.slice(0, 10));
    return candidates[0] ?? filtered[0] ?? pool[0];
  }

  /** Svårigheten stiger först vid ihållande snabbhet, men sjunker snabbt. */
  private adjustDifficulty(): void {
    const last = this.results[this.results.length - 1];
    if (!last) {
      return;
    }
    const timeSec = last.timeMs / 1000;

    if (last.correct && timeSec <= this.stats.fastSeconds) {
      this.consecutiveFast += 1;
      this.consecutiveSlow = 0;
      if (this.consecutiveFast >= UPGRADE_THRESHOLD) {
        if (this.currentDifficulty === 'easy') {
          this.currentDifficulty = 'medium';
          this.consecutiveFast = 0;
        } else if (this.currentDifficulty === 'medium') {
          this.currentDifficulty = 'hard';
          this.consecutiveFast = 0;
        }
      }
    } else if (!last.correct || timeSec > this.stats.slowSeconds) {
      this.consecutiveSlow += 1;
      this.consecutiveFast = 0;
      if (this.consecutiveSlow >= DOWNGRADE_THRESHOLD) {
        if (this.currentDifficulty === 'hard') {
          this.currentDifficulty = 'medium';
          this.consecutiveSlow = 0;
        } else if (this.currentDifficulty === 'medium') {
          this.currentDifficulty = 'easy';
          this.consecutiveSlow = 0;
        }
      }
    } else {
      // Mittemellan: raden bryts inte, men den räknas ner.
      this.consecutiveFast = Math.max(0, this.consecutiveFast - 1);
    }
  }

  private buildHeatmap(): void {
    const rows: { label: number; cells: HeatmapCell[] }[] = [];

    for (let row = 1; row <= 10; row++) {
      const cells: HeatmapCell[] = [];
      for (let col = 1; col <= 10; col++) {
        const stat = this.stats.statFor(row, col);
        const average = this.stats.averageSeconds(stat);
        if (!stat || average === null) {
          cells.push({
            text: '—',
            color: 'rgba(255,255,255,0.1)',
            title: `${row} × ${col}: Ej testad`,
          });
          continue;
        }
        cells.push({
          text: average.toFixed(1),
          color: this.timeColor(average),
          title: this.heatmapTitle(row, col, stat, average),
        });
      }
      rows.push({ label: row, cells });
    }

    this.heatmapRows = rows;
    this.masteredCount = this.stats.masteredCount();
  }

  private heatmapTitle(row: number, col: number, stat: QuestionStat, average: number): string {
    const accuracy = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
    return [
      `${row} × ${col} = ${row * col}`,
      `Snitt (senaste ${stat.times.length}): ${average.toFixed(1)}s`,
      `Rätt totalt: ${accuracy}%`,
      `Försök: ${stat.total}`,
    ].join('\n');
  }

  /** Fisher-Yates på en kopia, så anroparens lista lämnas orörd. */
  private shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Grönt upp till den kalibrerade tiden, sedan gult mot rött. */
  private timeColor(seconds: number): string {
    const fast = this.stats.fastSeconds;
    const slow = this.stats.slowSeconds;
    if (seconds <= fast) {
      return 'hsl(140, 80%, 35%)';
    }
    const t = Math.max(0, Math.min(1, (seconds - fast) / (slow - fast)));
    return `hsl(${50 * (1 - t)}, 75%, 45%)`;
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
