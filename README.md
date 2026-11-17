# Denný rozpočet

Osobná PWA na rýchle zapisovanie výdavkov. Do poľa nadiktuješ mikrofónom na klávesnici alebo napíšeš „12,50 obed“, aplikácia výdavok zapíše a ukáže, koľko ti dnes ešte zostáva. Prehľad ukazuje balance – koľko máš našetrené z predošlých dní. Žiadny server, účet ani analytika – dáta sú len v telefóne (IndexedDB).

## Ako ju dostať do iPhonu X

Aplikácia musí bežať na HTTPS adrese, inak iPhone nepovolí prácu offline ani pridanie na plochu ako aplikácie.

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
4. Aby šlo diktovať do poľa, maj v iPhone zapnuté **Nastavenia → Všeobecné → Klávesnica → Zapnúť diktovanie** a pridanú slovenskú klávesnicu.

### Používanie

- **Zápis:** ťukni do poľa, stlač mikrofón na klávesnici a nadiktuj „dvanásť päťdesiat obed“ (alebo to napíš), potom ťukni na *Zapísať*. Tlačidlami *Vrátiť späť* / *Opraviť* zápis hneď zmeníš.
- **Dnes:** veľké číslo je dnešný zostatok, pod ním dnešný limit a minuté dnes.
- **Prehľad:** *balance* je to, čo môžeš práve teraz minúť – denný diel rozpočtu za každý deň obdobia vrátane dneška, mínus všetko minuté. Pri dennom diele 15 € a troch dňoch bez výdavku je štvrtý deň balance 60 €. Pod ním sú súčty podľa kategórií a po dňoch a prepínanie na staršie obdobia.
- **Záloha:** *Nastavenia → Zálohovať všetko (JSON)* a súbor ulož do Súborov/iCloudu. Rob to pravidelne.

**Dnešný limit vs. balance:** limit je rozdelenie zostatku rozpočtu na zostávajúce dni (prečerpanie či úspora sa rozložia dopredu), balance je naopak to, čo sa nasporilo dozadu od začiatku obdobia.

## Ručný test na iPhone X (treba spraviť, viď nižšie)

- [ ] Diktovanie mikrofónom klávesnice do textového poľa v Safari aj po pridaní na plochu.
- [ ] Režim Lietadlo: aplikácia sa otvorí a výdavok sa dá zapísať textom.
- [ ] Zatvoriť aplikáciu (aj vyhodiť z prepínača), otvoriť – výdavky sú tam.
- [ ] Export CSV a záloha JSON ponúknu zdieľanie/uloženie súboru; obnova zo zálohy funguje.
- [ ] Nič nie je schované pod výrezom ani pod spodným indikátorom.

## Čo sa na iOS 16 nepodarilo spraviť podľa zadania

1. **Veľké tlačidlo mikrofónu v aplikácii nefunguje a bolo odstránené.** `webkitSpeechRecognition` sa na iOS 16 dalo zapnúť aj vypnúť, ale rozpoznaný text aplikácii nikdy neposlalo, takže sa nemalo čo zapísať. Po dvoch pokusoch o obídenie (čakanie na text po zastavení, vlastné ukončenie po tichu) som tlačidlo zrušil. Zostáva textové pole s mikrofónom na klávesnici, ktorý funguje spoľahlivo. Oproti zadaniu to znamená jedno ťuknutie navyše (*Zapísať*) – web nevie zistiť, kedy diktovanie klávesnice skončilo.
2. **Nič nie je overené na skutočnom iPhone X s iOS 16** okrem diktovania. Aplikácia vznikla a bola testovaná v cloude: jednotkové testy v Node a test rozhrania v Chromiu s rozmerom 375 × 812. Kód sa vyhýba veciam, ktoré Safari 16.0 nevie (CSS nesting, regex lookbehind), ale ručný test vyššie je nutný.
3. **Trvalosť dát sa nedá zaručiť.** `navigator.storage.persist()` sa pri štarte volá, ale Safari 16 ho nemusí potvrdiť; stav vidíš v Nastaveniach. Preto je tam zreteľná záloha a dátum poslednej zálohy.
4. **Číslovky slovom sú len do 999.** Vyššie sumy fungujú číslicami (`1250 eur nábytok`).
5. **Zmena rozpočtu alebo dňa výplaty platí aj spätne** – staršie obdobia v Prehľade sa prepočítajú podľa aktuálneho nastavenia.
6. **Aktualizácia aplikácie sa prejaví až pri druhom otvorení** po nasadení novej verzie (service worker najprv ukáže uloženú verziu a novú stiahne na pozadí).

## Vývoj

```bash
npm test
```
Jednotkové testy rozpoznania sumy, kategórií, výpočtu zostatku a balance (24 testov, časová zóna Europe/Bratislava).

```bash
npm start
```
Miestny server na `http://localhost:8080`. Test rozhrania v Chromiu: `node tests/smoke.mjs` (vyžaduje Playwright).

Pri zmene súborov zvýš `CACHE` v `sw.js` (teraz `rozpocet-v3`).

| Súbor | Obsah |
|---|---|
| `js/parse.js` | rozpoznanie sumy a popisu, slovenské číslovky |
| `js/categories.js` | kategórie podľa kľúčových slov |
| `js/budget.js` | obdobie, denný limit, balance, zostatky (všetko v centoch) |
| `js/db.js` | IndexedDB |
| `js/app.js` | rozhranie, export a záloha |
| `sw.js`, `manifest.webmanifest` | offline a pridanie na plochu |
