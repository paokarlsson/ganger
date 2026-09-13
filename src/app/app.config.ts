import {
  ApplicationConfig,
  provideAppInitializer,
  provideZoneChangeDetection,
  inject,
} from '@angular/core';
import { ObservationLog } from './services/observation-log';
import { PracticeStatsService } from './services/practice-stats.service';

export const appConfig: ApplicationConfig = {
  providers: [
    // Angular 22 startar zonlöst som standard. Komponenterna här uppdaterar
    // vanliga fält (inga signaler), så zonen får stå kvar tills de skrivs om.
    provideZoneChangeDetection(),
    // Framstegen läses en gång, innan första vyn ritas. Lagringen är asynkron;
    // allt efter uppstarten läser kopian i minnet och slipper vänta.
    provideAppInitializer(() => inject(PracticeStatsService).hydrate()),
    // Loggen är råa händelser och läses av ingenting i spelet ännu, men den
    // ska inte skriva över det som redan ligger där.
    provideAppInitializer(() => inject(ObservationLog).hydrate()),
  ],
};
