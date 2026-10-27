import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, bySymbol, gridPosition, CATEGORY_NAMES } from '../public/js/chem/elements.js';
import { parseFormula, molarMass } from '../public/js/chem/formula.js';
import { balanceEquation } from '../public/js/chem/balance.js';
import { chemHTML, escapeHTML } from '../public/js/chem/format.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('elements: 118, unique positions, sane data', () => {
  assert.equal(ELEMENTS.length, 118);
  const pos = new Set(ELEMENTS.map(e => `${e.x},${e.y}`));
  assert.equal(pos.size, 118);
  ELEMENTS.forEach((e, i) => assert.equal(e.z, i + 1));
  for (const e of ELEMENTS) assert.ok(CATEGORY_NAMES[e.category], e.symbol);
  assert.equal(bySymbol('Fe').name, 'Железо');
  assert.equal(bySymbol('Fe').group, 8);
  assert.equal(bySymbol('La').group, null);
  assert.deepEqual(gridPosition('La'), { x: 3, y: 9 });
  assert.deepEqual(gridPosition('Lr'), { x: 17, y: 10 });
  assert.equal(bySymbol('Br').state, 'liquid');
  assert.equal(bySymbol('Hg').state, 'liquid');
  assert.equal(bySymbol('Cl').state, 'gas');
  near(bySymbol('Cl').mass, 35.45);
  near(bySymbol('Cu').mass, 63.546);
  assert.equal(bySymbol('Og').period, 7);
});

test('parseFormula: basics and brackets', () => {
  assert.deepEqual(parseFormula('H2SO4'), { H: 2, S: 1, O: 4 });
  assert.deepEqual(parseFormula('Ca(OH)2'), { Ca: 1, O: 2, H: 2 });
  assert.deepEqual(parseFormula('Fe2(SO4)3'), { Fe: 2, S: 3, O: 12 });
  assert.deepEqual(parseFormula('[Cu(NH3)4]SO4'), { Cu: 1, N: 4, H: 12, S: 1, O: 4 });
  assert.deepEqual(parseFormula('K4[Fe(CN)6]'), { K: 4, Fe: 1, C: 6, N: 6 });
  assert.deepEqual(parseFormula('CH3COOH'), { C: 2, H: 4, O: 2 });
  assert.deepEqual(parseFormula('Co'), { Co: 1 });
  assert.deepEqual(parseFormula('CO'), { C: 1, O: 1 });
});

test('parseFormula: hydrates, coefficients, charges', () => {
  assert.deepEqual(parseFormula('CuSO4*5H2O'), { Cu: 1, S: 1, O: 9, H: 10 });
  assert.deepEqual(parseFormula('CuSO4·5H2O'), { Cu: 1, S: 1, O: 9, H: 10 });
  assert.deepEqual(parseFormula('2H2O'), { H: 4, O: 2 });
  assert.deepEqual(parseFormula('SO4^2-'), { S: 1, O: 4 });
  assert.deepEqual(parseFormula('SO4(2-)'), { S: 1, O: 4 });
  assert.deepEqual(parseFormula('Fe3+'), { Fe: 1 });
  assert.deepEqual(parseFormula('NH4+'), { N: 1, H: 4 });
  assert.deepEqual(parseFormula('SO₄²⁻'), { S: 1, O: 4 });
});

test('parseFormula: errors in Russian', () => {
  assert.throws(() => parseFormula('Xx2'), /Неизвестный химический элемент/);
  assert.throws(() => parseFormula('Ca(OH2'), /скобк/);
  assert.throws(() => parseFormula('H2O)'), /скобк/);
  assert.throws(() => parseFormula(''), /формул/i);
  assert.throws(() => parseFormula('h2o'), /заглавной/);
  assert.throws(() => parseFormula('Н2О'), /русская буква/); // кириллица
});

test('molarMass', () => {
  near(molarMass('H2O').total, 18.015);
  near(molarMass('H2SO4').total, 98.07, 0.01);
  near(molarMass('CuSO4*5H2O').total, 249.68, 0.01);
  near(molarMass('Na2CO3·10H2O').total, 286.14, 0.01);
  near(molarMass('FeSO4*7H2O').total, 278.01, 0.02);
  near(molarMass('CaCl2·6H2O').total, 219.07, 0.02);
  near(molarMass('C6H12O6').total, 180.16, 0.01);
  const r = molarMass('NaCl');
  assert.equal(r.parts.length, 2);
  near(r.parts.reduce((s, p) => s + p.fraction, 0), 1, 1e-9);
  near(r.parts.find(p => p.symbol === 'Na').fraction, 0.3934, 0.001);
});

const EQUATIONS = [
  ['Fe + O2 = Fe2O3', '4Fe + 3O2 = 2Fe2O3'],
  ['H2 + O2 -> H2O', '2H2 + O2 = 2H2O'],
  ['Al + HCl → AlCl3 + H2', '2Al + 6HCl = 2AlCl3 + 3H2'],
  ['C6H12O6 + O2 = CO2 + H2O', 'C6H12O6 + 6O2 = 6CO2 + 6H2O'],
  ['C3H8 + O2 = CO2 + H2O', 'C3H8 + 5O2 = 3CO2 + 4H2O'],
  ['C2H5OH + O2 = CO2 + H2O', 'C2H5OH + 3O2 = 2CO2 + 3H2O'],
  ['KMnO4 + HCl = KCl + MnCl2 + Cl2 + H2O', '2KMnO4 + 16HCl = 2KCl + 2MnCl2 + 5Cl2 + 8H2O'],
  ['Cu + HNO3 = Cu(NO3)2 + NO + H2O', '3Cu + 8HNO3 = 3Cu(NO3)2 + 2NO + 4H2O'],
  ['Cu + HNO3 = Cu(NO3)2 + NO2 + H2O', 'Cu + 4HNO3 = Cu(NO3)2 + 2NO2 + 2H2O'],
  ['K2Cr2O7 + H2SO4 + KI = Cr2(SO4)3 + I2 + K2SO4 + H2O', 'K2Cr2O7 + 7H2SO4 + 6KI = Cr2(SO4)3 + 3I2 + 4K2SO4 + 7H2O'],
  ['NH3 + O2 = NO + H2O', '4NH3 + 5O2 = 4NO + 6H2O'],
  ['Ca(OH)2 + H3PO4 = Ca3(PO4)2 + H2O', '3Ca(OH)2 + 2H3PO4 = Ca3(PO4)2 + 6H2O'],
  ['FeS2 + O2 = Fe2O3 + SO2', '4FeS2 + 11O2 = 2Fe2O3 + 8SO2'],
  ['KClO3 = KCl + O2', '2KClO3 = 2KCl + 3O2'],
  ['MnO4^- + Fe^2+ + H^+ = Mn^2+ + Fe^3+ + H2O', 'MnO4^- + 5Fe^2+ + 8H^+ = Mn^2+ + 5Fe^3+ + 4H2O'],
  ['Cr2O7^2- + H^+ + I^- = Cr^3+ + I2 + H2O', 'Cr2O7^2- + 14H^+ + 6I^- = 2Cr^3+ + 3I2 + 7H2O'],
  ['Ba2+ + SO42- = BaSO4', 'Ba^2+ + SO4^2- = BaSO4'],
  ['Fe3+ + e- = Fe2+', 'Fe^3+ + e^- = Fe^2+'],
  ['CuSO4*5H2O = CuSO4 + H2O', 'CuSO4*5H2O = CuSO4 + 5H2O'],
  ['2H2 + O2 = 2H2O', '2H2 + O2 = 2H2O'],
  ['Fe+O2=Fe2O3', '4Fe + 3O2 = 2Fe2O3'],
];

for (const [src, expected] of EQUATIONS) {
  test(`balance: ${src}`, () => {
    const r = balanceEquation(src);
    assert.equal(r.text, expected);
    // проверка сохранения атомов и заряда
    const sum = (arr) => {
      const s = {}; let q = 0;
      for (const x of arr) { for (const [e, n] of Object.entries(x.atoms)) s[e] = (s[e] || 0) + n * x.coef; q += x.charge * x.coef; }
      return [s, q];
    };
    const [L, qL] = sum(r.reactants), [R, qR] = sum(r.products);
    assert.deepEqual(L, R);
    assert.equal(qL, qR);
    assert.equal(r.coefficients.length, r.reactants.length + r.products.length);
  });
}

test('balance: errors', () => {
  assert.throws(() => balanceEquation('Fe + O2'), /знак реакции/i);
  assert.throws(() => balanceEquation('Fe = Cu'), /только в левой части/);
  assert.throws(() => balanceEquation('H2 + O2 = H2O + H2O2'), /несколько независимых решений/);
  assert.throws(() => balanceEquation('NaCl = Na + Cl2 + O2'), /только в правой части/);
  assert.throws(() => balanceEquation('H2O = H2O + O2'), /уравнять|участвует/);
});

test('chemHTML: formulas', () => {
  assert.equal(chemHTML('H2SO4'), 'H<sub>2</sub>SO<sub>4</sub>');
  assert.equal(chemHTML('2H2O'), '2H<sub>2</sub>O');
  assert.equal(chemHTML('Ca(OH)2'), 'Ca(OH)<sub>2</sub>');
  assert.equal(chemHTML('CuSO4·5H2O'), 'CuSO<sub>4</sub>·5H<sub>2</sub>O');
  assert.equal(chemHTML('SO4^2-'), 'SO<sub>4</sub><sup>2−</sup>');
  assert.equal(chemHTML('Fe^3+'), 'Fe<sup>3+</sup>');
  assert.equal(chemHTML('H^+'), 'H<sup>+</sup>');
  assert.equal(chemHTML('N2 + 3H2 <-> 2NH3'), 'N<sub>2</sub> + 3H<sub>2</sub> ⇄ 2NH<sub>3</sub>');
  assert.equal(chemHTML('A -> B => C'), 'A → B → C');
  assert.equal(chemHTML('M(H2SO4) = 98 г/моль'), 'M(H<sub>2</sub>SO<sub>4</sub>) = 98 г/моль');
  assert.equal(chemHTML('раствор H2SO4(конц.)'), 'раствор H<sub>2</sub>SO<sub>4</sub>(конц.)');
});

test('chemHTML: does not mangle ordinary text', () => {
  for (const s of ['2 моль', '25 °C', '0,1 М', '10%', 'вариант 3', 'NaCl', 'HCl', 'ОГЭ 2025, задание 14',
    'Ответ: 3) и 4)', '(рис. 2)', 'HELLO WORLD', 'x2 + y2', 'pH 7', 'Ka', 'A1', '1,5 л']) {
    assert.equal(chemHTML(s), escapeHTML(s), s);
  }
});

test('chemHTML/escapeHTML: escaping', () => {
  assert.equal(escapeHTML('<b>"a" & \'b\'</b>'), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
  assert.equal(chemHTML('<script>H2O</script>'), '&lt;script&gt;H<sub>2</sub>O&lt;/script&gt;');
  assert.equal(chemHTML('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
  assert.equal(chemHTML(null), '');
});
