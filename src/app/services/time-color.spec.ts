import { describe, expect, it } from 'vitest';
import { timeColor } from './time-color';

/** Nyansen ur en oklch-sträng, alltså tredje talet: 152 är grönt, 85
 *  bärnsten, 25 rött. */
function hue(color: string): number {
  const parts = color.slice(color.indexOf('(') + 1, color.indexOf(')')).split(/\s+/);
  return Number.parseFloat(parts[2]);
}

/** Ljusheten, alltså första talet. Den ska stå stilla över hela rampen — det
 *  är vad som gör att ett steg väger lika mycket var på skalan det än ligger,
 *  och att siffran i rutan är läsbar hela vägen. */
function lightness(color: string): number {
  return Number.parseFloat(color.slice(color.indexOf('(') + 1));
}

describe('timeColor', () => {
  it('ger grönt åt allt som är snabbt nog', () => {
    expect(timeColor(0.5, 2, 8)).toBe(timeColor(2, 2, 8));
    expect(hue(timeColor(2, 2, 8))).toBe(152);
  });

  it('går från bärnsten mot rött mellan gränserna', () => {
    const warm = hue(timeColor(3, 2, 8));
    const hot = hue(timeColor(6, 2, 8));

    expect(warm).toBeLessThan(85);
    expect(hot).toBeLessThan(warm);
    expect(hue(timeColor(8, 2, 8))).toBe(25);
  });

  it('stannar på rött bortom den långsamma tiden', () => {
    expect(hue(timeColor(60, 2, 8))).toBe(25);
  });

  it('håller samma ljushet hela vägen', () => {
    const steg = [2, 3, 4, 5, 6, 7, 8, 60].map((s) => lightness(timeColor(s, 2, 8)));
    expect(new Set(steg).size).toBe(1);
  });

  it('ger samma färg åt samma läge på skalan, oavsett spel', () => {
    // Ett svep och ett skrivet svar mäts mot olika gränser. Halvvägs ska
    // ändå se likadant ut, annars betyder en gul ruta inte samma sak.
    expect(timeColor(5, 2, 8)).toBe(timeColor(1.95, 1.3, 2.6));
  });

  it('klarar gränser som fallit ihop', () => {
    expect(() => timeColor(3, 2, 2)).not.toThrow();
    expect(hue(timeColor(3, 2, 2))).toBe(25);
  });
});
