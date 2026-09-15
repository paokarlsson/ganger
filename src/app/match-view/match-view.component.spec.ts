import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MatchViewComponent, Question, firstFactor, questionKey, secondFactor } from './match-view.component';
import { GameAudio } from '../services/game-audio';
import { MatchMispairObservation, MatchPairObservation, ObservationLog } from '../services/observation-log';

/**
 * jsdom har ingen uppspelning, så ljudet byts mot en attrapp som bara minns om
 * slingan spelar. Slingan är det som mäts: den överlever komponenten och
 * tystnar inte av sig själv när spelet rivs.
 */
class FakeGameAudio implements Pick<GameAudio, 'toggleLoop' | 'stopLoop' | 'playCorrect' | 'playWrong'> {
  playing = false;
  /** Sätts av testet som prövar en nekad uppspelning. */
  denyLoop = false;

  get loopPlaying(): boolean {
    return this.playing;
  }

  toggleLoop(): void {
    this.playing = !this.playing && !this.denyLoop;
  }

  stopLoop(): void {
    this.playing = false;
  }

  playCorrect(): void {}
  playWrong(): void {}
}

/** Komponenten som appen bygger den, med ljudet utbytt. Rundan läggs fram av
 *  `ngOnInit`, alltså av den första ändringsdetekteringen. */
function matchView(): {
  component: MatchViewComponent;
  loop: FakeGameAudio;
  log: ObservationLog;
} {
  TestBed.resetTestingModule();
  const loop = new FakeGameAudio();
  TestBed.configureTestingModule({
    providers: [{ provide: GameAudio, useValue: loop }],
  });
  const fixture = TestBed.createComponent(MatchViewComponent);
  fixture.detectChanges();
  return {
    component: fixture.componentInstance,
    loop,
    log: TestBed.inject(ObservationLog),
  };
}

/** Löser ett par genom att välja frågan och sedan svaret. */
function solve(component: MatchViewComponent, question: Question): void {
  component.selectQuestion(question);
  component.selectAnswer(question);
}

function pairs(log: ObservationLog): MatchPairObservation[] {
  return log.all().filter((o): o is MatchPairObservation => o.kind === 'pair');
}

function mispairs(log: ObservationLog): MatchMispairObservation[] {
  return log.all().filter((o): o is MatchMispairObservation => o.kind === 'mispair');
}

describe('MatchViewComponent', () => {
  it('startar och stoppar musiken med knappen', () => {
    const { component, loop } = matchView();

    component.startStopLoopAudio();
    expect(component.playLoop).toBe(true);
    expect(loop.playing).toBe(true);

    component.startStopLoopAudio();
    expect(component.playLoop).toBe(false);
    expect(loop.playing).toBe(false);
  });

  it('tystnar när spelet rivs', () => {
    const { component, loop } = matchView();
    component.startStopLoopAudio();

    // Att gå tillbaka till menyn river komponenten. Utan det här fortsätter
    // musiken i menyn, och nästa omgång lägger en andra slinga ovanpå.
    component.ngOnDestroy();

    expect(loop.playing).toBe(false);
    expect(component.playLoop).toBe(false);
  });

  it('låter knappen visa tystnad när uppspelningen nekas', () => {
    const { component, loop } = matchView();
    loop.denyLoop = true;

    component.startStopLoopAudio();

    expect(component.playLoop).toBe(false);
  });

  describe('rundan', () => {
    it('bygger den ur katalogen, med talens egna nycklar', () => {
      const { component } = matchView();

      expect(component.round.length).toBe(5);
      for (const question of component.round) {
        const key = questionKey(question);
        expect(key).toMatch(/^mul:\d+x\d+$/);
        // Nyckeln är kanonisk: minsta faktorn först, oavsett visad ordning.
        const [small, large] = key.slice(4).split('x').map(Number);
        expect(small).toBeLessThanOrEqual(large);
        expect(small * large).toBe(firstFactor(question) * secondFactor(question));
      }
    });

    it('håller produkterna unika', () => {
      // Svarsspalten visar bara produkten. Två frågor med samma produkt gick
      // inte att skilja åt.
      for (let attempt = 0; attempt < 20; attempt++) {
        const { component } = matchView();
        const products = component.round.map((question) => question.fact.answer);
        expect(new Set(products).size).toBe(products.length);
      }
    });
  });

  describe('observationer', () => {
    it('skriver en händelse när ett par löses', () => {
      const { component, log } = matchView();
      const first = component.round[0];

      solve(component, first);

      const [observation] = pairs(log);
      expect(observation.key).toBe(questionKey(first));
      expect(observation.firstTry).toBe(true);
      expect(observation.attempts).toBe(0);
      expect(observation.startedFrom).toBe('question');
      expect(observation.msSinceFirstTouch).not.toBeNull();
    });

    it('mäter hur stort uteslutningsrummet var', () => {
      // Sista paret är gratis: det finns bara ett kvar att välja. Utan den
      // siffran går det inte att skilja kunskap från uteslutning i efterhand.
      const { component, log } = matchView();
      for (const question of [...component.round]) {
        solve(component, question);
      }

      expect(pairs(log).map((o) => o.remaining)).toEqual([5, 4, 3, 2, 1]);
      expect(pairs(log).map((o) => o.resolvedBefore)).toEqual([0, 1, 2, 3, 4]);
    });

    it('minns vilken spalt spelaren började i', () => {
      const { component, log } = matchView();
      const first = component.round[0];

      component.selectAnswer(first);
      component.selectQuestion(first);

      expect(pairs(log)[0].startedFrom).toBe('answer');
    });

    it('skriver en felparning med båda talen', () => {
      const { component, log } = matchView();
      const [one, other] = component.round;

      component.selectQuestion(one);
      component.selectAnswer(other);

      const [observation] = mispairs(log);
      expect(observation.key).toBe(questionKey(one));
      expect(observation.pairedWith).toBe(questionKey(other));
      expect(observation.chosenAnswer).toBe(other.fact.answer);
    });

    it('räknar felparningar på båda talen som var inblandade', () => {
      const { component, log } = matchView();
      const [one, other] = component.round;

      component.selectQuestion(one);
      component.selectAnswer(other);
      // Felparningen står kvar tills något annat väljs; att peka ut rätt svar
      // löser paret utan att börja om.
      component.selectAnswer(one);
      solve(component, other);

      const byKey = new Map(pairs(log).map((o) => [o.key, o]));
      expect(byKey.get(questionKey(one))!.attempts).toBe(1);
      expect(byKey.get(questionKey(one))!.firstTry).toBe(false);
      expect(byKey.get(questionKey(other))!.attempts).toBe(1);
    });

    it('börjar om räkningen med en ny runda', () => {
      const { component, log } = matchView();
      const [one, other] = component.round;
      component.selectQuestion(one);
      component.selectAnswer(other);

      component.nextRound();
      solve(component, component.round[0]);

      expect(pairs(log)[0].attempts).toBe(0);
    });

    it('skriver ingenting för ett tal som redan är löst', () => {
      const { component, log } = matchView();
      const first = component.round[0];
      solve(component, first);

      solve(component, first);

      expect(pairs(log).length).toBe(1);
    });
  });
});
