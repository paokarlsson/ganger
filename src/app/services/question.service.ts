import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, retry, shareReplay } from 'rxjs';

export interface Statement {
  rank: number;
  number1: number;
  number2: number;
  answer: number;
  /** Trovärdiga felsvar. Tom för 0 × 0, som saknar en rimlig miss. */
  wrongs: number[];
}

/** Frågorna ligger som statisk asset — appen har ingen backend. */
const QUESTIONS_URL = 'assets/ranked-questions.json';

@Injectable({ providedIn: 'root' })
export class QuestionService {
  private readonly http = inject(HttpClient);

  /** Hämtas en gång och delas mellan alla prenumeranter. */
  private readonly questions$: Observable<Statement[]> = this.http
    .get<Statement[]>(QUESTIONS_URL)
    .pipe(
      retry({ count: 2, delay: 1000 }),
      map((questions) => [...questions].sort((a, b) => a.rank - b.rank)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

  getQuestions(): Observable<Statement[]> {
    return this.questions$;
  }
}
