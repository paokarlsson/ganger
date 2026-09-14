import { Component, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { FACTS } from '../facts/fact-catalog';
import { ObservationLog } from '../services/observation-log';
import { progressKeyFor } from '../services/progress-store';
import { shuffle } from '../shared/random';

/** Number of pairs shown in one round. */
const ROUND_SIZE = 5;

@Component({
  selector: 'app-match-view',
  styleUrl: 'match-view.component.scss',
  templateUrl: 'match-view.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class MatchViewComponent implements OnDestroy {
  playLoop: boolean = false;

  round: Question[] = [];
  leftList: Question[] = [];
  rightList: Question[] = [];
  doneQuestions = new Set<Question>();
  left: Question | null = null;
  right: Question | null = null;

  loopAudio: HTMLAudioElement;
  rightAudio: HTMLAudioElement;
  wrongAudio: HTMLAudioElement;

  /** När rundan lades fram, och när det senaste paret löstes. */
  private roundStartedAt = 0;
  private lastResolvedAt = 0;
  /** Första klicket i den växling som pågår. `null` innan den börjat. */
  private firstTouchAt: number | null = null;
  private startedFrom: 'question' | 'answer' = 'question';
  /** Felparningar per tal i den här rundan. */
  private attempts = new Map<Question, number>();

  /**
   * Loggen kommer från DI i appen. Grundvärdet finns för testerna, som bygger
   * komponenten med `new` — `inject()` går inte utanför en injektionskontext,
   * och att dra in TestBed för det här vore dyrare än en parameter.
   */
  constructor(private readonly log: ObservationLog = new ObservationLog()) {
    this.loopAudio = new Audio('assets/audio/loop.mp3');
    this.loopAudio.loop = true;
    this.loopAudio.volume = 0.1;
    this.rightAudio = new Audio('assets/audio/right.wav');
    this.rightAudio.volume = 0.3;
    this.wrongAudio = new Audio('assets/audio/wrong.wav');
    this.wrongAudio.volume = 0.3;
    this.next();
  }

  /**
   * The audio elements are plain objects, not part of the template, so tearing
   * the game down leaves them playing: going back to the menu would carry the
   * music along, and starting the game again would build a second element that
   * plays on top of the first one, with no way left to stop either.
   */
  ngOnDestroy(): void {
    this.playLoop = false;
    this.loopAudio.pause();
    this.log.flush();
  }

  startStopLoopAudio() {
    this.playLoop = !this.playLoop;
    if (this.playLoop) {
      this.loopAudio.play().catch((error) => {
        // Playback can be refused — an unsupported file, or a browser that
        // wants a plainer gesture than this one. Say so with the icon rather
        // than leaving it claiming that music is playing.
        this.playLoop = false;
        console.error('Error starting loop:', error);
      });
    } else {
      this.loopAudio.pause();
    }
  }

  next() {
    this.round = this.buildRound();
    this.doneQuestions = new Set<Question>();
    this.attempts = new Map<Question, number>();
    this.resetLeftAndRight();
    this.leftList = shuffle(this.round);
    this.rightList = this.shuffleDeranged(this.round, this.leftList);
    this.roundStartedAt = this.now();
    this.lastResolvedAt = this.roundStartedAt;
  }

  isDone(q: Question) {
    return this.doneQuestions.has(q);
  }

  allIsDone(): boolean {
    return this.round.length > 0 && this.doneQuestions.size === this.round.length;
  }

  isQSelected(q: Question) {
    return this.left === q;
  }

  isASelected(q: Question) {
    return this.right === q;
  }

  isLeftWrong(q: Question) {
    return this.left === q && this.right !== null && this.left !== this.right;
  }

  isRightWrong(q: Question) {
    return this.right === q && this.left !== null && this.left !== this.right;
  }

  selQ(q: Question) {
    if (this.isDone(q)) {
      return;
    }
    this.noteTouch('question');
    this.left = this.left === q ? null : q;
    this.evaluatePair();
  }

  selA(q: Question) {
    if (this.isDone(q)) {
      return;
    }
    this.noteTouch('answer');
    this.right = this.right === q ? null : q;
    this.evaluatePair();
  }

  private resetLeftAndRight() {
    this.left = null;
    this.right = null;
  }

  /**
   * En växling börjar när brädet är orört och något väljs. Klicket som bryter
   * en felparning räknas inte som en ny början — felet hör till samma försök,
   * och `attempts` är det som bär den informationen.
   */
  private noteTouch(from: 'question' | 'answer'): void {
    if (this.left === null && this.right === null) {
      this.firstTouchAt = this.now();
      this.startedFrom = from;
    }
  }

  private evaluatePair() {
    if (this.left === null || this.right === null) {
      return;
    }
    if (this.left === this.right) {
      const matched = this.left;
      this.recordPair(matched);
      this.doneQuestions.add(matched);
      this.lastResolvedAt = this.now();
      this.firstTouchAt = null;
      this.resetLeftAndRight();
      this.playEffect(this.rightAudio);
    } else {
      this.recordMispair(this.left, this.right);
      this.attempts.set(this.left, (this.attempts.get(this.left) ?? 0) + 1);
      this.attempts.set(this.right, (this.attempts.get(this.right) ?? 0) + 1);
      this.playEffect(this.wrongAudio);
    }
  }

  private recordPair(question: Question): void {
    const at = this.now();
    const attempts = this.attempts.get(question) ?? 0;
    this.log.append({
      source: 'match',
      kind: 'pair',
      key: question.key,
      firstTry: attempts === 0,
      attempts,
      msSinceRoundStart: Math.round(at - this.roundStartedAt),
      msSinceLastResolved: Math.round(at - this.lastResolvedAt),
      msSinceFirstTouch:
        this.firstTouchAt === null ? null : Math.round(at - this.firstTouchAt),
      resolvedBefore: this.doneQuestions.size,
      remaining: this.round.length - this.doneQuestions.size,
      startedFrom: this.startedFrom,
      flipped: question.first > question.second,
      at: Date.now(),
    });
  }

  private recordMispair(question: Question, pairedWith: Question): void {
    this.log.append({
      source: 'match',
      kind: 'mispair',
      key: question.key,
      pairedWith: pairedWith.key,
      chosenAnswer: pairedWith.first * pairedWith.second,
      msSinceRoundStart: Math.round(this.now() - this.roundStartedAt),
      resolvedBefore: this.doneQuestions.size,
      remaining: this.round.length - this.doneQuestions.size,
      at: Date.now(),
    });
  }

  /**
   * Every round is drawn fresh from the whole table, so the game never runs
   * out of questions. Products are kept unique within a round: the answer
   * column shows nothing but the product, so two questions sharing one would
   * be impossible to tell apart.
   *
   * Urvalet är avsiktligt slumpmässigt, trots att katalogen vet vilka tal som
   * är svåra. Loggen ska kunna användas för att kalibrera, och det kräver ett
   * obiaserat stickprov över hela tabellen. Väljer spelet tal efter vad det
   * redan tror om spelaren blir loggen ett eko av det beslutet i stället för
   * en mätning av spelaren.
   */
  private buildRound(): Question[] {
    const round: Question[] = [];
    const products = new Set<number>();

    for (const fact of shuffle(FACTS)) {
      if (products.has(fact.answer)) {
        continue;
      }
      products.add(fact.answer);
      // Katalogen lagrar den lättaste faktorn först. Att alltid visa den så
      // vore ett mönster att lära sig i stället för talet.
      const flipped = Math.random() < 0.5;
      round.push({
        first: flipped ? fact.b : fact.a,
        second: flipped ? fact.a : fact.b,
        key: progressKeyFor(fact.a, fact.b),
      });
      if (round.length === ROUND_SIZE) {
        break;
      }
    }
    return round;
  }

  /** Lays out the answers so none of them sits on the same row as its question. */
  private shuffleDeranged(questions: Question[], other: Question[]): Question[] {
    for (let attempt = 0; attempt < 20; attempt++) {
      const shuffled = shuffle(questions);
      if (shuffled.every((q, i) => q !== other[i])) {
        return shuffled;
      }
    }
    // Rotating by one step is a derangement for any list of two or more.
    return [...other.slice(1), ...other.slice(0, 1)];
  }

  /** Monoton klocka, så att en systemklocka som justeras inte ger negativa
   *  tider. `at` i händelsen är väggklockan och används för att sortera. */
  private now(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now();
  }

  /** Spelar om från början, så att två par i snabb följd hörs som två. */
  private playEffect(audio: HTMLAudioElement): void {
    audio.currentTime = 0;
    audio.play().catch((error) => console.error('Error playing effect:', error));
  }
}

export interface Question {
  first: number;
  second: number;
  /** Lagringsnyckeln för talet, `mul:7x8`. Oberoende av visad ordning. */
  key: string;
}
