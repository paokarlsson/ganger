import { describe, expect, it } from 'vitest';
import { MatchViewComponent, Question } from './match-view.component';
import { MatchMispairObservation, MatchPairObservation, ObservationLog } from '../services/observation-log';

/**
 * jsdom har ingen uppspelning, så ljudelementen byts mot attrapper som bara
 * minns om de spelar. Musikslingan är det som mäts: den ligger utanför mallen
 * och tystnar inte av sig själv när spelet rivs.
 */
function componentWithFakeAudio(): {
  component: MatchViewComponent;
  loop: { playing: boolean };
  log: ObservationLog;
} {
  const log = new ObservationLog();
  const component = new MatchViewComponent(log);
  const loop = { playing: false };
  component.loopAudio = {
    play: () => {
      loop.playing = true;
      return Promise.resolve();
    },
    pause: () => {
      loop.playing = false;
    },
  } as unknown as HTMLAudioElement;
  silenceEffects(component);
  return { component, loop, log };
}

function silenceEffects(component: MatchViewComponent): void {
  const silent = {
    currentTime: 0,
    play: () => Promise.resolve(),
    pause: () => {},
  } as unknown as HTMLAudioElement;
  component.rightAudio = silent;
  component.wrongAudio = silent;
}

/** Löser ett par genom att välja frågan och sedan svaret. */
function solve(component: MatchViewComponent, question: Question): void {
  component.selQ(question);
  component.selA(question);
}

function pairs(log: ObservationLog): MatchPairObservation[] {
  return log.all().filter((o): o is MatchPairObservation => o.kind === 'pair');
}

function mispairs(log: ObservationLog): MatchMispairObservation[] {
  return log.all().filter((o): o is MatchMispairObservation => o.kind === 'mispair');
}

describe('MatchViewComponent', () => {
  it('startar och stoppar musiken med knappen', () => {
    const { component, loop } = componentWithFakeAudio();

    component.startStopLoopAudio();
    expect(component.playLoop).toBe(true);
    expect(loop.playing).toBe(true);

    component.startStopLoopAudio();
    expect(component.playLoop).toBe(false);
    expect(loop.playing).toBe(false);
  });

  it('tystnar när spelet rivs', () => {
    const { component, loop } = componentWithFakeAudio();
    component.startStopLoopAudio();

    // Att gå tillbaka till menyn river komponenten. Utan det här fortsätter
    // musiken i menyn, och nästa omgång lägger en andra slinga ovanpå.
    component.ngOnDestroy();

    expect(loop.playing).toBe(false);
    expect(component.playLoop).toBe(false);
  });

  it('låter knappen visa tystnad när uppspelningen nekas', async () => {
    const { component } = componentWithFakeAudio();
    component.loopAudio = {
      play: () => Promise.reject(new Error('nekad')),
      pause: () => {},
    } as unknown as HTMLAudioElement;

    component.startStopLoopAudio();
    await Promise.resolve();

    expect(component.playLoop).toBe(false);
  });

  describe('rundan', () => {
    it('bygger den ur katalogen, med talens egna nycklar', () => {
      const { component } = componentWithFakeAudio();

      expect(component.round.length).toBe(5);
      for (const question of component.round) {
        expect(question.key).toMatch(/^mul:\d+x\d+$/);
        // Nyckeln är kanonisk: minsta faktorn först, oavsett visad ordning.
        const [small, large] = question.key.slice(4).split('x').map(Number);
        expect(small).toBeLessThanOrEqual(large);
        expect(small * large).toBe(question.first * question.second);
      }
    });

    it('håller produkterna unika', () => {
      // Svarsspalten visar bara produkten. Två frågor med samma produkt gick
      // inte att skilja åt.
      for (let attempt = 0; attempt < 20; attempt++) {
        const { component } = componentWithFakeAudio();
        const products = component.round.map((q) => q.first * q.second);
        expect(new Set(products).size).toBe(products.length);
      }
    });
  });

  describe('observationer', () => {
    it('skriver en händelse när ett par löses', () => {
      const { component, log } = componentWithFakeAudio();
      const first = component.round[0];

      solve(component, first);

      const [observation] = pairs(log);
      expect(observation.key).toBe(first.key);
      expect(observation.firstTry).toBe(true);
      expect(observation.attempts).toBe(0);
      expect(observation.startedFrom).toBe('question');
      expect(observation.msSinceFirstTouch).not.toBeNull();
    });

    it('mäter hur stort uteslutningsrummet var', () => {
      // Sista paret är gratis: det finns bara ett kvar att välja. Utan den
      // siffran går det inte att skilja kunskap från uteslutning i efterhand.
      const { component, log } = componentWithFakeAudio();
      for (const question of [...component.round]) {
        solve(component, question);
      }

      expect(pairs(log).map((o) => o.remaining)).toEqual([5, 4, 3, 2, 1]);
      expect(pairs(log).map((o) => o.resolvedBefore)).toEqual([0, 1, 2, 3, 4]);
    });

    it('minns vilken spalt spelaren började i', () => {
      const { component, log } = componentWithFakeAudio();
      const first = component.round[0];

      component.selA(first);
      component.selQ(first);

      expect(pairs(log)[0].startedFrom).toBe('answer');
    });

    it('skriver en felparning med båda talen', () => {
      const { component, log } = componentWithFakeAudio();
      const [one, other] = component.round;

      component.selQ(one);
      component.selA(other);

      const [observation] = mispairs(log);
      expect(observation.key).toBe(one.key);
      expect(observation.pairedWith).toBe(other.key);
      expect(observation.chosenAnswer).toBe(other.first * other.second);
    });

    it('räknar felparningar på båda talen som var inblandade', () => {
      const { component, log } = componentWithFakeAudio();
      const [one, other] = component.round;

      component.selQ(one);
      component.selA(other);
      // Felparningen står kvar tills något annat väljs; att peka ut rätt svar
      // löser paret utan att börja om.
      component.selA(one);
      solve(component, other);

      const byKey = new Map(pairs(log).map((o) => [o.key, o]));
      expect(byKey.get(one.key)!.attempts).toBe(1);
      expect(byKey.get(one.key)!.firstTry).toBe(false);
      expect(byKey.get(other.key)!.attempts).toBe(1);
    });

    it('börjar om räkningen med en ny runda', () => {
      const { component, log } = componentWithFakeAudio();
      const [one, other] = component.round;
      component.selQ(one);
      component.selA(other);

      component.next();
      solve(component, component.round[0]);

      expect(pairs(log)[0].attempts).toBe(0);
    });

    it('skriver ingenting för ett tal som redan är löst', () => {
      const { component, log } = componentWithFakeAudio();
      const first = component.round[0];
      solve(component, first);

      solve(component, first);

      expect(pairs(log).length).toBe(1);
    });
  });
});
