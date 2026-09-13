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

Avgörs av: steg 4. Ett loop-test som oscillerar är svaret — och det testet
skrivs ihop med regulatorn, inte före den.

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

### Steg 4 — läs loggen, och testa regulatorn när den byggs

Siffrorna i modellen är gissningar, och det går inte att se på koden vad de gör
tillsammans över en hel rond. Frågan är bara vem som ska svara.

**Inte en simulering.** Ett tidigare utkast av den här planen föreslog en rigg
med syntetiska elever — nybörjare, mellanläge, säker, snabb-och-slarvig — som
skulle köras tusentals ronder mot motorn. Den var fel dimensionerad för det här
projektet, av tre skäl:

- Användarbasen är ett par barn vid ett köksbord, och de går att titta på medan
  de spelar. Ingen simulerad elev slår den upplösningen.
- En simulering validerar loopen mot *modellen* av en elev. Att bygga en
  trovärdig elevmodell är ungefär lika svårt som att bygga träningsloopen, och
  är modellen fel producerar riggen en välformulerad bekräftelse av de egna
  antagandena — med en auktoritet den inte förtjänar.
- De rena reglerna är redan testade var för sig. Hålet är smalare än det ser
  ut: det gäller bara vad som händer över en hel rond.

Att bygga en vindtunnel för att välja mellan två pappersflygplan är fel även
när vindtunneln i sig är välbyggd.

Argumentet hänger på användarbasen, så det vänder om den gör det: växer den
förbi vad som går att titta på, eller ska konstanterna trimmas på riktigt —
hundra varianter, leta optimum — då är en rigg rätt verktyg igen. Det är
premissen att pröva innan man avfärdar den en andra gång.

**Gör så här i stället.**

*Först:* låt loggen samla. Den skriver redan, och verklig data från två barn är
värd mer än fyra syntetiska arketyper.

*Sedan:* läs den. Läsaren finns nu — `training/observation-analysis.ts`, med
`observation-analysis.report.spec.ts` som körning. Så här används den:

1. Öppna Mästarens värmekarta på enheten som övats på, tryck **Exportera
   data**. Exporten tar med både loggen och framstegen; korrelationen nedan
   kräver svepens tider, som ligger i framstegsdokumentet.
2. Klistra in i `tools/observations.json` (ignorerad av git — ett barns
   svarstider hör inte hemma i ett publikt repo).
3. `npm test`. Rapporten hamnar i `tools/observations-report.txt`.

Ingenting av det är del av spelet: inget i `src/app` importerar analysen, så
den följer inte med i bygget.

Rapporten svarar på den fråga ingen simulering kan besvara, eftersom
korrelationen är just det som är okänt:

> Korrelerar Para ihops tider med Svepets på samma tal?

Gör de inte det är premissen att matchning duger som diagnostik fel, och en
motor ovanpå det måttet vore byggd på sand. Det är det billigaste tänkbara
testet av den dyraste idén.

Svaret är en rangkorrelation, en per nollpunkt. Rang och inte Pearson:
svarstider är skeva, och frågan är om de tal som är långsamma i Para ihop
*också* är de långsamma i Svep — en fråga om ordning, inte om linjär form.
Rapporten säger också vad siffran betyder för beslutet, så att den går att läsa
av någon som inte minns varför den skrevs.

Loggens tre nollpunkter (`msSinceRoundStart`, `msSinceLastResolved`,
`msSinceFirstTouch`) mäts var för sig, eftersom det inte går att avgöra på
förhand vilken som bär signal. `remaining` mäter hur stort uteslutningsrummet
var — vid 1 är paret gratis — och rapportens tabell över det är vad som avgör
var tröskeln ska ligga. Tills den mätts räknas evidens från `MIN_REMAINING = 3`
och uppåt, vilket är ett resonemang och inte en mätning: med två kvar är det en
gissning med 50 % chans.

**Kvar innan det här steget är klart:** data. Analysen är byggd och testad mot
påhittade händelser, men ingen riktig export har lästs ännu. Rapporten vägrar
tolka en korrelation som vilar på färre än åtta tal, så det behövs ett antal
ronder innan den säger något.

*Först därefter:* bygg blandningsregulatorn, och skriv loop-testerna i samma
veva. Det är där ett simulerat spel faktiskt gör något som inte går att göra på
annat sätt: en återkopplad regulator kan oscillera på ett sätt som är osynligt
i ett enskilt kort, och osynligt för ett barn som bara tycker att det känns
konstigt. Men det ska vara en handfull tester med en avsiktligt korkad falsk
spelare på ett tjugotal rader, skrivna tillsammans med regulatorn de testar —
inte ett `simulation/`-bygge med arketyper och spårningsutskrifter.

Testa **invarianter**, inte siffror. Ett test som låser `FOCUS_SPREAD` till 9
låser fast gissningen och är värdelöst; ett test som säger att lyckandegraden
inte får falla under 75 % fångar att någon ändrat 9 till 3 och gjort träningen
till ett prov. Konstanterna ska vara fria att justera — det är loopens
*beteende* som ska ligga fast:

- lyckandegraden håller sig mellan 75 och 90 % över en rond
- inget tal svälter mer än N kort
- den säkre når hela tabellens bredd inom X kort
- nybörjaren möter aldrig fler än Y nya tal per 20
- nivån konvergerar i stället för att oscillera

Listan är densamma oavsett om mätningen sker på riktig eller påhittad data. Det
var bara mekanismen som var övertung.

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
