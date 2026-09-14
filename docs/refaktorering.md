# Refaktoreringsplan

Genomgång av `src/` i sökandet efter dubblering, död kod, sliten namngivning
och kommentarer som inte bär sin vikt. Det här dokumentet beskriver *vad som
bör göras och varför* — det ändrar ingen kod självt.

`docs/plan.md` handlar om vad spelet ska bli. Det här handlar om hur koden mår
på vägen dit. En post som utförs stryks härifrån; en som visar sig vara fel
stryks också, med en rad om varför.

Storleken just nu: **10 370 rader** över 59 `.ts`-, `.html`- och `.scss`-filer
i `src/`, varav 864 rader (8 %) är den temporära temaväljaren och 2 735 rader
är tester.

---

## Vad som *inte* ska göras

Repot har en medveten dokumentationskultur: `ANTAGANDE:`-markeringarna kopplar
varje gissad konstant till en öppen fråga i `docs/plan.md`, och resonemangen
bakom `distractors.ts`, `time-color.ts` och `fact-catalog.ts` är dyra att
återupptäcka. **Den här planen är inte en uppmaning att skala bort
kommentarer.** Det som pekas ut under «Kommentarer» är två specifika sorter:
samma argument återupprepat i sex filer, och kommentarer som säger om vad
koden redan säger. Rationalet stannar.

Samma sak gäller `useRepository()`, `hasAnyPractice` och liknande: de är
sömmar som är billiga att behålla och dyra att sy upp igen. Förslaget nedan är
att *använda* dem, inte att riva dem.

---

## 1. Dubblering

Utförd. Kvar av den ligger i `shared/` (shuffle, clamp, median och snitt),
`services/local-store.ts`, `services/debounced-writer.ts` och
`testing/engine.ts`.

Numreringen nedan står kvar som den var — hänvisningarna i planen och i
koden pekar på de numren.

---

## 2. Död och överflödig kod

### 2.1 `TrainingEngine.useRepository()` (rad 135)

```ts
/** Pekar om lagringen. Finns för testerna och för den dag lagret byts ut. */
```

Den anropas inte av något test och inte av appen. Testerna skriver i stället
rå JSON till `localStorage` och läser tillbaka den — vilket gör dem beroende
av lagringsformatet i tester som handlar om pedagogik.

**Åtgärd:** använd sömmen. En `InMemoryProgressRepository` i `testing/` gör
`training-engine.spec.ts` och `heatmap-grid.spec.ts` oberoende av jsdom:s
`localStorage`, och är förresten det enda sättet att i dag pröva att motorn
klarar en lagring som kastar. Om beslutet blir att inte använda den: ta bort
metoden och kommentaren som lovar något annat.

### 2.2 Exporter utan konsument

Varken appen eller något test läser dem:

| Symbol | Fil |
| --- | --- |
| `TABLE_PRODUCTS` | `facts/fact-catalog.ts` |
| `focusRank`, `windowWeight`, `SelectionContext` | `facts/fact-selector.ts` |
| `clampLevel`, `LEVEL_UP_STEP`, `LEVEL_DOWN_STEP` | `swipe-view/swipe-difficulty.ts` |
| `NEAR_NUMBER_WEIGHT`, `PLAUSIBLE_WEIGHT` | `facts/distractors.ts` |
| `emptyChannel` | `services/progress-store.ts` |
| `ObservationSource` | `services/observation-log.ts` |

**Åtgärd:** var och en är antingen (a) intern och ska tappa sitt `export`,
eller (b) värd ett eget test. `focusRank` och `windowWeight` hör till (b) — de
är de två funktioner som avgör vilka tal en nivå släpper fram, och de saknar
direkt täckning. `TABLE_PRODUCTS` hör till (a): `isTableProduct()` är det
avsedda gränssnittet.

Medan du är i `fact-catalog.ts`: `TABLE_PRODUCTS` byggs med
`FACTS.flatMap((fact) => [fact.answer])` där `map` räcker.

### 2.3 Genomgångsexporter och genomgångsgetters

* `swipe-difficulty.ts:12` re-exporterar `LEVEL_MAX` och `LEVEL_MIN` från
  `fact-selector.ts`. `swipe-view.component.ts` importerar dem den vägen och
  ser därför inte var de bor.
* `training-engine.ts:33` re-exporterar `ChannelStat` från `progress-store.ts`,
  och `heatmap-grid.ts` importerar typen *genom motorn*. Pilen pekar fel:
  rutnätet beror på `HeatSource`, inte på `TrainingEngine`.
* `MasterViewComponent.consecutiveFastDisplay` (rad 133) returnerar
  `this.auto.consecutiveFast` och står direkt bredvid `streakVisible` som
  läser samma fält. Mallen kan läsa en av dem.
* `SwipeViewComponent.start()` och `restart()` har identiska kroppar.
  Behåll båda namnen om mallen vinner på det, men låt den ena anropa den andra.
* `MatchViewComponent.resetLeftAndRight()` är publik men anropas bara inifrån.

### 2.4 `isObservation` (observation-log.ts:265)

Deklarerad som `(value: unknown): boolean` och sedan tvingad till ett
typpredikat vid anropsplatsen:

```ts
.filter((item): item is Observation => isObservation(item))
```

**Åtgärd:** `function isObservation(value: unknown): value is Observation`.
Då blir `.filter(isObservation)` nog.

---

## 3. Namngivning

### 3.1 Tre vokabulärer för ett och samma begrepp

| Form | Var | Fält |
| --- | --- | --- |
| `Fact` | `facts/fact-catalog.ts` | `a`, `b`, `answer` |
| `Pair` | `master-view/levels.ts` | `[number, number]` |
| `Question` | `match-view.component.ts` | `first`, `second` |
| `GeneratedStatement` | `swipe-difficulty.ts` | `n1`, `n2` |

Fyra namn på «ett tal och dess två faktorer». `Pair` går inte att slå ihop utan
att röra `DIFFICULTY`-tabellerna, men `Question.first/second` och
`GeneratedStatement.n1/n2` kan båda byta till `a`/`b` utan att något annat
ändras — och `Question` kan bli ett `Fact` plus visningsordningen, vilket är
vad den redan är.

### 3.2 `match-view.component.ts` bär hela repots förkortningar

`selQ`, `selA`, `isQSelected`, `isASelected`, `isLeftWrong`, `allIsDone()`,
`next()`, `playLoop`. Två vokabulärer blandas dessutom: `Q`/`A` (fråga/svar)
och `left`/`right` (sida) för samma två spalter.

**Förslag:** `selectQuestion` / `selectAnswer`, `isQuestionSelected` /
`isAnswerSelected`, `isRoundComplete()`, `nextRound()`. Välj *en* av
fråga/svar och vänster/höger — fråga/svar beskriver vad det är, sidan bara var
det råkar ritas.

### 3.3 `currentStatmentString`

`swipe-view.component.ts:73` (satt på rad 413) — felstavat (`Statment`) och `String`-suffixet
säger ingenting. Läses i mallen.

**Förslag:** `statementText`.

### 3.4 `nrCorrect` / `nrWrong`

`swipe-view.component.ts` — `nr`-prefixet finns ingen annanstans i repot.

**Förslag:** `correctCount` / `wrongCount`.

### 3.5 Motorns tröskelfamilj

`fastSeconds`, `fastSecondsFor(channel)`, `swipeFastSeconds`,
`calibratedFastTime`, `slowSeconds`, `slowSecondsFor(channel)`,
`swipeSlowSeconds`, `baselineSecondsFor(channel)`, `swipeBaselineSeconds`.

Nio medlemmar för två kanaler × två trösklar. Varje enskilt namn är rimligt;
tillsammans är de svåra att hålla isär, och `fastSeconds` (som betyder *skrivet
svar*) ser ut som överkategorin till `fastSecondsFor()`.

**Förslag:** en `thresholdsFor(channel): { fast, slow, baseline }` som det enda
publika, och de kanalspecifika som privata. Värmekartan hämtar redan alla tre
var för sig (`heatmap-grid.ts:47–48`, `heatmap.component.ts:79`).

Samma sak med de fyra booleanerna `hasPractice`, `hasAnyPractice`,
`hasPracticeIn(channel)`, `hasStoredProgress` — här räcker det förmodligen med
en kommentar som ställer dem mot varandra på ett ställe, i stället för fyra som
var och en förklarar sig själv.

### 3.6 Filnamn

`progress-export.ts` exporterar `ProgressExportService` — den enda klassen i
repot med `Service`-suffix (`TrainingEngine`, `ObservationLog`,
`LocalStorageProgressRepository` har inget). Välj en konvention.

### 3.7 Språk

`match-view.component.ts` och dess mall är kommenterade på engelska
(«The audio elements are plain objects…», «Number of pairs shown in one
round», «Lays out the answers so none of them sits…»), resten av `src/` på
svenska. Filen har dessutom svenska kommentarer i de nyare delarna, så den är
blandad i sig själv. README är engelsk men har en svensk rubrik
(«Temaväljaren (temporary)»).

**Åtgärd:** bestäm ett språk för kodkommentarer — svenska, givet att 20 av 21
filer redan är det — och gör om `match-view`. README är en annan fråga och kan
gott förbli engelsk, men då ska rubriken översättas.

---

## 4. Struktur och ansvar

### 4.1 `MasterViewComponent` är fem komponenter i en (514 rader)

Den äger fem skärmar (`menu`, `calibration`, `game`, `result`, `heatmap`), ~30
publika fält, tre timers, kalibreringsflödet, frågebygget, resultatformateringen
och exportknappen. Sektionsbannerna `// --- Meny ---`, `// --- Kalibrering ---`,
`// --- Rundan ---`, `// --- Avbryt ---` är inte dokumentation utan ett kvitto
på att filen innehåller fyra filer.

**Åtgärd, i fallande ordning av värde:**

1. `endGame()` (rad 404) formaterar resultatskärmen — snitt, bästa tid,
   uppdelningsrader med färg. Det är en ren transformation `Answer[] →
   RoundResult` och hör hemma i en egen modul med tester, som
   `heatmap-grid.ts` redan är för värmekartan.
2. `buildQuestions()` (rad 430) bygger frågepoolen ur `LEVELS`. Hör hemma i
   `levels.ts` eller i motorn — det är urval, inte utseende, och det är den
   enda urvalslogik som i dag inte går att testa.
3. Kalibreringen (fält, `checkCalibrationAnswer`, `nextCalibrationQuestion`,
   `calibrationDotState`, två timers) är ett eget flöde med en egen skärm.
   Den kan bli `<app-calibration (done)="…">`.

### 4.2 `TrainingEngine` är fyra motorer i en (547 rader)

Filhuvudet beskriver den som pedagogikens fasad över rena moduler, vilket är
rätt beskrivning. Men den bär fyra sorters ansvar: (1) skalet mot lagringen med
fördröjd skrivning, (2) Mästarens kalibrering och trösklar, (3) Svepets takt,
nivå och rekord, (4) urvalet av nästa fråga.

Punkt 1 lyfts ut av 1.3 ovan. Punkt 3 är sju rena `get`/`set`-par mot
`this.progress` som var och en kallar `scheduleWrite()` + `flush()` — de kunde
lika gärna vara en `swipeState`-vy över dokumentet.

Det är ingen brådska, men filen är näst störst i repot och växer med varje
kanal som läggs till. `add:`-prefixet i lagringsnyckeln lovar att det kommer
fler.

### 4.3 `MatchViewComponent` konstruktor gör för mycket

```ts
constructor(private readonly log: ObservationLog = new ObservationLog()) {
  this.loopAudio = new Audio('assets/audio/loop.mp3');
  …
  this.next();
}
```

Tre problem i fyra rader:

* **Defaultvärdet finns bara för testernas skull** — kommentaren säger det rakt
  ut. Men det betyder att ett DI-missöde tyst ger en *andra* `ObservationLog`
  med egna `pagehide`-lyssnare som skriver över den riktiga loggen på samma
  nyckel.
* **Ljudelementen byggs i konstruktorn**, så `match-view.component.spec.ts`
  måste byta ut tre publika fält efter konstruktionen (`componentWithFakeAudio`,
  `silenceEffects`) för att jsdom inte ska försöka spela upp.
* **`this.next()` i konstruktorn** startar en runda innan komponenten ritats.

**Åtgärd:** en liten `GameAudio`-tjänst med `playCorrect()`, `playWrong()`,
`toggleLoop()`, injicerad med `inject()`. Då blir testet en provider i stället
för tre fältbyten, `log` får sitt vanliga `inject()`, och `next()` flyttar till
`ngOnInit`.

### 4.4 `observation-analysis.report.spec.ts` är ett verktyg i testdräkt

Filen säger det själv: «Inte ett test av spelet utan ett verktyg som råkar bo i
testkörningen». Den läser `tools/observations.json` och skriver
`tools/observations-report.txt`. Skälet — att det inte kostar ett beroende — var
rimligt, men konsekvensen är att `npm test` i CI (`.github/workflows/pages.yml`)
kör en filskrivande rapportgenerator vid varje push.

**Åtgärd:** `npm run report` som kör `vitest run` mot just den filen, och låt
`npm test` utesluta den. Samma kod, samma nollkostnad, men CI kör tester och
verktyget körs när någon vill ha en rapport.

### 4.5 Den stora hävstången: signaler

`app.config.ts` kommenterar redan varför `provideZoneChangeDetection()` står
kvar: «Komponenterna här uppdaterar vanliga fält (inga signaler), så zonen får
stå kvar tills de skrivs om.»

Priset syns i `app.component.ts`: `readProgress()` finns bara för att cacha
fyra värden från motorn, med en kommentar som förklarar att mallen inte får
läsa dem direkt eftersom hundra tal per ändringsdetektering vore för dyrt.
Samma mönster i `HeatmapComponent.build()`. Alla fem komponenterna kör
`ChangeDetectionStrategy.Eager`.

Med signaler i motorn (`progress` som en `signal`, `masteredCount` som en
`computed`) försvinner `readProgress()`, cache-fälten, `Eager` och
`provideZoneChangeDetection()`. Det är det enskilt största strukturella greppet
som finns kvar — och också det dyraste. Bör tas som ett eget arbete, inte som
en bieffekt av något annat.

### 4.6 Temaväljaren

`src/app/theme-picker/` är 864 rader, 8 % av källträdet, och är märkt
`TILLFÄLLIG` i fyra filer. Den tas bort av ett *beslut* (vilket tema?), inte av
en refaktorering — men den är den största enskilda radminskning som finns att
göra, och den är redan planerad i README steg för steg.

---

## 5. Kommentarer

### 5.1 Samma argument i sex filer

Två resonemang är återupprepade genom hela repot:

**«Ett svep är igenkänning, ett skrivet svar är framplockning»** — 10
förekomster i 5 icke-testfiler: `training-engine.ts` (5 gånger i samma fil),
`time-color.ts`, `progress-store.ts`, `heatmap.component.ts`,
`heatmap-grid.ts`.

**«7 × 8 och 8 × 7 är samma tal»** — i `fact-catalog.ts`, `progress-store.ts`
(4 gånger), `training-engine.ts` (2), `app.component.ts`,
`heatmap.component.ts`, `heatmap-grid.ts` och `heatmap.component.html`.

Båda står redan i `docs/plan.md` under «Avgjort» (rad 37 respektive 290).

**Åtgärd:** en kanonisk formulering per argument — rimligen där beslutet bor,
alltså `fact-catalog.ts` för nyckelkanoniseringen och `training-engine.ts` för
kanalskillnaden — och en rad på övriga ställen: `// Kanalerna mäter olika
saker, se TrainingEngine.` Det är inte en besparing i rader det handlar om utan
i *underhåll*: ändras argumentet i dag måste sex filer hittas.

### 5.2 Klassdoc som upprepar varandra

`heatmap.component.ts` (rad 18–40) och `heatmap-grid.ts` (rad 37–48) förklarar
båda, nästan ordagrant, att rutnätet har 55 rutor, att raden är den mindre
faktorn och att färgen mäts mot den valda kanalens egen tröskel. Samma text en
tredje gång i `heatmap.component.html` som en mall-kommentar.

**Åtgärd:** låt `heatmap-grid.ts` äga förklaringen (det är där regeln bor) och
korta komponentens till vad komponenten gör: växla kanal och visa.

### 5.3 `time-color.ts`: 23 kommentarrader på 14 rader kod

Innehållet är bra — varför oklch och inte hsl, varför L 0.72, vilka
kontrastvärden det ger. Men det är ett *designbeslut* med en historia, inte en
förklaring av funktionen `timeColor()`, och «det är hela skillnaden mot förr»
syftar på kod som inte finns kvar.

**Åtgärd:** flytta resonemanget till `docs/plan.md` eller ett avsnitt i README
om färgskalan, och lämna kvar de tre raderna som en läsare av `timeColor()`
faktiskt behöver.

### 5.4 Kommentarer som säger om vad koden säger

Utspridda, men värda att ta när man ändå är i filen:

* `progress-store.ts:74` — `/** Läser och skriver. Ingen pedagogik, inga
  trösklar, inga beslut. */` på ett interface med tre metoder som heter `load`,
  `save` och `clear`. Filhuvudet har redan sagt det, utförligare.
* `training-engine.ts:525` — `// Färre än tre svar är för lite för att kalla
  ett tal automatiserat.` står ovanför en jämförelse mot
  `MIN_MASTERY_SAMPLES`, vars egen deklaration (rad 66) säger samma sak.
* `master-view.component.ts` / `swipe-view.component.ts` — sektionsbannerna,
  se 4.1.

---

## 6. Konventioner och verktyg

### 6.1 `.editorconfig` följs inte

Filen säger `indent_size = 2` för allt. Verkligheten:

| Indrag | Filer |
| --- | --- |
| 2 | all `.ts` utom theme-picker |
| 4 | **alla sju `.scss`-filer**, `swipe-view.component.html`, `theme-picker/*.ts` |

Mallarna skiljer sig också i interpolationsstil: `{{ värde }}` i master-,
heatmap- och match-mallarna, `{{värde}}` i swipe-mallen.

Orsaken är att **ingenting kontrollerar det** — repot har varken Prettier eller
ESLint, och CI kör bara `npm test`.

**Åtgärd, i den ordningen:**

1. Lägg till Prettier med en konfiguration som matchar `.editorconfig`
   (`printWidth: 100`, enkla citattecken — vad koden redan gör).
2. En enda formateringscommit över hela `src/`, separat från allt annat, så
   att den går att hoppa över i `git blame` (`.git-blame-ignore-revs`).
3. `angular-eslint` med `no-unused-vars` — som hade fångat 2.2 av sig själv.
4. `npm run lint` som ett steg i `pages.yml`, före `npm test`.

Punkt 1–2 bör tas **först av allt i den här planen**: varje annan ändring nedan
blir annars en blandning av innehåll och formatering i samma diff.

Avsnitt 1 gick före ändå. Filerna det lade till (`shared/`,
`services/local-store.ts`, `services/debounced-writer.ts`, `testing/engine.ts`)
är skrivna med två stegs indrag och enkla citattecken, alltså som resten av
`.ts`-koden, så formateringscommiten bör inte röra dem.

### 6.2 README har svällt

22 570 tecken, och beskriver numera både vad spelet är, hur lagren hänger ihop,
hur temaväljaren tas bort och hur man kör tester. Delar av «Three layers»
överlappar `docs/plan.md` §«Tre lager» ordagrant.

**Åtgärd:** låt README vara «vad det är och hur man kör det», och flytta
arkitekturavsnitten till `docs/`. Länka i stället för att upprepa.

---

## Ordning

Den här ordningen minimerar konflikter — varje steg lämnar repot i ett
tillstånd där nästa steg blir mindre.

| # | Steg | Storlek | Beroende |
| --- | --- | --- | --- |
| 1 | Prettier + ESLint + formateringscommit (6.1) | halvdag | — |
| 2 | Död kod och genomgångsexporter (2.1–2.4) | liten | 1 |
| 5 | Namnbyten (3.1–3.6) | medel | 1 |
| 6 | Kommentarskonsolidering (5.1–5.4) + språkval (3.7) | medel | 5 |
| 7 | `GameAudio` + match-viewens konstruktor (4.3) | medel | 5 |
| 8 | Resultat- och frågebygge ut ur `MasterViewComponent` (4.1) | stor | — |
| 10 | `npm run report` (4.4) | liten | — |
| 11 | Signaler (4.5) | stor, eget arbete | 8 |

Steg 3, 4 och 9 är utförda — de var avsnitt 1, och numren står kvar tomma så
att de kvarvarandes beroenden fortsätter peka rätt.

Steg 1 och 2 är rena vinster utan risk. Steg 11 är den enda posten som ändrar
hur appen fungerar under ytan och bör ha egna tester före och efter.

Temaväljaren (4.6) ligger utanför ordningen — den väntar på ett beslut, inte på
en refaktorering.
