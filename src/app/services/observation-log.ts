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
 * Ringbufferten är fortfarande en ringbuffert: det aggregerade tillståndet är
 * det som ska leva, och de råa händelserna är till för felsökning och för att
 * kalibrera konstanter. Men taket är satt av vad kalibreringen behöver läsa,
 * inte av vad som råkar kännas lagom — se `MAX_OBSERVATIONS`.
 */
import { Injectable } from '@angular/core';

export const OBSERVATIONS_KEY = 'ganger-observations';
export const OBSERVATIONS_SCHEMA_VERSION = 1;

/**
 * Hur många händelser som sparas. Äldre faller ur i andra änden.
 *
 * Taket är räknat baklänges från rapporten i `observation-analysis.ts`, inte
 * satt på känsla. En rond i Para ihop är fem par, och bara de par som löstes
 * med minst `MIN_REMAINING = 3` kvar på brädet räknas som evidens — tre av fem
 * par per rond. Ska vart och ett av tabellens 55 tal nå omkring fem
 * evidenspar krävs `55 × 5 / 0,6 ≈ 460` lösta par, alltså runt nittio ronder;
 * med felparningar inräknat ungefär 600 händelser. Urvalet är slumpmässigt och
 * därmed ojämnt, så det taket måste tas med marginal för att *de flesta* tal
 * ska hinna dit och inte bara medeltalet.
 *
 * 2000 är den marginalen: drygt tre gånger det minsta användbara stickprovet,
 * och plats för flera sittningar innan någon kommer ihåg att exportera.
 *
 * Det tidigare taket, 200, rymde inte ens en fjärdedel av en enda mätning. Det
 * var den bindande gränsen för steg 4 i docs/plan.md — inte att exporten görs
 * för hand.
 *
 * Priset är skrivningen: 2000 händelser är omkring 460 kB att serialisera, mot
 * 46 kB förut. Det är därför `WRITE_DELAY` höjdes i samma veva.
 */
export const MAX_OBSERVATIONS = 2000;

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

/**
 * Hur länge händelser får samlas på hög innan de skrivs ned.
 *
 * Hela loggen serialiseras om vid varje skrivning, så kostnaden följer taket.
 * Vid en sekund blev det i praktiken en skrivning per löst par; vid fem blir
 * det ungefär en per rond, vilket är vad en surfplatta ska behöva göra med ett
 * halvt megabyte JSON.
 *
 * Det som riskeras är de senaste sekundernas händelser om fliken dödas rakt
 * av. `pagehide` och `visibilitychange` fångar de vanliga vägarna ut, och det
 * här är felsökningsdata — några par är ett pris värt att betala för att
 * spelet inte ska hacka mitt i en rond.
 */
const WRITE_DELAY = 5000;

/**
 * Hur få händelser det får bli innan lagringen ges upp helt.
 *
 * Nekas skrivningen trappas det som sparas ned i stället för att loggen tyst
 * slutar bli sparad — men under hundra händelser är det lagrade för tunt för
 * att bära en mätning, och då är det ärligare att låta loggen leva i minnet
 * sessionen ut än att skriva ett halvt megabyte som ändå inte svarar på något.
 */
const MIN_STORAGE_LIMIT = 100;

@Injectable({ providedIn: 'root' })
export class ObservationLog {
  private observations: Observation[] = [];
  private writeTimer?: ReturnType<typeof setTimeout>;
  private dirty = false;
  /**
   * Hur många händelser som får plats i lagret. Börjar på taket och trappas
   * ned av `flush()` när skrivningen nekas. Minnet behåller alltid allt —
   * det här är bara vad som ryms på disk.
   */
  private storageLimit = MAX_OBSERVATIONS;

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

    // Nekad skrivning är nästan alltid full kvot, och med ett tak på 2000 är
    // det ett rimligt utfall och inte ett undantag. Att bara svälja felet vore
    // att låta loggen sluta sparas utan att säga något — den halveras hellre
    // och sparar de nyaste, eftersom en kortare logg är en mätning och ingen
    // logg alls inte är det.
    while (this.storageLimit > 0) {
      if (this.write(this.observations.slice(-this.storageLimit))) {
        return;
      }
      const halved = Math.floor(this.storageLimit / 2);
      this.storageLimit = halved >= MIN_STORAGE_LIMIT ? halved : 0;
    }
    // Loggen får leva kvar i minnet under sessionen. Se progress-store.ts.
  }

  clear(): void {
    clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    this.dirty = false;
    this.observations = [];
    // Kvoten kan mycket väl ha frigjorts av just den här rensningen.
    this.storageLimit = MAX_OBSERVATIONS;
    try {
      localStorage.removeItem(OBSERVATIONS_KEY);
    } catch {
      // Se flush().
    }
  }

  private write(observations: Observation[]): boolean {
    const document: ObservationDocument = {
      schemaVersion: OBSERVATIONS_SCHEMA_VERSION,
      observations,
    };
    try {
      localStorage.setItem(OBSERVATIONS_KEY, JSON.stringify(document));
      return true;
    } catch {
      return false;
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
