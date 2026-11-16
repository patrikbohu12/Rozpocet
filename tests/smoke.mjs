// Dymový test rozhrania v Chromiu (nie je to náhrada za test na iPhone).
// Spustenie: python3 -m http.server 8080 &  a potom  node tests/smoke.mjs [priečinok na snímky]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';

const shots = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 }, deviceScaleFactor: 2,
  locale: 'sk-SK', timezoneId: 'Europe/Bratislava', acceptDownloads: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.clock.install({ time: new Date('2026-11-15T12:00:00+01:00') });
await page.goto('http://localhost:8080/');
const hero = () => page.locator('#hero-value').innerText().then((s) => s.replace(/\s/g, ' '));
const add = async (text) => { await page.fill('#entry-text', text); await page.click('#entry-form button'); };

await page.waitForFunction(() => document.getElementById('hero-value').textContent.includes('€'));
assert.equal(await hero(), '14,30 €');

await add('dvadsať eur nákup lidl');
assert.equal(await hero(), '5,70 €');
assert.match(await page.locator('#msg').innerText(), /Zapísané.*20,00.*Potraviny/s);

// bez sumy sa nič neuloží
await add('káva');
assert.match(await page.locator('#msg').innerText(), /Nenašiel som sumu/);
assert.equal(await page.locator('#today-list .item').count(), 1);
assert.equal(await page.inputValue('#entry-text'), 'káva');

// vrátenie späť
await add('3 eur káva');
assert.equal(await page.locator('#today-list .item').count(), 2);
await page.click('[data-undo]');
assert.equal(await page.locator('#today-list .item').count(), 1);

// na druhý deň: limit (429 − 20) / 29 = 14,10; po 5 € zostáva 9,10
await page.clock.setFixedTime(new Date('2026-11-16T09:00:00+01:00'));
await page.reload();
await page.waitForFunction(() => document.getElementById('hero-value').textContent.includes('€'));
assert.equal((await page.locator('#st-limit').innerText()).replace(/\s/g, ' '), '14,10 €');
await add('päť eur káva');
assert.equal(await hero(), '9,10 €');
if (shots) await page.screenshot({ path: `${shots}/dnes.png` });

// prekročenie
await add('12,50 obed');
assert.equal(await page.locator('#hero-label').innerText(), 'Dnes prekročené o');
assert.equal(await hero(), '3,40 €');
if (shots) await page.screenshot({ path: `${shots}/prekrocene.png` });

// úprava a zmazanie
await page.click('#today-list .item >> nth=0');
await page.fill('#ed-amount', '2,50');
await page.click('#edit-form button[type=submit]');
assert.equal(await hero(), '6,60 €');
await page.click('#today-list .item >> nth=0');
if (shots) await page.screenshot({ path: `${shots}/uprava.png` });
await page.click('#ed-delete');
assert.equal(await hero(), '9,10 €');

// história
await page.click('[data-tab=history]');
const hist = await page.locator('#tab-history').innerText();
assert.match(hist, /15\. 11\. – 14\. 12\. 2026/);
assert.match(hist, /Potraviny/);
assert.match(hist, /nedeľa 15\. 11\./);
if (shots) await page.screenshot({ path: `${shots}/historia.png` });

// nastavenia, CSV a záloha
await page.click('[data-tab=settings]');
assert.equal(await page.inputValue('#set-budget'), '429,00');
const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#btn-csv')]);
assert.match(csv.suggestedFilename(), /^vydavky-2026-11-16\.csv$/);
const [json] = await Promise.all([page.waitForEvent('download'), page.click('#btn-backup')]);
const backupPath = await json.path();
if (shots) await page.screenshot({ path: `${shots}/nastavenia.png`, fullPage: true });

// obnova zo zálohy po zmazaní dát + zmena rozpočtu
await page.fill('#set-budget', '300');
await page.locator('#set-budget').blur();
page.on('dialog', (d) => d.accept());
await page.setInputFiles('#restore-file', backupPath);
await page.waitForFunction(() => /Obnovených 2/.test(document.getElementById('set-msg').textContent));
assert.equal(await page.inputValue('#set-budget'), '429,00');

// dáta prežijú zatvorenie; aplikácia sa načíta offline zo service workera
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(500);
await ctx.setOffline(true);
await page.reload();
await page.waitForFunction(() => document.getElementById('hero-value').textContent.includes('€'));
assert.equal(await hero(), '9,10 €');
assert.equal(await page.locator('#today-list .item').count(), 1);

assert.deepEqual(errors, []);
await browser.close();
console.log('Dymový test prešiel.');
