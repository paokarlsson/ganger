import { describe, expect, it } from 'vitest';
import { shuffle } from './random';

describe('shuffle', () => {
  it('lämnar anroparens lista orörd', () => {
    const original = [1, 2, 3, 4, 5];
    shuffle(original);

    expect(original).toEqual([1, 2, 3, 4, 5]);
  });

  it('behåller alla element', () => {
    const shuffled = shuffle([1, 2, 3, 4, 5]);

    expect([...shuffled].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('går att köra deterministiskt med en egen rng', () => {
    // Samma rng, samma ordning — det är hela poängen med parametern.
    const constantRng = () => 0;

    expect(shuffle(['a', 'b', 'c'], constantRng)).toEqual(shuffle(['a', 'b', 'c'], constantRng));
  });
});
