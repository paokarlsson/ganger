/**
 * Snabbhetskalibreringen: fem enkla tal, mätta på tid.
 *
 * Egen komponent för att det är ett eget flöde med en egen skärm. Den mäter
 * spelarens takt på tal som inte ska behöva räknas ut, så att allt annat
 * spelet säger om snabbhet har något att vara snabbt *i förhållande till* —
 * se `TrainingEngine.calibrate()`.
 *
 * Den säger till när den är klar och vet inget om vad som händer sedan. Det
 * är Mästaren som äger vad kalibreringen leder till.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  output,
} from '@angular/core';
import { TrainingEngine } from '../training/training-engine';
import { CALIBRATION_QUESTIONS } from '../master-view/levels';

/** Hur länge ett rätt svar står kvar innan nästa tal kommer. */
const NEXT_QUESTION_DELAY_MS = 300;

/** Hur länge det röda fältet står kvar efter ett fel. */
const WRONG_FEEDBACK_MS = 500;

@Component({
  selector: 'app-calibration',
  templateUrl: './calibration.component.html',
  styleUrl: './calibration.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class CalibrationComponent implements OnInit, OnDestroy {
  @ViewChild('input') private input?: ElementRef<HTMLInputElement>;

  /** Kalibreringen är klar, mätt eller överhoppad. */
  readonly done = output<void>();

  readonly questions = CALIBRATION_QUESTIONS;

  questionText = '';
  index = 0;
  wrong = false;

  private readonly engine = inject(TrainingEngine);
  private times: number[] = [];
  private startedAt = 0;
  private handle?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.nextQuestion();
  }

  ngOnDestroy(): void {
    clearTimeout(this.handle);
  }

  get progressLabel(): string {
    return `Fråga ${Math.min(this.index + 1, this.questions.length)} av ${this.questions.length}`;
  }

  /** Tillståndsklasserna kommer från stilmallens .ui-dot. */
  dotState(index: number): 'is-done' | 'is-current' | '' {
    if (index < this.index) {
      return 'is-done';
    }
    return index === this.index ? 'is-current' : '';
  }

  /** Svaret prövas medan det skrivs, så snart det är lika långt som facit. */
  checkAnswer(): void {
    const input = this.input?.nativeElement;
    if (!input || this.index >= this.questions.length) {
      return;
    }
    const [a, b] = this.questions[this.index];
    const correctAnswer = a * b;
    const userAnswer = Number.parseInt(input.value, 10);

    if (Number.isNaN(userAnswer) || input.value.length < String(correctAnswer).length) {
      return;
    }

    if (userAnswer === correctAnswer) {
      this.times.push(Date.now() - this.startedAt);
      this.index += 1;
      this.handle = setTimeout(() => this.nextQuestion(), NEXT_QUESTION_DELAY_MS);
    } else {
      this.wrong = true;
      this.handle = setTimeout(() => {
        this.wrong = false;
        this.clearAndFocus();
      }, WRONG_FEEDBACK_MS);
    }
  }

  skip(): void {
    this.engine.useDefaultCalibration();
    this.done.emit();
  }

  private nextQuestion(): void {
    if (this.index >= this.questions.length) {
      this.engine.calibrate(this.times);
      this.done.emit();
      return;
    }
    const [a, b] = this.questions[this.index];
    this.questionText = `${a} × ${b}`;
    this.startedAt = Date.now();
    this.clearAndFocus();
  }

  /** Fältet ligger bakom @if och finns först när vyn ritats om, så det slås
   *  upp inifrån timeouten i stället för att skickas in. */
  private clearAndFocus(): void {
    setTimeout(() => {
      const input = this.input?.nativeElement;
      if (input) {
        input.value = '';
        input.focus();
      }
    });
  }
}
