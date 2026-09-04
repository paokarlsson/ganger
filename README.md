# Ganger

A small Angular app for practising the multiplication table. The start screen
lets you pick one of three games, and shows how many of the hundred entries in
the table are already answered fast enough to count as automatic — once there
is any practice to count.

- **Para ihop** — match each question in the left column with its answer in the
  right one. Background music and sound effects included.
- **Svep** — a statement such as `7 × 8 = 54` is shown on a card. Swipe (or drag
  with the mouse, or press the arrow keys) right if it is correct, left if it is
  not. The statements are generated at run time by `swipe-difficulty.ts`; the
  curated set they were modelled on is kept next to that file as
  [`ranked-questions.reference.json`](src/app/swipe-view/ranked-questions.reference.json);
  nothing imports it, so it is not shipped.
- **Mästaren** — type the answer against the clock. Pick a level (one table at a
  time, all of them mixed, or *Auto*, which follows how the round is going) and a
  round length. A short calibration measures how fast the player answers the
  easiest questions; everything after that is judged against that time. A wrong
  answer costs four seconds. The heat map shows the average time per table
  entry, and how many of the hundred are answered fast enough to count as
  automatic.

The swipe game was moved here from the separate `ganger-swipe` repository, which
is no longer developed. *Mästaren* was ported from a standalone HTML prototype.

All four surfaces share one style sheet, which lives in `src/styles/`:
`_tokens.scss` holds the palette, fonts, radii and spacing as CSS variables,
`_base.scss` the reset, and `_ui.scss` a small set of global `ui-` classes —
card, title, button, toggle, dot and modal — that the components use instead of
restyling the same widget once per game. A component's own stylesheet keeps only
what is that game's own: the swipe card, the heat map, the matching board. The
`ui-` prefix in a template is the signal that the look comes from the shared
sheet. The dark palette was *Mästaren*'s to begin with, and the yellow of
*Svep*'s card is kept as its own token, deliberately lighter than the theme's
gold.

Several token values are pinned by WCAG 2.2 AA rather than by taste, so changing
them is not free: `--accent-red` is lighter than a plain red because #e74c3c sat
at 4.46:1 against the background, just under the 4.5:1 needed for body text;
`--line-strong` is as bright as it is because a control's border needs 3:1
against *both* neighbours, the surface outside and the control's own fill; and
the primary button carries dark text because white on `--accent-green` is
2.1:1. Text on a red or green tint is light, never red or green — a colour
against its own tint does not reach 4.5:1. Where colour carries meaning it is
never alone: *Para ihop* marks tiles with ✓ and ✗, *Svep* stamps the card RÄTT
or FEL, and *Mästaren*'s dot rows have an `aria-label` saying the same thing in
words.

*Mästaren* keeps its statistics in `localStorage` under `mult-heatmap` and
`mult-calibration`, so they live in the browser they were practised in and are
cleared with the **Nollställ** button on the heat map screen.

## Structure

| Path | What it is |
| --- | --- |
| `src/styles.scss` | Entry point; pulls in the three parts below |
| `src/styles/_tokens.scss` | Colours, fonts, radii and spacing as CSS variables |
| `src/styles/_base.scss` | Reset, and the one reduced-motion rule for the app |
| `src/styles/_ui.scss` | The shared `ui-` classes the four surfaces build from |
| `src/app/app.component.*` | Shell: the start menu and the choice of game |
| `src/app/match-view/` | The *Para ihop* game |
| `src/app/swipe-view/` | The *Svep* game |
| `src/app/master-view/` | The *Mästaren* game, with its levels in `levels.ts` |
| `src/app/services/practice-stats.service.ts` | Times and calibration for *Mästaren* |

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) and runs on
Angular 22. Building it needs Node 22.22.3 or later (24 LTS is what CI and
[compose.yml](compose.yml) use).

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Build

Run `ng build` to build the project. The build artifacts will be stored in `dist/browser/`.

## Deployment

Two targets share the same build:

- **GitHub Pages** — `.github/workflows/pages.yml` builds every push to `main`
  with `--base-href /ganger/` and publishes `dist/browser`. Nothing is
  committed to the repository; the Pages source must be set to *GitHub
  Actions* under Settings → Pages.
- **Docker** — for machines without node installed, `docker compose up` runs
  the dev server (`ng serve`) inside a `node` container and exposes it on
  [http://localhost:4200](http://localhost:4200). The container runs as your
  host user (see the `user` field in [compose.yml](compose.yml)) so
  `node_modules` and `.angular/cache`, both bind-mounted, end up owned by you
  rather than root. `npm install` is a fast no-op once dependencies are
  already installed.

## Running unit tests

Run `ng test` to execute the unit tests via [Vitest](https://vitest.dev), which
runs them in jsdom.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
