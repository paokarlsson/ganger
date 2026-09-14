/**
 * Läsning och skrivning mot localStorage, på ett ställe.
 *
 * Två sorters fel sväljs här, och bara här:
 *
 * * **Lagret kastar.** localStorage är otillgängligt i privat läge och när
 *   sajtdata är avstängt, och en skrivning nekas när kvoten är full. Spelet
 *   ska gå att spela ändå, bara utan att något följer med till nästa gång.
 * * **Det lagrade går inte att tolka.** Ett dokument som legat i en webbläsare
 *   kan vara handredigerat eller halvskrivet, och är inte värt att krascha
 *   uppstarten för.
 *
 * Att samla dem är vad som gör att förklaringen ovan behöver stå en gång i
 * stället för vid vart och ett av de tomma catch-blocken.
 */

/** Råsträngen under en nyckel. `null` när den inte finns eller inte går att läsa. */
export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Det som ligger under en nyckel, tolkat. `null` för allt som inte går att läsa. */
export function readJson(key: string): unknown {
  const raw = readString(key);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** `false` när skrivningen nekades. Anroparen får avgöra vad den gör av det —
 *  `ObservationLog` trappar ned hur mycket den sparar, framstegen låter sitt
 *  dokument leva i minnet sessionen ut. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Se readString().
  }
}
