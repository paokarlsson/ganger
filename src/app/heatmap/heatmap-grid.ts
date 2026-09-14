/**
 * Rutnätet bakom värmekartan.
 *
 * Skilt från komponenten så att det går att pröva utan en vy: det är en
 * datatransformation och inte ett utseende. Samma princip som resten av
 * pedagogiken — reglerna i en modul, vyn bara visar dem.
 */
import { MAX_FACTOR, MIN_FACTOR } from '../facts/fact-catalog';
import { ChannelStat } from '../services/progress-store';
import { timeColor } from '../services/time-color';
import { Channel, Thresholds } from '../training/training-engine';

export interface HeatCell {
  text: string;
  /** Tom för en ruta utan mätning — den färgas av `--untested` i stället. */
  color: string;
  title: string;
  /** Under diagonalen: talet står redan på andra sidan. */
  mirrored: boolean;
  /** Talet finns i rutnätet men är inte övat i den här kanalen. */
  untested: boolean;
}

export interface HeatRow {
  label: number;
  cells: HeatCell[];
}

/** Det rutnätet behöver veta om spelaren. `TrainingEngine` uppfyller det. */
export interface HeatSource {
  statFor(a: number, b: number, channel: Channel): ChannelStat | undefined;
  averageSeconds(stat: ChannelStat | undefined): number | null;
  thresholdsFor(channel: Channel): Thresholds;
}

/**
 * Ett rutnät över tabellens 55 tal.
 *
 * Raden är den mindre faktorn och kolumnen den större, så varje tal står
 * precis en gång och den nedre halvan är tom: 7 × 8 och 8 × 7 är samma
 * kunskap och en enda rad i lagret.
 *
 * Färgen mäts mot den valda kanalens *egen* tröskel. Ett svep är igenkänning
 * och går systematiskt snabbare än ett skrivet svar, så en gemensam skala
 * hade fått halva tabellen att se behärskad ut på fel grund.
 */
export function buildHeatRows(source: HeatSource, channel: Channel): HeatRow[] {
  const { fast, slow } = source.thresholdsFor(channel);
  const rows: HeatRow[] = [];

  for (let row = MIN_FACTOR; row <= MAX_FACTOR; row++) {
    const cells: HeatCell[] = [];
    for (let col = MIN_FACTOR; col <= MAX_FACTOR; col++) {
      cells.push(col < row ? mirrored() : cell(source, channel, row, col, fast, slow));
    }
    rows.push({ label: row, cells });
  }
  return rows;
}

function cell(
  source: HeatSource,
  channel: Channel,
  row: number,
  col: number,
  fast: number,
  slow: number,
): HeatCell {
  const stat = source.statFor(row, col, channel);
  const average = source.averageSeconds(stat);
  if (!stat || average === null) {
    return {
      text: '—',
      color: '',
      title: `${row} × ${col}: ${channel === 'swipe' ? 'ej svept' : 'ej testad'}`,
      mirrored: false,
      untested: true,
    };
  }
  return {
    text: average.toFixed(1),
    color: timeColor(average, fast, slow),
    title: title(row, col, stat, average),
    mirrored: false,
    untested: false,
  };
}

function mirrored(): HeatCell {
  return { text: '', color: '', title: '', mirrored: true, untested: false };
}

function title(row: number, col: number, stat: ChannelStat, average: number): string {
  const accuracy = stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0;
  return [
    `${row} × ${col} = ${row * col}`,
    `Snitt (senaste ${stat.times.length}): ${average.toFixed(1)}s`,
    `Rätt: ${accuracy}%`,
    `Försök: ${stat.total}`,
  ].join('\n');
}
