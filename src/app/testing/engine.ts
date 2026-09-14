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
 * Hjälparna skriver fortfarande i riktig `localStorage` och känner därmed till
 * lagringsformatet. Se 2.1 i docs/refaktorering.md: `useRepository()` är sömmen
 * som skulle göra dem oberoende av det.
 */
import { TrainingEngine } from '../training/training-engine';

const built: TrainingEngine[] = [];

/** Som att ladda om sidan: en ny motor som läser det som ligger i lagret. */
export async function restarted(): Promise<TrainingEngine> {
  const engine = new TrainingEngine();
  built.push(engine);
  await engine.hydrate();
  return engine;
}

/**
 * En motor som läser ett rensat lager, eller ett förberett. Värden som inte
 * redan är strängar skrivs som JSON, precis som appen gör.
 */
export async function engineWith(
  stored: Record<string, unknown> = {},
): Promise<TrainingEngine> {
  localStorage.clear();
  for (const [key, value] of Object.entries(stored)) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return restarted();
}

/** Kopplar loss lyssnarna efter de motorer testet byggt. Hör hemma i en
 *  `afterEach`. */
export function disposeEngines(): void {
  for (const engine of built.splice(0)) {
    engine.ngOnDestroy();
  }
}
