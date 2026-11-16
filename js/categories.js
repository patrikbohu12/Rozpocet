import { normalize } from './parse.js';

export const OTHER = 'Ostatné';

// Kľúčové slová sú bez diakritiky a porovnávajú sa so začiatkom slova,
// aby zachytili aj skloňovanie (káva, kávu, kávy -> „kav").
// Slová v `exact` musia sedieť celé (napr. „bar", aby nechytil „barber").
const RULES = [
  { name: 'Potraviny', prefix: ['lidl', 'bill', 'tesc', 'coop', 'potravin', 'nakup', 'kaufland'], exact: [] },
  { name: 'Reštaurácie a kaviarne', prefix: ['obed', 'vecer', 'kav', 'piv', 'restaurac', 'donask', 'ranajk'], exact: ['bar', 'bare', 'baru'] },
  { name: 'Tabak', prefix: ['cigaret', 'tabak'], exact: [] },
  { name: 'Pohonné hmoty', prefix: ['benzin', 'naft', 'tankovan'], exact: [] },
  { name: 'Doprava', prefix: ['vlak', 'autobus', 'parkovan'], exact: ['mhd'] },
  { name: 'Zábava', prefix: ['kin', 'vstupenk', 'koncert', 'vylet'], exact: [] },
];

export const CATEGORIES = [...RULES.map((r) => r.name), OTHER];

export function categorize(description) {
  const words = normalize(description).split(/[^a-z0-9]+/).filter(Boolean);
  for (const rule of RULES) {
    for (const w of words) {
      if (rule.exact.includes(w) || rule.prefix.some((p) => w.startsWith(p))) return rule.name;
    }
  }
  return OTHER;
}
