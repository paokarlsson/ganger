/**
 * Läser observationsloggen.
 *
 * Loggen har samlat händelser sedan Para ihop instrumenterades, men ingenting
 * har läst dem. Det här är läsaren — steg 4 i docs/plan.md.
 *
 * Den är avsiktligt ingen del av spelet. Ingenting i `src/app` importerar den,
 * så den följer inte med i bygget; den körs av
 * `observation-analysis.report.spec.ts` över en export, och testas av
 * `observation-analysis.spec.ts` mot påhittade händelser.
 *
 * Den viktigaste frågan den finns för att besvara är den som avgör om Para
 * ihop duger som diagnostik alls:
 *
 *     Säger Para ihops tider något om samma tal i Svep?
 *
 * Svaret är en rangkorrelation. Är den nära noll mäter matchningen något annat
 * än framplockning — och då ska ingen motor byggas ovanpå måttet.
 */
import { FACTS } from '../facts/fact-catalog';
import { Observation } from '../services/observation-log';
import { ProgressDocument } from '../services/progress-store';

/**
 * Hur många par som minst måste stå kvar på brädet för att ett löst par ska
 * räknas som evidens.
 *
 * Med ett par kvar är svaret gratis: det finns inget att välja mellan. Med två
 * är det en gissning med 50 % chans. Tröskeln är satt på det resonemanget och
 * inte på mätdata — `eliminationBuckets` i rapporten finns just för att pröva
 * om den ligger rätt.
 */
export const MIN_REMAINING = 3;

/** Färre tal än så gör en korrelation till en anekdot. */
export const MIN_FACTS_FOR_CORRELATION = 8;

export interface Correlation {
  /** Spearmans rho, −1 till 1. `null` när underlaget är för litet. */
  rho: number | null;
  /** Hur många tal som hade båda måtten. */
  facts: number;
  /** Om `facts` räcker för att våga tolka `rho`. */
  trustworthy: boolean;
}

export interface FactSummary {
  key: string;
  /** Lösta par totalt, och de som satt utan felparning. */
  pairs: number;
  firstTry: number;
  /** Felparningar där talet var inblandat. */
  mispairs: number;
  /** Median över rena par, i ms. `null` när inget rent par mätts. */
  medianSinceFirstTouch: number | null;
  medianSinceLastResolved: number | null;
  /** Median över svepen på samma tal, i ms. */
  medianSwipe: number | null;
}

export interface EliminationBucket {
  /** Antal par kvar på brädet, det lösta inräknat. */
  remaining: number;
  pairs: number;
  firstTryShare: number;
  medianSinceFirstTouch: number | null;
}

export interface Confusion {
  key: string;
  pairedWith: string;
  chosenAnswer: number;
  times: number;
}

export interface StartedFromSummary {
  question: { pairs: number; medianSinceFirstTouch: number | null };
  answer: { pairs: number; medianSinceFirstTouch: number | null };
}

export interface ObservationReport {
  observations: number;
  pairs: number;
  mispairs: number;
  /** Hur många av tabellens tal loggen sett, och hur många som finns. */
  factsSeen: number;
  factsTotal: number;
  /** Första och sista händelsen, som tidsstämplar. `null` för en tom logg. */
  span: { from: number; to: number } | null;
  /** Hur mycket uteslutning som var tillgänglig, och vad det gjorde med tiden. */
  eliminationBuckets: EliminationBucket[];
  startedFrom: StartedFromSummary;
  /** Vanligaste felparningarna först. */
  confusions: Confusion[];
  byFact: FactSummary[];
  /**
   * Kärnfrågan, en korrelation per nollpunkt. De tre mäts var för sig eftersom
   * det inte gick att avgöra på förhand vilken som bär signal — det är därför
   * loggen sparar alla tre.
   */
  matchVersusSwipe: {
    sinceFirstTouch: Correlation;
    sinceLastResolved: Correlation;
    sinceRoundStart: Correlation;
  };
}

/** Läser loggen mot vad spelet redan vet om spelaren. */
export function analyseObservations(
  observations: readonly Observation[],
  progress: ProgressDocument,
  minRemaining: number = MIN_REMAINING,
): ObservationReport {
  const pairs = observations.filter((o) => o.kind === 'pair');
  const mispairs = observations.filter((o) => o.kind === 'mispair');

  // Bara rena par med tillräckligt uteslutningsrum duger som mätning av
  // spelaren. Ett par som fumlades mäter fumlandet, och ett par med en enda
  // kvarvarande ruta mäter ingenting alls.
  const clean = pairs.filter((o) => o.firstTry && o.remaining >= minRemaining);

  // Båda halvorna av en felparning är tal som setts. Räknas bara `key` blir
  // det tal som svaret felaktigt kopplades *till* osynligt i rapporten, fast
  // förväxlingen säger något om det.
  const keys = [
    ...new Set(observations.flatMap((o) => (o.kind === 'mispair' ? [o.key, o.pairedWith] : [o.key]))),
  ].sort();
  const byFact = keys.map((key) => summariseFact(key, pairs, mispairs, clean, progress));

  return {
    observations: observations.length,
    pairs: pairs.length,
    mispairs: mispairs.length,
    factsSeen: keys.length,
    factsTotal: FACTS.length,
    span: span(observations),
    eliminationBuckets: eliminationBuckets(pairs),
    startedFrom: startedFrom(clean),
    confusions: confusions(mispairs),
    byFact,
    matchVersusSwipe: {
      sinceFirstTouch: correlate(byFact, (f) => f.medianSinceFirstTouch),
      sinceLastResolved: correlate(byFact, (f) => f.medianSinceLastResolved),
      sinceRoundStart: correlate(
        keys.map((key) => ({
          medianRoundStart: median(
            clean.filter((o) => o.key === key).map((o) => o.msSinceRoundStart),
          ),
          medianSwipe: swipeMedian(key, progress),
        })),
        (f) => f.medianRoundStart,
        (f) => f.medianSwipe,
      ),
    },
  };
}

function summariseFact(
  key: string,
  pairs: readonly Extract<Observation, { kind: 'pair' }>[],
  mispairs: readonly Extract<Observation, { kind: 'mispair' }>[],
  clean: readonly Extract<Observation, { kind: 'pair' }>[],
  progress: ProgressDocument,
): FactSummary {
  const mine = pairs.filter((o) => o.key === key);
  const cleanMine = clean.filter((o) => o.key === key);
  return {
    key,
    pairs: mine.length,
    firstTry: mine.filter((o) => o.firstTry).length,
    // En felparning nämner två tal, och båda är inblandade.
    mispairs: mispairs.filter((o) => o.key === key || o.pairedWith === key).length,
    medianSinceFirstTouch: median(
      cleanMine
        .map((o) => o.msSinceFirstTouch)
        .filter((ms): ms is number => ms !== null),
    ),
    medianSinceLastResolved: median(cleanMine.map((o) => o.msSinceLastResolved)),
    medianSwipe: swipeMedian(key, progress),
  };
}

/** Svepens mediantid för ett tal, i ms. */
function swipeMedian(key: string, progress: ProgressDocument): number | null {
  return median(progress.facts[key]?.swipe.times ?? []);
}

function span(observations: readonly Observation[]): { from: number; to: number } | null {
  if (observations.length === 0) {
    return null;
  }
  const times = observations.map((o) => o.at);
  return { from: Math.min(...times), to: Math.max(...times) };
}

/**
 * Tiden per storlek på uteslutningsrummet.
 *
 * Det här är tabellen som avgör var `MIN_REMAINING` ska ligga. Faller tiden
 * brant mot 1 är uteslutning en verklig kraft och de sista paren ska inte
 * räknas som kunskap; är kurvan flat mäter Para ihop framplockning hela vägen
 * och tröskeln kan sänkas.
 */
function eliminationBuckets(
  pairs: readonly Extract<Observation, { kind: 'pair' }>[],
): EliminationBucket[] {
  const remainings = [...new Set(pairs.map((o) => o.remaining))].sort((a, b) => b - a);
  return remainings.map((remaining) => {
    const bucket = pairs.filter((o) => o.remaining === remaining);
    return {
      remaining,
      pairs: bucket.length,
      firstTryShare: bucket.filter((o) => o.firstTry).length / bucket.length,
      medianSinceFirstTouch: median(
        bucket.map((o) => o.msSinceFirstTouch).filter((ms): ms is number => ms !== null),
      ),
    };
  });
}

/**
 * Att välja svaret först och leta upp frågan är en annan operation än tvärtom.
 * Skiljer tiderna sig åt bär fältet information; gör de inte det kan det tas
 * bort ur händelsen.
 */
function startedFrom(
  clean: readonly Extract<Observation, { kind: 'pair' }>[],
): StartedFromSummary {
  const side = (from: 'question' | 'answer') => {
    const mine = clean.filter((o) => o.startedFrom === from);
    return {
      pairs: mine.length,
      medianSinceFirstTouch: median(
        mine.map((o) => o.msSinceFirstTouch).filter((ms): ms is number => ms !== null),
      ),
    };
  };
  return { question: side('question'), answer: side('answer') };
}

/** Vanligaste förväxlingarna. Ett återkommande felsvar är ett mönster. */
function confusions(
  mispairs: readonly Extract<Observation, { kind: 'mispair' }>[],
): Confusion[] {
  const counts = new Map<string, Confusion>();
  for (const miss of mispairs) {
    const id = `${miss.key}|${miss.pairedWith}`;
    const existing = counts.get(id);
    if (existing) {
      existing.times += 1;
    } else {
      counts.set(id, {
        key: miss.key,
        pairedWith: miss.pairedWith,
        chosenAnswer: miss.chosenAnswer,
        times: 1,
      });
    }
  }
  return [...counts.values()].sort((a, b) => b.times - a.times);
}

/** Rangkorrelation mellan ett matchmått och svepens tid, tal för tal. */
function correlate<T extends { medianSwipe?: number | null }>(
  rows: readonly T[],
  matchTime: (row: T) => number | null | undefined,
  swipeTime: (row: T) => number | null | undefined = (row) => row.medianSwipe,
): Correlation {
  const paired: [number, number][] = [];
  for (const row of rows) {
    const match = matchTime(row);
    const swipe = swipeTime(row);
    if (typeof match === 'number' && typeof swipe === 'number') {
      paired.push([match, swipe]);
    }
  }
  return {
    rho: spearman(paired),
    facts: paired.length,
    trustworthy: paired.length >= MIN_FACTS_FOR_CORRELATION,
  };
}

/**
 * Spearmans rangkorrelation.
 *
 * Rang och inte Pearson: svarstider är skeva och har svansar, och frågan är om
 * de tal som är långsamma i Para ihop *också* är de långsamma i Svep — alltså
 * en fråga om ordning, inte om linjär form.
 */
export function spearman(pairs: readonly [number, number][]): number | null {
  if (pairs.length < 3) {
    return null;
  }
  const xs = rank(pairs.map(([x]) => x));
  const ys = rank(pairs.map(([, y]) => y));
  return pearson(xs, ys);
}

/** Medelrang vid lika värden, annars 1, 2, 3 … */
export function rank(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index }));
  order.sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) {
      j += 1;
    }
    // Rang är ett-baserad; medelrangen för en grupp lika värden är mitten.
    const shared = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      ranks[order[k].index] = shared;
    }
    i = j + 1;
  }
  return ranks;
}

function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (varianceX === 0 || varianceY === 0) {
    // Alla värden lika åt minst ett håll — ingen ordning att korrelera.
    return null;
  }
  return covariance / Math.sqrt(varianceX * varianceY);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** Nyckeln som text, för rapporten: `mul:7x8` → `7 × 8`. */
export function readableKey(key: string): string {
  const match = /^mul:(\d+)x(\d+)$/.exec(key);
  return match ? `${match[1]} × ${match[2]}` : key;
}

/** Rapporten som text. Läses av en människa, inte av spelet. */
export function formatReport(report: ObservationReport): string {
  const lines: string[] = [];
  const pct = (share: number) => `${Math.round(share * 100)} %`;
  const ms = (value: number | null) => (value === null ? '—' : `${Math.round(value)} ms`);

  lines.push('OBSERVATIONER FRÅN PARA IHOP');
  lines.push('='.repeat(64));
  lines.push(
    `${report.observations} händelser: ${report.pairs} lösta par, ${report.mispairs} felparningar.`,
  );
  lines.push(`Tal sedda: ${report.factsSeen} av ${report.factsTotal}.`);
  if (report.span) {
    const days = (report.span.to - report.span.from) / 86_400_000;
    lines.push(`Insamlat över ${days.toFixed(1)} dygn.`);
  }

  lines.push('');
  lines.push('KÄRNFRÅGAN — säger Para ihops tider något om Svepets?');
  lines.push('-'.repeat(64));
  for (const [name, correlation] of [
    ['sedan första klicket', report.matchVersusSwipe.sinceFirstTouch],
    ['sedan förra paret löstes', report.matchVersusSwipe.sinceLastResolved],
    ['sedan rundan lades fram', report.matchVersusSwipe.sinceRoundStart],
  ] as const) {
    lines.push(`  ${name.padEnd(26)} ${formatCorrelation(correlation)}`);
  }
  lines.push('');
  lines.push(interpretation(report));

  lines.push('');
  lines.push('UTESLUTNINGSRUMMET — hur mycket hjälp låg på brädet?');
  lines.push('-'.repeat(64));
  lines.push('  kvar   par   rätt direkt   median');
  for (const bucket of report.eliminationBuckets) {
    lines.push(
      `  ${String(bucket.remaining).padStart(4)}  ${String(bucket.pairs).padStart(4)}   ` +
        `${pct(bucket.firstTryShare).padStart(11)}   ${ms(bucket.medianSinceFirstTouch)}`,
    );
  }
  lines.push(`  (evidens räknas från ${MIN_REMAINING} kvar och uppåt)`);

  lines.push('');
  lines.push('BÖRJADE I VILKEN SPALT?');
  lines.push('-'.repeat(64));
  lines.push(
    `  frågan  ${String(report.startedFrom.question.pairs).padStart(4)} par   ` +
      `${ms(report.startedFrom.question.medianSinceFirstTouch)}`,
  );
  lines.push(
    `  svaret  ${String(report.startedFrom.answer.pairs).padStart(4)} par   ` +
      `${ms(report.startedFrom.answer.medianSinceFirstTouch)}`,
  );

  if (report.confusions.length > 0) {
    lines.push('');
    lines.push('VANLIGASTE FÖRVÄXLINGARNA');
    lines.push('-'.repeat(64));
    for (const confusion of report.confusions.slice(0, 10)) {
      lines.push(
        `  ${readableKey(confusion.key).padEnd(8)} parades med svaret ` +
          `${String(confusion.chosenAnswer).padStart(3)} (${readableKey(confusion.pairedWith)})` +
          `  ×${confusion.times}`,
      );
    }
  }

  const measured = report.byFact.filter((f) => f.medianSinceFirstTouch !== null);
  if (measured.length > 0) {
    lines.push('');
    lines.push('PER TAL — långsammast i Para ihop först');
    lines.push('-'.repeat(64));
    lines.push('  tal      par  fel   match     svep');
    const slowest = [...measured].sort(
      (a, b) => (b.medianSinceFirstTouch ?? 0) - (a.medianSinceFirstTouch ?? 0),
    );
    for (const fact of slowest.slice(0, 15)) {
      lines.push(
        `  ${readableKey(fact.key).padEnd(8)} ${String(fact.pairs).padStart(3)}  ` +
          `${String(fact.mispairs).padStart(3)}   ${ms(fact.medianSinceFirstTouch).padStart(7)}  ` +
          `${ms(fact.medianSwipe).padStart(7)}`,
      );
    }
  }

  return lines.join('\n');
}

function formatCorrelation(correlation: Correlation): string {
  if (correlation.rho === null) {
    return `— (${correlation.facts} tal, för få för att räkna)`;
  }
  const warning = correlation.trustworthy
    ? ''
    : `  ⚠ under ${MIN_FACTS_FOR_CORRELATION} tal, tolka inte`;
  return `rho ${correlation.rho >= 0 ? '+' : ''}${correlation.rho.toFixed(2)}  (${correlation.facts} tal)${warning}`;
}

/**
 * Vad siffrorna betyder för beslutet. Rapporten ska kunna läsas av någon som
 * inte minns varför den skrevs.
 */
function interpretation(report: ObservationReport): string {
  const best = [
    report.matchVersusSwipe.sinceFirstTouch,
    report.matchVersusSwipe.sinceLastResolved,
    report.matchVersusSwipe.sinceRoundStart,
  ]
    .filter((c) => c.trustworthy && c.rho !== null)
    .reduce<Correlation | null>((a, b) => (a === null || Math.abs(b.rho!) > Math.abs(a.rho!) ? b : a), null);

  if (best === null) {
    return '  Underlaget räcker inte ännu. Spela mer, exportera igen.';
  }
  const rho = best.rho!;
  if (rho >= 0.5) {
    return '  Tydlig koppling. Para ihops tider bär information om samma tal i\n' +
      '  Svep, och duger som diagnostik. Använd den nollpunkt som gav högst rho.';
  }
  if (rho >= 0.3) {
    return '  Svag men verklig koppling. Para ihop kan introducera och gradera\n' +
      '  ungefär, men ska inte ensamt få avgöra att ett tal sitter.';
  }
  if (rho > -0.3) {
    return '  Ingen koppling. Para ihops tider mäter något annat än framplockning —\n' +
      '  troligen letande på brädet. Bygg ingen motor ovanpå måttet; låt spelet\n' +
      '  introducera tal, men låt Svep avgöra vad som sitter.';
  }
  return '  Negativ koppling, vilket är misstänkt snarare än intressant. Kontrollera\n' +
    '  att tiderna inte råkat bli jämförda åt olika håll innan något tolkas.';
}
