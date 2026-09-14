import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatchViewComponent } from './match-view/match-view.component';
import { MasterViewComponent } from './master-view/master-view.component';
import { SwipeViewComponent } from './swipe-view/swipe-view.component';
// TILLFÄLLIG: temaväljaren. Raden och den i imports nedan går bort med
// mappen theme-picker/ — se README.
import { ThemePickerComponent } from './theme-picker/theme-picker.component';
import { ObservationLog } from './services/observation-log';
import { TrainingEngine } from './training/training-engine';

/** Spelen som går att välja mellan, plus menyn de väljs från. Skild från
 *  spelens egna `MasterScreen` och `SwipeScreen`, som är skärmar *inom* ett
 *  spel — de tre hette förut `Screen` allihop. */
export type Game = 'menu' | 'match' | 'swipe' | 'master';

@Component({
  selector: 'app-root',
  imports: [MasterViewComponent, MatchViewComponent, SwipeViewComponent, ThemePickerComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.scss',
})
export class AppComponent {
  game: Game = 'menu';

  /** Hur många av tabellens tal som sitter. Räknas mot `factCount`, som är 55
   *  och inte 100: 7 × 8 och 8 × 7 är samma kunskap och en enda rad i lagret. */
  masteredCount = 0;
  factCount = 0;
  hasPractice = false;
  /** Om det finns något sparat att rensa — styr knappen för att byta spelare. */
  hasStoredProgress = false;

  constructor(
    private readonly engine: TrainingEngine,
    private readonly observations: ObservationLog,
  ) {
    this.readProgress();
  }

  /** Mätarens bredd. Skild från antalet, som inte längre går mot 100. */
  get masteredPercent(): number {
    return this.factCount === 0 ? 0 : (this.masteredCount / this.factCount) * 100;
  }

  play(game: Game): void {
    this.game = game;
  }

  showMenu(): void {
    // Spelen är egna komponenter, så de rivs här och startar om från början
    // nästa gång de väljs.
    this.game = 'menu';
    this.readProgress();
  }

  /**
   * Allt spelet minns om den som övat hör till webbläsaren, inte till en
   * inloggning. Delar syskon på surfplattan behöver den ena kunna börja från
   * noll utan att leta upp nollställningen inne i Mästarens värmekarta.
   */
  switchPlayer(): void {
    const confirmed = confirm(
      'Börja om från noll? Allt spelet minns om den som övat försvinner: ' +
        'vilka tal som sitter, tiderna och nivåerna. Det går inte att ångra.',
    );
    if (!confirmed) {
      return;
    }
    this.observations.clear();
    void this.engine.reset().then(() => this.readProgress());
  }

  /** Läses när menyn visas i stället för från mallen — att gå igenom hundra
   *  tal vid varje ändringsdetektering vore onödigt, och statistiken kan
   *  bara ha ändrats medan ett spel var igång. */
  private readProgress(): void {
    this.hasPractice = this.engine.hasPractice;
    this.hasStoredProgress = this.engine.hasStoredProgress;
    this.masteredCount = this.engine.masteredCount();
    this.factCount = this.engine.factCount;
  }
}
