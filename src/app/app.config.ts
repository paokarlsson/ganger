import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';

export const appConfig: ApplicationConfig = {
  // Angular 22 startar zonlöst som standard. Komponenterna här uppdaterar
  // vanliga fält (inga signaler), så zonen får stå kvar tills de skrivs om.
  providers: [provideZoneChangeDetection()],
};
