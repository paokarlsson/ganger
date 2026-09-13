/* TILLFÄLLIG — hela mappen theme-picker/ ska bort när ett tema är valt.
   Se README, avsnittet "Temaväljaren (tillfällig)", för de tre stegen.

   Temana bor här och inte i src/styles/, just för att de ska kunna raderas i
   ett svep. Det valda temats värden flyttas då in i src/styles/_tokens.scss,
   som är och förblir det enda stället appen läser färger ifrån. */

/** De färgtoken ett tema äger. Formen och måtten — radier, mellanrum,
 *  typsnitt — är appens och byts inte med temat. */
export type PaletteToken =
    | '--bg-base'
    | '--bg-floor'
    | '--bg-card'
    | '--bg-card-raised'
    | '--accent-highlight'
    | '--on-highlight'
    | '--accent-green'
    | '--green-deep'
    | '--green-shadow'
    | '--on-green'
    | '--accent-red'
    | '--accent-orange'
    | '--card-face'
    | '--card-ink'
    | '--text-primary'
    | '--text-muted'
    | '--tone-rgb';

export type Palette = Record<PaletteToken, string>;

export interface Theme {
    /** Går in i data-theme på <html>. */
    readonly id: string;
    readonly name: string;
    /** En rad om vad temat vill vara, så att listan går att läsa. */
    readonly note: string;
    /** Saknas för Midnatt, som redan ligger i _tokens.scss. */
    readonly dark?: Palette;
    readonly light?: Palette;
}

/* Midnatt, alltså det som står i _tokens.scss. Övriga teman skrivs som
   avvikelser från de här två, så att ett tema som inte har någon åsikt om
   det röda ärver ett rött som redan är kontrollerat. */
const darkBase: Palette = {
    '--bg-base': '#1a1a2e',
    '--bg-floor': '#0f0f23',
    '--bg-card': '#16213e',
    '--bg-card-raised': '#1e2b50',
    '--accent-highlight': '#ffd700',
    '--on-highlight': '#0f0f23',
    '--accent-green': '#2ecc71',
    '--green-deep': '#27ae60',
    '--green-shadow': '#1e8449',
    '--on-green': '#0f0f23',
    '--accent-red': '#ea6253',
    '--accent-orange': '#f39c12',
    '--card-face': '#ffde5c',
    '--card-ink': '#1a1a2e',
    '--text-primary': '#f0f0f0',
    '--text-muted': '#9096a4',
    '--tone-rgb': '255, 255, 255',
};

const lightBase: Palette = {
    '--bg-base': '#f7f8fc',
    '--bg-floor': '#e8ebf5',
    '--bg-card': '#ffffff',
    '--bg-card-raised': '#eef1f9',
    '--accent-highlight': '#8a6300',
    '--on-highlight': '#fffdf5',
    '--accent-green': '#157a41',
    '--green-deep': '#106836',
    '--green-shadow': '#0b4d28',
    '--on-green': '#ffffff',
    '--accent-red': '#c3372b',
    '--accent-orange': '#9a5300',
    '--card-face': '#ffde5c',
    '--card-ink': '#1a1a2e',
    '--text-primary': '#16203a',
    '--text-muted': '#545d73',
    '--tone-rgb': '16, 24, 48',
};

const dark = (over: Partial<Palette>): Palette => ({ ...darkBase, ...over });
const light = (over: Partial<Palette>): Palette => ({ ...lightBase, ...over });

export const THEMES: readonly Theme[] = [
    {
        id: 'midnatt',
        name: 'Midnatt',
        note: 'Nuvarande: indigo och guld',
    },
    {
        id: 'grafit',
        name: 'Grafit',
        note: 'Nästan svart, en enda signalfärg',
        dark: dark({
            '--bg-base': '#141416',
            '--bg-floor': '#0b0b0c',
            '--bg-card': '#1a1a1d',
            '--bg-card-raised': '#26262a',
            '--accent-highlight': '#ff8a3d',
            '--on-highlight': '#0b0b0c',
            '--accent-green': '#5ddc82',
            '--green-deep': '#35c268',
            '--green-shadow': '#218a46',
            '--on-green': '#0b0b0c',
            '--accent-red': '#ff6f61',
            '--accent-orange': '#ffa62b',
            '--card-face': '#ffb37a',
            '--text-primary': '#f4f4f5',
            '--text-muted': '#9a9aa1',
        }),
        light: light({
            '--bg-base': '#f7f7f8',
            '--bg-floor': '#e6e6e8',
            '--bg-card': '#ffffff',
            '--bg-card-raised': '#efeff1',
            '--accent-highlight': '#b03d00',
            '--on-highlight': '#fff6f0',
            '--accent-green': '#15703f',
            '--green-deep': '#115a33',
            '--green-shadow': '#0c4325',
            '--accent-red': '#c02c22',
            '--accent-orange': '#8f4b00',
            '--card-face': '#ffb37a',
            '--card-ink': '#20140c',
            '--text-primary': '#17171a',
            '--text-muted': '#55555c',
            '--tone-rgb': '23, 23, 26',
        }),
    },
    {
        id: 'citrus',
        name: 'Citrus',
        note: 'Grafitgrönt med syrlig lime',
        dark: dark({
            '--bg-base': '#161a14',
            '--bg-floor': '#0d0f0c',
            '--bg-card': '#1c211a',
            '--bg-card-raised': '#262d22',
            '--accent-highlight': '#c9f24d',
            '--on-highlight': '#14170f',
            '--accent-green': '#4ade80',
            '--green-deep': '#22c55e',
            '--green-shadow': '#15803d',
            '--on-green': '#0d0f0c',
            '--accent-red': '#ff7a6b',
            '--accent-orange': '#ffab3d',
            '--card-face': '#e8fa8c',
            '--card-ink': '#14170f',
            '--text-primary': '#f2f4ef',
            '--text-muted': '#9aa18f',
        }),
        light: light({
            '--bg-base': '#f6f7f1',
            '--bg-floor': '#e7e9df',
            '--bg-card': '#ffffff',
            '--bg-card-raised': '#eff1e8',
            '--accent-highlight': '#4e6b00',
            '--on-highlight': '#f8ffe8',
            '--accent-green': '#15803d',
            '--green-deep': '#116632',
            '--green-shadow': '#0b4a24',
            '--accent-red': '#c0392b',
            '--accent-orange': '#8a5200',
            '--card-face': '#e8fa8c',
            '--card-ink': '#14170f',
            '--text-primary': '#1a1d16',
            '--text-muted': '#565b4d',
            '--tone-rgb': '26, 29, 22',
        }),
    },
    {
        id: 'arktis',
        name: 'Arktis',
        note: 'Kall djupblå med cyan is',
        dark: dark({
            '--bg-base': '#0d1f2a',
            '--bg-floor': '#06131a',
            '--bg-card': '#122a38',
            '--bg-card-raised': '#1a3a4c',
            '--accent-highlight': '#5ce1e6',
            '--on-highlight': '#06131a',
            '--accent-green': '#3ddc97',
            '--green-deep': '#22b877',
            '--green-shadow': '#148554',
            '--on-green': '#06131a',
            '--accent-red': '#ff7b7b',
            '--accent-orange': '#ffb020',
            '--card-face': '#a9f0f2',
            '--card-ink': '#06131a',
            '--text-primary': '#eaf6fa',
            '--text-muted': '#8fa8b5',
        }),
        light: light({
            '--bg-base': '#f2f8fb',
            '--bg-floor': '#dfeaf0',
            '--bg-card': '#ffffff',
            '--bg-card-raised': '#eaf3f8',
            '--accent-highlight': '#0b6a78',
            '--on-highlight': '#f0feff',
            '--accent-green': '#0f7a52',
            '--green-deep': '#0b6442',
            '--green-shadow': '#084a31',
            '--accent-red': '#bb3040',
            '--accent-orange': '#8a5000',
            '--card-face': '#a9f0f2',
            '--card-ink': '#06131a',
            '--text-primary': '#0d2430',
            '--text-muted': '#4d6672',
            '--tone-rgb': '13, 36, 48',
        }),
    },
    {
        id: 'ametist',
        name: 'Ametist',
        note: 'Violett natt med blålila ljus',
        dark: dark({
            '--bg-base': '#171233',
            '--bg-floor': '#0c0a1a',
            '--bg-card': '#1e1840',
            '--bg-card-raised': '#2b2358',
            '--accent-highlight': '#a78bfa',
            '--on-highlight': '#0c0a1a',
            '--accent-green': '#4ade9f',
            '--green-deep': '#2bc086',
            '--green-shadow': '#178a5e',
            '--on-green': '#0c0a1a',
            '--accent-red': '#fb7185',
            '--accent-orange': '#fbbf24',
            '--card-face': '#d8c9ff',
            '--card-ink': '#0c0a1a',
            '--text-primary': '#efeaff',
            '--text-muted': '#a49dc4',
        }),
        light: light({
            '--bg-base': '#f6f4ff',
            '--bg-floor': '#e7e4f6',
            '--bg-card': '#ffffff',
            '--bg-card-raised': '#efecfd',
            '--accent-highlight': '#6231d1',
            '--on-highlight': '#f8f5ff',
            '--accent-green': '#0f7248',
            '--green-deep': '#0b5c39',
            '--green-shadow': '#084329',
            '--accent-red': '#bf2c46',
            '--accent-orange': '#8a5000',
            '--card-face': '#d8c9ff',
            '--card-ink': '#0c0a1a',
            '--text-primary': '#1c1436',
            '--text-muted': '#574f78',
            '--tone-rgb': '28, 20, 54',
        }),
    },
    {
        id: 'sockervadd',
        name: 'Sockervadd',
        note: 'Aubergine, hallon och mynta',
        dark: dark({
            '--bg-base': '#221030',
            '--bg-floor': '#150b1b',
            '--bg-card': '#2b1440',
            '--bg-card-raised': '#3a1c55',
            '--accent-highlight': '#ff7ac8',
            '--on-highlight': '#1c0a26',
            '--accent-green': '#5ce6b5',
            '--green-deep': '#2fd39c',
            '--green-shadow': '#1d8f6b',
            '--on-green': '#150b1b',
            '--accent-red': '#ff6b81',
            '--accent-orange': '#ffa552',
            '--card-face': '#ffc3e4',
            '--card-ink': '#1c0a26',
            '--text-primary': '#fbeefb',
            '--text-muted': '#b39cc2',
        }),
        light: light({
            '--bg-base': '#fdf5fc',
            '--bg-floor': '#f3e6f2',
            '--bg-card': '#ffffff',
            '--bg-card-raised': '#f8ecf7',
            '--accent-highlight': '#b3126e',
            '--on-highlight': '#fff0f8',
            '--accent-green': '#0f7a5c',
            '--green-deep': '#0b6449',
            '--green-shadow': '#084936',
            '--accent-red': '#c62640',
            '--accent-orange': '#8f4f00',
            '--card-face': '#ffc3e4',
            '--card-ink': '#1c0a26',
            '--text-primary': '#2b0f2b',
            '--text-muted': '#6b4a68',
            '--tone-rgb': '43, 15, 43',
        }),
    },
    {
        id: 'lera',
        name: 'Lera',
        note: 'Varm terrakotta och sand',
        dark: dark({
            '--bg-base': '#241b14',
            '--bg-floor': '#16110d',
            '--bg-card': '#2c211a',
            '--bg-card-raised': '#3a2c22',
            '--accent-highlight': '#f0a875',
            '--on-highlight': '#1b120c',
            '--accent-green': '#7fc98a',
            '--green-deep': '#55a768',
            '--green-shadow': '#3a7548',
            '--on-green': '#16110d',
            '--accent-red': '#e4776a',
            '--accent-orange': '#e59b45',
            '--card-face': '#f7d9b4',
            '--card-ink': '#1b120c',
            '--text-primary': '#f5ece2',
            '--text-muted': '#a89484',
        }),
        light: light({
            '--bg-base': '#faf4ec',
            '--bg-floor': '#ece2d5',
            '--bg-card': '#fffaf4',
            '--bg-card-raised': '#f3e9dd',
            '--accent-highlight': '#9a4a12',
            '--on-highlight': '#fff4ea',
            '--accent-green': '#2f6d43',
            '--green-deep': '#245735',
            '--green-shadow': '#1a3f26',
            '--accent-red': '#b5372a',
            '--accent-orange': '#8a4f10',
            '--card-face': '#f7d9b4',
            '--card-ink': '#1b120c',
            '--text-primary': '#2a1d12',
            '--text-muted': '#6a5546',
            '--tone-rgb': '42, 29, 18',
        }),
    },
];

/**
 * Temat som CSS, i samma form som _tokens.scss använder: den mörka paletten
 * på temat självt, den ljusa dels bakom systemets ljusläge, dels bakom ett
 * uttryckligt val i appen. Ordningen är hela regelverket — den ljusa har
 * högre specificitet och vinner därför när båda gäller.
 */
export function themeCss(theme: Theme): string {
    if (!theme.dark || !theme.light) {
        return '';
    }
    const root = `:root[data-theme='${theme.id}']`;
    return [
        `${root} {\n${declarations(theme.dark)}}`,
        `@media (prefers-color-scheme: light) {\n  ${root}:not([data-mode='dark']) {\n${declarations(theme.light, '    ')}  }\n}`,
        `${root}[data-mode='light'] {\n${declarations(theme.light)}}`,
    ].join('\n\n');
}

/**
 * Samma färger, men som bara deklarationer med en rad om var de ska in —
 * formen som faktiskt behövs den dagen temat flyttar in i _tokens.scss.
 */
export function themeDeclarations(theme: Theme): string {
    if (!theme.dark || !theme.light) {
        return '';
    }
    return [
        `/* ${theme.name} — in i @mixin dark-palette i src/styles/_tokens.scss */`,
        declarations(theme.dark, '    '),
        `/* ${theme.name} — in i @mixin light-palette */`,
        declarations(theme.light, '    '),
    ].join('\n');
}

function declarations(palette: Palette, indent = '  '): string {
    return Object.entries(palette)
        .map(([token, value]) => `${indent}${token}: ${value};\n`)
        .join('');
}
