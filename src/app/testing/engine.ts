/**
 * En hydrerad motor att testa mot.
 *
 * Lagringen är asynkron, så en `new TrainingEngine()` vet ingenting förrän den
 * hydrerats. De specar som behöver en motor byggde var sin variant av de tre
 * raderna nedan.
 *
 * Motorerna hålls också reda på. Varje motor kopplar upp ett par
 * sidbyteslyssnare, och en testkörning bygger en per test — `disposeEngines()`
 * i en `afterEach` är vad som gör att de inte blir kvar.
 *
 * `freshEngine()` är vägen för de flesta specar: framstegen ligger i minnet och
 * testet slipper känna till lagringsformatet. `engineWith()` finns för de få
 * som handlar om just formatet — migreringen från version 1 — och går den
 * riktiga vägen genom `localStorage`.
 */
import { ProgressRepository } from '../services/progress-store';
import { TrainingEngine } from '../training/training-engine';
import { InMemoryProgressRepository } from './progress-repository';

const built: TrainingEngine[] = [];

/** Lagringen de senast byggda motorerna delar, så att `restarted()` kan läsa
 *  det den förra skrev. `null` betyder motorns egen, mot `localStorage`. */
let current: ProgressRepository | null = null;

/** En motor på en given lagring. */
export async function engineOn(repository: ProgressRepository): Promise<TrainingEngine> {
  current = repository;
  return restarted();
}

/** En motor som inte vet något om spelaren, med framstegen i minnet. */
export function freshEngine(): Promise<TrainingEngine> {
  return engineOn(new InMemoryProgressRepository());
}

/** Som att ladda om sidan: en ny motor som läser samma lagring som den förra. */
export async function restarted(): Promise<TrainingEngine> {
  const engine = new TrainingEngine();
  built.push(engine);
  if (current !== null) {
    engine.useRepository(current);
  }
  await engine.hydrate();
  return engine;
}

/**
 * En motor som läser ett rensat `localStorage`, eller ett förberett. Värden som
 * inte redan är strängar skrivs som JSON, precis som appen gör.
 *
 * Bara för de tester som handlar om lagringsformatet. Övriga vill ha
 * `freshEngine()`.
 */
export async function engineWith(
  stored: Record<string, unknown> = {},
): Promise<TrainingEngine> {
  localStorage.clear();
  for (const [key, value] of Object.entries(stored)) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  current = null;
  return restarted();
}

/** Kopplar loss lyssnarna efter de motorer testet byggt, och glömmer lagringen
 *  de delade. Hör hemma i en `afterEach`. */
export function disposeEngines(): void {
  for (const engine of built.splice(0)) {
    engine.ngOnDestroy();
  }
  current = null;
}
