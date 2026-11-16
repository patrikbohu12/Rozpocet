import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExpense, parseMoney } from '../js/parse.js';
import { categorize } from '../js/categories.js';

const ok = (input, cents, description) => {
  const r = parseExpense(input);
  assert.equal(r.ok, true, `„${input}" sa malo rozpoznať`);
  assert.equal(r.cents, cents, `suma pre „${input}"`);
  assert.equal(r.description, description, `popis pre „${input}"`);
  assert.equal(r.raw, input);
};

test('tabuľka zo zadania', () => {
  ok('12,50 obed', 1250, 'obed');
  ok('12.50 obed', 1250, 'obed');
  ok('12 eur 50 obed', 1250, 'obed');
  ok('12 eur a 50 centov obed', 1250, 'obed');
  ok('5,80 € cigarety', 580, 'cigarety');
  ok('cigarety 5,80', 580, 'cigarety');
  ok('dvanásť päťdesiat obed', 1250, 'obed');
  ok('päť eur káva', 500, 'káva');
  ok('dvadsaťtri eur benzín', 2300, 'benzín');
});

test('bez sumy je chyba a nič sa neuloží', () => {
  const r = parseExpense('káva');
  assert.equal(r.ok, false);
  assert.equal(r.raw, 'káva');
  assert.equal(parseExpense('').ok, false);
  assert.equal(parseExpense('nula eur káva').ok, false);
});

test('číslovky bez diakritiky a rozdelené na slová', () => {
  ok('dvanast patdesiat obed', 1250, 'obed');
  ok('dvadsat tri eur benzin', 2300, 'benzin');
  ok('Dvadsaťtri Eur Benzín', 2300, 'Benzín');
  ok('sto dvadsať päť eur nákup', 12500, 'nákup');
  ok('stodvadsaťpäť eur nákup', 12500, 'nákup');
  ok('deväťsto deväťdesiat deväť eur výlet', 99900, 'výlet');
  ok('deväťstodeväťdesiatdeväť eur výlet', 99900, 'výlet');
  ok('dvesto eur výlet', 20000, 'výlet');
  ok('štyristo päťdesiat eur', 45000, '');
  ok('päť sto eur výlet', 50000, 'výlet');
  ok('sto jeden eur', 10100, '');
  ok('devätnásť eur kino', 1900, 'kino');
  ok('päťadvadsať eur tričko', 2500, 'tričko');
});

test('všetky základné číslovky', () => {
  const words = {
    jeden: 1, dva: 2, dve: 2, tri: 3, 'štyri': 4, 'päť': 5, 'šesť': 6, sedem: 7, osem: 8, 'deväť': 9,
    'desať': 10, 'jedenásť': 11, 'dvanásť': 12, 'trinásť': 13, 'štrnásť': 14, 'pätnásť': 15,
    'šestnásť': 16, 'sedemnásť': 17, 'osemnásť': 18, 'devätnásť': 19,
    'dvadsať': 20, 'tridsať': 30, 'štyridsať': 40, 'päťdesiat': 50, 'šesťdesiat': 60,
    'sedemdesiat': 70, 'osemdesiat': 80, 'deväťdesiat': 90,
    sto: 100, dvesto: 200, tristo: 300, 'štyristo': 400, 'päťsto': 500, 'šesťsto': 600,
    sedemsto: 700, osemsto: 800, 'deväťsto': 900,
  };
  for (const [w, n] of Object.entries(words)) ok(`${w} eur test`, n * 100, 'test');
});

test('eurá a centy v rôznych tvaroch', () => {
  ok('jedno euro žuvačka', 100, 'žuvačka');
  ok('dve eurá káva', 200, 'káva');
  ok('5,80€ cigarety', 580, 'cigarety');
  ok('5,80 eur cigarety', 580, 'cigarety');
  ok('12eur obed', 1200, 'obed');
  ok('12 EUR 50 obed', 1250, 'obed');
  ok('päťdesiat centov žuvačka', 50, 'žuvačka');
  ok('dvanásť eur päťdesiat obed', 1250, 'obed');
  ok('dvanásť eur a päť centov obed', 1205, 'obed');
  ok('dvanásť päťdesiat eur obed', 1250, 'obed');
  ok('tri deväťdesiat rožky', 390, 'rožky');
  ok('dvadsať tri päťdesiat obed', 2350, 'obed');
  ok('12,5 obed', 1250, 'obed');
  ok('12 obed', 1200, 'obed');
  ok('obed 12,50.', 1250, 'obed');
});

test('číslo v popise nepokazí sumu', () => {
  ok('2 pivá 6 eur', 600, '2 pivá');
  ok('lidl 3 rožky 2,40', 240, 'lidl 3 rožky');
  ok('5 eur 2 kávy', 500, '2 kávy');
  ok('stolička 30 eur', 3000, 'stolička');
});

test('parseMoney', () => {
  assert.equal(parseMoney('12,50'), 1250);
  assert.equal(parseMoney('12.5'), 1250);
  assert.equal(parseMoney('12'), 1200);
  assert.equal(parseMoney('12,50 €'), 1250);
  assert.equal(parseMoney('0,05'), 5);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney(''), null);
});

test('kategórie', () => {
  assert.equal(categorize('lidl'), 'Potraviny');
  assert.equal(categorize('nákup Billa'), 'Potraviny');
  assert.equal(categorize('obed'), 'Reštaurácie a kaviarne');
  assert.equal(categorize('kávu'), 'Reštaurácie a kaviarne');
  assert.equal(categorize('2 pivá'), 'Reštaurácie a kaviarne');
  assert.equal(categorize('bar'), 'Reštaurácie a kaviarne');
  assert.equal(categorize('barber'), 'Ostatné');
  assert.equal(categorize('cigarety'), 'Tabak');
  assert.equal(categorize('benzín'), 'Pohonné hmoty');
  assert.equal(categorize('MHD lístok'), 'Doprava');
  assert.equal(categorize('parkovanie'), 'Doprava');
  assert.equal(categorize('kino'), 'Zábava');
  assert.equal(categorize('výlet'), 'Zábava');
  assert.equal(categorize('tričko'), 'Ostatné');
  assert.equal(categorize(''), 'Ostatné');
});
