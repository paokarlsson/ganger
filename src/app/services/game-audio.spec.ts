import { describe, expect, it, vi } from 'vitest';
import { GameAudio } from './game-audio';

/** Tjänsten med elementbygget utbytt. Allt annat är det riktiga. */
class FakeElements extends GameAudio {
  constructor(private readonly element: (src: string) => HTMLAudioElement) {
    super();
  }

  protected override create(src: string): HTMLAudioElement {
    return this.element(src);
  }
}

/**
 * Det som mäts är knappens sanningshalt: `loopPlaying` ska säga vad som
 * faktiskt hörs. jsdom har ingen uppspelning, så elementen byts mot attrapper.
 */
function audioWith(play: () => Promise<void>): {
  audio: GameAudio;
  paused: () => number;
} {
  let pauses = 0;
  const element = {
    play,
    pause: () => {
      pauses += 1;
    },
  } as unknown as HTMLAudioElement;
  return { audio: new FakeElements(() => element), paused: () => pauses };
}

describe('GameAudio', () => {
  it('startar och tystar slingan med samma växel', () => {
    const { audio, paused } = audioWith(() => Promise.resolve());

    audio.toggleLoop();
    expect(audio.loopPlaying).toBe(true);

    audio.toggleLoop();
    expect(audio.loopPlaying).toBe(false);
    expect(paused()).toBe(1);
  });

  it('säger att slingan är tyst när uppspelningen nekas', async () => {
    // En webbläsare kan kräva en rakare gest än knappen ger. Knappen ska visa
    // tystnad i stället för att påstå att musik spelas.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { audio } = audioWith(() => Promise.reject(new Error('nekad')));

    audio.toggleLoop();
    await Promise.resolve();

    expect(audio.loopPlaying).toBe(false);
    vi.restoreAllMocks();
  });

  it('tystar slingan även när den aldrig startats', () => {
    const audio = new FakeElements(() => {
      throw new Error('inget element ska byggas');
    });

    expect(() => audio.stopLoop()).not.toThrow();
    expect(audio.loopPlaying).toBe(false);
  });
});
