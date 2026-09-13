import { ChangeDetectionStrategy, Component, Input, OnInit, inject } from '@angular/core';
import { Channel, TrainingEngine } from '../training/training-engine';
import { HeatRow, buildHeatRows } from './heatmap-grid';

interface ChannelTab {
  channel: Channel;
  label: string;
  /** Vad tröskeln kallas i den här kanalen. De två mäter olika saker. */
  baselineLabel: string;
}

const TABS: readonly ChannelTab[] = [
  { channel: 'typed', label: 'Skrivet', baselineLabel: 'Din baslinje' },
  { channel: 'swipe', label: 'Svept', baselineLabel: 'Din sveptakt' },
];

/**
 * Värmekartan, en för hela spelet.
 *
 * Tidigare hade Mästaren och Svep var sin: ett 10 × 10-rutnät där halvorna
 * speglade varandra sedan nycklarna kanoniserats, och en halv karta över de 55
 * talen. Båda visade samma tal; det som skilde var vilken kanal som mättes.
 *
 * Nu är kartan en och kanalen en växel. 7 × 8 och 8 × 7 är samma tal och står
 * en gång — raden är den mindre faktorn, kolumnen den större — så rutnätet
 * rymmer precis 55 rutor utan att någon står två gånger.
 *
 * Det viktiga är att färgen alltid mäts mot *den valda kanalens egen* tröskel.
 * Ett svep är igenkänning och går systematiskt snabbare än ett skrivet svar;
 * en gemensam skala hade fått halva tabellen att se behärskad ut på fel grund.
 * Att se samma tal grönt i ena kanalen och rött i den andra är inte ett fel i
 * kartan utan hela poängen med den: det är skillnaden mellan att känna igen
 * svaret och att kunna plocka fram det.
 *
 * Knapparna runt kartan är varje spels egna och projiceras in.
 */
@Component({
  selector: 'app-heatmap',
  templateUrl: './heatmap.component.html',
  styleUrl: './heatmap.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class HeatmapComponent implements OnInit {
  /** Kanalen kartan öppnas på. Spelaren kan byta i kartan. */
  @Input() channel: Channel = 'typed';

  readonly tabs = TABS;
  readonly factCount: number;

  rows: HeatRow[] = [];
  mastered = 0;

  private readonly engine = inject(TrainingEngine);

  constructor() {
    this.factCount = this.engine.factCount;
  }

  ngOnInit(): void {
    this.build();
  }

  selectChannel(channel: Channel): void {
    this.channel = channel;
    this.build();
  }

  get tab(): ChannelTab {
    return TABS.find((tab) => tab.channel === this.channel) ?? TABS[0];
  }

  /** Om den valda kanalen har något att visa alls. */
  get hasPractice(): boolean {
    return this.engine.hasPracticeIn(this.channel);
  }

  /** Takten kanalens färger utgår från, som text. */
  get baselineDisplay(): string {
    const baseline = this.engine.baselineSecondsFor(this.channel);
    return baseline === null ? '—' : `${baseline.toFixed(1)}s`;
  }

  /** Kolumnrubrikerna, som också är radrubrikerna. */
  get factors(): number[] {
    return this.rows.map((row) => row.label);
  }

  private build(): void {
    this.rows = buildHeatRows(this.engine, this.channel);
    this.mastered = this.engine.masteredCount(this.channel);
  }
}
