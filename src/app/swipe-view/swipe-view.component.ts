import { Component, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { CdkDrag, CdkDragEnd, CdkDragMove } from '@angular/cdk/drag-drop';
import {
  DEFAULT_QUESTION_COUNT,
  DEFAULT_TARGET_TIME,
  GeneratedStatement,
  LEVEL_DOWN_STEP,
  LEVEL_MAX,
  LEVEL_MIN,
  LEVEL_UP_STEP,
  QUESTION_COUNTS,
  SLOW_TIME_MULTIPLIER,
  START_LEVEL,
  TARGET_TIMES,
  TargetTime,
  generateStatement,
} from './swipe-difficulty';

/** Hur länge kortet flyger ut innan nästa fråga läggs fram. */
const LEAVE_MS = 260;

/** Hastighet i px/ms som räknas som en knyck även om dragningen är kort. */
const FLING_SPEED = 0.6;

/** Hur länge brasan pulsar efter att nivån ändrats. */
const LEVEL_FLASH_MS = 500;

type Screen = 'menu' | 'game' | 'result';

interface Feedback {
  correct: boolean;
  solution: string;
}

@Component({
  selector: 'app-swipe-view',
  standalone: true,
  imports: [CdkDrag, MatCardModule],
  templateUrl: './swipe-view.component.html',
  styleUrl: './swipe-view.component.scss',
})
export class SwipeViewComponent implements OnDestroy {
  @ViewChild(CdkDrag) private drag?: CdkDrag;

  readonly targetTimes = TARGET_TIMES;
  readonly questionCounts = QUESTION_COUNTS;
  readonly levelMax = LEVEL_MAX;

  screen: Screen = 'menu';
  selectedTargetTime: TargetTime = DEFAULT_TARGET_TIME;
  selectedQuestionCount = DEFAULT_QUESTION_COUNT;

  level = START_LEVEL;
  /** Kort puls när nivån just ändrats, styr brasans animation. */
  levelFlash: '' | 'up' | 'down' = '';

  currentStatement: GeneratedStatement | undefined;
  currentStatmentString = '';
  nrCorrect = 0;
  nrWrong = 0;
  feedback: Feedback | undefined;

  /** -1 helt åt vänster, 0 i vila, +1 helt åt höger. Driver all dragrespons. */
  progress = 0;
  /** Riktningen kortet flyger ut åt, 0 när det ligger stilla. */
  leaving: -1 | 0 | 1 = 0;
  /** Stänger av övergångar i det ögonblick nästa kort läggs på plats. */
  instant = false;

  private answered = 0;
  private cardShownAt = 0;
  private samples: { x: number; t: number }[] = [];
  private advanceTimer?: ReturnType<typeof setTimeout>;
  private feedbackTimer?: ReturnType<typeof setTimeout>;
  private flashTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    clearTimeout(this.advanceTimer);
    clearTimeout(this.feedbackTimer);
    clearTimeout(this.flashTimer);
  }

  /** Sant medan kortet flyger ut — då tas inga nya svar emot. */
  get locked(): boolean {
    return this.leaving !== 0;
  }

  get rotation(): number {
    return this.progress * 12;
  }

  get totalAnswered(): number {
    return this.nrCorrect + this.nrWrong;
  }

  /** 0 vid lägsta nivån, 1 vid högsta — skalar brasan. */
  get flameIntensity(): number {
    return (this.level - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN);
  }

  /** 0 när kortet ligger stilla, 1 när det dragits hela vägen åt `dir`. */
  strength(dir: 1 | -1): number {
    return Math.max(0, dir * this.progress);
  }

  numberOfStatementsLeft(): number {
    return Math.max(0, this.selectedQuestionCount - this.answered);
  }

  // --- Meny -------------------------------------------------------------

  selectTargetTime(time: TargetTime): void {
    this.selectedTargetTime = time;
  }

  selectQuestionCount(count: number): void {
    this.selectedQuestionCount = count;
  }

  start(): void {
    this.screen = 'game';
    this.restartRound();
  }

  /** "Spela igen" på slutskärmen — samma inställningar, ny rond. */
  restart(): void {
    this.screen = 'game';
    this.restartRound();
  }

  backToMenu(): void {
    this.screen = 'menu';
  }

  private restartRound(): void {
    clearTimeout(this.advanceTimer);
    clearTimeout(this.feedbackTimer);
    clearTimeout(this.flashTimer);
    this.answered = 0;
    this.nrCorrect = 0;
    this.nrWrong = 0;
    this.level = START_LEVEL;
    this.levelFlash = '';
    this.feedback = undefined;
    this.progress = 0;
    this.leaving = 0;
    this.samples = [];
    this.nextCard();
  }

  // --- Dragning -----------------------------------------------------------

  dragMoved($event: CdkDragMove): void {
    // Rotationen ska följa hur långt kortet flyttats, inte var på skärmen
    // fingret råkar befinna sig.
    this.progress = this.clamp($event.distance.x / this.threshold(), -1, 1);

    this.samples.push({ x: $event.distance.x, t: performance.now() });
    if (this.samples.length > 5) {
      this.samples.shift();
    }
  }

  dragEnd($event: CdkDragEnd): void {
    const dx = $event.distance.x;
    const committed =
      Math.abs(dx) >= this.threshold() || (this.isFling() && Math.abs(dx) > 24);
    this.samples = [];

    if (committed) {
      this.answer(dx > 0);
    } else {
      this.progress = 0;
      this.drag?.reset();
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown($event: KeyboardEvent): void {
    if ($event.key !== 'ArrowLeft' && $event.key !== 'ArrowRight') {
      return;
    }
    if (this.screen !== 'game') {
      return;
    }
    $event.preventDefault();
    this.answer($event.key === 'ArrowRight');
  }

  /** `true` = spelaren svarar att påståendet stämmer (höger), `false` = vänster. */
  answer(saysTrue: boolean): void {
    if (this.locked || this.screen !== 'game' || !this.currentStatement) {
      return;
    }

    const correct = saysTrue === this.currentStatement.isTrue;
    const timeSec = (performance.now() - this.cardShownAt) / 1000;

    if (correct) {
      this.nrCorrect += 1;
    } else {
      this.nrWrong += 1;
      this.buzz();
    }
    this.adjustLevel(correct, timeSec);
    this.answered += 1;

    const { n1, n2 } = this.currentStatement;
    this.feedback = {
      correct,
      solution: `${n1} × ${n2} = ${n1 * n2}`,
    };
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(
      () => (this.feedback = undefined),
      correct ? 900 : 1800,
    );

    this.leaving = saysTrue ? 1 : -1;
    this.progress = saysTrue ? 1 : -1;
    this.advanceTimer = setTimeout(() => this.settleNextCard(), LEAVE_MS);
  }

  private settleNextCard(): void {
    if (this.answered >= this.selectedQuestionCount) {
      this.screen = 'result';
      this.leaving = 0;
      this.progress = 0;
      return;
    }

    this.nextCard();
    this.leaving = 0;
    this.progress = 0;
    // Utan detta skulle kortet animeras tillbaka in från kanten det for ut åt.
    this.instant = true;
    this.drag?.reset();
    requestAnimationFrame(() => (this.instant = false));
  }

  /** Nivån stiger försiktigt (ett steg) men sjunker snabbt (två) — samma
   *  princip som auto-läget i Mästaren, se master-view.component.ts. */
  private adjustLevel(correct: boolean, timeSec: number): void {
    const slowSeconds = this.selectedTargetTime * SLOW_TIME_MULTIPLIER;
    const before = this.level;

    if (correct && timeSec <= this.selectedTargetTime) {
      this.level = Math.min(LEVEL_MAX, this.level + LEVEL_UP_STEP);
    } else if (!correct || timeSec > slowSeconds) {
      this.level = Math.max(LEVEL_MIN, this.level - LEVEL_DOWN_STEP);
    }
    // Mittemellan (rätt, varken snabbt eller långsamt): nivån ligger still.

    if (this.level !== before) {
      this.levelFlash = this.level > before ? 'up' : 'down';
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => (this.levelFlash = ''), LEVEL_FLASH_MS);
    }
  }

  /** Tröskeln skalar med skärmen så att svepet känns lika på mobil och desktop. */
  private threshold(): number {
    return this.clamp(window.innerWidth * 0.22, 60, 130);
  }

  private isFling(): boolean {
    if (this.samples.length < 2) {
      return false;
    }
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = last.t - first.t;
    return dt > 0 && Math.abs((last.x - first.x) / dt) > FLING_SPEED;
  }

  private buzz(): void {
    if ('vibrate' in navigator) {
      navigator.vibrate(60);
    }
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  // --- Frågor ---------------------------------------------------------------

  private nextCard(): void {
    let next = generateStatement(this.level);
    // Slumpen ger ibland exakt samma kort två gånger i rad — dra om en gång.
    if (this.currentStatement && this.sameCard(next, this.currentStatement)) {
      next = generateStatement(this.level);
    }
    this.currentStatement = next;
    this.currentStatmentString = `${next.n1} × ${next.n2} = ${next.shown}`;
    this.cardShownAt = performance.now();
  }

  private sameCard(a: GeneratedStatement, b: GeneratedStatement): boolean {
    return a.n1 === b.n1 && a.n2 === b.n2 && a.shown === b.shown;
  }
}
