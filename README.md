# Ganger

A small Angular app for practising the multiplication table. The start screen
lets you pick one of two games:

- **Para ihop** — match each question in the left column with its answer in the
  right one. Background music and sound effects included.
- **Svep** — a statement such as `7 × 8 = 54` is shown on a card. Swipe (or drag
  with the mouse, or press the arrow keys) right if it is correct, left if it is
  not. The questions come from `src/assets/ranked-questions.json`, which is
  fetched as a static asset — the app has no backend.

The swipe game was moved here from the separate `ganger-swipe` repository, which
is no longer developed.

## Structure

| Path | What it is |
| --- | --- |
| `src/app/app.component.*` | Shell: the start menu and the choice of game |
| `src/app/match-view/` | The *Para ihop* game |
| `src/app/swipe-view/` | The *Svep* game |
| `src/app/services/question.service.ts` | Loads the ranked questions for *Svep* |

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.3.11.

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
- **Docker** — `docker compose up` serves the app on
  [http://localhost:8080](http://localhost:8080) through nginx, using the
  default base href `/`.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.
