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

  constructor() {
    this.bigDataBaseQuestionSet = this.createQuestions();
    this.questionList = this.getQuestions();
    this.doneQuestions = new Set<Question>();
    this.leftList = this.shuffleArray(this.questionList, 1);
    this.rightList = this.shuffleArray(this.questionList, 200);
  }

  isDone(q: Question) {
    let a: Question[] = Array.from(this.doneQuestions);
    return a.some((a) => a.first * a.second == q.first * q.second && (a.first == q.first ||  a.second == q.second));
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
    if (this.left == undefined || this.right == undefined) {
      return false;
    }
    if (this.left == null || this.right == null) {
      return false;
    }
    if(this.left != q) {
      return false;
    }
    return this.left != this.right;
  }

  isRightWrong(q: Question) {
    if (this.left == undefined || this.right == undefined) {
      return false;
    }
    if (this.left == null || this.right == null) {
      return false;
    }
    if(this.right != q) {
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
  selQ(q: Question) {
    if (this.isDone(q)) {
      return;
    }
    this.left = this.left == q ? null : q;
    if (this.isCorrect(q)) {
      this.pushToDone(q);
      this.resetLeftAndRight();
    }
  }
  resetLeftAndRight() {
    this.left = null;
    this.right = null;
  }
  private pushToDone(q: Question) {
    this.doneQuestions?.add(q);
  }

  selA(q: Question) {
    if (this.isDone(q)) {
      return;
    }
    this.right = this.right == q ? null : q;
    if (this.isCorrect(q)) {
      this.pushToDone(q);
      this.resetLeftAndRight();
    }
  }

  getQuestions(): Set<Question> {
    let iterator = this.bigDataBaseQuestionSet.values();
    let set = new Set<Question>();
    for (let i = 0; i < 4; i++) {
      const next = iterator.next(); // Get the next item in the Set
      // let a: Question[] = Array.from(set);
      // let already = a.some((a) => a.first * a.second == next?.first * next.second && (a.first == next.first ||  a.second == next.second));
      if (next.done) break; // Stop if there are no more items
      set.add(next.value); // Add the item to the result array
      this.bigDataBaseQuestionSet.delete(next.value); // Remove the item from the Set
    }
    return set;
  }

  createQuestions(): Set<Question> {
    let set = new Set<Question>();
    for (let i = 0; i < 100; i++) {
      let a = Math.floor(Math.random() * 11);
      let b = Math.floor(Math.random() * 11);
      const q: Question = { first: a, second: b};
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
