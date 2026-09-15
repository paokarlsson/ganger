/**
 * Resultatskärmen, som en transformation.
 *
 * Skilt från komponenten så att det går att pröva utan en vy: rundans svar in,
 * det som ska stå på skärmen ut. Samma princip som `heatmap/heatmap-grid.ts` —
 * reglerna i en modul, vyn bara visar dem.
 */
import { timeColor } from '../services/time-color';
import { mean } from '../shared/statistics';

/** Ett besvarat tal i rundan. */
export interface Answer {
  a: number;
  b: number;
  correct: boolean;
  /** Svarstiden med straffet inräknat — det är den som mäts och sparas. */
  timeMs: number;
  penalty: number;
  userAnswer: number;
  correctAnswer: number;
}

/** En rad i uppdelningen: talet, tiden och färgen tiden förtjänar. */
export interface BreakdownRow {
  text: string;
  time: string;
  penalty: string;
  color: string;
}

export interface RoundResult {
  title: string;
  /** Rätt av besvarade, som `7/10`. */
  correct: string;
  avgTime: string;
  bestTime: string;
  breakdown: BreakdownRow[];
}

/**
 * Snittet och bästa tiden räknas bara på de rätta svaren. Ett fel svar bär
 * straffet i sin tid, och att låta det dra upp snittet vore att mäta samma
 * miss två gånger — den syns redan som ett kryss och en röd rad.
 */
export function buildRoundResult(
  answers: readonly Answer[],
  thresholds: { fast: number; slow: number },
  aborted: boolean,
): RoundResult {
  const correctTimes = answers.filter((answer) => answer.correct).map((answer) => answer.timeMs);
  // Utan ett enda rätt svar finns ingen tid att visa. Noll är det skärmen sagt
  // sedan tidigare, och ett streck där vore en egen fråga.
  const average = mean(correctTimes) ?? 0;
  const best = correctTimes.length ? Math.min(...correctTimes) : 0;

  return {
    title: aborted ? 'Avbrutet' : 'Rundan klar!',
    correct: `${correctTimes.length}/${answers.length}`,
    avgTime: seconds(average / 1000),
    bestTime: seconds(best / 1000),
    breakdown: answers.map((answer) => breakdownRow(answer, thresholds)),
  };
}

function breakdownRow(answer: Answer, thresholds: { fast: number; slow: number }): BreakdownRow {
  const shown = answer.correct
    ? answer.correctAnswer
    : `${answer.userAnswer} (${answer.correctAnswer})`;
  const timeSec = answer.timeMs / 1000;
  return {
    text: `${answer.correct ? '✓' : '✗'} ${answer.a} × ${answer.b} = ${shown}`,
    time: seconds(timeSec),
    penalty: answer.penalty ? ` (+${answer.penalty}s)` : '',
    // Grönt upp till den kalibrerade tiden, sedan gult mot rött. Värmekartan
    // färgar sig själv med samma skala.
    color: timeColor(timeSec, thresholds.fast, thresholds.slow),
  };
}

function seconds(value: number): string {
  return value.toFixed(1) + 's';
}
