# Ganger

A small Angular app for practising the multiplication table: match each
question in the left column with its answer in the right one.

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
