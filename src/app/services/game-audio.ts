/**
 * Spelets ljud, bakom en söm.
 *
 * Elementen är vanliga objekt och ligger utanför mallen, så att riva ett spel
 * lämnar dem spelande: att gå tillbaka till menyn skulle bära med sig musiken,
 * och att starta om skulle bygga ett andra element som spelar ovanpå det
 * första, utan att något av dem gick att stoppa. Därför äger tjänsten dem, och
 * den som river ett spel säger till med `stopLoop()`.
 *
 * Skilt från komponenten av samma skäl som pedagogiken är det: jsdom har ingen
 * uppspelning. Testerna byter tjänsten mot en attrapp i stället för att byta ut
 * tre publika fält efter konstruktionen.
 */
import { Injectable } from '@angular/core';

/** Musikslingan ligger under effekterna — den ska höras, inte överrösta. */
const LOOP_VOLUME = 0.1;
const EFFECT_VOLUME = 0.3;

@Injectable({ providedIn: 'root' })
export class GameAudio {
  /** Om slingan spelar just nu. Knappen läser den, och den kan bli `false`
   *  av sig själv när uppspelningen nekas. */
  get loopPlaying(): boolean {
    return this.playing;
  }

  private playing = false;
  private loop?: HTMLAudioElement;
  private correct?: HTMLAudioElement;
  private wrong?: HTMLAudioElement;

  /** Startar slingan, eller tystar den om den redan spelar. */
  toggleLoop(): void {
    if (this.playing) {
      this.stopLoop();
      return;
    }
    this.playing = true;
    void this.loopElement()
      .play()
      .catch((error) => {
        // Uppspelningen kan nekas — en fil som inte stöds, eller en webbläsare
        // som vill ha en rakare gest än den här. Säg det med ikonen i stället
        // för att låta den påstå att musik spelas.
        this.playing = false;
        console.error('Error starting loop:', error);
      });
  }

  stopLoop(): void {
    this.playing = false;
    this.loop?.pause();
  }

  playCorrect(): void {
    this.playEffect(this.correctElement());
  }

  playWrong(): void {
    this.playEffect(this.wrongElement());
  }

  /** Elementen byggs först när de behövs: en spelare som aldrig rör ljudet
   *  ska inte betala för tre nedladdningar. */
  private loopElement(): HTMLAudioElement {
    if (!this.loop) {
      this.loop = this.create('assets/audio/loop.mp3');
      this.loop.loop = true;
      this.loop.volume = LOOP_VOLUME;
    }
    return this.loop;
  }

  private correctElement(): HTMLAudioElement {
    this.correct ??= this.effect('assets/audio/right.wav');
    return this.correct;
  }

  private wrongElement(): HTMLAudioElement {
    this.wrong ??= this.effect('assets/audio/wrong.wav');
    return this.wrong;
  }

  /** Hur ett element byggs. Skild metod för att testerna ska kunna gå förbi
   *  den: jsdom har ingen uppspelning. Det går inte som konstruktorparameter —
   *  en funktionstyp duger inte som injektionstoken. */
  protected create(src: string): HTMLAudioElement {
    return new Audio(src);
  }

  private effect(src: string): HTMLAudioElement {
    const audio = this.create(src);
    audio.volume = EFFECT_VOLUME;
    return audio;
  }

  /** Spelar om från början, så att två par i snabb följd hörs som två. */
  private playEffect(audio: HTMLAudioElement): void {
    audio.currentTime = 0;
    audio.play().catch((error) => console.error('Error playing effect:', error));
  }
}

