/** Ett tal att öva på, som paret av faktorer det består av. */
export type Pair = [number, number];

export type Difficulty = 'easy' | 'medium' | 'hard';

/** 'auto' låter spelet välja tal efter hur det går, siffrorna är fasta nivåer. */
export type Level = 'auto' | number;

/** Vilka tabeller som ingår i varje nivå. Ordningen följer hur svåra de är
 *  att lära sig, inte tabellernas storlek. */
export const LEVELS: Record<number, number[]> = {
  1: [1],
  2: [10],
  3: [2],
  4: [5],
  5: [3],
  6: [4],
  7: [9],
  8: [6],
  9: [7],
  10: [8],
  11: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
};

/** Knapparna i nivåväljaren: nivån, talet den övar och etiketten under. */
export const LEVEL_BUTTONS: { level: Level; num: string; label: string }[] = [
  { level: 'auto', num: '🎯', label: 'Auto' },
  { level: 1, num: '×1', label: 'Nivå 1' },
  { level: 2, num: '×10', label: 'Nivå 2' },
  { level: 3, num: '×2', label: 'Nivå 3' },
  { level: 4, num: '×5', label: 'Nivå 4' },
  { level: 5, num: '×3', label: 'Nivå 5' },
  { level: 6, num: '×4', label: 'Nivå 6' },
  { level: 7, num: '×9', label: 'Nivå 7' },
  { level: 8, num: '×6', label: 'Nivå 8' },
  { level: 9, num: '×7', label: 'Nivå 9' },
  { level: 10, num: '×8', label: 'Nivå 10' },
  { level: 11, num: 'Mix', label: 'Blandad' },
];

/** Svårighetsgrupperna som auto-läget rör sig mellan. */
export const DIFFICULTY: Record<Difficulty, Pair[]> = {
  easy: [[1,1],[1,2],[2,1],[1,10],[10,1],[2,10],[10,2],[1,5],[5,1],[2,2],[5,5],[10,10],[1,3],[3,1],[1,4],[4,1],[1,6],[6,1],[1,7],[7,1],[1,8],[8,1],[1,9],[9,1]],
  medium: [[2,3],[3,2],[2,4],[4,2],[2,5],[5,2],[3,3],[3,5],[5,3],[4,4],[4,5],[5,4],[3,10],[10,3],[4,10],[10,4],[5,10],[10,5],[2,6],[6,2],[2,7],[7,2],[2,8],[8,2],[2,9],[9,2]],
  hard: [[3,4],[4,3],[3,6],[6,3],[3,7],[7,3],[3,8],[8,3],[3,9],[9,3],[4,6],[6,4],[4,7],[7,4],[4,8],[8,4],[4,9],[9,4],[5,6],[6,5],[5,7],[7,5],[5,8],[8,5],[5,9],[9,5],[6,6],[6,7],[7,6],[6,8],[8,6],[6,9],[9,6],[7,7],[7,8],[8,7],[7,9],[9,7],[8,8],[8,9],[9,8],[9,9],[6,10],[10,6],[7,10],[10,7],[8,10],[10,8],[9,10],[10,9]],
};

/** Talen kalibreringen mäter svarstiden på. */
export const CALIBRATION_QUESTIONS: Pair[] = [[1,1],[1,2],[2,1],[1,10],[10,1]];

/** Antal sekunder som räknas som snabbt innan spelaren kalibrerats. */
export const DEFAULT_FAST_TIME = 2.0;

/** Långsamt = så här många gånger den snabba tiden. */
export const SLOW_TIME_MULTIPLIER = 4;

/** Sekunder som läggs på tiden vid fel svar. */
export const PENALTY_TIME = 4.0;

/** Snabba svar i rad innan svårigheten höjs, respektive långsamma innan den sänks. */
export const UPGRADE_THRESHOLD = 5;
export const DOWNGRADE_THRESHOLD = 2;
