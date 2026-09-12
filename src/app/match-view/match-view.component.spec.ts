import { describe, expect, it } from 'vitest';
import { MatchViewComponent } from './match-view.component';

/**
 * jsdom har ingen uppspelning, så ljudelementen byts mot attrapper som bara
 * minns om de spelar. Musikslingan är det som mäts: den ligger utanför mallen
 * och tystnar inte av sig själv när spelet rivs.
 */
function componentWithFakeAudio(): {
  component: MatchViewComponent;
  loop: { playing: boolean };
} {
  const component = new MatchViewComponent();
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
  return { component, loop };
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
});
