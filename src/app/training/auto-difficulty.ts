/**
 * Mästarens auto-läge: hur svårighetsgruppen rör sig med hur det går.
 *
 * Ren funktion, som `nextLevel()` i Svep. Rondens räknare är ett värde som
 * skickas in och kommer ut igen, i stället för tre fält på komponenten — det
 * är samma princip som resten av pedagogiken: gammalt tillstånd plus ny
 * händelse ger nytt tillstånd.
 */
import { DOWNGRADE_THRESHOLD, Difficulty, UPGRADE_THRESHOLD } from '../master-view/levels';

/** Grupperna i ordning, så att ett steg upp eller ned är ett index. */
const LADDER: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export interface AutoDifficultyState {
  difficulty: Difficulty;
  /** Snabba rätt i rad, respektive långsamma eller felaktiga svar i rad. */
  consecutiveFast: number;
  consecutiveSlow: number;
}

/** Vad ett svar var värt, mätt mot spelarens egna trösklar. */
export interface AnswerPace {
  correct: boolean;
  timeSec: number;
  fastSeconds: number;
  slowSeconds: number;
}

export function initialAutoDifficulty(difficulty: Difficulty): AutoDifficultyState {
  return { difficulty, consecutiveFast: 0, consecutiveSlow: 0 };
}

/**
 * Svårigheten stiger först vid ihållande snabbhet, men sjunker snabbt. Ett
 * svar däremellan bryter inte räckan, men räknar ned den: det ska inte gå att
 * samla på sig en uppflyttning över en hel rond av nästan-snabba svar.
 */
export function nextAutoDifficulty(
  state: AutoDifficultyState,
  { correct, timeSec, fastSeconds, slowSeconds }: AnswerPace,
): AutoDifficultyState {
  if (correct && timeSec <= fastSeconds) {
    const consecutiveFast = state.consecutiveFast + 1;
    const moved = consecutiveFast >= UPGRADE_THRESHOLD ? step(state.difficulty, 1) : null;
    if (moved !== null) {
      return initialAutoDifficulty(moved);
    }
    // Står gruppen redan i taket fortsätter räckan att växa. Den är också det
    // hejaropet i toppraden räknar, och ska inte nollställas av ett steg som
    // inte gick att ta.
    return { difficulty: state.difficulty, consecutiveFast, consecutiveSlow: 0 };
  }

  if (!correct || timeSec > slowSeconds) {
    const consecutiveSlow = state.consecutiveSlow + 1;
    const moved = consecutiveSlow >= DOWNGRADE_THRESHOLD ? step(state.difficulty, -1) : null;
    if (moved !== null) {
      return initialAutoDifficulty(moved);
    }
    return { difficulty: state.difficulty, consecutiveFast: 0, consecutiveSlow };
  }

  // Mittemellan: räckan bryts inte, men den räknas ner.
  return {
    difficulty: state.difficulty,
    consecutiveFast: Math.max(0, state.consecutiveFast - 1),
    consecutiveSlow: state.consecutiveSlow,
  };
}

/** Gruppen ett steg bort, eller `null` när skalan tar slut åt det hållet. */
function step(difficulty: Difficulty, direction: 1 | -1): Difficulty | null {
  const next = LADDER.indexOf(difficulty) + direction;
  return next < 0 || next >= LADDER.length ? null : LADDER[next];
}
