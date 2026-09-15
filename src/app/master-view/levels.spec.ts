import { describe, expect, it } from 'vitest';
import { DIFFICULTY, LEVELS, Pair, buildRound } from './levels';

/** Talen i ronden som text, så att de går att jämföra som mängd. */
function keys(round: readonly Pair[]): string[] {
  return round.map(([a, b]) => `${a}x${b}`);
}

describe('buildRound', () => {
  it('lägger fram hela ronden på en fast nivå', () => {
    for (const count of [10, 20, 30]) {
      expect(buildRound(3, count, 'medium').length).toBe(count);
    }
  });

  it('ger bara det första talet i auto-läget', () => {
    // Resten väljs utifrån hur det går, så de kan inte bestämmas på förhand.
    expect(buildRound('auto', 30, 'easy').length).toBe(1);
  });

  it('öppnar auto-ronden med ett tal ur den givna gruppen', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const [pair] = buildRound('auto', 10, difficulty);
      expect(keys(DIFFICULTY[difficulty])).toContain(keys([pair])[0]);
    }
  });

  it('håller sig till nivåns tabeller', () => {
    const round = buildRound(9, 30, 'medium');

    // Nivå 9 är sjuans tabell: varje tal ska ha en sjua i sig.
    expect(LEVELS[9]).toEqual([7]);
    for (const [a, b] of round) {
      expect(a === 7 || b === 7).toBe(true);
      expect(Math.max(a, b)).toBeLessThanOrEqual(10);
    }
  });

  it('tar med båda ordningarna av ett tal', () => {
    // 4 × 7 och 7 × 4 är samma kunskap men inte samma fråga att möta.
    const round = keys(buildRound(9, 30, 'medium'));

    expect(round).toContain('7x4');
    expect(round).toContain('4x7');
  });

  it('fyller på när tabellen är mindre än ronden', () => {
    // En enskild tabell ger 19 tal. En rond på 30 ska inte ta slut i förtid.
    const round = buildRound(9, 30, 'medium');

    expect(round.length).toBe(30);
    expect(new Set(keys(round)).size).toBe(19);
  });

  it('upprepar inte i onödan när tabellen räcker', () => {
    const round = buildRound(9, 10, 'medium');

    expect(new Set(keys(round)).size).toBe(10);
  });

  it('drar den blandade nivån ur hela tabellen', () => {
    const round = buildRound(11, 30, 'medium');

    expect(round.length).toBe(30);
    for (const [a, b] of round) {
      expect(Math.max(a, b)).toBeLessThanOrEqual(10);
    }
  });

  it('lägger varje tal två gånger i den blandade nivåns påse', () => {
    // Nivån är tio tabeller, och ett tal som 3 × 7 hör till två av dem — det
    // hamnar i påsen en gång per tabell. Följden är att en rond kan ställa
    // samma fråga två gånger fast hundra tal finns att välja bland.
    //
    // Det här är hur spelet alltid har fungerat, inte ett beslut som tagits
    // här. Testet fäster beteendet så att en ändring av det blir avsiktlig.
    // 190 frågor är påsen exakt en gång: tio tabeller × tio tal, plus den
    // omvända ordningen för alla utom de tio kvadraterna.
    const round = keys(buildRound(11, 190, 'medium'));
    const counts = new Map<string, number>();
    for (const key of round) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    expect(counts.size).toBe(100);
    // Kvadraterna hör bara till en tabell och ligger en gång; 3 × 7 hör till
    // både treans och sjuans och ligger två.
    expect(counts.get('3x3')).toBe(1);
    expect(counts.get('3x7')).toBe(2);
    expect(counts.get('7x3')).toBe(2);
  });

  it('blandar ronden, så att två ronder inte kommer i samma ordning', () => {
    const one = keys(buildRound(11, 30, 'medium'));
    const other = keys(buildRound(11, 30, 'medium'));

    expect(one).not.toEqual(other);
  });
});
