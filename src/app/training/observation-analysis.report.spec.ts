/**
 * Kör analysen över en riktig export och skriver rapporten.
 *
 * Inte ett test av spelet utan ett verktyg som råkar bo i testkörningen. Skälet
 * är att det inte kostar ett enda beroende: `npm test` finns redan, kan redan
 * TypeScript, och rapporten hamnar i utskriften.
 *
 * Så här används den:
 *
 *   1. Öppna Mästarens värmekarta på enheten som övats på, tryck
 *      **Exportera data**.
 *   2. Klistra in i `tools/observations.json` (filen är ignorerad av git —
 *      det är ett barns övningsdata och hör inte hemma i ett publikt repo).
 *   3. `npm test`
 *
 * Rapporten hamnar i `tools/observations-report.txt`. Den skrivs till fil och
 * inte bara till utskriften eftersom Angulars testkörare sväljer `console.log`.
 *
 * Utan exporten hoppas allt över, tyst så när som på en rad om var den ska
 * ligga.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Observation } from '../services/observation-log';
import { ProgressDocument, emptyDocument } from '../services/progress-store';
import { analyseObservations, formatReport } from './observation-analysis';

// Från projektroten och inte från den här filen: Angular kompilerar specarna
// till en temporär katalog, så `import.meta.url` pekar inte på källträdet.
const EXPORT_PATH = resolve(process.cwd(), 'tools/observations.json');
const REPORT_PATH = resolve(process.cwd(), 'tools/observations-report.txt');

interface ExportFile {
  progress?: { facts?: unknown } | null;
  observations?: { observations?: unknown } | null;
}

describe('rapport från en riktig export', () => {
  if (!existsSync(EXPORT_PATH)) {
    it.skip('ingen export i tools/observations.json — se filhuvudet', () => {});
    return;
  }

  it('läser exporten och skriver rapporten', () => {
    const file = JSON.parse(readFileSync(EXPORT_PATH, 'utf8')) as ExportFile;

    const observations = (file.observations?.observations ?? []) as Observation[];
    const progress = (file.progress ?? emptyDocument()) as ProgressDocument;
    if (!progress.facts) {
      progress.facts = {};
    }

    const report = analyseObservations(observations, progress);
    const text = formatReport(report);
    writeFileSync(REPORT_PATH, text + '\n', 'utf8');
    console.log('\n' + text + '\n');

    // Rapporten ska ha något att säga; en tom export är nästan säkert en
    // felaktig inklistring och inte ett tyst svar.
    expect(report.observations).toBeGreaterThan(0);
  });
});
