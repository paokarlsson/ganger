/**
 * Får ut det spelet samlat, så att det går att läsa.
 *
 * Loggen och framstegen ligger i `localStorage` på den enhet som övats på, och
 * den enheten är en surfplatta utan utvecklarverktyg. Utan en väg ut är
 * observationsloggen data ingen kan läsa — se steg 4 i docs/plan.md.
 *
 * Exporten tar med *båda* nycklarna. Analysen ställer Para ihops tider mot
 * Svepets på samma tal, och svepen ligger i framstegsdokumentet; en export med
 * bara loggen kan inte besvara den frågan.
 */
import { Injectable } from '@angular/core';
import { readJson } from './local-store';
import { OBSERVATIONS_KEY } from './observation-log';
import { PROGRESS_KEY } from './progress-store';

export const EXPORT_VERSION = 1;

export interface ProgressExport {
  exportVersion: number;
  exportedAt: string;
  /** Råa dokument, precis som de ligger i lagret. `null` när inget finns. */
  progress: unknown;
  observations: unknown;
}

@Injectable({ providedIn: 'root' })
export class ProgressExportService {
  /** Om det finns något att exportera alls. */
  get hasSomethingToExport(): boolean {
    return readJson(PROGRESS_KEY) !== null || readJson(OBSERVATIONS_KEY) !== null;
  }

  build(): ProgressExport {
    return {
      exportVersion: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      progress: readJson(PROGRESS_KEY),
      observations: readJson(OBSERVATIONS_KEY),
    };
  }

  toJson(): string {
    return JSON.stringify(this.build(), null, 2);
  }

  /**
   * Lägger exporten där den går att komma åt. Urklippet först — på en
   * surfplatta är det den enda vägen som inte kräver en filhanterare — och en
   * nedladdning när urklippet nekas, vilket det gör utan säker anslutning och
   * i vissa inbäddade vyer.
   */
  async share(): Promise<'clipboard' | 'download'> {
    const json = this.toJson();
    try {
      await navigator.clipboard.writeText(json);
      return 'clipboard';
    } catch {
      this.download(json);
      return 'download';
    }
  }

  private download(json: string): void {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ganger-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
