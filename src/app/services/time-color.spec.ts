import { describe, expect, it } from 'vitest';
import { timeColor } from './time-color';

/** Nyansen ur en hsl-sträng: 140 är grönt, 50 gult, 0 rött. */
function hue(color: string): number {
  return Number.parseFloat(color.slice(color.indexOf('(') + 1));
}

describe('timeColor', () => {
  it('ger grönt åt allt som är snabbt nog', () => {
    expect(timeColor(0.5, 2, 8)).toBe(timeColor(2, 2, 8));
    expect(hue(timeColor(2, 2, 8))).toBe(140);
  });

  it('går från gult mot rött mellan gränserna', () => {
    const warm = hue(timeColor(3, 2, 8));
    const hot = hue(timeColor(6, 2, 8));

    expect(warm).toBeLessThan(140);
    expect(hot).toBeLessThan(warm);
    expect(hue(timeColor(8, 2, 8))).toBe(0);
  });

  it('stannar på rött bortom den långsamma tiden', () => {
    expect(hue(timeColor(60, 2, 8))).toBe(0);
  });

  it('ger samma färg åt samma läge på skalan, oavsett spel', () => {
    // Ett svep och ett skrivet svar mäts mot olika gränser. Halvvägs ska
    // ändå se likadant ut, annars betyder en gul ruta inte samma sak.
    expect(timeColor(5, 2, 8)).toBe(timeColor(1.95, 1.3, 2.6));
  });

  it('klarar gränser som fallit ihop', () => {
    expect(() => timeColor(3, 2, 2)).not.toThrow();
    expect(hue(timeColor(3, 2, 2))).toBe(0);
  });
});
