import { Component, ChangeDetectionStrategy, OnDestroy, OnInit, inject } from '@angular/core';
import { FACTS, Fact } from '../facts/fact-catalog';
import { GameAudio } from '../services/game-audio';
import { ObservationLog } from '../services/observation-log';
import { progressKeyFor } from '../services/progress-store';
import { shuffle } from '../shared/random';

/** Antal par som visas i en runda. */
const ROUND_SIZE = 5;

@Component({
  selector: 'app-match-view',
  styleUrl: 'match-view.component.scss',
  templateUrl: 'match-view.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class MatchViewComponent implements OnInit, OnDestroy {
  round: Question[] = [];
  /** Frågespalten och svarsspalten, var och en i sin egen ordning. */
  questionColumn: Question[] = [];
  answerColumn: Question[] = [];
  doneQuestions = new Set<Question>();
  /** Det som är valt i respektive spalt just nu. */
  selectedQuestion: Question | null = null;
  selectedAnswer: Question | null = null;

  /** När rundan lades fram, och när det senaste paret löstes. */
  private roundStartedAt = 0;
  private lastResolvedAt = 0;
  /** Första klicket i den växling som pågår. `null` innan den börjat. */
  private firstTouchAt: number | null = null;
  private startedFrom: 'question' | 'answer' = 'question';
  /** Felparningar per tal i den här rundan. */
  private attempts = new Map<Question, number>();

  private readonly log = inject(ObservationLog);
  private readonly audio = inject(GameAudio);

  /** Rundan läggs fram när komponenten ritats, inte i konstruktorn. */
  ngOnInit(): void {
    this.nextRound();
  }

  /** Ljudet överlever komponenten, så det som river spelet får tysta det:
   *  annars följer musiken med tillbaka till menyn. */
  ngOnDestroy(): void {
    this.audio.stopLoop();
    this.log.flush();
  }

  get playLoop(): boolean {
    return this.audio.loopPlaying;
  }

  startStopLoopAudio() {
    this.audio.toggleLoop();
  }

  nextRound() {
    this.round = this.buildRound();
    this.doneQuestions = new Set<Question>();
    this.attempts = new Map<Question, number>();
    this.clearSelection();
    this.questionColumn = shuffle(this.round);
    this.answerColumn = this.shuffleDeranged(this.round, this.questionColumn);
    this.roundStartedAt = this.now();
    this.lastResolvedAt = this.roundStartedAt;
  }

  /** Visningsformen för en ruta i frågespalten. */
  questionText(question: Question): string {
    return `${firstFactor(question)} × ${secondFactor(question)}`;
  }

  /** Svarsspalten visar bara produkten. */
  answerText(question: Question): number {
    return question.fact.answer;
  }

  isDone(question: Question) {
    return this.doneQuestions.has(question);
  }

  isRoundComplete(): boolean {
    return this.round.length > 0 && this.doneQuestions.size === this.round.length;
  }

  isQuestionSelected(question: Question) {
    return this.selectedQuestion === question;
  }

  isAnswerSelected(question: Question) {
    return this.selectedAnswer === question;
  }

  isQuestionWrong(question: Question) {
    return this.isQuestionSelected(question) && this.isMispaired();
  }

  isAnswerWrong(question: Question) {
    return this.isAnswerSelected(question) && this.isMispaired();
  }

  selectQuestion(question: Question) {
    if (this.isDone(question)) {
      return;
    }
    this.noteTouch('question');
    this.selectedQuestion = this.selectedQuestion === question ? null : question;
    this.evaluatePair();
  }

  selectAnswer(question: Question) {
    if (this.isDone(question)) {
      return;
    }
    this.noteTouch('answer');
    this.selectedAnswer = this.selectedAnswer === question ? null : question;
    this.evaluatePair();
  }

  /** Två valda rutor som inte hör ihop. Står kvar tills något annat väljs. */
  private isMispaired(): boolean {
    return (
      this.selectedQuestion !== null &&
      this.selectedAnswer !== null &&
      this.selectedQuestion !== this.selectedAnswer
    );
  }

  private clearSelection() {
    this.selectedQuestion = null;
    this.selectedAnswer = null;
  }

  /**
   * En växling börjar när brädet är orört och något väljs. Klicket som bryter
   * en felparning räknas inte som en ny början — felet hör till samma försök,
   * och `attempts` är det som bär den informationen.
   */
  private noteTouch(from: 'question' | 'answer'): void {
    if (this.selectedQuestion === null && this.selectedAnswer === null) {
      this.firstTouchAt = this.now();
      this.startedFrom = from;
    }
  }

  private evaluatePair() {
    const question = this.selectedQuestion;
    const answer = this.selectedAnswer;
    if (question === null || answer === null) {
      return;
    }
    if (question === answer) {
      this.recordPair(question);
      this.doneQuestions.add(question);
      this.lastResolvedAt = this.now();
      this.firstTouchAt = null;
      this.clearSelection();
      this.audio.playCorrect();
    } else {
      this.recordMispair(question, answer);
      this.attempts.set(question, (this.attempts.get(question) ?? 0) + 1);
      this.attempts.set(answer, (this.attempts.get(answer) ?? 0) + 1);
      this.audio.playWrong();
    }
  }

  private recordPair(question: Question): void {
    const at = this.now();
    const attempts = this.attempts.get(question) ?? 0;
    this.log.append({
      source: 'match',
      kind: 'pair',
      key: questionKey(question),
      firstTry: attempts === 0,
      attempts,
      msSinceRoundStart: Math.round(at - this.roundStartedAt),
      msSinceLastResolved: Math.round(at - this.lastResolvedAt),
      msSinceFirstTouch:
        this.firstTouchAt === null ? null : Math.round(at - this.firstTouchAt),
      resolvedBefore: this.doneQuestions.size,
      remaining: this.round.length - this.doneQuestions.size,
      startedFrom: this.startedFrom,
      flipped: firstFactor(question) > secondFactor(question),
      at: Date.now(),
    });
  }

  private recordMispair(question: Question, pairedWith: Question): void {
    this.log.append({
      source: 'match',
      kind: 'mispair',
      key: questionKey(question),
      pairedWith: questionKey(pairedWith),
      chosenAnswer: pairedWith.fact.answer,
      msSinceRoundStart: Math.round(this.now() - this.roundStartedAt),
      resolvedBefore: this.doneQuestions.size,
      remaining: this.round.length - this.doneQuestions.size,
      at: Date.now(),
    });
  }

  /**
   * Varje runda dras på nytt ur hela tabellen, så spelet tar aldrig slut på
   * frågor. Produkterna hålls unika inom rundan: svarsspalten visar ingenting
   * annat än produkten, så två frågor som delade en vore omöjliga att skilja åt.
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
      round.push({ fact, flipped: Math.random() < 0.5 });
      if (round.length === ROUND_SIZE) {
        break;
      }
    }
    return round;
  }

  /** Lägger svaren så att inget av dem hamnar på samma rad som sin fråga. */
  private shuffleDeranged(questions: Question[], other: Question[]): Question[] {
    for (let attempt = 0; attempt < 20; attempt++) {
      const shuffled = shuffle(questions);
      if (shuffled.every((question, i) => question !== other[i])) {
        return shuffled;
      }
    }
    // Att rotera ett steg är en derangemang för varje lista på två eller fler.
    return [...other.slice(1), ...other.slice(0, 1)];
  }

  /** Monoton klocka, så att en systemklocka som justeras inte ger negativa
   *  tider. `at` i händelsen är väggklockan och används för att sortera. */
  private now(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now();
  }
}

/**
 * Ett tal ur katalogen, med den ordning det ritas i. Katalogen lagrar den
 * lättaste faktorn först; `flipped` säger att spalten visar den andra vägen.
 */
export interface Question {
  fact: Fact;
  flipped: boolean;
}

/** Den faktor som står först i spalten. */
export function firstFactor(question: Question): number {
  return question.flipped ? question.fact.b : question.fact.a;
}

/** Den faktor som står sist i spalten. */
export function secondFactor(question: Question): number {
  return question.flipped ? question.fact.a : question.fact.b;
}

/** Lagringsnyckeln för talet, `mul:7x8`. Oberoende av visad ordning. */
export function questionKey(question: Question): string {
  return progressKeyFor(question.fact.a, question.fact.b);
}
