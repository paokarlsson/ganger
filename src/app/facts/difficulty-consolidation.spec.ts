import { describe, expect, it } from 'vitest';
import { Difficulty, DIFFICULTY } from '../master-view/levels';
import { Band, FACTS, factKey } from './fact-catalog';

/**
 * Mästaren har sin egen handskrivna svårighetsindelning. Den och katalogen är
 * överens om principen men inte om varje tal, och att slå ihop dem skulle
 * ändra hur Mästaren beter sig — ett eget beslut, inte något som hör hemma i
 * omskrivningen av Svep.
 *
 * Testet rör därför ingenting. Det låser fast exakt var de två är oense, så
 * att en ändring i endera filen tvingar fram ett medvetet val i stället för
 * att glida i tysthet.
 */
const BAND_FOR_DIFFICULTY: Record<Difficulty, Band> = {
  easy: 'anchor',
  medium: 'bridge',
  hard: 'core',
};

function disagreements(): string[] {
  const expected = new Map<string, Band>();
  for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
    for (const [a, b] of DIFFICULTY[difficulty]) {
      expected.set(factKey(a, b), BAND_FOR_DIFFICULTY[difficulty]);
    }
  }

  const drift: string[] = [];
  for (const fact of FACTS) {
    const theirs = expected.get(factKey(fact.a, fact.b));
    if (theirs && theirs !== fact.band) {
      drift.push(`${fact.a}×${fact.b}: Mästaren ${theirs}, katalogen ${fact.band}`);
    }
  }
  return drift.sort();
}

describe('katalogens band mot Mästarens DIFFICULTY', () => {
  it('är oense om exakt de här talen', () => {
    expect(disagreements()).toEqual(EXPECTED_DRIFT);
  });
});

/**
 * De 15 tal de två modellerna placerar olika, med tre tydliga mönster:
 *
 * - Tians tal. Mästaren räknar 10 × 7 som svårt, katalogen som ett ankartal.
 *   Här har katalogen rimligen rätt — tian bär en regel oavsett partner.
 * - Femmans tal. Samma sak ett snäpp svagare: 5 × 8 är halva 10 × 8.
 * - Kvadraterna. Mästaren räknar 2 × 2 och 5 × 5 som lätta och 3 × 3, 4 × 4
 *   som medel; katalogen rankar dem som vilket tal som helst i sin faktors
 *   block. Att kvadrater är lättare att minnas är ett eget argument som
 *   ingen av modellerna uttrycker.
 *
 * Listan är en beskrivning av nuläget, inte ett facit.
 */
const EXPECTED_DRIFT: string[] = [
  '10×3: Mästaren bridge, katalogen anchor',
  '10×4: Mästaren bridge, katalogen anchor',
  '10×6: Mästaren core, katalogen anchor',
  '10×7: Mästaren core, katalogen anchor',
  '10×8: Mästaren core, katalogen anchor',
  '10×9: Mästaren core, katalogen anchor',
  '2×10: Mästaren anchor, katalogen bridge',
  '2×2: Mästaren anchor, katalogen bridge',
  '3×3: Mästaren bridge, katalogen core',
  '4×4: Mästaren bridge, katalogen core',
  '5×5: Mästaren anchor, katalogen bridge',
  '5×6: Mästaren core, katalogen bridge',
  '5×7: Mästaren core, katalogen bridge',
  '5×8: Mästaren core, katalogen bridge',
  '5×9: Mästaren core, katalogen bridge',
];
