import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

/**
 * @title Basic grid-list
 */
@Component({
  selector: 'app-root',
  styleUrl: 'app.component.scss',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [MatCardModule, CommonModule],
})
export class AppComponent {
  next() {
    this.doneQuestions = new Set<Question>();
    this.questionList = this.getQuestions();
    this.leftList = this.shuffleArray(
      this.questionList,
      1 + new Date().getDate()
    );
    this.rightList = this.shuffleArray(
      this.questionList,
      200 + new Date().getDate()
    );
  }

  bigDataBaseQuestionSet: Set<Question>;
  questionList: Set<Question>;
  leftList: Set<Question>;
  rightList: Set<Question>;
  doneQuestions: Set<Question>;
  left: Question | null | undefined;
  right: Question | null | undefined;
  loopAudio: HTMLAudioElement;
  rightAudio: HTMLAudioElement;
  wrongAudio: HTMLAudioElement;

  constructor() {
    this.bigDataBaseQuestionSet = this.createQuestions();
    this.questionList = this.getQuestions();
    this.doneQuestions = new Set<Question>();
    this.leftList = this.shuffleArray(this.questionList, 1);
    this.rightList = this.shuffleArray(this.questionList, 200);
    this.loopAudio = new Audio('assets/audio/loop.mp3');
    this.rightAudio = new Audio('assets/audio/right.wav');
    this.wrongAudio = new Audio('assets/audio/wrong.wav');
    this.loopAudio.loop = true;
    this.loopAudio.volume = 0.1;
    this.loopAudio.play().catch(error => console.error('Error starting loop:', error));
  }

  isDone(q: Question) {
    let a: Question[] = Array.from(this.doneQuestions);

    return a.some(
      (a) =>
        a.first * a.second == q.first * q.second &&
        (a.first == q.first || a.second == q.second)
    );
  }
  allIsDone(): any {
    if (this.doneQuestions?.size == this.questionList?.size) {
      return true;
    }
    return false;
  }
  isCorrect(q: Question) {
    if (this.left == undefined || this.right == undefined) {
      return false;
    }
    if (this.left == null || this.right == null) {
      return false;
    }

    if (this.left == this.right) {
      return true;
    }
    return false;
  }
  isLeftWrong(q: Question) {
    if (this.left != q) {
      return false;
    }
    if (this.left == undefined || this.right == undefined) {
      return false;
    }
    if (this.left == null || this.right == null) {
      return false;
    }
    return this.left != this.right;
  }

  isRightWrong(q: Question) {
    if (this.right != q) {
      return false;
    }
    if (this.left == undefined || this.right == undefined) {
      return false;
    }
    if (this.left == null || this.right == null) {
      return false;
    }
    return this.left != this.right;
  }

  isQSelected(q: Question) {
    return this.left == q;
  }
  isASelected(q: Question) {
    return this.right == q;
  }
  resetLeftAndRight() {
    this.left = null;
    this.right = null;
  }
  private pushToDone(q: Question) {
    this.doneQuestions?.add(q);
  }
  selQ(q: Question) {
    if (this.isDone(q)) {
      return;
    }
    this.left = this.left == q ? null : q;
    if (this.isCorrect(q)) {
      this.pushToDone(q);
      this.resetLeftAndRight();
      this.playSuccess();
    } else if (!this.isCorrect(q) && this.left != null && this.right != null) {
      this.playWrong();
    }
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

  selA(q: Question) {
    if (this.isDone(q)) {
      return;
    }
    this.right = this.right == q ? null : q;
    if (this.isCorrect(q)) {
      this.pushToDone(q);
      this.resetLeftAndRight();
      this.playSuccess()
    } else if (!this.isCorrect(q) && this.left != null && this.right != null) {
      this.playWrong();
    }
  }

  getQuestions(): Set<Question> {
    let iterator = this.bigDataBaseQuestionSet.values();
    let set: Question[] = [];
    while (set.length < 5) {
      const next = iterator.next();

      if (next.done) break;
      if (
        set.some(
          (a) => a.first * a.second == next.value.first * next.value.second
        )
      ) {
        continue;
      }
      set.push(next.value);
      this.bigDataBaseQuestionSet.delete(next.value);
    }
    return new Set(set);
  }

  createQuestions(): Set<Question> {
    let set = new Set<Question>();
    for (let i = 0; i < 100; i++) {
      let a = Math.floor(Math.random() * 11);
      let b = Math.floor(Math.random() * 11);
      const q: Question = { first: a, second: b };
      set.add(q);
    }
    return set;
  }

  removeQuestion(question: Question) {}

  shuffleArray(set: Set<Question>, seed: number): Set<Question> {
    const random = this.seededRandom(seed);

    let array = Array.from(set);
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }

    return new Set(array);
  }
  seededRandom(seed: number): () => number {
    return function () {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }
}

export interface Question {
  first: number;
  second: number;
}
