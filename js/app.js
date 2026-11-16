import { parseExpense, parseMoney } from './parse.js';
import { categorize, CATEGORIES } from './categories.js';
import { compute, periodFor, dayKey, isoLocal, expenseDay, addDays, parseKey } from './budget.js';
import * as db from './db.js';

const $ = (id) => document.getElementById(id);
const DEFAULTS = { budgetCents: 42900, payday: 15, lastBackup: null };

let settings = { ...DEFAULTS };
let expenses = [];
let historyStart = null; // začiatok zobrazeného obdobia; null = aktuálne
let editingId = null;
let msgTimer = null;

// ---------- formátovanie ----------

const money = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' });
const fmt = (cents) => money.format(cents / 100);
const fmtPlain = (cents) => (cents / 100).toFixed(2).replace('.', ',');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const localDate = (key) => { const { y, m, d } = parseKey(key); return new Date(y, m - 1, d); };
const fmtDay = (key, opts) => new Intl.DateTimeFormat('sk-SK', opts).format(localDate(key));
const fmtTime = (iso) => new Intl.DateTimeFormat('sk-SK', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const todayKey = () => dayKey(new Date());
const withDay = () => expenses.map((e) => ({ ...e, day: expenseDay(e) }));

// ---------- vykreslenie ----------

function itemHtml(e, showTime) {
  return `<button type="button" class="item" data-id="${esc(e.id)}">
    ${showTime ? `<span class="time">${fmtTime(e.time)}</span>` : ''}
    <span class="what"><div class="desc">${esc(e.description || 'bez popisu')}</div><div class="cat">${esc(e.category)}</div></span>
    <span class="sum">${fmt(e.cents)}</span>
  </button>`;
}

function renderToday() {
  const today = todayKey();
  const all = withDay();
  const r = compute({ budgetCents: settings.budgetCents, payday: settings.payday, today, expenses: all });

  const over = r.leftToday < 0;
  $('hero').classList.toggle('over', over);
  $('hero-label').textContent = over ? 'Dnes prekročené o' : 'Dnes zostáva';
  $('hero-value').textContent = fmt(Math.abs(r.leftToday));
  $('st-limit').textContent = fmt(r.limit);
  $('st-limit').classList.toggle('neg', r.limit < 0);
  $('st-spent').textContent = fmt(r.spentToday);

  const list = all.filter((e) => e.day === today).sort((a, b) => (a.time < b.time ? 1 : -1));
  $('today-list').innerHTML = list.length
    ? list.map((e) => itemHtml(e, true)).join('')
    : '<p class="empty">Dnes zatiaľ nič.</p>';
}

function renderHistory() {
  const current = periodFor(todayKey(), settings.payday);
  const per = historyStart ? periodFor(historyStart, settings.payday) : current;
  const all = withDay();
  const inPer = all.filter((e) => e.day >= per.start && e.day < per.end);

  const o = { day: 'numeric', month: 'numeric' };
  $('per-label').textContent = `${fmtDay(per.start, o)} – ${fmtDay(addDays(per.end, -1), { ...o, year: 'numeric' })}`;
  $('per-next').disabled = per.start >= current.start;
  $('per-prev').disabled = !all.some((e) => e.day < per.start);

  const total = inPer.reduce((s, e) => s + e.cents, 0);
  const left = settings.budgetCents - total;
  let html = `<div class="summary">
    <div class="big">${fmt(total)} <span class="note">z ${fmt(settings.budgetCents)}</span></div>
    <div class="${left < 0 ? 'neg' : ''}">${left < 0 ? `Prekročené o ${fmt(-left)}` : `Zostáva ${fmt(left)}`}</div>
  </div>`;

  if (!inPer.length) {
    html += '<p class="empty">V tomto období nie sú žiadne výdavky.</p>';
  } else {
    const byCat = new Map();
    for (const e of inPer) byCat.set(e.category, (byCat.get(e.category) || 0) + e.cents);
    html += '<h2>Podľa kategórií</h2>' + [...byCat].sort((a, b) => b[1] - a[1])
      .map(([c, s]) => `<div class="line"><span>${esc(c)}</span><strong>${fmt(s)}</strong></div>`).join('');

    const byDay = new Map();
    for (const e of inPer) (byDay.get(e.day) || byDay.set(e.day, []).get(e.day)).push(e);
    html += '<h2>Po dňoch</h2>';
    for (const day of [...byDay.keys()].sort().reverse()) {
      const items = byDay.get(day).sort((a, b) => (a.time < b.time ? 1 : -1));
      const sum = items.reduce((s, e) => s + e.cents, 0);
      html += `<div class="day-head"><span>${fmtDay(day, { weekday: 'long', day: 'numeric', month: 'numeric' })}</span><span>${fmt(sum)}</span></div>`;
      html += items.map((e) => itemHtml(e, true)).join('');
    }
  }
  $('history-body').innerHTML = html;
}

async function renderSettings() {
  $('set-budget').value = fmtPlain(settings.budgetCents);
  $('set-payday').value = settings.payday;
  const per = periodFor(todayKey(), settings.payday);
  const o = { day: 'numeric', month: 'numeric', year: 'numeric' };
  $('set-info').textContent = `Aktuálne obdobie: ${fmtDay(per.start, o)} – ${fmtDay(addDays(per.end, -1), o)}. Pevné platby a sporenie sem nezapisuj.`;
  $('backup-info').textContent = `Počet výdavkov: ${expenses.length}. Posledná záloha: ${
    settings.lastBackup ? new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(settings.lastBackup)) : 'nikdy'}.`;
  let persisted = false;
  try { persisted = !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); } catch { /* nevadí */ }
  $('storage-info').textContent = persisted
    ? 'Trvalé úložisko: povolené.'
    : 'Trvalé úložisko: prehliadač ho nepotvrdil. Aplikácia pridaná na plochu má dáta chránené lepšie než stránka v Safari, zálohu si rob aj tak.';
}

function render() {
  renderToday();
  if (!$('tab-history').hidden) renderHistory();
  if (!$('tab-settings').hidden) renderSettings();
}

function showTab(name) {
  for (const t of ['today', 'history', 'settings']) $(`tab-${t}`).hidden = t !== name;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.tab === name);
  if (name === 'history') historyStart = null;
  render();
  window.scrollTo(0, 0);
}

// ---------- správy pod vstupom ----------

function showMsg(html, { error = false, timeout = 0 } = {}) {
  clearTimeout(msgTimer);
  const el = $('msg');
  el.innerHTML = html;
  el.classList.toggle('error', error);
  el.hidden = false;
  if (timeout) msgTimer = setTimeout(hideMsg, timeout);
}
function hideMsg() { clearTimeout(msgTimer); $('msg').hidden = true; }

// ---------- zápis výdavku ----------

async function submit(text) {
  const r = parseExpense(text);
  const input = $('entry-text');
  if (!r.ok) {
    input.value = r.raw;
    showMsg(r.raw
      ? `Nenašiel som sumu v texte <strong>„${esc(r.raw)}“</strong>. Nič som neuložil – oprav text v poli a ťukni na Zapísať.`
      : 'Povedz alebo napíš sumu a na čo to bolo, napr. „12,50 obed“.', { error: true });
    if (r.raw) input.focus();
    return;
  }
  const e = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    time: isoLocal(new Date()),
    cents: r.cents,
    description: r.description,
    category: categorize(r.description),
    raw: r.raw,
  };
  expenses.push(e);
  input.value = '';
  input.blur();
  render();
  showMsg(`Zapísané: <strong>${fmt(e.cents)}</strong> · ${esc(e.description || 'bez popisu')} · ${esc(e.category)}
    <div class="row"><button type="button" class="btn" data-undo="${esc(e.id)}">Vrátiť späť</button>
    <button type="button" class="btn" data-fix="${esc(e.id)}">Opraviť</button></div>`, { timeout: 15000 });
  try {
    await db.putExpense(e);
  } catch (err) {
    expenses = expenses.filter((x) => x.id !== e.id);
    render();
    input.value = r.raw;
    showMsg(`Výdavok sa nepodarilo uložiť do zariadenia (${esc(err && err.message || err)}).`, { error: true });
  }
}

async function removeExpense(id) {
  expenses = expenses.filter((e) => e.id !== id);
  render();
  await db.deleteExpense(id);
}

// ---------- úprava ----------

function openEdit(id) {
  const e = expenses.find((x) => x.id === id);
  if (!e) return;
  editingId = id;
  $('ed-amount').value = fmtPlain(e.cents);
  $('ed-amount').classList.remove('invalid');
  $('ed-desc').value = e.description;
  $('ed-cat').innerHTML = CATEGORIES.map((c) => `<option${c === e.category ? ' selected' : ''}>${esc(c)}</option>`).join('');
  $('ed-date').value = expenseDay(e);
  $('ed-raw').textContent = e.raw ? `Pôvodný text: „${e.raw}“` : '';
  $('sheet').hidden = false;
}
function closeEdit() { editingId = null; $('sheet').hidden = true; }

async function saveEdit() {
  const e = expenses.find((x) => x.id === editingId);
  if (!e) return closeEdit();
  const cents = parseMoney($('ed-amount').value);
  if (!cents) { $('ed-amount').classList.add('invalid'); $('ed-amount').focus(); return; }
  e.cents = cents;
  e.description = $('ed-desc').value.trim();
  e.category = $('ed-cat').value;
  const day = $('ed-date').value;
  if (day && day !== expenseDay(e)) {
    const old = new Date(e.time);
    const { y, m, d } = parseKey(day);
    e.time = isoLocal(new Date(y, m - 1, d, old.getHours(), old.getMinutes(), old.getSeconds()));
  }
  closeEdit();
  hideMsg();
  render();
  await db.putExpense(e);
}

// ---------- hlas ----------

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;

function setListening(on) {
  $('mic').classList.toggle('listening', on);
  $('mic').setAttribute('aria-label', on ? 'Zastaviť diktovanie' : 'Diktovať výdavok');
  $('mic-label').textContent = on ? 'Počúvam… (ťukni pre ukončenie)' : 'Ťukni a povedz sumu a na čo';
}

function toggleListening() {
  // Druhé ťuknutie: tlačidlo sa hneď vypne, chvíľu počkáme na posledné slovo.
  if (rec) { rec.finishSoon(); return; }
  hideMsg();
  const r = new SR();
  let heard = '', error = '', done = false, stopping = false, timer = null, cap = null;
  const input = $('entry-text');

  // Ukončenie nesmie závisieť od udalosti „end" – iOS ju po stop() nie vždy pošle.
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    clearTimeout(cap);
    if (rec && rec.r === r) rec = null;
    r.onresult = r.onerror = r.onend = null;
    try { r.stop(); } catch { /* už skončilo */ }
    try { r.abort(); } catch { /* už skončilo */ }
    setListening(false);
    if (heard) return submit(heard);
    if (error === 'not-allowed' || error === 'service-not-allowed' || error === 'audio-capture' || error === 'language-not-supported' || error === 'start') {
      showMsg('Diktovanie cez toto tlačidlo tu nie je dostupné alebo povolené (Nastavenia iPhonu → Safari → Mikrofón, a zapnutá Siri a diktovanie). Ťukni do poľa a použi mikrofón na klávesnici.', { error: true });
    } else if (error === 'network') {
      showMsg('Rozpoznávanie reči potrebuje internet. Napíš výdavok do poľa.', { error: true });
    } else {
      showMsg('Nič som nepočul. Skús to znova alebo napíš výdavok do poľa.', { timeout: 6000 });
    }
  };
  const finishSoon = () => {
    if (stopping) return finish(); // tretie ťuknutie = hneď
    stopping = true;
    setListening(false);
    clearTimeout(timer);
    try { r.stop(); } catch { /* už skončilo */ }
    timer = setTimeout(finish, 700);
  };
  const arm = (ms) => { clearTimeout(timer); timer = setTimeout(finish, ms); };

  r.lang = 'sk-SK';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  r.onresult = (ev) => {
    let text = '', final = ev.results.length > 0;
    for (let i = 0; i < ev.results.length; i++) {
      text += ev.results[i][0].transcript;
      if (!ev.results[i].isFinal) final = false;
    }
    text = text.trim();
    const changed = text !== heard;
    heard = text;
    input.value = heard;
    if (final) finish();
    // Ticho = text sa 1,5 s nezmenil. Opakované rovnaké výsledky časovač nepredlžujú.
    else if (changed && !stopping) arm(1500);
  };
  r.onerror = (ev) => { error = ev.error || 'unknown'; };
  r.onend = finish;

  rec = { r, finishSoon };
  setListening(true);
  arm(7000);                     // nikto nič nepovedal
  cap = setTimeout(finish, 20000); // tvrdý strop, nech sa stane čokoľvek
  try { r.start(); } catch { error = 'start'; finish(); }
}

// ---------- export, záloha ----------

async function saveFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; } catch (err) {
      if (err && err.name === 'AbortError') return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return true;
}

function setMsg(text, error = false) {
  const el = $('set-msg');
  el.textContent = text;
  el.classList.toggle('error', error);
  el.hidden = !text;
}

async function exportCsv() {
  const q = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const rows = [...expenses].sort((a, b) => (new Date(a.time) - new Date(b.time)))
    .map((e) => [q(e.id), q(e.time), fmtPlain(e.cents), q(e.description), q(e.category), q(e.raw)].join(';'));
  const csv = '﻿' + ['id;cas;suma_eur;popis;kategoria;povodny_text', ...rows].join('\r\n') + '\r\n';
  if (await saveFile(`vydavky-${todayKey()}.csv`, csv, 'text/csv')) setMsg(`Exportovaných ${expenses.length} výdavkov.`);
}

async function backup() {
  const data = { app: 'denny-rozpocet', version: 1, exported: isoLocal(new Date()), settings: { budgetCents: settings.budgetCents, payday: settings.payday }, expenses };
  if (await saveFile(`rozpocet-zaloha-${todayKey()}.json`, JSON.stringify(data, null, 2), 'application/json')) {
    settings.lastBackup = new Date().toISOString();
    await db.putSettings(settings);
    setMsg('Záloha vytvorená. Ulož ju mimo telefónu (Súbory/iCloud, e-mail).');
    renderSettings();
  }
}

function validExpense(e) {
  return e && typeof e.id === 'string' && typeof e.time === 'string' && !isNaN(new Date(e.time)) &&
    Number.isInteger(e.cents) && e.cents > 0 && typeof e.description === 'string';
}

async function restore(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== 'denny-rozpocet' || !Array.isArray(data.expenses) || !data.expenses.every(validExpense)) {
      throw new Error('Súbor nie je záloha tejto aplikácie.');
    }
    const s = data.settings || {};
    const next = {
      budgetCents: Number.isInteger(s.budgetCents) && s.budgetCents >= 0 ? s.budgetCents : DEFAULTS.budgetCents,
      payday: Number.isInteger(s.payday) && s.payday >= 1 && s.payday <= 31 ? s.payday : DEFAULTS.payday,
      lastBackup: settings.lastBackup,
    };
    if (!confirm(`Obnoviť ${data.expenses.length} výdavkov zo zálohy? Súčasné dáta (${expenses.length} výdavkov) sa nahradia.`)) return;
    const list = data.expenses.map((e) => ({
      id: e.id, time: e.time, cents: e.cents, description: e.description,
      category: CATEGORIES.includes(e.category) ? e.category : categorize(e.description),
      raw: typeof e.raw === 'string' ? e.raw : '',
    }));
    await db.replaceAll(list, next);
    expenses = list;
    settings = next;
    render();
    setMsg(`Obnovených ${list.length} výdavkov.`);
  } catch (err) {
    setMsg(`Obnova zlyhala: ${err && err.message || err}`, true);
  }
}

// ---------- udalosti ----------

function wire() {
  for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));

  $('entry-form').addEventListener('submit', (ev) => { ev.preventDefault(); submit($('entry-text').value); });
  if (SR) {
    $('mic').hidden = false;
    $('mic-label').hidden = false;
    $('mic').addEventListener('click', toggleListening);
  } else {
    $('entry-text').placeholder = 'ťukni a diktuj alebo píš: 12,50 obed';
  }

  $('msg').addEventListener('click', (ev) => {
    const undo = ev.target.closest('[data-undo]');
    const fix = ev.target.closest('[data-fix]');
    if (undo) { removeExpense(undo.dataset.undo); showMsg('Zápis vrátený späť.', { timeout: 4000 }); }
    if (fix) openEdit(fix.dataset.fix);
  });
  for (const id of ['today-list', 'history-body']) {
    $(id).addEventListener('click', (ev) => { const it = ev.target.closest('.item'); if (it) openEdit(it.dataset.id); });
  }

  $('edit-form').addEventListener('submit', (ev) => { ev.preventDefault(); saveEdit(); });
  $('ed-cancel').addEventListener('click', closeEdit);
  $('ed-delete').addEventListener('click', () => { const id = editingId; closeEdit(); hideMsg(); removeExpense(id); });
  $('sheet').addEventListener('click', (ev) => { if (ev.target === $('sheet')) closeEdit(); });

  $('per-prev').addEventListener('click', () => {
    const per = periodFor(historyStart || todayKey(), settings.payday);
    historyStart = periodFor(addDays(per.start, -1), settings.payday).start;
    renderHistory();
  });
  $('per-next').addEventListener('click', () => {
    const per = periodFor(historyStart || todayKey(), settings.payday);
    historyStart = per.end;
    renderHistory();
  });

  $('set-budget').addEventListener('change', async () => {
    const cents = parseMoney($('set-budget').value);
    $('set-budget').classList.toggle('invalid', cents === null);
    if (cents === null) return;
    settings.budgetCents = cents;
    await db.putSettings(settings);
    render();
  });
  $('set-payday').addEventListener('change', async () => {
    const n = Number($('set-payday').value);
    const good = Number.isInteger(n) && n >= 1 && n <= 31;
    $('set-payday').classList.toggle('invalid', !good);
    if (!good) return;
    settings.payday = n;
    await db.putSettings(settings);
    render();
  });
  $('btn-csv').addEventListener('click', exportCsv);
  $('btn-backup').addEventListener('click', backup);
  $('btn-restore').addEventListener('click', () => $('restore-file').click());
  $('restore-file').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (f) restore(f);
  });

  // Po návrate do aplikácie a o polnoci prepočítať deň.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  let lastDay = todayKey();
  setInterval(() => { if (todayKey() !== lastDay) { lastDay = todayKey(); render(); } }, 30000);
}

async function init() {
  wire();
  try {
    const data = await db.loadAll();
    expenses = data.expenses || [];
    settings = { ...DEFAULTS, ...(data.settings || {}) };
  } catch (err) {
    showMsg(`Nepodarilo sa otvoriť úložisko v zariadení (${esc(err && err.message || err)}). Výdavky sa neuložia.`, { error: true });
  }
  render();
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* nevadí */ }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
