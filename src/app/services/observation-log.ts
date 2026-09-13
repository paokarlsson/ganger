/**
 * Råa händelser från träningen.
 *
 * Det här är mätning, inte pedagogi. Ingenting i spelet läser loggen ännu och
 * ingenting väljs utifrån den — den finns för att svara på frågor som inte går
 * att svara på utan data, och den viktigaste är: *säger Para ihops tider något
 * om samma tal i Svep?* Om de inte korrelerar är premissen att Para ihop
 * duger som diagnostik fel, och det är bättre att veta det innan en motor
 * byggs ovanpå måttet.
 *
 * Loggen ligger under en egen nyckel, skild från framstegsdokumentet.
 * `TrainingEngine` serialiserar hela sitt dokument vid varje kort och
 * har redan fått en fördröjning för att det blev för dyrt; händelserna i samma
 * dokument hade gjort den skrivningen dyrare för varje rond.
 *
 * Ringbufferten är avsiktligt kort. Det aggregerade tillståndet är det som ska
 * leva; de råa händelserna är till för felsökning och för att kalibrera
 * konstanter, och då räcker de senaste.
 */
import { Injectable } from '@angular/core';

export const OBSERVATIONS_KEY = 'ganger-observations';
export const OBSERVATIONS_SCHEMA_VERSION = 1;

/** Hur många händelser som sparas. Äldre faller ur i andra änden. */
export const MAX_OBSERVATIONS = 200;

/** Vilket spel händelsen kommer ur. Svep och Mästaren skriver ännu inte hit. */
export type ObservationSource = 'match';

/**
 * Ett par som löstes i Para ihop.
 *
 * Tre nollpunkter mäts, inte en, för det finns inget självklart svar på när en
 * uppgift *börjar* i ett spel där fem par ligger framme samtidigt. Vilken av
 * dem som säger något om spelaren är en empirisk fråga, och att spara alla tre
 * är billigare än att gissa fel.
 */
export interface MatchPairObservation {
  source: 'match';
  kind: 'pair';
  /** `mul:7x8`, samma nyckel som framstegsdokumentet använder. */
  key: string;
  /** Om paret satt utan en enda felparning. */
  firstTry: boolean;
  /** Antal felparningar innan det satt. */
  attempts: number;
  /** Från att rundan lades fram. Innehåller allt letande på brädet. */
  msSinceRoundStart: number;
  /** Från att föregående par löstes. */
  msSinceLastResolved: number;
  /** Från första klicket i den här växlingen. `null` om det inte gick att mäta. */
  msSinceFirstTouch: number | null;
  /** Hur många par som redan var lösta när det här löstes. */
  resolvedBefore: number;
  /**
   * Hur många par som stod kvar på brädet, det här inräknat. Måttet på hur
   * stort uteslutningsrummet var: vid 1 är paret gratis, och det är den
   * siffran en framtida tröskel ska sättas på i stället för på känsla.
   */
  remaining: number;
  /** Om spelaren började i frågespalten eller i svarsspalten. */
  startedFrom: 'question' | 'answer';
  /** Om talet visades med den större faktorn först. */
  flipped: boolean;
  at: number;
}

/**
 * En felparning. Den säger något om *två* tal, inte ett, och vilket svar som
 * kopplades fel är samma sorts information som `distractors.ts` bygger falska
 * kort av: paras 7 × 8 konsekvent med 54 är det ett mönster, inte brus.
 */
export interface MatchMispairObservation {
  source: 'match';
  kind: 'mispair';
  /** Talet i frågespalten. */
  key: string;
  /** Talet vars svar kopplades dit. */
  pairedWith: string;
  /** Svaret som valdes. */
  chosenAnswer: number;
  msSinceRoundStart: number;
  resolvedBefore: number;
  remaining: number;
  at: number;
}

export type Observation = MatchPairObservation | MatchMispairObservation;

interface ObservationDocument {
  schemaVersion: number;
  observations: Observation[];
}

/** Hur länge händelser får samlas på hög innan de skrivs ned. */
const WRITE_DELAY = 1000;

@Injectable({ providedIn: 'root' })
export class ObservationLog {
  private observations: Observation[] = [];
  private writeTimer?: ReturnType<typeof setTimeout>;
  private dirty = false;

  constructor() {
    if (typeof addEventListener === 'function') {
      addEventListener('pagehide', () => this.flush());
      addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flush();
        }
      });
    }
  }

  /** Läser in loggen. Anropas en gång vid uppstart, se `app.config.ts`. */
  async hydrate(): Promise<void> {
    this.observations = this.read();
  }

  append(observation: Observation): void {
    this.observations.push(observation);
    if (this.observations.length > MAX_OBSERVATIONS) {
      this.observations.splice(0, this.observations.length - MAX_OBSERVATIONS);
    }
    this.dirty = true;
    this.writeTimer ??= setTimeout(() => this.flush(), WRITE_DELAY);
  }

  /** Äldst först. */
  all(): readonly Observation[] {
    return this.observations;
  }

  flush(): void {
    clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    const document: ObservationDocument = {
      schemaVersion: OBSERVATIONS_SCHEMA_VERSION,
      observations: this.observations,
    };
    try {
      localStorage.setItem(OBSERVATIONS_KEY, JSON.stringify(document));
    } catch {
      // Loggen får leva kvar i minnet under sessionen. Se progress-store.ts.
    }
  }

  clear(): void {
    clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    this.dirty = false;
    this.observations = [];
    try {
      localStorage.removeItem(OBSERVATIONS_KEY);
    } catch {
      // Se flush().
    }
  }

  private read(): Observation[] {
    let raw: string | null;
    try {
      raw = localStorage.getItem(OBSERVATIONS_KEY);
    } catch {
      return [];
    }
    if (raw === null) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        return [];
      }
      const observations = (parsed as { observations?: unknown }).observations;
      if (!Array.isArray(observations)) {
        return [];
      }
      // Loggen är felsökningsdata. Att en post ser konstig ut är inte värt att
      // krascha uppstarten för, men den ska inte heller tas för en händelse.
      return observations
        .filter((item): item is Observation => isObservation(item))
        .slice(-MAX_OBSERVATIONS);
    } catch {
      return [];
    }
  }
}

function isObservation(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { source?: unknown; kind?: unknown; key?: unknown };
  return (
    candidate.source === 'match' &&
    (candidate.kind === 'pair' || candidate.kind === 'mispair') &&
    typeof candidate.key === 'string'
  );
}
