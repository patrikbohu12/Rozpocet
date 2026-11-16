# Denný rozpočet

Osobná PWA na hlasové zapisovanie výdavkov. Nadiktuješ „dvanásť päťdesiat obed“, aplikácia výdavok zapíše a ukáže, koľko ti dnes ešte zostáva. Zostatok za celé obdobie je v Histórii. Žiadny server, účet ani analytika – dáta sú len v telefóne (IndexedDB).

## Ako ju dostať do iPhonu X

Aplikácia musí bežať na HTTPS adrese, inak iPhone nepovolí mikrofón ani prácu offline.

### 1. Nasadenie na GitHub Pages (raz, z počítača)

1. Na github.com vytvor nový **verejný** repozitár, napr. `rozpocet` (Pages na bezplatnom účte fungujú len pre verejné repozitáre; v repozitári je iba kód, žiadne tvoje výdavky).
2. Nahraj doň obsah tohto priečinka – buď cez **Add file → Upload files**, alebo:
   ```bash
   git remote add origin https://github.com/TVOJE-MENO/rozpocet.git
   ```
   ```bash
   git push -u origin main
   ```
3. V repozitári otvor **Settings → Pages**, v časti *Build and deployment* zvoľ **Deploy from a branch**, vetvu **main** a priečinok **/ (root)**, a ulož.
4. Po minúte až dvoch bude aplikácia na `https://TVOJE-MENO.github.io/rozpocet/`.

### 2. Pridanie na plochu (v iPhone)

1. Otvor adresu v **Safari** (nie v Chrome).
2. Ťukni na **Zdieľať** (štvorec so šípkou hore) → **Pridať na plochu** → **Pridať**.
3. Aplikáciu odteraz otváraj z ikony na ploche. **Pozor:** ikona na ploche a stránka v Safari majú oddelené dáta. Výdavky zapisuj len na jednom mieste – odporúčam ikonu na ploche.
4. Pri prvom ťuknutí na mikrofón povoľ prístup k mikrofónu a rozpoznávaniu reči. V iPhone musí byť zapnuté **Nastavenia → Všeobecné → Klávesnica → Zapnúť diktovanie** a pridaná slovenská klávesnica.

### Používanie

- **Mikrofón:** ťukni, povedz sumu a na čo, zápis sa uloží sám. Tlačidlami *Vrátiť späť* / *Opraviť* ho hneď zmeníš.
- **Textové pole:** ak veľký mikrofón nefunguje (alebo sa vôbec nezobrazí), ťukni do poľa, stlač mikrofón na klávesnici, nadiktuj a ťukni na *Zapísať*.
- **Záloha:** *Nastavenia → Zálohovať všetko (JSON)* a súbor ulož do Súborov/iCloudu. Rob to pravidelne.

## Ručný test na iPhone X (treba spraviť, viď nižšie)

- [ ] Diktovanie veľkým mikrofónom v Safari.
- [ ] Diktovanie veľkým mikrofónom po pridaní na plochu.
- [ ] Diktovanie mikrofónom klávesnice do textového poľa.
- [ ] Režim Lietadlo: aplikácia sa otvorí a výdavok sa dá zapísať textom.
- [ ] Zatvoriť aplikáciu (aj vyhodiť z prepínača), otvoriť – výdavky sú tam.
- [ ] Export CSV a záloha JSON ponúknu zdieľanie/uloženie súboru; obnova zo zálohy funguje.
- [ ] Nič nie je schované pod výrezom ani pod spodným indikátorom.

## Čo sa na iOS 16 nepodarilo spraviť alebo overiť podľa zadania

1. **Nič nebolo overené na skutočnom iPhone X s iOS 16.** Aplikácia vznikla a bola testovaná v cloude: jednotkové testy v Node a test rozhrania v Chromiu s rozmerom 375 × 812. Safari 16 ani iOS som k dispozícii nemal. Kód sa vyhýba veciam, ktoré Safari 16.0 nevie (CSS nesting, regex lookbehind), ale ručný test vyššie je nutný.
2. **Správanie `webkitSpeechRecognition` v režime standalone nie je overené.** Zadanie žiadalo overenie priamo na iOS 16; to som urobiť nemohol. Aplikácia je preto napísaná obranne: ak rozhranie neexistuje, veľký mikrofón sa nezobrazí; ak zlyhá, ukáže sa pokyn použiť mikrofón na klávesnici; ak iOS neoznačí výsledok ako konečný, zápis sa uloží po necelých 2 sekundách ticha.
3. **Záložná cesta nie je „pár sekúnd bez ťuknutia navyše“.** Pri diktovaní cez klávesnicu treba po dohovorení ťuknúť na *Zapísať* – web nevie zistiť, kedy diktovanie klávesnice skončilo.
4. **Diktovanie nie je úplne „bez externých služieb“ a offline.** Rozpoznávanie reči robí Apple (rovnaká služba ako diktovanie klávesnice); pre slovenčinu podľa všetkého potrebuje internet. Offline funguje všetko ostatné vrátane zápisu textom.
5. **Trvalosť dát sa nedá zaručiť.** `navigator.storage.persist()` sa pri štarte volá, ale Safari 16 ho nemusí potvrdiť; stav vidíš v Nastaveniach. Preto je tam zreteľná záloha a dátum poslednej zálohy.
6. **Číslovky slovom sú len do 999.** Vyššie sumy fungujú číslicami (`1250 eur nábytok`).
7. **Zmena rozpočtu alebo dňa výplaty platí aj spätne** – staršie obdobia v Histórii sa prepočítajú podľa aktuálneho nastavenia.
8. **Aktualizácia aplikácie sa prejaví až pri druhom otvorení** po nasadení novej verzie (service worker najprv ukáže uloženú verziu a novú stiahne na pozadí).

## Vývoj

```bash
npm test
```
Jednotkové testy rozpoznania sumy, kategórií a výpočtu zostatku (22 testov, časová zóna Europe/Bratislava).

```bash
npm start
```
Miestny server na `http://localhost:8080`. Test rozhrania v Chromiu: `node tests/smoke.mjs` (vyžaduje Playwright).

Pri zmene súborov zvýš `CACHE` v `sw.js` (napr. `rozpocet-v2`).

| Súbor | Obsah |
|---|---|
| `js/parse.js` | rozpoznanie sumy a popisu, slovenské číslovky |
| `js/categories.js` | kategórie podľa kľúčových slov |
| `js/budget.js` | obdobie, denný limit, zostatky (všetko v centoch) |
| `js/db.js` | IndexedDB |
| `js/app.js` | rozhranie, hlas, export a záloha |
| `sw.js`, `manifest.webmanifest` | offline a pridanie na plochu |
