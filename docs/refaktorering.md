# Refaktoreringsplan

Genomgång av `src/` i sökandet efter dubblering, död kod, sliten namngivning
och kommentarer som inte bär sin vikt. Det här dokumentet beskriver *vad som
bör göras och varför* — det ändrar ingen kod självt.

`docs/plan.md` handlar om vad spelet ska bli. Det här handlar om hur koden mår
på vägen dit. En post som utförs stryks härifrån; en som visar sig vara fel
stryks också, med en rad om varför.

Storleken just nu: **10 148 rader** över 65 `.ts`-, `.html`- och `.scss`-filer
i `src/`, varav 3 168 rader är tester. Avsnitt 4 lade till rader netto: det som lyftes ut ur komponenterna
fick tester det inte hade, och de väger tyngre än raderna som försvann.

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

Utförd. Sömmen mot lagringen används nu av testerna, som får sin lagring ur
`testing/progress-repository.ts` i stället för ur `localStorage`; de exporter
ingen läste är interna, genomgångarna borta och `focusRank`/`windowWeight`
täckta av egna tester.

---

## 3. Namngivning

Utförd. `Question` och `GeneratedStatement` är nu båda ett `Fact` plus den
ordning talet ritas i, så `first/second` och `n1/n2` är borta och nyckeln faller
ut ur katalogen i stället för att bäras med. Match-viewen talar om frågor och
svar rakt igenom, inte om `selQ` och `left`. Motorns nio tröskelnamn har blivit
`thresholdsFor(channel)`, med de kanalspecifika privata, och de fyra
`hasPractice`-booleanerna har en kommentar som ställer dem mot varandra i
stället för fyra som var och en förklarar sig själv. `ProgressExportService` är
`ProgressExporter`, efter repots suffixlösa konvention — `ProgressExport` står
kvar som namnet på det som exporteras.

Språket är avgjort: **kodkommentarer skrivs på svenska.** Det som fanns kvar på
engelska låg i `match-view` och är omskrivet. README förblir engelsk.

`Pair` i `master-view/levels.ts` står kvar — den går inte att slå ihop utan att
röra `DIFFICULTY`-tabellerna, vilket är ett annat arbete än det här.

---

## 4. Struktur och ansvar

### 4.1 `MasterViewComponent`

Utförd. Komponenten har gått från 511 rader till 368 och äger fyra skärmar i
stället för fem. `endGame()` är `master-view/round-result.ts`, en ren
transformation `Answer[] → RoundResult` med egna tester; `buildQuestions()` är
`buildRound()` i `levels.ts`, där urvalet hör hemma; kalibreringen är
`<app-calibration (done)="startGame()">` med egna tester, som den inte hade
förut — den gick inte att nå utan att spela.

Svarsfältets stilar flyttade till stilmallen som `.ui-answer-input`.
Kalibreringens fält och rundans delade redan en regel, och att duplicera den
till den nya komponenten hade gjort samma sak till två.

Testerna av `buildRound()` fäste ett beteende som ingen visste om: på den
blandade nivån ligger varje tal utom kvadraterna två gånger i påsen, en gång
per tabell det hör till. En rond kan alltså ställa samma fråga två gånger fast
hundra tal finns att välja bland. Det är inte infört här utan hittat här, och
om det ska ändras är det en fråga för `docs/plan.md` och inte för den här
planen.

### 4.2 `TrainingEngine` är fyra motorer i en (536 rader)

Filhuvudet beskriver den som pedagogikens fasad över rena moduler, vilket är
rätt beskrivning. Men den bär fyra sorters ansvar: (1) skalet mot lagringen med
fördröjd skrivning, (2) Mästarens kalibrering och trösklar, (3) Svepets takt,
nivå och rekord, (4) urvalet av nästa fråga.

Punkt 1 lyfts ut av 1.3 ovan.

Det som *är* gjort är skrivningarna: sex av sju stod som `scheduleWrite()` följt
av `flush()` — schemalägg en fördröjd skrivning, gör den sedan omedelbart —
utan att något sa varför. De heter nu `write()` och `deferWrite()`.
Fördröjningen finns för `record()`, som sker per svar; allt annat ändras en
gång per rond eller mer sällan.

Punkt 3 står kvar, men förslaget om en `swipeState`-vy väger lättare än det
såg ut: de två `get`/`set`-paren ligger inte för sig utan bland
`swipeStartLevel()`, `isFastSwipe()`, `nextSwipeLevel()` och
`recordSwipeCalibration()`, som alla anropas från samma flöde i svep-viewen.
Att flytta paren utan fasadmetoderna omkring dem rör varje anropsställe utan
att flytta ansvaret.

Det är ingen brådska, men filen är näst störst i repot och växer med varje
kanal som läggs till. `add:`-prefixet i lagringsnyckeln lovar att det kommer
fler.

### 4.3 `MatchViewComponent` konstruktor gör för mycket

Utförd. Loggen kommer ur `inject()` som överallt annars, ljudet ur en
`GameAudio`, och `nextRound()` ligger i `ngOnInit`. Specen är en provider i
stället för tre fältbyten efter konstruktionen.

Ljudet är sedan dess borta ur spelet på begäran — `GameAudio`, ljudknappen och
de tre filerna under `src/assets/audio/` finns inte längre. Posten står kvar
för de två andra delarna, som gäller: konstruktorn gör inget, och vad
komponenten behöver kommer ur `inject()`.

### 4.4 `observation-analysis.report.spec.ts` är ett verktyg i testdräkt

Utförd. Ändelsen `.report.spec.ts` är utesluten ur `test`-målet och det enda
`report`-målet kör. `npm test` kör tester, `npm run report` kör verktyget.

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

Utförd. Beslutet blev *Sockervadd*, vars två paletter nu står i
`src/styles/_tokens.scss` som appens enda. `src/app/theme-picker/` är borta med
sina 864 rader, och med den de fyra `TILLFÄLLIG`-markeringarna. Ljust och mörkt
står kvar — de bodde aldrig i väljaren.

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

* `progress-store.ts:75` — `/** Läser och skriver. Ingen pedagogik, inga
  trösklar, inga beslut. */` på ett interface med tre metoder som heter `load`,
  `save` och `clear`. Filhuvudet har redan sagt det, utförligare.
* `training-engine.ts:525` — `// Färre än tre svar är för lite för att kalla
  ett tal automatiserat.` står ovanför en jämförelse mot
  `MIN_MASTERY_SAMPLES`, vars egen deklaration (rad 80) säger samma sak.
* `master-view.component.ts` / `swipe-view.component.ts` — sektionsbannerna,
  se 4.1.

---

## 6. Konventioner och verktyg

### 6.1 `.editorconfig` följs inte

Filen säger `indent_size = 2` för allt. Verkligheten:

| Indrag | Filer |
| --- | --- |
| 2 | all `.ts` |
| 4 | **alla sju `.scss`-filer**, `swipe-view.component.html` |

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

Beskriver numera både vad spelet är, hur lagren hänger ihop och hur man kör
tester. Delar av «Three layers»
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
| 6 | Kommentarskonsolidering (5.1–5.4) | medel | — |
| 11 | Signaler (4.5) | stor, eget arbete | — |

Steg 2–5 och 7–10 är utförda: steg 2 var avsnitt 2, steg 5 avsnitt 3, steg 3, 4
och 9 avsnitt 1, och steg 7, 8 och 10 avsnitt 4. Numren står kvar som de var —
hänvisningarna i planen och i koden pekar på dem.

Steg 1 stod som beroende för 5, 6 och 7 för att formateringen skulle gå först
och hålla diffarna rena. Avsnitt 3 och 4 gick före ändå, av samma skäl som
avsnitt 1 gjorde det: det som ändrats är skrivet med repots vanliga två stegs
indrag och enkla citattecken, så formateringscommiten har fortfarande inget att
göra där. De nya `.scss`-filerna följer stilmallens fyra steg.

Steg 11 stod som beroende av 8. Det beroendet är borta i och med att 8 är
utförd.

Steg 1 är en ren vinst utan risk. Steg 11 är den enda posten som ändrar
hur appen fungerar under ytan och bör ha egna tester före och efter.

