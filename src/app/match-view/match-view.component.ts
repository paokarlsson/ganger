import { Component, ChangeDetectionStrategy } from '@angular/core';

/** Smallest and largest factor a question is built from. */
const MIN_FACTOR = 1;
const MAX_FACTOR = 10;

/** Number of pairs shown in one round. */
const ROUND_SIZE = 5;

@Component({
  selector: 'app-match-view',
  styleUrl: 'match-view.component.scss',
  templateUrl: 'match-view.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class MatchViewComponent {
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

  constructor() {
    this.loopAudio = new Audio('assets/audio/loop.mp3');
    this.rightAudio = new Audio('assets/audio/right.wav');
    this.wrongAudio = new Audio('assets/audio/wrong.wav');
    this.next();
  }

  startStopLoopAudio() {
    this.playLoop = !this.playLoop;
    if (this.playLoop) {
      this.loopAudio.loop = true;
      this.loopAudio.volume = 0.1;
      this.loopAudio
        .play()
        .catch((error) => console.error('Error starting loop:', error));
    } else {
      this.loopAudio.pause();
    }
  }

  next() {
    this.round = this.buildRound();
    this.doneQuestions = new Set<Question>();
    this.resetLeftAndRight();
    this.leftList = this.shuffle(this.round);
    this.rightList = this.shuffleDeranged(this.round, this.leftList);
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
    this.left = this.left === q ? null : q;
    this.evaluatePair();
  }

  selA(q: Question) {
    if (this.isDone(q)) {
      return;
    }
    this.right = this.right === q ? null : q;
    this.evaluatePair();
  }

  resetLeftAndRight() {
    this.left = null;
    this.right = null;
  }

  private evaluatePair() {
    if (this.left === null || this.right === null) {
      return;
    }
    if (this.left === this.right) {
      this.doneQuestions.add(this.left);
      this.resetLeftAndRight();
      this.playSuccess();
    } else {
      this.playWrong();
    }
  }

  /**
   * Every round is drawn fresh from the whole table, so the game never runs
   * out of questions. Products are kept unique within a round: the answer
   * column shows nothing but the product, so two questions sharing one would
   * be impossible to tell apart.
   */
  private buildRound(): Question[] {
    const round: Question[] = [];
    const products = new Set<number>();

    for (const q of this.shuffle(this.allQuestions())) {
      const product = q.first * q.second;
      if (products.has(product)) {
        continue;
      }
      products.add(product);
      round.push(q);
      if (round.length === ROUND_SIZE) {
        break;
      }
    }
    return round;
  }

  private allQuestions(): Question[] {
    const questions: Question[] = [];
    for (let first = MIN_FACTOR; first <= MAX_FACTOR; first++) {
      for (let second = MIN_FACTOR; second <= MAX_FACTOR; second++) {
        questions.push({ first, second });
      }
    }
    return questions;
  }

  private shuffle(questions: Question[]): Question[] {
    const array = [...questions];
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /** Lays out the answers so none of them sits on the same row as its question. */
  private shuffleDeranged(questions: Question[], other: Question[]): Question[] {
    for (let attempt = 0; attempt < 20; attempt++) {
      const shuffled = this.shuffle(questions);
      if (shuffled.every((q, i) => q !== other[i])) {
        return shuffled;
      }
    }
    // Rotating by one step is a derangement for any list of two or more.
    return [...other.slice(1), ...other.slice(0, 1)];
  }

  private playWrong() {
    this.wrongAudio.currentTime = 0;
    this.wrongAudio.volume = 0.3;
    this.wrongAudio
      .play()
      .catch((error) => console.error('Error playing effect:', error));
  }

  private playSuccess() {
    this.rightAudio.currentTime = 0;
    this.rightAudio.volume = 0.3;
    this.rightAudio
      .play()
      .catch((error) => console.error('Error playing effect:', error));
  }
}

export interface Question {
  first: number;
  second: number;
}
