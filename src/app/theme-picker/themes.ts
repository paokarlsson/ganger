/* TILLFÄLLIG — hela mappen theme-picker/ ska bort när ett tema är valt.
   Se README, avsnittet "Temaväljaren (tillfällig)", för de tre stegen.

   Temana bor här och inte i src/styles/, just för att de ska kunna raderas i
   ett svep. Det valda temats värden flyttas då in i src/styles/_tokens.scss,
   som är och förblir det enda stället appen läser färger ifrån.

   Alla sju är byggda på samma trappa av ljushet och kroma som _tokens.scss
   beskriver, och det enda som skiljer dem åt är nyanserna. Det är därför de
   går att jämföra: byter man tema flyttar sig färgen men inte tyngden, och
   ett tema kan inte råka bli lättare att läsa än ett annat. Den svagaste
   kontrasten i vart och ett av dem ligger på 4.69:1 där WCAG kräver 4.5:1,
   och det är samma två token som är svagast överallt — vilket är tecknet på
   att det är regeln och inte turen som håller.

   Ett undantag från trappan finns, och det är accenten som lyfter. Den vill
   ligga på L 0.84, men blått och violett kan inte vara både så ljusa och
   färgade — sRGB tar slut. För dem sänks ljusheten tills kromat kommer upp i
   0.12, aldrig under 0.72. Grafit landar därför på 0.76 och Ametist på 0.80. */

/** De färgtoken ett tema äger. Formen och måtten — radier, mellanrum,
 *  typsnitt — är appens och byts inte med temat. Detsamma gäller sjoket bakom
 *  en modal: det är mörkt i båda lägena och har ingen åsikt om temat. */
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
    | '--tone';

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
    '--bg-base': 'oklch(0.205 0.024 272)',
    '--bg-floor': 'oklch(0.15 0.019 272)',
    '--bg-card': 'oklch(0.248 0.024 272)',
    '--bg-card-raised': 'oklch(0.31 0.028 272)',
    '--accent-highlight': 'oklch(0.84 0.155 82)',
    '--on-highlight': 'oklch(0.18 0.024 272)',
    '--accent-green': 'oklch(0.8 0.155 155)',
    '--green-deep': 'oklch(0.72 0.165 155)',
    '--green-shadow': 'oklch(0.6 0.149 155)',
    '--on-green': 'oklch(0.18 0.024 272)',
    '--accent-red': 'oklch(0.72 0.165 25)',
    '--accent-orange': 'oklch(0.8 0.133 55)',
    '--card-face': 'oklch(0.9 0.120 90)',
    '--card-ink': 'oklch(0.21 0.030 90)',
    '--text-primary': 'oklch(0.965 0.006 272)',
    '--text-muted': 'oklch(0.72 0.018 272)',
    '--tone': 'oklch(0.99 0.004 272)',
};

const lightBase: Palette = {
    '--bg-base': 'oklch(0.98 0.006 85)',
    '--bg-floor': 'oklch(0.945 0.012 85)',
    '--bg-card': 'oklch(0.999 0.002 85)',
    '--bg-card-raised': 'oklch(0.962 0.008 85)',
    '--accent-highlight': 'oklch(0.505 0.111 68)',
    '--on-highlight': 'oklch(0.995 0.006 68)',
    '--accent-green': 'oklch(0.505 0.125 155)',
    '--green-deep': 'oklch(0.45 0.112 155)',
    '--green-shadow': 'oklch(0.38 0.095 155)',
    '--on-green': 'oklch(0.995 0.006 155)',
    '--accent-red': 'oklch(0.505 0.165 25)',
    '--accent-orange': 'oklch(0.505 0.135 42)',
    '--card-face': 'oklch(0.9 0.120 90)',
    '--card-ink': 'oklch(0.21 0.030 90)',
    '--text-primary': 'oklch(0.28 0.032 272)',
    '--text-muted': 'oklch(0.5 0.026 272)',
    '--tone': 'oklch(0.235 0.032 272)',
};

const dark = (over: Partial<Palette>): Palette => ({ ...darkBase, ...over });
const light = (over: Partial<Palette>): Palette => ({ ...lightBase, ...over });

export const THEMES: readonly Theme[] = [
    {
        id: 'midnatt',
        name: 'Midnatt',
        note: 'Nuvarande: indigo natt med bärnsten',
    },
    {
        id: 'grafit',
        name: 'Grafit',
        note: 'Neutral grafit, en enda sval signal',
        dark: dark({
            '--bg-base': 'oklch(0.205 0.008 285)',
            '--bg-floor': 'oklch(0.15 0.006 285)',
            '--bg-card': 'oklch(0.248 0.008 285)',
            '--bg-card-raised': 'oklch(0.31 0.009 285)',
            '--accent-highlight': 'oklch(0.76 0.122 265)',
            '--on-highlight': 'oklch(0.18 0.008 285)',
            '--on-green': 'oklch(0.18 0.008 285)',
            '--accent-red': 'oklch(0.72 0.165 22)',
            '--accent-orange': 'oklch(0.8 0.150 65)',
            '--card-face': 'oklch(0.9 0.067 62)',
            '--card-ink': 'oklch(0.21 0.030 62)',
            '--text-primary': 'oklch(0.965 0.006 285)',
            '--text-muted': 'oklch(0.72 0.018 285)',
            '--tone': 'oklch(0.99 0.004 285)',
        }),
        light: light({
            '--bg-base': 'oklch(0.98 0.006 80)',
            '--bg-floor': 'oklch(0.945 0.012 80)',
            '--bg-card': 'oklch(0.999 0.002 80)',
            '--bg-card-raised': 'oklch(0.962 0.008 80)',
            '--accent-highlight': 'oklch(0.505 0.135 262)',
            '--on-highlight': 'oklch(0.995 0.006 262)',
            '--accent-red': 'oklch(0.505 0.165 22)',
            '--accent-orange': 'oklch(0.505 0.117 62)',
            '--card-face': 'oklch(0.9 0.067 62)',
            '--card-ink': 'oklch(0.21 0.030 62)',
            '--text-primary': 'oklch(0.28 0.032 285)',
            '--text-muted': 'oklch(0.5 0.026 285)',
            '--tone': 'oklch(0.235 0.032 285)',
        }),
    },
    {
        id: 'citrus',
        name: 'Citrus',
        note: 'Mörk mossa med syrlig lime',
        dark: dark({
            '--bg-base': 'oklch(0.205 0.020 145)',
            '--bg-floor': 'oklch(0.15 0.016 145)',
            '--bg-card': 'oklch(0.248 0.020 145)',
            '--bg-card-raised': 'oklch(0.31 0.023 145)',
            '--accent-highlight': 'oklch(0.84 0.155 122)',
            '--on-highlight': 'oklch(0.18 0.020 145)',
            '--accent-green': 'oklch(0.8 0.155 160)',
            '--green-deep': 'oklch(0.72 0.163 160)',
            '--green-shadow': 'oklch(0.6 0.136 160)',
            '--on-green': 'oklch(0.18 0.020 145)',
            '--accent-orange': 'oklch(0.8 0.150 65)',
            '--card-face': 'oklch(0.9 0.120 118)',
            '--card-ink': 'oklch(0.21 0.030 118)',
            '--text-primary': 'oklch(0.965 0.006 145)',
            '--text-muted': 'oklch(0.72 0.018 145)',
            '--tone': 'oklch(0.99 0.004 145)',
        }),
        light: light({
            '--bg-base': 'oklch(0.98 0.006 110)',
            '--bg-floor': 'oklch(0.945 0.012 110)',
            '--bg-card': 'oklch(0.999 0.002 110)',
            '--bg-card-raised': 'oklch(0.962 0.008 110)',
            '--accent-highlight': 'oklch(0.505 0.133 128)',
            '--on-highlight': 'oklch(0.995 0.006 128)',
            '--accent-green': 'oklch(0.505 0.115 160)',
            '--green-deep': 'oklch(0.45 0.102 160)',
            '--green-shadow': 'oklch(0.38 0.087 160)',
            '--on-green': 'oklch(0.995 0.006 160)',
            '--accent-orange': 'oklch(0.505 0.134 50)',
            '--card-face': 'oklch(0.9 0.120 118)',
            '--card-ink': 'oklch(0.21 0.030 118)',
            '--text-primary': 'oklch(0.28 0.032 145)',
            '--text-muted': 'oklch(0.5 0.026 145)',
            '--tone': 'oklch(0.235 0.032 145)',
        }),
    },
    {
        id: 'arktis',
        name: 'Arktis',
        note: 'Kall djupblå med cyan is',
        dark: dark({
            '--bg-base': 'oklch(0.205 0.030 240)',
            '--bg-floor': 'oklch(0.15 0.024 240)',
            '--bg-card': 'oklch(0.248 0.030 240)',
            '--bg-card-raised': 'oklch(0.31 0.034 240)',
            '--accent-highlight': 'oklch(0.84 0.144 205)',
            '--on-highlight': 'oklch(0.18 0.030 240)',
            '--accent-green': 'oklch(0.8 0.155 165)',
            '--green-deep': 'oklch(0.72 0.152 165)',
            '--green-shadow': 'oklch(0.6 0.126 165)',
            '--on-green': 'oklch(0.18 0.030 240)',
            '--accent-red': 'oklch(0.72 0.165 22)',
            '--accent-orange': 'oklch(0.8 0.140 60)',
            '--card-face': 'oklch(0.9 0.120 200)',
            '--card-ink': 'oklch(0.21 0.030 200)',
            '--text-primary': 'oklch(0.965 0.006 240)',
            '--text-muted': 'oklch(0.72 0.018 240)',
            '--tone': 'oklch(0.99 0.004 240)',
        }),
        light: light({
            '--bg-base': 'oklch(0.98 0.006 225)',
            '--bg-floor': 'oklch(0.945 0.012 225)',
            '--bg-card': 'oklch(0.999 0.002 225)',
            '--bg-card-raised': 'oklch(0.962 0.008 225)',
            '--accent-highlight': 'oklch(0.505 0.090 215)',
            '--on-highlight': 'oklch(0.995 0.006 215)',
            '--accent-green': 'oklch(0.505 0.107 165)',
            '--green-deep': 'oklch(0.45 0.095 165)',
            '--green-shadow': 'oklch(0.38 0.081 165)',
            '--on-green': 'oklch(0.995 0.006 165)',
            '--accent-red': 'oklch(0.505 0.165 22)',
            '--accent-orange': 'oklch(0.505 0.135 45)',
            '--card-face': 'oklch(0.9 0.120 200)',
            '--card-ink': 'oklch(0.21 0.030 200)',
            '--text-primary': 'oklch(0.28 0.032 240)',
            '--text-muted': 'oklch(0.5 0.026 240)',
            '--tone': 'oklch(0.235 0.032 240)',
        }),
    },
    {
        id: 'ametist',
        name: 'Ametist',
        note: 'Violett natt med lila ljus',
        dark: dark({
            '--bg-base': 'oklch(0.205 0.032 292)',
            '--bg-floor': 'oklch(0.15 0.026 292)',
            '--bg-card': 'oklch(0.248 0.032 292)',
            '--bg-card-raised': 'oklch(0.31 0.037 292)',
            '--accent-highlight': 'oklch(0.8 0.126 305)',
            '--on-highlight': 'oklch(0.18 0.032 292)',
            '--accent-green': 'oklch(0.8 0.155 160)',
            '--green-deep': 'oklch(0.72 0.163 160)',
            '--green-shadow': 'oklch(0.6 0.136 160)',
            '--on-green': 'oklch(0.18 0.032 292)',
            '--accent-red': 'oklch(0.72 0.165 18)',
            '--card-face': 'oklch(0.9 0.061 305)',
            '--card-ink': 'oklch(0.21 0.030 305)',
            '--text-primary': 'oklch(0.965 0.006 292)',
            '--text-muted': 'oklch(0.72 0.018 292)',
            '--tone': 'oklch(0.99 0.004 292)',
        }),
        light: light({
            '--bg-base': 'oklch(0.98 0.006 300)',
            '--bg-floor': 'oklch(0.945 0.012 300)',
            '--bg-card': 'oklch(0.999 0.002 300)',
            '--bg-card-raised': 'oklch(0.962 0.008 300)',
            '--accent-highlight': 'oklch(0.505 0.135 300)',
            '--on-highlight': 'oklch(0.995 0.006 300)',
            '--accent-green': 'oklch(0.505 0.115 160)',
            '--green-deep': 'oklch(0.45 0.102 160)',
            '--green-shadow': 'oklch(0.38 0.087 160)',
            '--on-green': 'oklch(0.995 0.006 160)',
            '--accent-red': 'oklch(0.505 0.165 18)',
            '--accent-orange': 'oklch(0.505 0.135 45)',
            '--card-face': 'oklch(0.9 0.061 305)',
            '--card-ink': 'oklch(0.21 0.030 305)',
            '--text-primary': 'oklch(0.28 0.032 292)',
            '--text-muted': 'oklch(0.5 0.026 292)',
            '--tone': 'oklch(0.235 0.032 292)',
        }),
    },
    {
        id: 'sockervadd',
        name: 'Sockervadd',
        note: 'Plommon, hallon och mynta',
        dark: dark({
            '--bg-base': 'oklch(0.205 0.030 328)',
            '--bg-floor': 'oklch(0.15 0.024 328)',
            '--bg-card': 'oklch(0.248 0.030 328)',
            '--bg-card-raised': 'oklch(0.31 0.034 328)',
            '--accent-highlight': 'oklch(0.82 0.137 340)',
            '--on-highlight': 'oklch(0.18 0.030 328)',
            '--accent-green': 'oklch(0.8 0.155 168)',
            '--green-deep': 'oklch(0.72 0.146 168)',
            '--green-shadow': 'oklch(0.6 0.122 168)',
            '--on-green': 'oklch(0.18 0.030 328)',
            '--accent-red': 'oklch(0.72 0.165 28)',
            '--accent-orange': 'oklch(0.8 0.140 60)',
            '--card-face': 'oklch(0.9 0.063 348)',
            '--card-ink': 'oklch(0.21 0.030 348)',
            '--text-primary': 'oklch(0.965 0.006 328)',
            '--text-muted': 'oklch(0.72 0.018 328)',
            '--tone': 'oklch(0.99 0.004 328)',
        }),
        light: light({
            '--bg-base': 'oklch(0.98 0.006 340)',
            '--bg-floor': 'oklch(0.945 0.012 340)',
            '--bg-card': 'oklch(0.999 0.002 340)',
            '--bg-card-raised': 'oklch(0.962 0.008 340)',
            '--accent-highlight': 'oklch(0.505 0.135 348)',
            '--on-highlight': 'oklch(0.995 0.006 348)',
            '--accent-green': 'oklch(0.505 0.103 168)',
            '--green-deep': 'oklch(0.45 0.092 168)',
            '--green-shadow': 'oklch(0.38 0.078 168)',
            '--on-green': 'oklch(0.995 0.006 168)',
            '--accent-red': 'oklch(0.505 0.165 28)',
            '--accent-orange': 'oklch(0.505 0.135 48)',
            '--card-face': 'oklch(0.9 0.063 348)',
            '--card-ink': 'oklch(0.21 0.030 348)',
            '--text-primary': 'oklch(0.28 0.032 328)',
            '--text-muted': 'oklch(0.5 0.026 328)',
            '--tone': 'oklch(0.235 0.032 328)',
        }),
    },
    {
        id: 'lera',
        name: 'Lera',
        note: 'Varm terrakotta och sand',
        dark: dark({
            '--bg-base': 'oklch(0.205 0.022 62)',
            '--bg-floor': 'oklch(0.15 0.018 62)',
            '--bg-card': 'oklch(0.248 0.022 62)',
            '--bg-card-raised': 'oklch(0.31 0.025 62)',
            '--accent-highlight': 'oklch(0.8 0.133 55)',
            '--on-highlight': 'oklch(0.18 0.022 62)',
            '--accent-green': 'oklch(0.8 0.155 150)',
            '--green-deep': 'oklch(0.72 0.165 150)',
            '--green-shadow': 'oklch(0.6 0.150 150)',
            '--on-green': 'oklch(0.18 0.022 62)',
            '--accent-orange': 'oklch(0.8 0.116 32)',
            '--card-face': 'oklch(0.9 0.079 72)',
            '--card-ink': 'oklch(0.21 0.030 72)',
            '--text-primary': 'oklch(0.965 0.006 62)',
            '--text-muted': 'oklch(0.72 0.018 62)',
            '--tone': 'oklch(0.99 0.004 62)',
        }),
        light: light({
            '--bg-base': 'oklch(0.98 0.006 75)',
            '--bg-floor': 'oklch(0.945 0.012 75)',
            '--bg-card': 'oklch(0.999 0.002 75)',
            '--bg-card-raised': 'oklch(0.962 0.008 75)',
            '--accent-highlight': 'oklch(0.505 0.135 48)',
            '--on-highlight': 'oklch(0.995 0.006 48)',
            '--accent-green': 'oklch(0.505 0.135 150)',
            '--green-deep': 'oklch(0.45 0.125 150)',
            '--green-shadow': 'oklch(0.38 0.106 150)',
            '--on-green': 'oklch(0.995 0.006 150)',
            '--accent-orange': 'oklch(0.505 0.135 30)',
            '--card-face': 'oklch(0.9 0.079 72)',
            '--card-ink': 'oklch(0.21 0.030 72)',
            '--text-primary': 'oklch(0.28 0.032 62)',
            '--text-muted': 'oklch(0.5 0.026 62)',
            '--tone': 'oklch(0.235 0.032 62)',
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
