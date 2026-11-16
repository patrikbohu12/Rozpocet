import test from 'node:test';
import assert from 'node:assert/strict';
import { compute, periodFor, daysBetween, addDays, dayKey, isoLocal, expenseDay } from '../js/budget.js';

const B = 42900;
const calc = (today, expenses = [], payday = 15, budgetCents = B) =>
  compute({ budgetCents, payday, today, expenses });

test('15. 11. bez výdavkov: 30 dní, limit 14,30 €', () => {
  const r = calc('2026-11-15');
  assert.equal(r.start, '2026-11-15');
  assert.equal(r.end, '2026-12-15');
  assert.equal(r.daysTotal, 30);
  assert.equal(r.daysLeft, 30);
  assert.equal(r.limit, 1430);
  assert.equal(r.leftToday, 1430);
  assert.equal(r.leftPeriod, B);
});

test('15. 11. minutých 20 €, 16. 11. je limit 14,10 €', () => {
  const r = calc('2026-11-16', [{ day: '2026-11-15', cents: 2000 }]);
  assert.equal(r.daysLeft, 29);
  assert.equal(r.limit, 1410);
});

test('16. 11. minutých 5 € pri limite 14,10 €: zostáva 9,10 €', () => {
  const r = calc('2026-11-16', [{ day: '2026-11-15', cents: 2000 }, { day: '2026-11-16', cents: 500 }]);
  assert.equal(r.limit, 1410);
  assert.equal(r.spentToday, 500);
  assert.equal(r.leftToday, 910);
  assert.equal(r.leftPeriod, B - 2500);
});

test('dnes minuté viac než limit: záporná hodnota', () => {
  const r = calc('2026-11-16', [{ day: '2026-11-15', cents: 2000 }, { day: '2026-11-16', cents: 2000 }]);
  assert.equal(r.leftToday, -590);
});

test('14. 12.: zostáva 1 deň, limit je celý zostatok obdobia', () => {
  const r = calc('2026-12-14', [{ day: '2026-11-20', cents: 30000 }, { day: '2026-12-13', cents: 2900 }]);
  assert.equal(r.daysLeft, 1);
  assert.equal(r.limit, 10000);
  assert.equal(r.leftToday, r.leftPeriod);
});

test('15. 12. začína nové obdobie a staré výdavky sa nerátajú', () => {
  const r = calc('2026-12-15', [{ day: '2026-12-14', cents: 9999 }]);
  assert.equal(r.start, '2026-12-15');
  assert.equal(r.end, '2027-01-15');
  assert.equal(r.spentBefore, 0);
  assert.equal(r.daysLeft, 31);
});

test('prelom mesiaca: 1. 12. patrí do obdobia od 15. 11.', () => {
  const r = calc('2026-12-01', [{ day: '2026-11-30', cents: 1000 }]);
  assert.equal(r.start, '2026-11-15');
  assert.equal(r.daysLeft, 14);
  assert.equal(r.spentBefore, 1000);
});

test('prelom roka', () => {
  assert.deepEqual(periodFor('2026-12-31', 15), { start: '2026-12-15', end: '2027-01-15' });
  assert.deepEqual(periodFor('2027-01-01', 15), { start: '2026-12-15', end: '2027-01-15' });
  assert.deepEqual(periodFor('2027-01-14', 15), { start: '2026-12-15', end: '2027-01-15' });
  assert.deepEqual(periodFor('2027-01-15', 15), { start: '2027-01-15', end: '2027-02-15' });
  const r = calc('2027-01-01', [{ day: '2026-12-31', cents: 2900 }]);
  assert.equal(r.daysTotal, 31);
  assert.equal(r.daysLeft, 14);
  assert.equal(r.limit, Math.round(40000 / 14));
});

test('február: obdobie 15. 2. – 14. 3. má 28 dní (29 v priestupnom roku)', () => {
  assert.equal(calc('2027-02-15').daysTotal, 28);
  assert.equal(calc('2028-02-15').daysTotal, 29);
});

test('deň výplaty 31. sa v kratších mesiacoch posúva na posledný deň', () => {
  assert.deepEqual(periodFor('2027-02-27', 31), { start: '2027-01-31', end: '2027-02-28' });
  assert.deepEqual(periodFor('2027-02-28', 31), { start: '2027-02-28', end: '2027-03-31' });
  assert.deepEqual(periodFor('2028-02-29', 31), { start: '2028-02-29', end: '2028-03-31' });
  assert.deepEqual(periodFor('2027-04-30', 31), { start: '2027-04-30', end: '2027-05-31' });
  assert.deepEqual(periodFor('2027-04-29', 30), { start: '2027-03-30', end: '2027-04-30' });
  assert.equal(calc('2027-02-27', [], 31).daysLeft, 1);
});

test('deň výplaty 1.', () => {
  assert.deepEqual(periodFor('2026-12-31', 1), { start: '2026-12-01', end: '2027-01-01' });
  assert.deepEqual(periodFor('2027-01-01', 1), { start: '2027-01-01', end: '2027-02-01' });
});

test('prečerpaný rozpočet dáva záporný limit', () => {
  const r = calc('2026-11-20', [{ day: '2026-11-16', cents: 50000 }]);
  assert.ok(r.limit < 0);
  assert.equal(r.leftPeriod, -7100);
});

test('počítanie dní cez zmenu času', () => {
  assert.equal(daysBetween('2026-10-20', '2026-10-30'), 10); // 25. 10. sa mení čas
  assert.equal(daysBetween('2027-03-20', '2027-04-02'), 13);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-03-01', -1), '2027-02-28');
});

test('dni sa počítajú v miestnom čase (Europe/Bratislava), nie v UTC', () => {
  assert.equal(process.env.TZ, 'Europe/Bratislava', 'testy spúšťaj cez npm test');
  // 00:30 miestneho času je v UTC ešte predchádzajúci deň
  assert.equal(dayKey(new Date(2026, 10, 16, 0, 30)), '2026-11-16');
  assert.equal(expenseDay({ time: '2026-11-16T00:30:00+01:00' }), '2026-11-16');
  assert.equal(expenseDay({ time: '2026-11-15T23:30:00Z' }), '2026-11-16');
  assert.equal(isoLocal(new Date(2026, 10, 16, 0, 30, 5)), '2026-11-16T00:30:05+01:00');
  assert.equal(isoLocal(new Date(2026, 6, 1, 12, 0, 0)), '2026-07-01T12:00:00+02:00');
});
