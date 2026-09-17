import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { MatchViewComponent, Question, firstFactor, questionKey, secondFactor } from './match-view.component';
import { MatchMispairObservation, MatchPairObservation, ObservationLog } from '../services/observation-log';

/** Komponenten som appen bygger den. Rundan läggs fram av `ngOnInit`, alltså
 *  av den första ändringsdetekteringen. */
function matchView(): { component: MatchViewComponent; log: ObservationLog } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(MatchViewComponent);
  fixture.detectChanges();
  return {
    component: fixture.componentInstance,
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
  it('skriver ned loggen när spelet rivs', () => {
    const { component, log } = matchView();
    const flush = vi.spyOn(log, 'flush');

    // Att gå tillbaka till menyn river komponenten. Skrivningen är fördröjd,
    // så utan det här ligger de senaste händelserna kvar i minnet och väntar
    // på en skrivning som ingen kommer att be om.
    component.ngOnDestroy();

    expect(flush).toHaveBeenCalled();
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

    it('låter ett ångrat fel förbli ett enda fel', () => {
      const { component, log } = matchView();
      const [one, other, third] = component.round;

      component.selectQuestion(one);
      component.selectAnswer(other);
      // Spelaren ångrar sig och pekar på en annan fråga. Stryks inte
      // felparningen utvärderas klicket mot svaret som blev kvar, och ett
      // enda felval skriver tre felparningar på tre olika tal.
      component.selectQuestion(third);

      expect(mispairs(log).length).toBe(1);
      expect(component.isAnswerSelected(other)).toBe(false);
      expect(component.isQuestionSelected(third)).toBe(true);

      component.selectAnswer(third);

      const solved = pairs(log).find((o) => o.key === questionKey(third))!;
      expect(solved.attempts).toBe(0);
      expect(solved.firstTry).toBe(true);
    });

    it('räknar ett nytt svar på samma fråga som ett nytt försök', () => {
      const { component, log } = matchView();
      const [one, other, third] = component.round;

      component.selectQuestion(one);
      component.selectAnswer(other);
      // Samma fråga, en ny gissning: det är ett fel till, och ska räknas.
      component.selectAnswer(third);

      expect(mispairs(log).length).toBe(2);
    });

    it('stryker felparningen även när växlingen började i svarsspalten', () => {
      const { component, log } = matchView();
      const [one, other, third] = component.round;

      component.selectAnswer(one);
      component.selectQuestion(other);
      // Det är svarsspalten som inledde, så det är den som börjar om.
      component.selectAnswer(third);

      expect(mispairs(log).length).toBe(1);
      expect(component.isQuestionSelected(other)).toBe(false);
      expect(component.isAnswerSelected(third)).toBe(true);
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
