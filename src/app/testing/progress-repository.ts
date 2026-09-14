/**
 * Framstegen i minnet, för testerna.
 *
 * Det här är vad `TrainingEngine.useRepository()` finns för. En spec om
 * pedagogik ska kunna säga vad spelaren gjort utan att känna till vare sig
 * nyckelnamn eller JSON — den som testar själva lagringsformatet, alltså
 * migreringen från version 1, går fortfarande den riktiga vägen genom
 * `localStorage`.
 *
 * Dokumentet serialiseras på väg in och ut precis som lagret gör, så att två
 * motorer på samma lagring inte råkar dela objekt och därmed dölja att något
 * aldrig skrevs.
 */
import { ProgressDocument, ProgressRepository, emptyDocument } from '../services/progress-store';

export class InMemoryProgressRepository implements ProgressRepository {
  private document: ProgressDocument = emptyDocument();

  /** Antal skrivningar. Att den fördröjda skrivaren verkligen skriver går inte
   *  att se någon annanstans. */
  saves = 0;

  async load(): Promise<ProgressDocument> {
    return copy(this.document);
  }

  async save(document: ProgressDocument): Promise<void> {
    this.saves += 1;
    this.document = copy(document);
  }

  async clear(): Promise<void> {
    this.document = emptyDocument();
  }
}

/**
 * En lagring som nekar varje skrivning.
 *
 * `local-store.ts` sväljer en full kvot och låter dokumentet leva i minnet
 * sessionen ut; en lagring bakom nätet kommer att kunna säga nej på fler sätt
 * än så. Det här är sättet att pröva att ronden går att spela klart ändå.
 */
export class RefusingProgressRepository implements ProgressRepository {
  async load(): Promise<ProgressDocument> {
    return emptyDocument();
  }

  async save(): Promise<void> {
    throw new Error('lagringen nekar skrivningar');
  }

  async clear(): Promise<void> {
    // Nollställningen når fram. Det är skrivningarna som nekas.
  }
}

function copy(document: ProgressDocument): ProgressDocument {
  return JSON.parse(JSON.stringify(document)) as ProgressDocument;
}
