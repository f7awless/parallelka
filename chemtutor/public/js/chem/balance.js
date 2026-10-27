// Уравнивание химических реакций методом нахождения ядра матрицы
// (точная рациональная арифметика на BigInt, метод Гаусса).
import { parseSpecies } from './formula.js';

const ARROW_RE = /\s*(?:<=>|<->|⇄|⇌|↔|=>|->|→|⟶|=)\s*/;

function babs(a) { return a < 0n ? -a : a; }
function gcd(a, b) {
  a = babs(a); b = babs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}
function lcm(a, b) { return a === 0n || b === 0n ? 0n : babs(a / gcd(a, b) * b); }

// Дробь: [числитель, знаменатель], знаменатель > 0, несократимая
function frac(n, d = 1n) {
  if (d === 0n) throw new Error('Деление на ноль');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return [n / g, d / g];
}
const fsub = (a, b) => frac(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const fmul = (a, b) => frac(a[0] * b[0], a[1] * b[1]);
const fdiv = (a, b) => frac(a[0] * b[1], a[1] * b[0]);
const isZero = a => a[0] === 0n;

/** Приводит матрицу к ступенчатому виду (RREF); возвращает индексы ведущих столбцов. */
function rref(M, cols) {
  const pivots = [];
  let r = 0;
  for (let c = 0; c < cols && r < M.length; c++) {
    let p = -1;
    for (let i = r; i < M.length; i++) if (!isZero(M[i][c])) { p = i; break; }
    if (p < 0) continue;
    [M[r], M[p]] = [M[p], M[r]];
    const pv = M[r][c];
    M[r] = M[r].map(v => fdiv(v, pv));
    for (let i = 0; i < M.length; i++) {
      if (i !== r && !isZero(M[i][c])) {
        const f = M[i][c];
        M[i] = M[i].map((v, j) => fsub(v, fmul(f, M[r][j])));
      }
    }
    pivots.push(c);
    r++;
  }
  return pivots;
}

/** Делит строку уравнения на вещества с учётом зарядов (H^+ + OH^- , Fe3+ + ...). */
function splitSide(side) {
  const s = side.trim();
  if (!s) return [];
  let parts;
  if (/\s\+\s|\s\+(?=[\dA-Z(\[])/.test(s)) {
    // есть «+» с пробелом перед ним — разделитель
    parts = s.split(/\s+\+\s*/);
  } else {
    // без пробелов: «+» — разделитель, если за ним начинается новая частица и перед ним нет «^»
    parts = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '+' && cur && !/\^\d*$/.test(cur) && /[A-Z(\[\d]/.test(s[i + 1] || '') && !/[+]$/.test(cur)) {
        parts.push(cur);
        cur = '';
      } else cur += c;
    }
    parts.push(cur);
  }
  return parts.map(p => p.trim()).filter(Boolean);
}

const ELECTRON_RE = /^\d*\s*(?:e|ē|e\^?-|e⁻|ē\^?-)$/;

function parseTerm(raw) {
  const t = raw.trim();
  if (ELECTRON_RE.test(t)) return { input: t, formula: 'e^-', atoms: {}, charge: -1, electron: true };
  const sp = parseSpecies(t);
  // формула без исходного коэффициента
  const baseNoCoef = sp.base.replace(/^\s*\d+(?:[.,]\d+)?\s*/, '');
  const atoms = {};
  for (const [el, n] of Object.entries(sp.atoms)) atoms[el] = n / sp.coef;
  for (const n of Object.values(atoms)) {
    if (!Number.isInteger(n)) throw new Error(`Дробные индексы не поддерживаются при уравнивании: «${t}»`);
  }
  return { input: t, formula: formatIon(baseNoCoef, sp.charge), atoms, charge: sp.charge };
}

function formatIon(base, charge) {
  if (!charge) return base;
  const a = Math.abs(charge);
  return base + '^' + (a > 1 ? a : '') + (charge > 0 ? '+' : '-');
}

/**
 * Уравнивает уравнение реакции.
 * balanceEquation('Fe + O2 = Fe2O3') →
 * {coefficients: [4, 3, 2], text: '4Fe + 3O2 = 2Fe2O3', reactants: [...], products: [...]}
 * reactants/products: [{formula, coef, atoms, charge}]
 */
export function balanceEquation(str) {
  const src = String(str ?? '').trim();
  if (!src) throw new Error('Введите уравнение реакции');
  const sides = src.split(ARROW_RE);
  if (sides.length !== 2) {
    throw new Error(sides.length < 2
      ? 'Не найден знак реакции: используйте «=», «->» или «→» между исходными веществами и продуктами'
      : 'Знак реакции («=», «->», «→») должен встречаться ровно один раз');
  }
  const left = splitSide(sides[0]).map(parseTerm);
  const right = splitSide(sides[1]).map(parseTerm);
  if (!left.length) throw new Error('Нет исходных веществ (левая часть пуста)');
  if (!right.length) throw new Error('Нет продуктов реакции (правая часть пуста)');
  const all = [...left, ...right];
  const nL = left.length;

  const elements = [];
  for (const sp of all) for (const el of Object.keys(sp.atoms)) if (!elements.includes(el)) elements.push(el);
  const leftEls = new Set(left.flatMap(s => Object.keys(s.atoms)));
  const rightEls = new Set(right.flatMap(s => Object.keys(s.atoms)));
  for (const el of elements) {
    if (!leftEls.has(el)) throw new Error(`Элемент ${el} есть только в правой части — уравнять нельзя`);
    if (!rightEls.has(el)) throw new Error(`Элемент ${el} есть только в левой части — уравнять нельзя`);
  }

  const rows = elements.map(el => all.map((sp, j) => BigInt(sp.atoms[el] || 0) * (j < nL ? 1n : -1n)));
  const hasCharge = all.some(sp => sp.charge !== 0);
  if (hasCharge) rows.push(all.map((sp, j) => BigInt(sp.charge) * (j < nL ? 1n : -1n)));

  const n = all.length;
  const M = rows.map(r => r.map(v => frac(v)));
  const pivots = rref(M, n);
  const free = [];
  for (let c = 0; c < n; c++) if (!pivots.includes(c)) free.push(c);
  if (free.length === 0) throw new Error('Уравнение невозможно уравнять: проверьте формулы веществ');
  if (free.length > 1) {
    throw new Error('Уравнение имеет несколько независимых решений (это, по сути, несколько реакций). ' +
      'Уточните схему: уберите лишние вещества или уравняйте вручную');
  }
  const f = free[0];
  const vec = Array.from({ length: n }, () => frac(0n));
  vec[f] = frac(1n);
  pivots.forEach((c, r) => { vec[c] = frac(-M[r][f][0], M[r][f][1]); });
  let L = 1n;
  for (const v of vec) L = lcm(L, v[1]);
  let ints = vec.map(v => v[0] * (L / v[1]));
  let g = 0n;
  for (const v of ints) g = gcd(g, v);
  ints = ints.map(v => v / g);
  if (ints.every(v => v <= 0n)) ints = ints.map(v => -v);
  if (ints.some(v => v === 0n)) {
    const bad = all.filter((_, i) => ints[i] === 0n).map(s => s.formula).join(', ');
    throw new Error(`Вещество ${bad} не участвует в реакции — уравнять нельзя. Проверьте схему`);
  }
  if (ints.some(v => v < 0n)) {
    throw new Error('Уравнение невозможно уравнять с положительными коэффициентами: проверьте, правильно ли разделены реагенты и продукты');
  }
  const coefficients = ints.map(v => Number(v));
  const mk = (sp, k) => ({ formula: sp.formula, coef: k, atoms: { ...sp.atoms }, charge: sp.charge });
  const reactants = left.map((sp, i) => mk(sp, coefficients[i]));
  const products = right.map((sp, i) => mk(sp, coefficients[nL + i]));
  const side = arr => arr.map(s => (s.coef === 1 ? '' : s.coef) + s.formula).join(' + ');
  const text = side(reactants) + ' = ' + side(products);
  return { coefficients, text, reactants, products };
}

/** Подсчёт атомов (и заряда) по сторонам — для проверочной таблицы. */
export function atomCheck(result) {
  const count = arr => {
    const res = {};
    for (const s of arr) for (const [el, n] of Object.entries(s.atoms)) res[el] = (res[el] || 0) + n * s.coef;
    return res;
  };
  const L = count(result.reactants);
  const R = count(result.products);
  const els = [...new Set([...Object.keys(L), ...Object.keys(R)])];
  const rows = els.map(el => ({ element: el, left: L[el] || 0, right: R[el] || 0 }));
  const qL = result.reactants.reduce((a, s) => a + s.charge * s.coef, 0);
  const qR = result.products.reduce((a, s) => a + s.charge * s.coef, 0);
  if (result.reactants.concat(result.products).some(s => s.charge)) rows.push({ element: 'заряд', left: qL, right: qR });
  return rows;
}
