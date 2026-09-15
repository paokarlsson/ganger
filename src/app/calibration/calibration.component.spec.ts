import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalibrationComponent } from './calibration.component';
import { CALIBRATION_QUESTIONS, DEFAULT_FAST_TIME } from '../master-view/levels';
import { disposeEngines, freshEngine } from '../testing/engine';
import { TrainingEngine } from '../training/training-engine';

/** Komponenten som appen bygger den, på en motor utan minne av spelaren. */
async function calibration(): Promise<{
  component: CalibrationComponent;
  engine: TrainingEngine;
  input: HTMLInputElement;
  /** Hur många gånger komponenten sagt att den är klar. */
  doneCount: () => number;
}> {
  const engine = await freshEngine();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: TrainingEngine, useValue: engine }],
  });
  const fixture = TestBed.createComponent(CalibrationComponent);
  const state = { done: 0 };
  fixture.componentInstance.done.subscribe(() => (state.done += 1));
  fixture.detectChanges();
  const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
  return {
    component: fixture.componentInstance,
    engine,
    input,
    doneCount: () => state.done,
  };
}

/** Skriver ett svar i fältet och låter komponenten pröva det. */
function answer(
  component: CalibrationComponent,
  input: HTMLInputElement,
  value: number | string,
): void {
  input.value = String(value);
  component.checkAnswer();
}

/** Rätt svar på det tal som står på tur. */
function correctAnswerNow(component: CalibrationComponent): number {
  const [a, b] = CALIBRATION_QUESTIONS[component.index];
  return a * b;
}

describe('CalibrationComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
    disposeEngines();
  });

  it('börjar på det första talet', async () => {
    const { component } = await calibration();

    const [a, b] = CALIBRATION_QUESTIONS[0];
    expect(component.questionText).toBe(`${a} × ${b}`);
    expect(component.index).toBe(0);
  });

  it('väntar tills svaret är lika långt som facit', async () => {
    // 1 × 10 = 10. En etta är inte ett svar än — det kan vara början på 10.
    const { component, input } = await calibration();
    while (correctAnswerNow(component) < 10) {
      vi.useFakeTimers();
      answer(component, input, correctAnswerNow(component));
      vi.runAllTimers();
      vi.useRealTimers();
    }

    answer(component, input, 1);

    expect(component.index).toBeLessThan(CALIBRATION_QUESTIONS.length);
    expect(component.wrong).toBe(false);
  });

  it('går vidare efter ett rätt svar', async () => {
    vi.useFakeTimers();
    const { component, input } = await calibration();

    answer(component, input, correctAnswerNow(component));
    vi.runAllTimers();

    expect(component.index).toBe(1);
    const [a, b] = CALIBRATION_QUESTIONS[1];
    expect(component.questionText).toBe(`${a} × ${b}`);
  });

  it('markerar ett fel svar utan att gå vidare', async () => {
    vi.useFakeTimers();
    const { component, input } = await calibration();

    answer(component, input, correctAnswerNow(component) + 1);

    expect(component.wrong).toBe(true);
    expect(component.index).toBe(0);

    // Det röda står kvar en stund och försvinner sedan av sig självt.
    vi.runAllTimers();
    expect(component.wrong).toBe(false);
  });

  it('mäter takten och säger till när alla tal är besvarade', async () => {
    vi.useFakeTimers();
    const { component, input, engine, doneCount } = await calibration();

    for (let i = 0; i < CALIBRATION_QUESTIONS.length; i++) {
      // En sekund per tal, så medianen är känd.
      vi.advanceTimersByTime(1000);
      answer(component, input, correctAnswerNow(component));
      vi.runAllTimers();
    }

    expect(doneCount()).toBe(1);
    // Medianen 1,0 s med 20 % marginal.
    expect(engine.thresholdsFor('typed').fast).toBe(1.2);
  });

  it('ger grundtiden åt den som hoppar över', async () => {
    const { component, engine, doneCount } = await calibration();

    component.skip();

    expect(doneCount()).toBe(1);
    expect(engine.thresholdsFor('typed').fast).toBe(DEFAULT_FAST_TIME);
  });

  it('säger till bara en gång', async () => {
    vi.useFakeTimers();
    const { component, input, doneCount } = await calibration();

    for (let i = 0; i < CALIBRATION_QUESTIONS.length; i++) {
      answer(component, input, correctAnswerNow(component));
      vi.runAllTimers();
    }
    // Ett svar efter att flödet är slut ska inte starta om någonting.
    answer(component, input, 1);

    expect(doneCount()).toBe(1);
  });

  it('lämnar inga timers efter sig', async () => {
    vi.useFakeTimers();
    const { component, input } = await calibration();
    answer(component, input, correctAnswerNow(component) + 1);

    component.ngOnDestroy();
    vi.runAllTimers();

    // Utan clearTimeout hade det röda tagits bort på en riven komponent.
    expect(component.wrong).toBe(true);
  });
});
