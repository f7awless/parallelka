// Разбор химических формул и расчёт молярной массы.
import { bySymbol } from './elements.js';

const SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const SUP_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Нормализует юникод: подстрочные цифры → обычные, надстрочный заряд → ^заряд, минусы → '-'. */
function normalize(str) {
  let s = String(str ?? '');
  s = s.replace(/[₀-₉]/g, c => String(SUB_DIGITS.indexOf(c)));
  s = s.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻])([⁰¹²³⁴⁵⁶⁷⁸⁹]*)/g, (_, a, sign, b) => {
    const d = (a + b).split('').map(c => SUP_DIGITS.indexOf(c)).join('');
    return '^' + d + (sign === '⁺' ? '+' : '-');
  });
  s = s.replace(/[−–—]/g, '-');
  return s.trim();
}

function signCount(signs) {
  // '+', '++', '-', '--'
  return signs.length * (signs[0] === '+' ? 1 : -1);
}

function chargeValue(digits, signs) {
  if (signs.length > 1) return signCount(signs);
  const n = digits ? parseInt(digits, 10) : 1;
  return signs === '+' ? n : -n;
}

/**
 * Отделяет заряд от формулы.
 * Поддерживаются: SO4^2-, SO4^-2, SO4(2-), SO4[2-], SO4{2-}, «SO4 2-», Fe3+, NH4+, SO42-, Fe++.
 * Без знака ^ используется эвристика: у одноатомного иона (Fe3+, S2-) одна цифра — заряд;
 * у многоатомного (NH4+, SO42-) последняя цифра считается зарядом, только если цифр две и более.
 * @returns {{base: string, charge: number}}
 */
export function splitCharge(str) {
  let s = normalize(str);
  let m;
  if ((m = s.match(/^(.*?)\^\{?(\d*)([+-]+)\}?$/)) || (m = s.match(/^(.*?)\^\{?([+-])(\d+)\}?$/))) {
    if (/^[+-]$/.test(m[2])) return { base: m[1].trim(), charge: chargeValue(m[3], m[2]) };
    return { base: m[1].trim(), charge: chargeValue(m[2], m[3]) };
  }
  if ((m = s.match(/^(.*?)[(\[{](\d*)([+-])[)\]}]$/))) {
    return { base: m[1].trim(), charge: chargeValue(m[2], m[3]) };
  }
  if ((m = s.match(/^(.*?\S)\s+(\d*)([+-]+)$/))) {
    return { base: m[1].trim(), charge: chargeValue(m[2], m[3]) };
  }
  if ((m = s.match(/^(.*?)(\d*)([+-]+)$/)) && m[1]) {
    let base = m[1];
    let digits = m[2];
    const signs = m[3];
    if (signs.length > 1 || !digits) {
      return { base: base + digits, charge: chargeValue('', signs) };
    }
    const monoatomic = /^\d*[A-Z][a-z]?$/.test(base);
    if (monoatomic) {
      // Fe3+ → Fe, заряд 3+; Hg22+ → Hg2, заряд 2+
      if (digits.length >= 2) { base += digits.slice(0, -1); digits = digits.slice(-1); }
      return { base, charge: chargeValue(digits, signs) };
    }
    if (digits.length >= 2) {
      // SO42- → SO4, заряд 2-
      return { base: base + digits.slice(0, -1), charge: chargeValue(digits.slice(-1), signs) };
    }
    // NH4+, MnO4- → индекс остаётся, заряд 1
    return { base: base + digits, charge: chargeValue('', signs) };
  }
  return { base: s, charge: 0 };
}

const OPEN = { '(': ')', '[': ']', '{': '}' };

function addTo(target, src, k = 1) {
  for (const [el, n] of Object.entries(src)) target[el] = (target[el] || 0) + n * k;
}

function parseNumber(s, pos) {
  let j = pos;
  while (j < s.length && /[0-9]/.test(s[j])) j++;
  if (j < s.length && (s[j] === '.' || s[j] === ',') && /[0-9]/.test(s[j + 1] || '')) {
    j++;
    while (j < s.length && /[0-9]/.test(s[j])) j++;
  }
  if (j === pos) return null;
  return { value: parseFloat(s.slice(pos, j).replace(',', '.')), end: j };
}

/** Разбирает часть формулы без коэффициента и заряда. */
function parseGroupSeq(s, original) {
  let i = 0;
  function seq(close) {
    const res = {};
    let any = false;
    while (i < s.length) {
      const c = s[i];
      if (c === close) {
        if (!any) throw new Error(`Пустые скобки в формуле «${original}»`);
        i++;
        return res;
      }
      let part;
      if (OPEN[c]) {
        i++;
        part = seq(OPEN[c]);
      } else if (c === ')' || c === ']' || c === '}') {
        throw new Error(`Лишняя закрывающая скобка «${c}» в формуле «${original}»`);
      } else if (/[A-Z]/.test(c)) {
        let sym = c;
        if (/[a-z]/.test(s[i + 1] || '') && bySymbol(c + s[i + 1])) sym = c + s[i + 1];
        else if (/[a-z]/.test(s[i + 1] || '') && !bySymbol(c)) {
          throw new Error(`Неизвестный химический элемент «${c + s[i + 1]}» в формуле «${original}»`);
        }
        if (!bySymbol(sym)) throw new Error(`Неизвестный химический элемент «${sym}» в формуле «${original}»`);
        i += sym.length;
        part = { [sym]: 1 };
      } else if (/[a-z]/.test(c)) {
        throw new Error(`Символ элемента должен начинаться с заглавной буквы: «${c}» в формуле «${original}»`);
      } else if (/[0-9]/.test(c)) {
        throw new Error(`Неожиданная цифра в формуле «${original}»`);
      } else if (/[А-Яа-яЁё]/.test(c)) {
        throw new Error(`В формуле «${original}» встречена русская буква «${c}» — используйте латиницу`);
      } else {
        throw new Error(`Недопустимый символ «${c}» в формуле «${original}»`);
      }
      const num = parseNumber(s, i);
      let k = 1;
      if (num) {
        k = num.value;
        i = num.end;
        if (!(k > 0)) throw new Error(`Нулевой индекс в формуле «${original}»`);
      }
      addTo(res, part, k);
      any = true;
    }
    if (close) throw new Error(`Не закрыта скобка в формуле «${original}»`);
    if (!any) throw new Error('Пустая формула');
    return res;
  }
  return seq(null);
}

/**
 * Полный разбор частицы: коэффициент, состав, заряд.
 * @returns {{coef: number, atoms: Object<string, number>, charge: number, base: string}}
 */
export function parseSpecies(str) {
  const original = String(str ?? '').trim();
  if (!original) throw new Error('Введите формулу');
  const { base, charge } = splitCharge(original);
  const clean = base.replace(/\s+/g, '');
  if (!clean) throw new Error(`Пустая формула «${original}»`);
  const parts = clean.split(/[*·•⋅∙]/);
  const atoms = {};
  let coef = 1;
  parts.forEach((p, idx) => {
    if (!p) throw new Error(`Неверная запись кристаллогидрата «${original}»`);
    let k = 1;
    let rest = p;
    const num = parseNumber(p, 0);
    if (num) {
      k = num.value;
      rest = p.slice(num.end);
      if (!(k > 0)) throw new Error(`Нулевой коэффициент в формуле «${original}»`);
    }
    if (!rest) throw new Error(`После коэффициента нет формулы: «${original}»`);
    const comp = parseGroupSeq(rest, original);
    if (idx === 0) coef = k;
    addTo(atoms, comp, idx === 0 ? 1 : k);
  });
  // ведущий коэффициент (2H2O) — умножает весь состав
  if (coef !== 1) for (const el of Object.keys(atoms)) atoms[el] *= coef;
  for (const el of Object.keys(atoms)) atoms[el] = Math.round(atoms[el] * 1e9) / 1e9;
  return { coef, atoms, charge, base };
}

/**
 * Состав формулы: parseFormula('H2SO4') → {H: 2, S: 1, O: 4}.
 * Заряд (SO4^2-, Fe3+, SO4(2-)) на состав не влияет; ведущий коэффициент умножает состав.
 */
export function parseFormula(str) {
  return parseSpecies(str).atoms;
}

/**
 * Молярная масса: molarMass('CuSO4*5H2O') →
 * {formula, total, parts: [{symbol, count, mass, fraction}]}
 * (mass — вклад элемента в г/моль, fraction — массовая доля от 0 до 1).
 */
export function molarMass(str) {
  const atoms = parseFormula(str);
  const parts = [];
  let total = 0;
  for (const [symbol, count] of Object.entries(atoms)) {
    const el = bySymbol(symbol);
    const mass = el.mass * count;
    total += mass;
    parts.push({ symbol, count, mass, fraction: 0 });
  }
  for (const p of parts) p.fraction = total ? p.mass / total : 0;
  return { formula: String(str).trim(), total, parts };
}
