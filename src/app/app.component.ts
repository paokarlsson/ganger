import { Component } from '@angular/core';
import { MatchViewComponent } from './match-view/match-view.component';
import { MasterViewComponent } from './master-view/master-view.component';
import { SwipeViewComponent } from './swipe-view/swipe-view.component';
import { PracticeStatsService } from './services/practice-stats.service';

/** Spelen som går att välja mellan, plus menyn de väljs från. */
export type Screen = 'menu' | 'match' | 'swipe' | 'master';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MasterViewComponent, MatchViewComponent, SwipeViewComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  screen: Screen = 'menu';

  /** Hur många av de hundra talen som sitter, som andel och antal. */
  masteredCount = 0;
  hasPractice = false;

  constructor(private readonly stats: PracticeStatsService) {
    this.readProgress();
  }

  play(screen: Screen): void {
    this.screen = screen;
  }

  showMenu(): void {
    // Spelen är egna komponenter, så de rivs här och startar om från början
    // nästa gång de väljs.
    this.screen = 'menu';
    this.readProgress();
  }

  /** Läses när menyn visas i stället för från mallen — att gå igenom hundra
   *  tal vid varje ändringsdetektering vore onödigt, och statistiken kan
   *  bara ha ändrats medan ett spel var igång. */
  private readProgress(): void {
    this.hasPractice = this.stats.hasPractice;
    this.masteredCount = this.stats.masteredCount();
  }
}
