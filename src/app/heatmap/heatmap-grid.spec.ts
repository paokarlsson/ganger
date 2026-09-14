import { afterEach, describe, expect, it } from 'vitest';
import { FACTS } from '../facts/fact-catalog';
import { disposeEngines, freshEngine } from '../testing/engine';
import { buildHeatRows } from './heatmap-grid';

/** Alla rutor i rutnätet, radvis. */
function cells(rows: ReturnType<typeof buildHeatRows>) {
  return rows.flatMap((row) => row.cells);
}

describe('buildHeatRows', () => {
  afterEach(disposeEngines);

  it('ger tabellens 55 tal, var och ett en gång', async () => {
    const rows = buildHeatRows(await freshEngine(), 'typed');
    const shown = cells(rows).filter((cell) => !cell.mirrored);

    expect(shown.length).toBe(FACTS.length);
    expect(shown.length).toBe(55);
  });

  it('lägger talen ovanför diagonalen och speglar resten', async () => {
    // Raden är den mindre faktorn. Rutan för 8 × 7 finns alltså inte — den
    // står som 7 × 8 på andra sidan.
    const rows = buildHeatRows(await freshEngine(), 'typed');

    expect(rows[6].cells[7].mirrored).toBe(false); // rad 7, kolumn 8
    expect(rows[7].cells[6].mirrored).toBe(true); // rad 8, kolumn 7
  });

  it('är 10 × 10 rutor stort, med hela tabellen som rubriker', async () => {
    const rows = buildHeatRows(await freshEngine(), 'typed');

    expect(rows.map((row) => row.label)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows.every((row) => row.cells.length === 10)).toBe(true);
  });

  it('märker ett otränat tal som otestat i stället för som långsamt', async () => {
    const rows = buildHeatRows(await freshEngine(), 'typed');
    const cell = rows[6].cells[7];

    // En ruta utan mätning är inte en punkt på skalan utan ett tomrum.
    expect(cell.untested).toBe(true);
    expect(cell.color).toBe('');
    expect(cell.text).toBe('—');
  });

  it('visar snittiden för ett övat tal', async () => {
    const trained = await freshEngine();
    trained.record(7, 8, true, 1500);
    trained.record(7, 8, true, 2500);

    const cell = buildHeatRows(trained, 'typed')[6].cells[7];

    expect(cell.untested).toBe(false);
    expect(cell.text).toBe('2.0');
    expect(cell.color).not.toBe('');
    expect(cell.title).toContain('7 × 8 = 56');
    expect(cell.title).toContain('Försök: 2');
  });

  it('hittar talet oavsett vilken väg det övades', async () => {
    const trained = await freshEngine();
    trained.record(8, 7, true, 1500);

    expect(buildHeatRows(trained, 'typed')[6].cells[7].untested).toBe(false);
  });

  describe('kanalerna', () => {
    it('visar olika mätningar för samma tal', async () => {
      const trained = await freshEngine();
      trained.record(7, 8, true, 3000);
      trained.record(7, 8, true, 900, 'swipe');

      expect(buildHeatRows(trained, 'typed')[6].cells[7].text).toBe('3.0');
      expect(buildHeatRows(trained, 'swipe')[6].cells[7].text).toBe('0.9');
    });

    it('lämnar den kanal som inte övats otestad', async () => {
      const trained = await freshEngine();
      trained.record(7, 8, true, 3000);

      expect(buildHeatRows(trained, 'swipe')[6].cells[7].untested).toBe(true);
      expect(buildHeatRows(trained, 'swipe')[6].cells[7].title).toContain('ej svept');
      expect(buildHeatRows(trained, 'typed')[6].cells[7].title).not.toContain('ej svept');
    });

    it('färgar varje kanal mot sin egen tröskel', async () => {
      // Det här är hela skälet till att kanalen är en växel och inte en
      // gemensam skala. 1,2 s är segt att skriva men snabbt att svepa, och
      // ska se ut som två olika saker.
      const trained = await freshEngine();
      trained.calibrate([800, 800, 800]);
      for (let i = 0; i < 5; i++) {
        trained.recordSwipeBaseline(1.0);
      }
      trained.record(7, 8, true, 1200);
      trained.record(7, 8, true, 1200, 'swipe');

      const typed = buildHeatRows(trained, 'typed')[6].cells[7];
      const swiped = buildHeatRows(trained, 'swipe')[6].cells[7];

      expect(typed.text).toBe(swiped.text);
      expect(typed.color).not.toBe(swiped.color);
    });
  });
});
