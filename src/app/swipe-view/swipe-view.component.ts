import { Component, HostListener, OnDestroy, ViewChild, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { CdkDrag, CdkDragEnd, CdkDragMove } from '@angular/cdk/drag-drop';
import { Fact } from '../facts/fact-catalog';
import { HeatmapComponent } from '../heatmap/heatmap.component';
import { PENALTY_TIME } from '../master-view/levels';
import { clamp } from '../shared/numbers';
import { TrainingEngine } from '../training/training-engine';
import {
  CALIBRATION_CARDS,
  DEFAULT_QUESTION_COUNT,
  DEFAULT_START_LEVEL,
  ENDLESS,
  GeneratedStatement,
  HEAT_TIERS,
  HeatTier,
  LEVEL_MAX,
  LEVEL_MIN,
  QUESTION_COUNTS,
  RoundMemory,
  createRoundMemory,
  heatTier,
  isEndless,
  nextStatement,
  nextStreak,
  rememberMiss,
} from './swipe-difficulty';

/** Hur länge kortet flyger ut innan nästa fråga läggs fram. */
const LEAVE_MS = 260;

/** Hastighet i px/ms som räknas som en knyck även om dragningen är kort. */
const FLING_SPEED = 0.6;

/** Hur länge brasan pulsar efter att nivån ändrats. */
const LEVEL_FLASH_MS = 500;

type Screen = 'menu' | 'game' | 'result' | 'heatmap';

interface Feedback {
  correct: boolean;
  solution: string;
}

@Component({
  selector: 'app-swipe-view',
  imports: [CdkDrag, HeatmapComponent, MatCardModule],
  templateUrl: './swipe-view.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './swipe-view.component.scss',
})
export class SwipeViewComponent implements OnDestroy {
  @ViewChild(CdkDrag) private drag?: CdkDrag;

  private readonly engine = inject(TrainingEngine);

  readonly questionCounts = QUESTION_COUNTS;
  readonly endless = ENDLESS;
  readonly levelMax = LEVEL_MAX;

  screen: Screen = 'menu';
  selectedQuestionCount = DEFAULT_QUESTION_COUNT;

  level = DEFAULT_START_LEVEL;
  /** Kort puls när nivån just ändrats, styr brasans animation. */
  levelFlash: '' | 'up' | 'down' = '';

  /** Snabba rätt i rad just nu, och den längsta räckan hittills i ronden. */
  streak = 0;
  roundBestStreak = 0;
  private previousBestStreak = 0;

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

  /** Antal kort som lagts fram, uppvärmningen inräknad. Rondens längd mäts i
   *  `totalAnswered`, som bara räknar de kort som gav poäng. */
  private answered = 0;
  private memory: RoundMemory = createRoundMemory();
  private cardShownAt = 0;
  private samples: { x: number; t: number }[] = [];
  private advanceTimer?: ReturnType<typeof setTimeout>;
  private feedbackTimer?: ReturnType<typeof setTimeout>;
  private flashTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    clearTimeout(this.advanceTimer);
    clearTimeout(this.feedbackTimer);
    clearTimeout(this.flashTimer);
    this.engine.flush();
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

  /**
   * Ronden öppnar med några ankartal som mäter spelarens sveptakt. Nivån står
   * still under dem — brasan ska inte röra sig på tider som ännu inte har
   * något att jämföras med.
   */
  get calibrating(): boolean {
    return this.answered < CALIBRATION_CARDS;
  }

  /** 0 vid lägsta nivån, 1 vid högsta. */
  get flameIntensity(): number {
    return (this.level - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN);
  }

  /** Vilket steg brasan står på, av räckan. */
  get heat(): HeatTier {
    return heatTier(this.streak);
  }

  get heatIndex(): number {
    return HEAT_TIERS.indexOf(this.heat);
  }

  /** Nivån sätter grundstorleken, räckan multiplicerar den. Den som kan mycket
   *  har en större glöd i botten; den som är på gång just nu har en brasa. */
  get flameScale(): number {
    return (0.75 + this.flameIntensity * 0.35) * this.heat.scale;
  }

  get flameLabel(): string {
    const level = `Nivå ${this.level} av ${this.levelMax}`;
    return this.calibrating ? `${level}, uppvärmning` : `${level}, ${this.heat.name}`;
  }

  /** Om värmekartan har något att visa. Kartan visar båda kanalerna, så den
   *  är värd att öppna så fort någon av dem är övad; den säger själv till när
   *  den kanal som visas är tom. */
  get hasPractice(): boolean {
    return this.engine.hasAnyPractice;
  }

  /** Rekordet att jaga. Läses ur statistiken, så att menyn visar det redan
   *  innan spelaren kört en rond den här gången. */
  get bestStreak(): number {
    return this.engine.swipeBestStreak;
  }

  /** Om ronden slog rekordet. Jämför mot vad som stod när den började —
   *  `endRound()` har redan skrivit det nya. */
  get beatRecord(): boolean {
    return this.roundBestStreak > this.previousBestStreak;
  }

  /** 0 när kortet ligger stilla, 1 när det dragits hela vägen åt `dir`. */
  strength(dir: 1 | -1): number {
    return Math.max(0, dir * this.progress);
  }

  /** Ronden som pågår tills spelaren själv säger stopp. */
  get roundIsEndless(): boolean {
    return isEndless(this.selectedQuestionCount);
  }

  numberOfStatementsLeft(): number {
    return Math.max(0, this.selectedQuestionCount - this.totalAnswered);
  }

  // --- Meny -------------------------------------------------------------

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

  openHeatmap(): void {
    this.screen = 'heatmap';
  }

  /** Slutknappen i en rond utan slut. Kortet som är på väg ut får inte lägga
   *  fram nästa efteråt, så dess timer stoppas här. */
  stopRound(): void {
    clearTimeout(this.advanceTimer);
    this.endRound();
  }

  private restartRound(): void {
    clearTimeout(this.advanceTimer);
    clearTimeout(this.feedbackTimer);
    clearTimeout(this.flashTimer);
    this.answered = 0;
    this.nrCorrect = 0;
    this.nrWrong = 0;
    this.memory = createRoundMemory();
    this.streak = 0;
    this.roundBestStreak = 0;
    this.previousBestStreak = this.engine.swipeBestStreak;
    this.level = this.engine.swipeStartLevel();
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
    this.progress = clamp($event.distance.x / this.threshold(), -1, 1);

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

    const statement = this.currentStatement;
    const correct = saysTrue === statement.isTrue;
    const timeSec = (performance.now() - this.cardShownAt) / 1000;

    // Uppvärmningen räknas inte i poängen — en rond på tio kort ska vara tio
    // kort, inte fem plus fem. Talen övas ändå: svaret går till statistiken,
    // och en miss kommer tillbaka som ett sant kort precis som annars.
    if (correct) {
      if (!this.calibrating) {
        this.nrCorrect += 1;
      }
    } else {
      if (!this.calibrating) {
        this.nrWrong += 1;
      }
      this.buzz();
      // Nästa gång talet kommer upp ska det vara sant — den rätta kopplingen
      // ska repeteras, inte den felaktiga.
      rememberMiss(this.memory, statement.fact);
    }
    this.recordAnswer(statement.fact, correct, timeSec);
    if (this.calibrating) {
      this.engine.recordSwipeCalibration(statement, correct, timeSec);
    } else {
      const fast = this.engine.isFastSwipe(statement, correct, timeSec);
      this.adjustLevel(statement, correct, timeSec);
      this.streak = nextStreak(this.streak, correct, fast);
      this.roundBestStreak = Math.max(this.roundBestStreak, this.streak);
    }
    this.answered += 1;

    const { n1, n2 } = statement;
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
    if (!this.roundIsEndless && this.totalAnswered >= this.selectedQuestionCount) {
      this.endRound();
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

  private endRound(): void {
    this.screen = 'result';
    this.leaving = 0;
    this.progress = 0;
    if (this.roundBestStreak > this.previousBestStreak) {
      this.engine.swipeBestStreak = this.roundBestStreak;
    }
    // Statistiken skrivs fördröjt under ronden; här ska den sitta på disk.
    this.engine.flush();
  }

  /** Skickar svaret till den delade statistiken, i svepets egen kanal. Fel
   *  svar får samma tidsstraff som i Mästaren så tiderna går att jämföra. */
  private recordAnswer(fact: Fact, correct: boolean, timeSec: number): void {
    const effectiveMs = (timeSec + (correct ? 0 : PENALTY_TIME)) * 1000;
    this.engine.record(fact.a, fact.b, correct, effectiveMs, 'swipe');
  }

  /** Nivån stiger försiktigt (ett steg) men sjunker snabbt (två) — samma
   *  princip som auto-läget i Mästaren. Tröskeln är spelarens egen sveptakt,
   *  och den läser motorn; vyn behöver inte veta att det finns en. */
  private adjustLevel(
    statement: GeneratedStatement,
    correct: boolean,
    timeSec: number,
  ): void {
    const before = this.level;
    this.level = this.engine.nextSwipeLevel(this.level, statement, correct, timeSec);

    if (this.level !== before) {
      this.engine.swipeLevel = this.level;
      this.levelFlash = this.level > before ? 'up' : 'down';
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => (this.levelFlash = ''), LEVEL_FLASH_MS);
    }
  }

  /** Tröskeln skalar med skärmen så att svepet känns lika på mobil och desktop. */
  private threshold(): number {
    return clamp(window.innerWidth * 0.22, 60, 130);
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

  // --- Frågor ---------------------------------------------------------------

  private nextCard(): void {
    const next = nextStatement({
      level: this.level,
      memory: this.memory,
      calibration: this.calibrating,
      need: this.need,
    });
    this.currentStatement = next;
    this.currentStatmentString = `${next.n1} × ${next.n2} = ${next.shown}`;
    this.cardShownAt = performance.now();
  }

  /** Spelarens vikt per tal — svaga och obeprövade tal dras oftare. Vikten är
   *  motorns att bestämma; ronden vidarebefordrar den bara till urvalet. */
  private readonly need = (fact: Fact): number => this.engine.needFor(fact);
}
