// Výpočet obdobia a denného zostatku. Dni sú kľúče 'YYYY-MM-DD' v miestnom
// čase telefónu; rozdiely dní sa počítajú z kalendárnych zložiek, takže ich
// neovplyvní UTC ani zmena času.

const pad = (n) => String(n).padStart(2, '0');

export const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`; // m = 1..12

export function dayKey(date) {
  return keyOf(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

const utc = (key) => {
  const { y, m, d } = parseKey(key);
  return Date.UTC(y, m - 1, d);
};

export function daysBetween(a, b) {
  return Math.round((utc(b) - utc(a)) / 86400000);
}

export function addDays(key, n) {
  const t = new Date(utc(key) + n * 86400000);
  return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Deň výplaty v danom mesiaci; ak je mesiac kratší, posledný deň mesiaca.
function paydayKey(y, m, payday) {
  return keyOf(y, m, Math.min(payday, daysInMonth(y, m)));
}

// Obdobie, do ktorého patrí deň `today`: { start (vrátane), end (bez neho) }.
export function periodFor(today, payday) {
  const { y, m } = parseKey(today);
  let sy = y, sm = m;
  if (today < paydayKey(y, m, payday)) {
    sm--;
    if (sm < 1) { sm = 12; sy--; }
  }
  let ey = sy, em = sm + 1;
  if (em > 12) { em = 1; ey++; }
  return { start: paydayKey(sy, sm, payday), end: paydayKey(ey, em, payday) };
}

// ISO čas s miestnou časovou zónou, napr. 2026-11-16T12:30:05+01:00
export function isoLocal(date) {
  const off = -date.getTimezoneOffset();
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// Deň výdavku v miestnom čase telefónu.
export function expenseDay(expense) {
  return dayKey(new Date(expense.time));
}

// expenses: [{ day: 'YYYY-MM-DD', cents }]. Všetky sumy sú celé centy.
export function compute({ budgetCents, payday, today, expenses }) {
  const { start, end } = periodFor(today, payday);
  let spentBefore = 0, spentToday = 0;
  for (const e of expenses) {
    if (e.day < start || e.day >= end) continue;
    if (e.day < today) spentBefore += e.cents;
    else if (e.day === today) spentToday += e.cents;
    // výdavky s budúcim dátumom sa rátajú až v ten deň
  }
  const daysLeft = daysBetween(today, end);
  const limit = Math.round((budgetCents - spentBefore) / daysLeft);
  return {
    start,
    end,
    daysTotal: daysBetween(start, end),
    daysLeft,
    spentBefore,
    spentToday,
    limit,
    leftToday: limit - spentToday,
    leftPeriod: budgetCents - spentBefore - spentToday,
  };
}
