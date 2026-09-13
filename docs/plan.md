# Plan

Arbetsanteckningar för det adaptiva träningssystemet: vad som är avgjort, vad
som är öppet, och vad som är en gissning.

README beskriver vad spelet *är*. Det här dokumentet beskriver vad det ska bli
och varför, och finns för att argumenten är lätta att glömma och dyra att
återupptäcka. Det ska ändras när något avgörs — en öppen fråga som besvaras
flyttar upp till «Avgjort», och en gissning som mätts stryks ur tabellen längst
ned.

---

## Idén

Användaren ska inte behöva administrera sitt lärande. Träningen börjar direkt,
systemet observerar vad som fungerar, och nästa uppgift följer av det.

    Para ihop introducerar. Svep automatiserar. Värmekartan minns.

Den pedagogiska rörelsen är `känna igen → välja säkert → återkalla snabbt →
automatisera`, och ett tal rör sig genom ungefär `okänt → introducerat →
igenkänt → stabilt → automatiserat`. Det som ännu inte introducerats ska inte
framstå som fel eller svagt — bara som outforskat.

Principen under allt: **komplexitet under ytan, enkelhet på ytan.** Ingen
nivåväljare, ingen träningsplan, ingen statistik att tolka.

---

## Avgjort

Det här är taget, och bör inte rivas upp utan att skälet nedan har fallit.

### Ett tal är ett tal, oavsett faktorernas ordning

7 × 8 och 8 × 7 lagras under en nyckel, `mul:7x8`. Måttet går därför mot 55 och
inte mot 100. Alternativet — två rader som slås ihop vid varje läsning — var
vad som gjorde att Mästaren och Svep räknade olika på samma kunskap.

Prefixet `mul:` är inte dekoration: `add:7+8` och `div:56/7` ska kunna läggas
till utan att dokumentet görs om.

### Lagringen är ett lager för sig, och asynkront

`ProgressRepository` är det enda som vet var framstegen ligger. Gränssnittet är
asynkront fast `localStorage` inte är det, eftersom ett löfte går att uppfylla
synkront men en synkron signatur inte går att göra asynkron i efterhand utan
att varje anropare skrivs om.

Dokumentet bär `schemaVersion`. Nästa ändring av formen har därmed någonstans
att hänga sin migrering — vilket version 1 inte hade, och därför måste kännas
igen på formen av sina nycklar.

### Tre lager

    vy → TrainingEngine → ProgressRepository

En vy frågar motorn och räknar aldrig ut en tröskel själv. Motorn äger i sin
tur inga rena regler; de ligger i moduler som går att testa utan en spelare,
var och en på formen `gammalt tillstånd + händelse = nytt tillstånd`.

### Loggen skriver, ingenting läser

`observation-log.ts` samlar råa händelser från Para ihop. Ingenting i spelet
läser dem, och ingenting väljs utifrån dem. Den finns för att besvara en fråga
som inte går att besvara utan data — se steg 4.

### Para ihops urval förblir slumpmässigt tills loggen använts

Att kalibrera mot loggen kräver ett obiaserat stickprov över hela tabellen. I
samma stund spelet väljer tal efter vad det redan tror om spelaren blir loggen
ett eko av det beslutet i stället för en mätning av spelaren.

Det är ett fönster som stänger sig självt, och det är öppet nu.

---

## Öppna frågor

### 1. Tre regulatorer drar i samma spak

Nivån (`windowWeight` kring `focusRank`) och `needWeight` reagerar redan båda
på samma bevis, multiplikativt. Blandningen 60/30/10 skulle bli en tredje.

Två saker följer:

- **Med multiplicerade vikter går det inte att ange en andel, bara hoppas på
  den.** Vill man ha en fördelning måste urvalet ske i två steg: dra grupp
  först, dra tal inom grupp sedan. Då blir fördelningen ett tal som går att
  testa.
- **Nivån bör sluta vara en egen kraft** och bara definiera var gränsen går —
  vilka otränade tal som räknas som «nära det du kan».

Avgörs av: steg 4. En simulering som oscillerar är svaret.

### 2. Styr på lyckandegrad, inte på «snabbt → höj»

«Om användaren svarar snabbt och rätt, öka» är en lokal regel utan börvärde,
och lokala regler oscillerar. Sätt målet explicit — omkring 85 % rätt över de
senaste ~12 interaktionerna — och låt avvikelsen därifrån flytta *en* knapp.

Då blir 60/30/10 en startpunkt som systemet självt lämnar, vilket är vad
"fördelningen bör vara dynamisk" faktiskt betyder.

### 3. `speed` får aldrig vara sekunder i det delade tillståndet

Ett svep, ett skrivet svar och en matchning är tre olika tidsskalor. Det här
har kodbasen redan lärt sig två gånger: Svep har en egen kanal, och sveptakten
*måste* mätas på ankarbandet — mäts den på medianen av alla kort stiger
tröskeln med nivån och jagar sin egen svans.

Lagra `speed` som **kvot mot den egna kanalens baslinje**. Först då kan Para
ihop och Svep skriva till samma fält utan att förstöra det.

### 4. Tillståndskedjan ska vara härledd, inte lagrad

Sparas `state: "igenkänt"` vid sidan av `familiarity/accuracy/speed` finns två
sanningar som kan glida isär. Spara måtten, räkna fram etiketten vid visning,
med olika trösklar upp och ner så att värmekartan inte blinkar över gränsen.

### 5. Para ihop får aldrig befordra ett tal till «automatiserat»

Igenkänning kan flytta `okänt → introducerat → igenkänt`, punkt. Bara
framplockning når `stabilt` och `automatiserat`.

Det måste ligga som en regel i motorn, inte som en förhoppning: annars kan ett
barn matcha sig till en grön karta utan att kunna ett enda tal.

### 6. «Börja under och accelerera» är motsatsen till vad koden gör

`LEVEL_UP_STEP = 1`, `LEVEL_DOWN_STEP = 2` — försiktig upp, snabb ner. Det är
rätt i stabilt läge och fel under kalibreringsfönstret, som ska hitta spelarens
nivå fort.

Låt uppsteget bero på räckan, och fall tillbaka till 1/−2 när fönstret är slut.
Bunden av regel 2 och av färskhetsspärren: acceleration får inte betyda tre
nya tal i rad.

### 7. Vad händer med Mästaren?

Kärnan beskrivs som tre delar — Para ihop, Svep, värmekartan — och Mästaren är
ingen av dem. Men det är i dag den enda kanal som mäter riktig framplockning,
och både `fastSeconds` och hela behärskningsmåttet vilar på dess kalibrering.

Faller Mästaren bort tappas skillnaden mellan «kan avgöra om 7 × 8 = 54 är
fel» och «kan säga 56». Rekommendation: behåll det som tredje steg i rörelsen.

Avgörs av: ett produktbeslut, inte av en mätning.

---

## Kvarvarande steg

### Steg 4 — simuleringsriggen, och först därefter regulatorn

Ordningen är viktig. Siffrorna i modellen är gissningar, och det enda sättet
att veta är att köra dem.

Bygg en rigg med syntetiska elever — nybörjare, mellanläge, säker,
snabb-och-slarvig — och testa **invarianter**, inte siffror:

- lyckandegraden håller sig mellan 75 och 90 % över en rond
- inget tal svälter mer än N kort
- den säkre når hela tabellens bredd inom X kort
- nybörjaren möter aldrig fler än Y nya tal per 20
- nivån konvergerar i stället för att oscillera

Då hamnar pedagogiken under `ng test` i stället för i en känsla.

**Den första frågan riggen inte kan svara på, men loggen kan:** korrelerar Para
ihops tider med Svepets på samma tal? Gör de inte det är premissen att
matchning duger som diagnostik fel, och en motor ovanpå det måttet vore byggd
på sand. Det är det billigaste tänkbara testet av den dyraste idén.

Loggens tre nollpunkter (`msSinceRoundStart`, `msSinceLastResolved`,
`msSinceFirstTouch`) finns för att det inte går att avgöra på förhand vilken
som säger något. `remaining` mäter hur stort uteslutningsrummet var — vid 1 är
paret gratis — och är fältet en evidenströskel ska sättas på.

### Steg 5 — slå ihop värmekartorna

En karta på 55 celler med färg per kanal, i stället för Mästarens 10 × 10 med
speglade halvor och Svepets halva rutnät. Kräver att färgskalan hålls per
kanal — se öppen fråga 3; tiderna är inte jämförbara och får inte råka bli det.

### Steg 6 — ta bort nivåknapparna

Sist, när motorn bevisat att den klarar sig utan dem. `LEVELS` och
`LEVEL_BUTTONS` i `master-view/levels.ts` är det som går bort; `DIFFICULTY`
och auto-läget är det som blir kvar.

---

## Konstanter som är gissningar

Satta på känsla eller ur simulering, inte ur mätdata. Markerade `ANTAGANDE:` i
koden. Det här är listan steg 4 ska beta av.

| Konstant | Fil | Vad den styr |
| --- | --- | --- |
| `FOCUS_SPREAD` | `facts/fact-selector.ts` | Hur mycket nivåerna blandas |
| `WEIGHT_FLOOR` | `facts/fact-selector.ts` | Hur ofta ett tal utanför fokus ändå kommer |
| `RECENT_MEMORY` | `facts/fact-selector.ts` | Hur länge ett tal hålls borta efter att ha varit uppe |
| `needWeight`-trappan | `facts/fact-selector.ts` | 0,15 för behärskat, taket 3, gränsen 0,9 rätt |
| `DEFAULT_FAST_TIME` | `master-view/levels.ts` | Snabbtröskeln innan spelaren kalibrerats |
| `SLOW_TIME_MULTIPLIER` | `master-view/levels.ts` | Var «segt» börjar för skrivna svar |
| `PENALTY_TIME` | `master-view/levels.ts` | Vad ett fel kostar i värmekartans tid |
| `UPGRADE_THRESHOLD` / `DOWNGRADE_THRESHOLD` | `master-view/levels.ts` | Hur trögt auto-läget rör sig |
| `AT_HOME_SHARE` | `training/training-engine.ts` | När en grupp räknas som avklarad |
| `MIN_MASTERY_SAMPLES` | `training/training-engine.ts` | Hur många svar som krävs för en dom |
| `AUTO_CANDIDATES` | `training/training-engine.ts` | Hur brett auto-läget slumpar |
| kalibreringens 1,2 | `training/training-engine.ts` | Marginalen ovanpå medianen |
| `DEFAULT_SWIPE_BASELINE` | `training/training-engine.ts` | Sveptakt innan den mätts |
| `FAST_FACTOR`, `SLOW_TIME_MULTIPLIER` | `swipe-view/swipe-difficulty.ts` | Svepets två trösklar |
| `FALSE_CARD_TIME_FACTOR` | `swipe-view/swipe-difficulty.ts` | Hur mycket längre ett falskt kort får ta |
| `CALIBRATION_CARDS` | `swipe-view/swipe-difficulty.ts` | Hur lång uppvärmningen är |
| `DEFAULT_START_LEVEL` | `swipe-view/swipe-difficulty.ts` | Var en okänd spelare börjar |
| `LEVEL_UP_STEP` / `LEVEL_DOWN_STEP` | `swipe-view/swipe-difficulty.ts` | Se öppen fråga 6 |

---

## Bevarade inkonsekvenser

Sådant som är fel men medvetet lämnat, så att det inte «rättas» utan beslut.

- **Auto-lägets första fråga** dras jämnt ur gruppen, alla följande bland de
  tio mest träningsvärda. Ronden ska inte öppna med det svåraste spelaren har.
  Ta ställning när regulatorn i steg 4 byggs.
- **Räckan fortsätter räknas i taket** av svårighetsskalan fast gruppen inte
  kan stiga mer, eftersom samma räknare driver hejaropet i toppraden. Låst med
  ett test i `training/auto-difficulty.spec.ts`.
- **Mästarens rutnät är 10 × 10 med speglade halvor** efter att nycklarna
  kanoniserats. Löses i steg 5.
- **`DIFFICULTY` i `levels.ts` listar båda ordningarna** av varje tal. Sedan
  nycklarna kanoniserats påverkar det inte andelarna, eftersom både täljare och
  nämnare räknar dubbelt — men listan är dubbelt så lång som den behöver vara.
