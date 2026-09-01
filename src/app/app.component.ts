import { Component } from '@angular/core';
import { MatchViewComponent } from './match-view/match-view.component';
import { MasterViewComponent } from './master-view/master-view.component';
import { SwipeViewComponent } from './swipe-view/swipe-view.component';

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

  play(screen: Screen): void {
    this.screen = screen;
  }

  showMenu(): void {
    // Spelen är egna komponenter, så de rivs här och startar om från början
    // nästa gång de väljs.
    this.screen = 'menu';
  }
}
