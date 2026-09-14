# Ganger

A small Angular app for practising the multiplication table. The start screen
lets you pick one of three games, and shows how many of the 55 facts in the
table are already answered fast enough to count as automatic — once there is
any practice to count.

- **Para ihop** — match each question in the left column with its answer in the
  right one. Background music and sound effects included. Its rounds are drawn
  from the shared fact catalogue, and every pair it resolves is written to an
  observation log; see below.
- **Svep** — a statement such as `7 × 8 = 54` is shown on a card. Swipe (or drag
  with the mouse, or press the arrow keys) right if it is correct, left if it is
  not. Pick a round of 10 to 40 cards, or ∞ to keep going until you press
  **Klar**. Every round opens with five cards from the anchor band (×1, ×10)
  that measure how fast this player swipes; everything after that is judged
  against that pace, so the level means the same thing for a quick player and a
  slow one. It has to be measured on the anchor band and nowhere else: take the
  median of every card instead and the threshold rises with the level and ends
  up chasing its own tail. The level says which facts you get, and the fire says
  how it is going right now — it grows with the run of fast correct answers and
  goes out on a miss, which is what being on fire means. There is a heat map
  too, reached from the menu once there is something to show. It fills half a
  10 × 10 grid, because 7 × 8 and 8 × 7 are one fact here and the swipes are
  only ever stored under one of the two orderings, and it counts to 55 rather
  than to 100 for the same reason. Its colours are measured against the swipe
  pace, never against *Mästaren*'s calibration — the two times are not
  comparable. The statements are
  generated at run time by `swipe-difficulty.ts`; the curated set they were
  modelled on is kept next to that file as
  [`ranked-questions.reference.json`](src/app/swipe-view/ranked-questions.reference.json);
  nothing imports it, so it is not shipped.
- **Mästaren** — type the answer against the clock. Pick a level (one table at a
  time, all of them mixed, or *Auto*, which follows how the round is going) and a
  round length. A short calibration measures how fast the player answers the
  easiest questions; everything after that is judged against that time. A wrong
  answer costs four seconds. The heat map shows the average time per table
  entry, and how many of the 55 facts are answered fast enough to count as
  automatic.

The swipe game was moved here from the separate `ganger-swipe` repository, which
is no longer developed. *Mästaren* was ported from a standalone HTML prototype.

All four surfaces share one style sheet, which lives in `src/styles/`:
`_tokens.scss` holds the palettes, fonts, radii and spacing as CSS variables,
`_base.scss` the reset, and `_ui.scss` a small set of global `ui-` classes —
card, title, button, toggle, dot, modal and the heat map grid — that the
components use instead of restyling the same widget once per game. A component's
own stylesheet keeps only what is that game's own: the swipe card, the matching
board, and each heat map screen's own layout around the shared grid. The
`ui-` prefix in a template is the signal that the look comes from the shared
sheet. The dark palette was *Mästaren*'s to begin with, and the yellow of
*Svep*'s card is kept as its own token, deliberately lighter than the theme's
highlight — the card is an object on a table, not a heading, and so keeps its
colour in both modes.

`_tokens.scss` holds two palettes, a dark one and a light one, as SCSS mixins.
Without a choice in the app the system decides, through
`prefers-color-scheme`; `data-mode="light"` or `"dark"` on `<html>` outweighs
it.

The colours are written in `oklch()` rather than hex, and that is not
cosmetic. The first number, L, is the lightness the eye actually sees, and it
means the same across every hue — so putting the accents on one L is what
makes them weigh the same on screen. Written in hex they did not: the old gold
`#ffd700` sat at L 0.89 and the old red `#ea6253` at L 0.67, so the gold shouted
over everything else whatever it was trying to say. The ladder is the whole
rule, and a departure from it needs a reason:

- **Grounds** at L 0.15 / 0.21 / 0.25 / 0.31 in dark mode, chroma near zero,
  one hue the whole way. A ground should carry colour, not be colour. The old
  grounds drifted 15° in hue between the floor and the cards and nearly
  doubled in chroma on the way up, which is what made the navy read as a
  colour of its own.
- **Accents** at L 0.84 for the one that lifts, 0.80 for green and orange,
  0.72 for red, which cannot go lighter without turning pink. In light mode
  they all sit at L 0.505 — the lightest they can be and still clear 4.5:1
  against `--bg-floor`.
- **The button's ladder**: green 0.80 at rest, `--green-deep` 0.72 pressed,
  `--green-shadow` 0.60 for the edge underneath. One even step in L per state,
  so the three read as one colour at three depths; in hex the steps were
  uneven.
- **The one exception** is the accent that lifts. Blue and violet cannot be
  both that light and that coloured — sRGB runs out — so for those hues the
  lightness drops until chroma reaches 0.12, never below 0.72.

The primary button is the one place where the app still wants to feel
physical, and that is worth keeping in a game for children — what was dated
was how it did it. The vertical gloss gradient is gone; a highlight from above
is inherited from buttons that wanted to look like glass. What is left is a
flat fill, an edge underneath that is the button's thickness, and a soft
shadow under the edge that is the air down to the card — the edge alone made
it a paper cutout rather than an object. Hover is computed rather than stored:
one step in lightness away from the ground, up against a dark one and down
against a light one, written with `oklch(from …)` so that only the lightness
moves. Mixing toward `--tone` would have dragged the hue along and turned the
green teal.

Light mode is not dark mode mirrored. Its ground is warm (hue 85) rather than
blue-grey: paper that leans yellow reads as paper, where the old `#f7f8fc`
read as a disabled control. The ink stays on the dark palette's hue, and that
warm-ground/cool-ink pairing is what carries the mode.

Three tokens are what make one set of rules serve both modes:

- `--tone` is *the opposite of the ground* — near-white against the dark
  palette, ink against the light one. Borders, faint fills and the pattern on
  the start screen are mixed out of it with `color-mix()`, so a surface that
  lifted off a dark ground lifts off a light one too. `--line-strong-alpha`
  goes with it, and is higher in light mode: ink against a white card does not
  clear 3:1 until 58%, where the light tone against a dark ground is there at
  45%.
- `--on-highlight` and `--on-green` are the text on the two colours that are
  used as fills — the active toggle and the primary button. They used to read
  `--bg-floor`, which only holds while the floor is dark.
- `--card-ink` is the text on *Svep*'s card, which is a light card in both
  modes and so cannot inherit the app's text colour. The heat map's cells
  borrow it for the same reason.

Colours a token needs but no palette should have to state twice — the green
and red tints, the highlight's tint and border — are derived from the accent
with `color-mix()` in `:root`. Nothing outside `_tokens.scss` writes a colour
of its own: the modal's scrim, the fire's glow in *Svep* and the untested
squares in both heat maps all used to, and all three broke in one mode or the
other — a 10% white square is invisible on a white card.

Several token values are pinned by WCAG 2.2 AA rather than by taste, so changing
them is not free: `--accent-red` stops at L 0.72 because below that it falls
under 4.5:1 against `--bg-card-raised`, the lightest ground;
`--line-strong` is as strong as it is because a control's border needs 3:1
against *both* neighbours, the surface outside and the control's own fill; and
the primary button carries dark text in the dark palette because white on that
`--accent-green` is 2:1 — which is exactly why the colour under the text is
a token of its own, `--on-green`, and turns light where the light palette's
green is dark enough to carry it; the weakest of that button's six
combinations, three states across two palettes, is 5.5:1. Text on a red or green tint is light, never
red or green — a colour against its own tint does not reach 4.5:1.

Both heat maps colour a time on one scale, and that scale sweeps hue in OKLCH
at a fixed lightness. It used to sweep in HSL at a fixed 45% *HSL* lightness,
which is not the same thing at all: 45% does not mean the same brightness to
the eye at yellow as it does at red, so the amber end glared, the red end went
dark, and the white number in the square sat at 2.2:1 against the amber where
it needs 4.5:1. Held at one OKLCH lightness the ramp weighs the same at every
step, and the squares carry `--card-ink` at 6.7:1 or better along its whole
length. Green is not a point on that ramp but a verdict — fast enough — and so
stands apart from it, in the function and in the legend alike. A square with no
measurement is neither: it takes the ground's own fill and a muted dash.

Where colour carries meaning it is never alone: *Para ihop* marks tiles with
✓ and ✗, *Svep* stamps the card RÄTT
or FEL and writes out the name of the fire's tier beside it, and *Mästaren*'s
dot rows have an `aria-label` saying the same thing in words. *Svep*'s fire
grows inside a box that is the same size at every tier, so that a card is never
nudged out from under a thumb mid-swipe.

All three games keep what they know about the player in `localStorage`, so it
lives in the browser it was practised in. It is one document under one key,
`ganger-progress`, and `src/app/services/progress-store.ts` is the only file
that knows that. Everything else asks the repository for a document and gets
one back; swapping `localStorage` for a database later is a new implementation
of `ProgressRepository` and nothing else. The interface is asynchronous even
though `localStorage` is not — a promise can be fulfilled synchronously, but a
synchronous signature cannot be made asynchronous later without rewriting every
caller. The document is read once at startup, before the first view is drawn
(`provideAppInitializer` in `app.config.ts`), and everything after that reads
the hydrated copy in memory, because the templates read it on every change
detection and cannot wait for a promise.

The document carries a `schemaVersion` so the next change of shape has
somewhere to hang its migration. Version 1 — five separate keys, `mult-heatmap`,
`mult-calibration`, `swipe-level`, `swipe-baseline` and `swipe-best-streak` — is
read once, converted, and deleted; having no version number of its own, it is
recognised by the shape of its keys instead.

The keys inside are machine-readable and stable: `mul:7x8`, always with the
smaller factor first. The namespace leaves room for `add:7+8` and `div:56/7`
without reshaping the document, and the canonical ordering is what makes 7 × 8
and 8 × 7 *one* fact instead of two rows that had to be merged on every read.
That is why the mastery count is out of 55 rather than 100: it is the number
*Svep* already counted to, and counting both orderings would be counting the
same knowledge twice.

It is also why there is now one heat map rather than two. `src/app/heatmap/`
draws the 55 facts as a triangle — the row is the smaller factor, the column
the larger — so each fact appears exactly once, and the channel is a toggle on
it rather than a second map. The colour is always measured against *that
channel's own* threshold: a swipe is recognition and is systematically faster
than a typed answer, so one shared scale would have made half the table look
mastered on the wrong grounds. Seeing a fact green under **Svept** and red
under **Skrivet** is not a fault in the map; it is the distinction between
recognising an answer and being able to retrieve it, which is the movement the
whole design is about.

Alongside it, under `ganger-observations`, sits a ring buffer of raw events
from *Para ihop* — what was paired, how long it took, how many pairs were
still on the board. Nothing in the game reads it, and nothing is chosen
from it. It is measurement, not pedagogy, and it exists to answer a question
that cannot be answered without data: *do the times in Para ihop say anything
about the same facts in Svep?* If they do not, the premise that matching is
diagnostic is wrong, and it is cheaper to learn that now than after an engine
has been built on top of the measure.

It records three zero points per pair, not one, because there is no obvious
answer to when a question *begins* in a game where five pairs lie on the table
at once: since the round was dealt, since the previous pair was resolved, and
since the first click of this exchange. Which of them says something about the
player is an empirical question, and storing all three is cheaper than guessing
wrong. It also records how many pairs were still on the board, which is the
measure of how much elimination was available — with one pair left the answer
is free — so a later threshold can be set on that number rather than on taste.
A mispairing is recorded too, with *both* facts and the answer that was chosen,
because pairing 7 × 8 with 54 is the same kind of information the distractors
are built from.

Reading it back is what the **Exportera data** button on *Mästaren*'s heat map
screen is for. The log lives in `localStorage` on the device it was practised
on, and that device is a tablet with no developer tools — without a way out,
the log is data nobody can read. The button puts both keys on the clipboard, or
downloads them as a file where the clipboard is refused; both are needed,
because the correlation above compares against swipe times, which live in the
progress document. Drop the result in `tools/observations.json` and run
`npm run report`: `observation-analysis.ts` writes a report to
`tools/observations-report.txt`. It is a separate script and not part of
`npm test`, so CI runs tests rather than a report generator. Neither file is committed — a child's response
times do not belong in a public repo — and nothing in `src/app` imports the
analysis, so it never reaches the bundle.

The buffer holds 2000 events, and that number is read backwards from the
report rather than picked for feeling roomy. A round is five pairs, and only
the pairs solved with at least three still on the board count as evidence —
three of every five. Getting each of the 55 facts to about five such pairs
takes roughly 460 solved pairs, some ninety rounds, call it 600 events; random
selection is uneven, so *most* facts reach that only with the cap set well
above the average. The earlier cap of 200 did not hold a quarter of one
measurement, which made it, and not the hand-driven export, the binding
constraint on step 4. If the write is ever refused — a full quota is plausible
at this size — the log halves what it stores and keeps the newest rather than
silently storing nothing.

*Para ihop* still picks its facts at random, even though the catalogue knows
which ones are hard. That is deliberate: calibrating against the log needs an
unbiased sample of the whole table, and the moment the game starts choosing
facts from what it already believes, the log becomes an echo of that belief
rather than a measurement of the player.

All of it is cleared by the **Nollställ** button on the heat map screen, and by
*Ny spelare* on the start screen.

## Structure

| Path | What it is |
| --- | --- |
| `src/styles.scss` | Entry point; pulls in the three parts below |
| `src/styles/_tokens.scss` | Colours, fonts, radii and spacing as CSS variables |
| `src/styles/_base.scss` | Reset, the shared game surface, and the one reduced-motion rule |
| `src/styles/_ui.scss` | The shared `ui-` classes the four surfaces build from |
| `src/app/app.component.*` | Shell: the start menu and the choice of game |
| `src/app/match-view/` | The *Para ihop* game |
| `src/app/swipe-view/` | The *Svep* game |
| `src/app/master-view/` | The *Mästaren* game, with its levels in `levels.ts` |
| `src/app/services/progress-store.ts` | The stored document, its schema version and its migrations |
| `src/app/services/local-store.ts` | The only file that touches `localStorage` directly |
| `src/app/services/debounced-writer.ts` | Delayed writes, flushed when the tab goes away |
| `src/app/services/observation-log.ts` | Raw training events; written, not yet read |
| `src/app/shared/` | `shuffle`, `clamp`, `median` and `mean`, shared by everything above |
| `src/app/testing/` | Helpers for the specs only; never imported by the app |
| `src/app/training/training-engine.ts` | What the game believes about the player, and what it does with that |
| `src/app/training/auto-difficulty.ts` | How *Mästaren*'s auto mode moves between difficulty groups |
| `src/app/heatmap/` | The one heat map, shared by both games |
| `src/app/training/observation-analysis.ts` | Reads the observation log; not part of the app |
| `src/app/services/progress-export.ts` | Gets the log and the progress off the device |
| `src/app/services/time-color.ts` | The green-to-red scale both heat maps colour a time with |
| `src/app/theme-picker/` | **Temporary** — the theme picker; see below |
| `docs/plan.md` | What is decided, what is open, and which constants are guesses |

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) and runs on
Angular 22. Building it needs Node 22.22.3 or later (24 LTS is what CI and
[compose.yml](compose.yml) use).

## Three layers

The app is split so that the teaching is not spread across event handlers:

| Layer | What it decides |
| --- | --- |
| The four view components | What is on screen |
| `TrainingEngine` | What the player knows, and what should come next |
| `ProgressRepository` | Where the bytes live |

A view asks the engine a question — *how much does this fact need practice*,
*what level should this round start at*, *was that swipe fast for this player* —
and never reads a threshold or a stored time to work it out for itself. Where a
component used to hold the answer, it now holds only the state of the round in
front of it.

The engine in turn owns none of the pure rules. Those stay in modules of their
own, where they can be tested without a player: `facts/fact-selector.ts` picks a
fact, `swipe-view/swipe-difficulty.ts` moves *Svep*'s level,
`training/auto-difficulty.ts` moves *Mästaren*'s difficulty group. Each is a
function from old state plus one event to new state, which is the shape the
whole model is meant to have:

    old state + new event = new state

Where this is all going — the remaining steps, the questions still open, and
the constants that were set by feel rather than measured — is written down in
[`docs/plan.md`](docs/plan.md), in Swedish, alongside the reasoning behind each
one. Constants it lists are marked `ANTAGANDE:` where they are defined, so the
code points back at it.

`auto-difficulty.ts` is the newest of them and came out of
`master-view.component.ts`, where the same rule lived as three mutable fields
and two nested `if` ladders. One detail is worth keeping in mind if it is ever
rewritten: at the top of the ladder the streak keeps counting even though the
difficulty cannot rise any further, because that same counter is what the cheer
in the top row is showing — resetting it on a step that could not be taken
would put the cheer out mid-run.

## Theme picker (temporary)

`src/app/theme-picker/` is scaffolding, not part of the app. It puts a **Tema**
button in the bottom right corner that switches between a handful of candidate
palettes and between Auto / Ljust / Mörkt, so a theme can be judged in the
running games rather than in a swatch. The choice is kept in `localStorage`
under `ganger-tema` and `ganger-lage`.

It touches nothing else: it writes `data-theme` and `data-mode` on `<html>` and
injects the candidate palettes as one `<style>` element, mirroring the rule
order `_tokens.scss` already uses. Light and dark mode themselves are *not*
temporary — they live in `_tokens.scss` and stay when this folder is gone.

All seven palettes are built on the same ladder of lightness and chroma the
section above describes, and the only thing that separates them is their hues.
That is what makes them comparable: switching theme moves the colour but not
the weight, and no theme can accidentally end up easier to read than another.
Each was checked against the same WCAG 2.2 AA thresholds — body text 4.5:1
against every ground it sits on, control borders 3:1 against both neighbours,
text on a fill 4.5:1 against the fill. The weakest contrast in each of them
lands at 4.69:1 or better, and it is the same pair of tokens that is weakest
everywhere, which is the sign that it is the rule and not luck doing the work.

To remove it once a theme is settled on:

1. Open the picker, pick the theme, press **Kopiera temats CSS**, and paste the
   dark and light declarations into the two mixins in `src/styles/_tokens.scss`
   (Midnatt is already what stands there).
2. Delete `src/app/theme-picker/`.
3. Delete the `<app-theme-picker />` tag in `src/app/app.component.html` and the
   import and `imports:` entry in `src/app/app.component.ts`. All three are
   marked `TILLFÄLLIG`.

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
