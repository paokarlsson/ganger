import { describe, expect, it } from 'vitest';
import { Answer, buildRoundResult } from './round-result';

const THRESHOLDS = { fast: 2, slow: 8 };

function answer(overrides: Partial<Answer> = {}): Answer {
  return {
    a: 7,
    b: 8,
    correct: true,
    timeMs: 2000,
    penalty: 0,
    userAnswer: 56,
    correctAnswer: 56,
    ...overrides,
  };
}

/** Ett fel svar som det ser ut när det skrivits in: straffet ligger i tiden. */
function wrong(timeMs: number): Answer {
  return answer({ correct: false, timeMs, penalty: 4, userAnswer: 54 });
}

describe('buildRoundResult', () => {
  it('räknar snitt och bästa tid på bara de rätta svaren', () => {
    // Det felaktiga svaret bär straffet i sin tid. Att låta det dra upp
    // snittet vore att mäta samma miss två gånger.
    const result = buildRoundResult(
      [answer({ timeMs: 1000 }), answer({ timeMs: 3000 }), wrong(9000)],
      THRESHOLDS,
      false,
    );

    expect(result.correct).toBe('2/3');
    expect(result.avgTime).toBe('2.0s');
    expect(result.bestTime).toBe('1.0s');
  });

  it('säger noll när ingenting gick rätt', () => {
    const result = buildRoundResult([wrong(9000)], THRESHOLDS, false);

    expect(result.correct).toBe('0/1');
    expect(result.avgTime).toBe('0.0s');
    expect(result.bestTime).toBe('0.0s');
  });

  it('tål en runda utan svar alls', () => {
    const result = buildRoundResult([], THRESHOLDS, true);

    expect(result.correct).toBe('0/0');
    expect(result.breakdown).toEqual([]);
  });

  it('skiljer en avbruten runda från en klarad', () => {
    expect(buildRoundResult([], THRESHOLDS, true).title).toBe('Avbrutet');
    expect(buildRoundResult([], THRESHOLDS, false).title).toBe('Rundan klar!');
  });

  describe('uppdelningen', () => {
    it('visar talet och svaret för ett rätt svar', () => {
      const [row] = buildRoundResult([answer({ timeMs: 1500 })], THRESHOLDS, false).breakdown;

      expect(row.text).toBe('✓ 7 × 8 = 56');
      expect(row.time).toBe('1.5s');
      expect(row.penalty).toBe('');
    });

    it('visar både det skrivna och det rätta svaret för ett fel', () => {
      // Den som svarade 54 ska se vad hen skrev, inte bara facit.
      const [row] = buildRoundResult([wrong(9000)], THRESHOLDS, false).breakdown;

      expect(row.text).toBe('✗ 7 × 8 = 54 (56)');
      expect(row.penalty).toBe(' (+4s)');
    });

    it('färgar ett snabbt svar annorlunda än ett långsamt', () => {
      const rows = buildRoundResult(
        [answer({ timeMs: 1000 }), answer({ timeMs: 8000 })],
        THRESHOLDS,
        false,
      ).breakdown;

      expect(rows[0].color).not.toBe(rows[1].color);
    });

    it('har en rad per svar, i den ordning de gavs', () => {
      const rows = buildRoundResult(
        [
          answer({ a: 2, b: 3, correctAnswer: 6, userAnswer: 6 }),
          answer({ a: 4, b: 5, correctAnswer: 20, userAnswer: 20 }),
        ],
        THRESHOLDS,
        false,
      ).breakdown;

      expect(rows.map((row) => row.text)).toEqual(['✓ 2 × 3 = 6', '✓ 4 × 5 = 20']);
    });
  });
});
