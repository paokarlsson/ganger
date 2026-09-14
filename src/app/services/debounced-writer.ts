/**
 * Skriv inte vid varje ändring — men tappa ingenting när fliken läggs undan.
 *
 * Både framstegsdokumentet och observationsloggen serialiseras i sin helhet
 * vid varje skrivning, och båda ändras flera gånger per rond. Fördröjningen är
 * vad som gör det till ungefär en skrivning per rond i stället för en per kort.
 * Priset är det som hunnit ändras sedan sist, och det är vad `pagehide` och
 * `visibilitychange` är till för: de vanliga vägarna ut ur en flik.
 *
 * Hur lång fördröjningen ska vara är anroparens beslut och motiveras hos var
 * och en — de två skiljer sig med en faktor fem.
 */
export class DebouncedWriter {
  private timer?: ReturnType<typeof setTimeout>;
  private dirty = false;
  private readonly onPageHide = (): void => this.flush();
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this.flush();
    }
  };

  constructor(
    private readonly delayMs: number,
    private readonly write: () => void,
  ) {
    if (typeof addEventListener === 'function') {
      addEventListener('pagehide', this.onPageHide);
      addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  /** Något har ändrats. Skrivningen kommer när fördröjningen gått ut, eller
   *  tidigare om någon ber om den. */
  schedule(): void {
    this.dirty = true;
    this.timer ??= setTimeout(() => this.flush(), this.delayMs);
  }

  /** Skriver ned det som väntar, nu. Gör ingenting när ingenting väntar. */
  flush(): void {
    this.stopTimer();
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    this.write();
  }

  /** Släpper det som väntar utan att skriva det. Nollställningen rensar
   *  lagret, och en fördröjd skrivning efter den hade lagt tillbaka allt. */
  cancel(): void {
    this.stopTimer();
    this.dirty = false;
  }

  /**
   * Kopplar loss sidbyteslyssnarna.
   *
   * Utan den lever varje skrivare som byggts kvar så länge dokumentet gör det,
   * med en referens till det den skriver. I appen är de två och lever hela
   * sessionen; i en testkörning byggs de en per test.
   */
  dispose(): void {
    this.cancel();
    if (typeof removeEventListener === 'function') {
      removeEventListener('pagehide', this.onPageHide);
      removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  private stopTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
