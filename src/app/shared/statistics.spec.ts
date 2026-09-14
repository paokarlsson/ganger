import { describe, expect, it } from 'vitest';
import { mean, median } from './statistics';

describe('median', () => {
  it('tar mitten för udda antal och snittet av de två mittersta för jämnt', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('lämnar anroparens lista osorterad', () => {
    const values = [3, 1, 2];
    median(values);

    expect(values).toEqual([3, 1, 2]);
  });

  it('ger null för tomt', () => {
    expect(median([])).toBeNull();
  });
});

describe('mean', () => {
  it('räknar snittet', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it('ger null för tomt, inte NaN', () => {
    expect(mean([])).toBeNull();
  });
});
