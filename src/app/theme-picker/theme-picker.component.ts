/* TILLFÄLLIG — hela mappen theme-picker/ ska bort när ett tema är valt.
   Se README, avsnittet "Temaväljaren (tillfällig)", för de tre stegen.

   Allt ligger i en fil med mall och stil inbyggda, just för att raderingen
   ska bli en mapp och två rader i app.component och inget mer. Väljaren rör
   ingen annan del av appen: den skriver bara data-theme och data-mode på
   <html>, och temana når resten av appen genom samma token som _tokens.scss
   sätter. Ljust och mörkt läge är däremot inte tillfälligt — det bor i
   _tokens.scss och står kvar när den här mappen är borta. */

import { ChangeDetectionStrategy, Component, HostListener, OnDestroy } from '@angular/core';
import { THEMES, Theme, themeCss, themeDeclarations } from './themes';

/** Auto följer systemet; de andra två går före det. */
type Mode = 'auto' | 'light' | 'dark';

const THEME_KEY = 'ganger-tema';
const MODE_KEY = 'ganger-lage';
const STYLE_ID = 'ganger-teman';

@Component({
    selector: 'app-theme-picker',
    changeDetection: ChangeDetectionStrategy.Eager,
    template: `
        <div class="picker" [class.picker--open]="open">
            @if (open) {
                <div class="panel" role="dialog" aria-label="Välj tema">
                    <div class="panel-head">
                        <p class="panel-title">Tema</p>
                        <button type="button" class="close" (click)="close()" aria-label="Stäng">
                            ✕
                        </button>
                    </div>

                    <p class="panel-note">Tillfällig väljare — valet sparas lokalt.</p>

                    <div class="modes" role="group" aria-label="Ljust eller mörkt">
                        @for (choice of modes; track choice.id) {
                            <button
                                type="button"
                                class="mode"
                                [class.is-active]="mode === choice.id"
                                [attr.aria-pressed]="mode === choice.id"
                                (click)="setMode(choice.id)"
                            >
                                {{ choice.label }}
                            </button>
                        }
                    </div>

                    <ul class="themes">
                        @for (item of themes; track item.id) {
                            <li>
                                <button
                                    type="button"
                                    class="theme"
                                    [class.is-active]="theme === item.id"
                                    [attr.aria-pressed]="theme === item.id"
                                    (click)="setTheme(item.id)"
                                >
                                    <span class="swatch" aria-hidden="true">
                                        @for (color of swatch(item); track $index) {
                                            <span class="chip" [style.background]="color"></span>
                                        }
                                    </span>
                                    <span class="theme-text">
                                        <span class="theme-name">{{ item.name }}</span>
                                        <span class="theme-note">{{ item.note }}</span>
                                    </span>
                                </button>
                            </li>
                        }
                    </ul>

                    <button type="button" class="copy" (click)="copy()">
                        {{ copyLabel }}
                    </button>
                    <p class="panel-note panel-note--last">
                        Klart? Klistra in i <code>src/styles/_tokens.scss</code> och ta bort
                        mappen <code>theme-picker/</code>.
                    </p>
                </div>
            }

            <button
                type="button"
                class="toggle"
                [attr.aria-expanded]="open"
                (click)="open ? close() : openPanel()"
            >
                <span aria-hidden="true">🎨</span>
                <span class="toggle-text">Tema</span>
            </button>
        </div>
    `,
    styles: `
        :host {
            position: fixed;
            right: 0.75rem;
            bottom: calc(0.75rem + env(safe-area-inset-bottom));
            /* Över spelen och över dialogen i Mästaren, som ligger på 100. */
            z-index: 200;
            font-family: var(--font-body);
            color: var(--text-primary);
        }

        .picker {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: var(--space-2);
        }

        .toggle {
            display: flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.35rem 0.7rem;
            border: 2px solid var(--line-strong);
            border-radius: var(--radius-pill);
            background: var(--bg-card);
            color: var(--text-primary);
            font: inherit;
            font-size: 0.78rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: var(--shadow-card);
        }

        .toggle:hover {
            border-color: var(--accent-highlight);
        }

        .toggle:focus-visible {
            outline: var(--focus-ring);
            outline-offset: 3px;
        }

        /* Listan skrollar inuti panelen, inte panelen i sig: annars hamnar
           kopieringsknappen och raden om hur den tas bort under kanten. */
        .panel {
            display: flex;
            flex-direction: column;
            width: min(300px, calc(100vw - 1.5rem));
            max-height: min(80vh, 620px);
            overflow: hidden;
            padding: var(--space-3);
            border: 1px solid var(--line-soft);
            border-radius: var(--radius-md);
            background: var(--bg-card);
            box-shadow: var(--shadow-card);
        }

        .panel-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: var(--space-1);
        }

        .panel-title {
            font-family: var(--font-display);
            font-size: 1rem;
            font-weight: 700;
            color: var(--accent-highlight);
        }

        .close {
            padding: 0.15rem 0.4rem;
            border: 0;
            border-radius: var(--radius-sm);
            background: transparent;
            color: var(--text-muted);
            font: inherit;
            cursor: pointer;
        }

        .close:hover {
            color: var(--text-primary);
        }

        .panel-note {
            flex: none;
            margin-bottom: var(--space-2);
            font-size: 0.72rem;
            line-height: 1.45;
            color: var(--text-muted);
        }

        .panel-note code {
            font-size: 0.95em;
        }

        .panel-note--last {
            margin-bottom: 0;
        }

        .modes {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.25rem;
            margin-bottom: var(--space-3);
            padding: 0.25rem;
            border-radius: var(--radius-pill);
            background: var(--fill-soft);
        }

        .mode {
            padding: 0.4rem 0;
            border: 0;
            border-radius: var(--radius-pill);
            background: transparent;
            color: var(--text-muted);
            font: inherit;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
        }

        .mode.is-active {
            background: var(--accent-highlight);
            color: var(--on-highlight);
        }

        .mode:focus-visible,
        .theme:focus-visible,
        .copy:focus-visible,
        .close:focus-visible {
            outline: var(--focus-ring);
            outline-offset: 2px;
        }

        .themes {
            display: flex;
            flex: 1 1 auto;
            flex-direction: column;
            gap: 0.3rem;
            min-height: 0;
            overflow-y: auto;
            margin: 0 0 var(--space-3);
            padding: 0;
            list-style: none;
        }

        .theme {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            width: 100%;
            padding: 0.45rem 0.5rem;
            border: 2px solid transparent;
            border-radius: var(--radius-sm);
            background: var(--fill-soft);
            color: inherit;
            font: inherit;
            text-align: left;
            cursor: pointer;
        }

        .theme:hover {
            background: var(--fill-hover);
        }

        .theme.is-active {
            border-color: var(--accent-highlight);
        }

        .swatch {
            display: flex;
            flex: none;
            gap: 2px;
            padding: 3px;
            border-radius: var(--radius-sm);
            background: rgba(var(--tone-rgb), 0.1);
        }

        .chip {
            width: 12px;
            height: 20px;
            border-radius: 3px;
        }

        .theme-text {
            display: flex;
            flex-direction: column;
        }

        .theme-name {
            font-size: 0.9rem;
            font-weight: 600;
        }

        .theme-note {
            font-size: 0.72rem;
            color: var(--text-muted);
        }

        .copy {
            flex: none;
            width: 100%;
            margin-bottom: var(--space-2);
            padding: 0.5rem;
            border: 2px solid var(--line-strong);
            border-radius: var(--radius-sm);
            background: transparent;
            color: var(--text-primary);
            font: inherit;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
        }

        .copy:hover {
            border-color: var(--accent-highlight);
        }
    `,
})
export class ThemePickerComponent implements OnDestroy {
    readonly themes = THEMES;
    readonly modes: readonly { id: Mode; label: string }[] = [
        { id: 'auto', label: 'Auto' },
        { id: 'light', label: 'Ljust' },
        { id: 'dark', label: 'Mörkt' },
    ];

    open = false;
    theme = read(THEME_KEY) ?? THEMES[0].id;
    mode: Mode = asMode(read(MODE_KEY));
    copyLabel = 'Kopiera temats CSS';

    /** Auto behöver veta vad systemet säger, för att provkartorna ska visa
     *  färgerna i det läge som faktiskt är på. Appen själv byter utan hjälp:
     *  det är mediefrågan i _tokens.scss som gör det. */
    private readonly systemLight = matchMedia('(prefers-color-scheme: light)');
    private systemIsLight = this.systemLight.matches;
    private readonly onSystemChange = (event: MediaQueryListEvent) => {
        this.systemIsLight = event.matches;
    };

    constructor() {
        this.systemLight.addEventListener('change', this.onSystemChange);
        injectThemeStyles();
        this.apply();
    }

    ngOnDestroy(): void {
        this.systemLight.removeEventListener('change', this.onSystemChange);
    }

    openPanel(): void {
        this.open = true;
        this.copyLabel = 'Kopiera temats CSS';
    }

    @HostListener('document:keydown.escape')
    close(): void {
        this.open = false;
    }

    setTheme(id: string): void {
        this.theme = id;
        write(THEME_KEY, id);
        this.apply();
    }

    setMode(mode: Mode): void {
        this.mode = mode;
        write(MODE_KEY, mode);
        this.apply();
    }

    /** Fyra färger ur temat i det läge som faktiskt visas just nu. */
    swatch(theme: Theme): string[] {
        const palette = this.effectiveMode() === 'light' ? theme.light : theme.dark;
        const from = palette ?? fallbackPalette(this.effectiveMode());
        return [
            from['--bg-card'],
            from['--accent-highlight'],
            from['--accent-green'],
            from['--accent-red'],
        ];
    }

    async copy(): Promise<void> {
        const theme = THEMES.find((t) => t.id === this.theme);
        const css = theme ? themeDeclarations(theme) : '';
        if (!css) {
            this.copyLabel = 'Midnatt står redan i _tokens.scss';
            return;
        }
        try {
            await navigator.clipboard.writeText(css);
            this.copyLabel = 'Kopierat!';
        } catch {
            // Utan skrivrättighet till urklipp får konsolen bära texten.
            console.info(css);
            this.copyLabel = 'Urklipp nekades — se konsolen';
        }
    }

    private effectiveMode(): 'light' | 'dark' {
        if (this.mode !== 'auto') {
            return this.mode;
        }
        return this.systemIsLight ? 'light' : 'dark';
    }

    private apply(): void {
        const root = document.documentElement;
        root.dataset['theme'] = this.theme;
        if (this.mode === 'auto') {
            delete root.dataset['mode'];
        } else {
            root.dataset['mode'] = this.mode;
        }
    }
}

/** Temanas CSS läggs in en gång, efter appens egen stilmall, så att en regel
 *  med samma specificitet där vinner på att den står senare. */
function injectThemeStyles(): void {
    if (document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = THEMES.map(themeCss).filter(Boolean).join('\n\n');
    document.head.append(style);
}

/** Midnatt har ingen palett här — den ligger i _tokens.scss. Provkartan
 *  behöver ändå några färger att visa. */
function fallbackPalette(mode: 'light' | 'dark'): Record<string, string> {
    return mode === 'light'
        ? {
              '--bg-card': '#ffffff',
              '--accent-highlight': '#8a6300',
              '--accent-green': '#157a41',
              '--accent-red': '#c3372b',
          }
        : {
              '--bg-card': '#16213e',
              '--accent-highlight': '#ffd700',
              '--accent-green': '#2ecc71',
              '--accent-red': '#ea6253',
          };
}

function asMode(value: string | null): Mode {
    return value === 'light' || value === 'dark' ? value : 'auto';
}

// localStorage kan kasta i privat läge och när sajtdata är avstängt, precis
// som i practice-stats.service.ts. Väljaren är tillfällig — den får hellre
// glömma valet än stoppa appen.
function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* strunt samma */
    }
}
