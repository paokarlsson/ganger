import { describe, expect, it } from 'vitest';
import { DOWNGRADE_THRESHOLD, Difficulty, UPGRADE_THRESHOLD } from '../master-view/levels';
import {
  AutoDifficultyState,
  initialAutoDifficulty,
  nextAutoDifficulty,
} from './auto-difficulty';

const FAST = 2;
const SLOW = 8;

function fast(state: AutoDifficultyState): AutoDifficultyState {
  return nextAutoDifficulty(state, {
    correct: true,
    timeSec: 1,
    fastSeconds: FAST,
    slowSeconds: SLOW,
  });
}

function middling(state: AutoDifficultyState): AutoDifficultyState {
  return nextAutoDifficulty(state, {
    correct: true,
    timeSec: 4,
    fastSeconds: FAST,
    slowSeconds: SLOW,
  });
}

function wrong(state: AutoDifficultyState): AutoDifficultyState {
  return nextAutoDifficulty(state, {
    correct: false,
    timeSec: 1,
    fastSeconds: FAST,
    slowSeconds: SLOW,
  });
}

function repeat(
  state: AutoDifficultyState,
  times: number,
  step: (s: AutoDifficultyState) => AutoDifficultyState,
): AutoDifficultyState {
  let current = state;
  for (let i = 0; i < times; i++) {
    current = step(current);
  }
  return current;
}

describe('nextAutoDifficulty', () => {
  it('flyttar upp efter en räcka snabba rätt', () => {
    const state = repeat(initialAutoDifficulty('easy'), UPGRADE_THRESHOLD, fast);

    expect(state.difficulty).toBe<Difficulty>('medium');
    expect(state.consecutiveFast).toBe(0);
  });

  it('flyttar ned betydligt fortare än den flyttar upp', () => {
    // Ett barn som kör fast ska inte behöva vänta fem frågor på hjälp.
    expect(DOWNGRADE_THRESHOLD).toBeLessThan(UPGRADE_THRESHOLD);

    const state = repeat(initialAutoDifficulty('hard'), DOWNGRADE_THRESHOLD, wrong);
    expect(state.difficulty).toBe<Difficulty>('medium');
  });

  it('räknar ned räckan på ett svar däremellan i stället för att bryta den', () => {
    const state = middling(repeat(initialAutoDifficulty('easy'), 3, fast));

    expect(state.consecutiveFast).toBe(2);
    expect(state.difficulty).toBe<Difficulty>('easy');
  });

  it('bryter räckan av snabba på ett fel, och tvärtom', () => {
    expect(wrong(repeat(initialAutoDifficulty('medium'), 3, fast)).consecutiveFast).toBe(0);
    expect(fast(wrong(initialAutoDifficulty('medium'))).consecutiveSlow).toBe(0);
  });

  it('låter räckan växa vidare när gruppen redan står i taket', () => {
    // Räckan är också det hejaropet i toppraden räknar. Den får inte
    // nollställas av ett steg som inte gick att ta.
    const state = repeat(initialAutoDifficulty('hard'), UPGRADE_THRESHOLD + 3, fast);

    expect(state.difficulty).toBe<Difficulty>('hard');
    expect(state.consecutiveFast).toBe(UPGRADE_THRESHOLD + 3);
  });

  it('stannar i golvet', () => {
    const state = repeat(initialAutoDifficulty('easy'), DOWNGRADE_THRESHOLD + 3, wrong);

    expect(state.difficulty).toBe<Difficulty>('easy');
  });

  it('tar ett steg i taget, aldrig två', () => {
    const state = repeat(initialAutoDifficulty('easy'), UPGRADE_THRESHOLD * 2, fast);

    expect(state.difficulty).toBe<Difficulty>('hard');
  });

  it('räknar ett segt rätt som ett motstånd', () => {
    const slow = (s: AutoDifficultyState) =>
      nextAutoDifficulty(s, { correct: true, timeSec: SLOW + 1, fastSeconds: FAST, slowSeconds: SLOW });
    const state = repeat(initialAutoDifficulty('hard'), DOWNGRADE_THRESHOLD, slow);

    expect(state.difficulty).toBe<Difficulty>('medium');
  });

  it('lämnar tillståndet den fick oförändrat', () => {
    const state = initialAutoDifficulty('easy');
    fast(state);

    expect(state).toEqual(initialAutoDifficulty('easy'));
  });
});
