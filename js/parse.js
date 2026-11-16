// Rozpoznanie sumy a popisu z nadiktovanej alebo napísanej vety.
// Čistý modul bez závislostí na prehliadači – testuje sa v Node.
// Pozor: žiadne regex lookbehind, Safari 16.0–16.3 ho nepodporuje.

export function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const UNITS = { nula: 0, jeden: 1, jedna: 1, jedno: 1, dva: 2, dve: 2, tri: 3, styri: 4, pat: 5, sest: 6, sedem: 7, osem: 8, devat: 9 };
const TEENS = { desat: 10, jedenast: 11, dvanast: 12, trinast: 13, strnast: 14, patnast: 15, sestnast: 16, sedemnast: 17, osemnast: 18, devatnast: 19 };
const TENS = { dvadsat: 20, tridsat: 30, styridsat: 40, patdesiat: 50, sestdesiat: 60, sedemdesiat: 70, osemdesiat: 80, devatdesiat: 90 };
const HUNDREDS = { sto: 100, dvesto: 200, tristo: 300, styristo: 400, patsto: 500, seststo: 600, sedemsto: 700, osemsto: 800, devatsto: 900 };

const EUR_WORDS = new Set(['eur', 'euro', 'eura', 'eur', 'eurami', 'eurach', 'eury', '€']);
const CENT_WORDS = new Set(['cent', 'centy', 'centov', 'centa', 'centoch', 'centami']);

// Jedno slovo -> číslo. Úrovne: 3 = stovky, 2 = desiatky, 1 = jednotky.
// Vracia { value, high, low } alebo null.
function wordNumber(t) {
  if (!t) return null;
  // hovorový tvar „päťadvadsať"
  for (const u in UNITS) {
    if (UNITS[u] === 0 || !t.startsWith(u + 'a')) continue;
    const tens = TENS[t.slice(u.length + 1)];
    if (tens) return { value: tens + UNITS[u], high: 2, low: 1 };
  }
  let rest = t, value = 0, high = 0, low = 0, any = false;
  const take = (table, hi, lo) => {
    let best = null;
    for (const w in table) if (rest.startsWith(w) && (!best || w.length > best.length)) best = w;
    if (!best) return false;
    value += table[best];
    rest = rest.slice(best.length);
    if (!high) high = hi;
    low = lo;
    any = true;
    return true;
  };
  take(HUNDREDS, 3, 3);
  if (!take(TEENS, 2, 1)) {
    if (take(TENS, 2, 2)) take(UNITS, 1, 1);
    else take(UNITS, 1, 1);
  }
  if (!any || rest !== '') return null;
  return { value, high, low };
}

function tokenize(text) {
  const pre = String(text)
    .replace(/€/g, ' € ')
    .replace(/(\d)\s*(eur|cent)/gi, '$1 $2');
  return pre.split(/\s+/).filter(Boolean).map((orig) => {
    const core = orig.replace(/^[.,;:!?"'()\-]+|[.,;:!?"'()\-]+$/g, '');
    const norm = normalize(core);
    const tok = { orig, norm };
    const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(core);
    if (m) {
      tok.digits = m[1];
      tok.int = parseInt(m[1], 10);
      if (m[2] !== undefined) tok.decimals = parseInt(m[2].padEnd(2, '0'), 10);
    } else if (EUR_WORDS.has(norm)) tok.eur = true;
    else if (CENT_WORDS.has(norm)) tok.cent = true;
    else tok.word = wordNumber(norm);
    return tok;
  });
}

// Celé číslo od pozície i: číslice, alebo jedno či viac slov („sto dvadsať päť").
function readInt(toks, i) {
  const t = toks[i];
  if (!t) return null;
  if (t.digits !== undefined) {
    if (t.decimals !== undefined) return null;
    return { value: t.int, end: i + 1, twoDigit: t.digits.length === 2 };
  }
  if (!t.word) return null;
  let cur = { ...t.word };
  let j = i + 1;
  while (toks[j] && toks[j].word) {
    const nxt = toks[j].word;
    if (cur.high === 1 && cur.value >= 2 && toks[j].norm === 'sto') {
      cur = { value: cur.value * 100, high: 3, low: 3 }; // „päť sto"
    } else if (cur.value > 0 && nxt.value > 0 && nxt.high < cur.low) {
      cur.value += nxt.value;
      cur.low = nxt.low;
    } else break;
    j++;
  }
  return { value: cur.value, end: j, twoDigit: cur.value >= 10 && cur.value <= 99 };
}

// Suma začínajúca na pozícii i. strong = má desatinnú časť, menu alebo centy.
function amountAt(toks, i) {
  const t = toks[i];
  let start = i;
  let strong = false;
  if (i > 0 && toks[i - 1].eur) { start = i - 1; strong = true; }

  if (t.digits !== undefined && t.decimals !== undefined) {
    let end = i + 1;
    if (toks[end] && toks[end].eur) end++;
    return { cents: t.int * 100 + t.decimals, start, end, strong: true };
  }

  const n1 = readInt(toks, i);
  if (!n1) return null;
  let j = n1.end;
  let cents;

  if (toks[j] && toks[j].eur) {
    j++;
    strong = true;
    cents = n1.value * 100;
    let k = j;
    if (toks[k] && toks[k].norm === 'a') k++;
    const n2 = readInt(toks, k);
    if (n2 && n2.value <= 99) {
      if (toks[n2.end] && toks[n2.end].cent) { cents += n2.value; j = n2.end + 1; }
      else if (n2.twoDigit) { cents += n2.value; j = n2.end; }
    }
  } else if (toks[j] && toks[j].cent) {
    cents = n1.value;
    j++;
    strong = true;
  } else {
    const n2 = readInt(toks, j);
    if (n2 && n2.twoDigit) {
      // „dvanásť päťdesiat"
      cents = n1.value * 100 + n2.value;
      j = n2.end;
      strong = true;
      if (toks[j] && (toks[j].cent || toks[j].eur)) j++;
    } else {
      cents = n1.value * 100;
    }
  }
  return { cents, start, end: j, strong };
}

// Vráti { ok: true, cents, description, raw } alebo { ok: false, raw }.
// Berie prvú sumu s menou/desatinnou časťou; ak taká nie je, prvé číslo vo vete.
export function parseExpense(text) {
  const raw = String(text == null ? '' : text).trim();
  const toks = tokenize(raw);
  const cands = [];
  for (let i = 0; i < toks.length;) {
    const a = toks[i].digits !== undefined || toks[i].word ? amountAt(toks, i) : null;
    if (a && a.cents > 0) { cands.push(a); i = a.end; } else i++;
  }
  const pick = cands.find((c) => c.strong) || cands[0];
  if (!pick) return { ok: false, raw };
  const description = toks
    .filter((_, i) => i < pick.start || i >= pick.end)
    .map((t) => t.orig)
    .join(' ')
    .replace(/^[\s.,;:!?\-]+|[\s.,;:!?\-]+$/g, '');
  return { ok: true, cents: pick.cents, description, raw };
}

// „12,50" / „12.5" / „12" / „12,50 €" -> centy, inak null. Pre formulár úpravy.
export function parseMoney(text) {
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(String(text).replace(/[\s€]/g, ''));
  if (!m) return null;
  return parseInt(m[1], 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0);
}
