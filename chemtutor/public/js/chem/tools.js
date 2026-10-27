// Страница «Химические инструменты»: таблица Менделеева, калькуляторы, справочники, тренажёр.
import { ELEMENTS, CATEGORY_NAMES, STATE_NAMES, bySymbol, byZ, shortGroup } from './elements.js';
import { molarMass } from './formula.js';
import { balanceEquation, atomCheck } from './balance.js';
import { chemHTML, escapeHTML } from './format.js';

const TABS = [
  { id: 'table', title: 'Таблица Менделеева', render: renderTable },
  { id: 'mass', title: 'Молярная масса', render: renderMass },
  { id: 'balance', title: 'Уравнивание', render: renderBalance },
  { id: 'solutions', title: 'Растворы', render: renderSolutions },
  { id: 'gas', title: 'Газы', render: renderGas },
  { id: 'ph', title: 'pH', render: renderPH },
  { id: 'solubility', title: 'Растворимость', render: renderSolubility },
  { id: 'series', title: 'Ряды активности', render: renderSeries },
  { id: 'quiz', title: 'Тренажёр', render: renderQuiz },
];

const N_A = 6.022e23;
const V_M = 22.4;
const R_GAS = 8.314;

/* ------------------------------------------------------------------ утилиты */

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Число по-русски: запятая, экспонента вида 6,022·10²³. */
function fmt(x, sig = 4) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-3) {
    const [m, e] = x.toExponential(sig - 1).split('e');
    const mant = String(+m).replace('.', ',');
    const exp = String(+e).replace('-', '⁻').replace(/\d/g, d => SUPD[d]);
    return `${mant}·10${exp}`;
  }
  return String(+x.toPrecision(sig)).replace('.', ',').replace('-', '−');
}
function fix(x, d = 2) {
  if (!Number.isFinite(x)) return '—';
  return x.toFixed(d).replace('.', ',').replace('-', '−');
}
function pct(x, d = 2) { return fix(x * 100, d) + ' %'; }

/** Разбор числа из поля: запятая, «6,02e23», «6,02·10^23», пусто → NaN. */
function num(v) {
  let s = String(v ?? '').trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/[−–]/g, '-');
  if (!s) return NaN;
  s = s.replace(/[·*×x]10\^?/i, 'e');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
const has = v => Number.isFinite(v);

function signed(n) { return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }

function tryMolar(formula) {
  const f = String(formula || '').trim();
  if (!f) return null;
  try {
    const r = molarMass(f);
    return r.total > 0 ? r : null;
  } catch { return null; }
}

function field(label, opts = {}) {
  const input = h('input', {
    class: 'input ct-input', type: 'text', inputmode: opts.text ? 'text' : 'decimal',
    placeholder: opts.placeholder || '', value: opts.value ?? '', autocomplete: 'off', spellcheck: 'false',
    'aria-label': label.replace(/<[^>]+>/g, ''),
  });
  const wrap = h('label', { class: 'ct-field' },
    h('span', { class: 'ct-field-label', html: label }),
    h('span', { class: 'ct-field-box' }, input, opts.unit ? h('span', { class: 'ct-unit', html: opts.unit }) : null));
  return { wrap, input };
}

function select(label, options, value) {
  const sel = h('select', { class: 'input ct-input', 'aria-label': label },
    options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
  const wrap = h('label', { class: 'ct-field' }, h('span', { class: 'ct-field-label', text: label }), h('span', { class: 'ct-field-box' }, sel));
  return { wrap, input: sel };
}

function card(title, ...body) {
  return h('section', { class: 'card ct-card' }, title ? h('h3', { class: 'ct-card-title', html: title }) : null, ...body);
}

/** Блок результата: steps — строки решения (формат chemHTML), main — главный ответ (HTML). */
function showResult(box, { main, steps, error, hint }) {
  box.innerHTML = '';
  if (error) { box.append(h('div', { class: 'ct-error', role: 'status', text: error })); return; }
  if (hint) { box.append(h('div', { class: 'muted ct-hint', html: hint })); return; }
  if (main) box.append(h('div', { class: 'ct-answer', html: main }));
  if (steps && steps.length) {
    box.append(h('div', { class: 'ct-steps-title' }, 'Решение:'),
      h('ol', { class: 'ct-steps' }, steps.map(s => h('li', { html: stepHTML(s) }))));
  }
}

/** chemHTML + индексы у обозначений величин: N_A, V_m. */
function stepHTML(s) {
  return chemHTML(s).replace(/\b([NV])_([Am])\b/g, '$1<sub>$2</sub>');
}
const SUBD = '₀₁₂₃₄₅₆₇₈₉';
/** Формула с юникодными индексами — для <option>, где нельзя HTML: H2SO4 → H₂SO₄. */
function uniFormula(s) {
  return s.replace(/([A-Za-z)\]])(\d+)/g, (_, a, d) => a + [...d].map(c => SUBD[c]).join(''));
}

function resultBox() { return h('div', { class: 'ct-result', 'aria-live': 'polite' }); }

function liveInputs(inputs, fn) {
  for (const i of inputs) {
    i.addEventListener('input', fn);
    i.addEventListener('change', fn);
  }
  fn();
}

function rand(n) { return Math.floor(Math.random() * n); }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pick(arr) { return arr[rand(arr.length)]; }

/* ------------------------------------------------------------------ вход */

/**
 * Отрисовывает страницу «Химические инструменты».
 * @param {HTMLElement} container
 * @param {string} [tab] — id вкладки из #/tools/<tab>
 */
export function renderChemTools(container, tab) {
  container.innerHTML = '';
  const current = TABS.find(t => t.id === tab) || TABS[0];
  const root = h('div', { class: 'ct-root' });
  root.append(h('h2', { class: 'ct-title' }, 'Химические инструменты'));
  const nav = h('nav', { class: 'ct-tabs', 'aria-label': 'Разделы инструментов' },
    TABS.map(t => h('a', {
      class: 'ct-tab' + (t === current ? ' is-active' : ''), href: `#/tools/${t.id}`,
      'aria-current': t === current ? 'page' : null,
    }, t.title)));
  const panel = h('div', { class: 'ct-panel' });
  root.append(nav, panel);
  container.append(root);
  current.render(panel);
  const active = nav.querySelector('.is-active');
  if (active && active.scrollIntoView && nav.scrollWidth > nav.clientWidth) {
    // offsetLeft is relative to the offset parent, not the nav — use the rects instead
    nav.scrollLeft += active.getBoundingClientRect().left - nav.getBoundingClientRect().left - 16;
  }
}

/* ------------------------------------------------------------------ 1. Таблица */

const CORES = {
  He: '1s2', Ne: '[He] 2s2 2p6', Ar: '[Ne] 3s2 3p6', Kr: '[Ar] 3d10 4s2 4p6',
  Xe: '[Kr] 4d10 5s2 5p6', Rn: '[Xe] 4f14 5d10 6s2 6p6',
};
function plainConfig(c) {
  return c.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, m => [...m].map(ch => SUPD.indexOf(ch)).join(''));
}
function fullConfig(c) {
  let s = plainConfig(c);
  while (/\[(\w+)\]/.test(s)) s = s.replace(/\[(\w+)\]/, (_, g) => CORES[g]);
  return s;
}
function shells(el) {
  const res = [];
  for (const m of fullConfig(el.config).matchAll(/(\d)([spdf])(\d+)/g)) {
    const n = +m[1];
    res[n - 1] = (res[n - 1] || 0) + +m[3];
  }
  return Array.from(res, v => v || 0);
}
function block(el) {
  if (el.group === null) return 'f';
  if (el.group <= 2 || el.z === 2) return 's';
  if (el.group >= 13) return 'p';
  return 'd';
}
function massLabel(el, digits) {
  if (el.radioactive) return `[${el.mass}]`;
  return digits === undefined ? String(el.mass).replace('.', ',') : fix(el.mass, digits);
}
function enColor(en) {
  // 0,7 (синий) → 4,0 (красный)
  const t = Math.max(0, Math.min(1, (en - 0.7) / (3.98 - 0.7)));
  const hue = 230 - 230 * t;
  return `hsla(${hue.toFixed(0)}, 80%, 52%, 0.42)`;
}

function renderTable(panel) {
  let mode = 'category';
  let selected = bySymbol('Fe');
  let query = '';

  const search = h('input', {
    class: 'input ct-input ct-pt-search', type: 'search', placeholder: 'Поиск: символ, название или номер',
    'aria-label': 'Поиск элемента', autocomplete: 'off',
  });
  const modes = [['category', 'Категории'], ['en', 'Электроотрицательность'], ['state', 'Агрегатное состояние']];
  const modeBar = h('div', { class: 'ct-seg', role: 'group', 'aria-label': 'Режим подсветки' },
    modes.map(([id, t]) => h('button', { type: 'button', class: 'ct-seg-btn', 'data-mode': id, onclick: () => { mode = id; update(); } }, t)));
  const legend = h('div', { class: 'ct-legend' });
  const grid = h('div', { class: 'ct-pt', role: 'grid', 'aria-label': 'Периодическая система' });
  const preview = h('div', { class: 'ct-pt-preview', 'aria-hidden': 'true' });
  const detail = h('div', { class: 'ct-detail card' });

  // заголовки групп и периодов
  for (let g = 1; g <= 18; g++) {
    grid.append(h('div', { class: 'ct-pt-head', style: { gridColumn: String(g + 1), gridRow: '1' } }, String(g)));
  }
  for (let p = 1; p <= 7; p++) {
    grid.append(h('div', { class: 'ct-pt-head ct-pt-phead', style: { gridColumn: '1', gridRow: String(p + 1) } }, String(p)));
  }
  grid.append(h('div', { class: 'ct-pt-head ct-pt-phead ct-pt-fhead', style: { gridColumn: '1 / 4', gridRow: '10' } }, 'Лантаноиды'));
  grid.append(h('div', { class: 'ct-pt-head ct-pt-phead ct-pt-fhead', style: { gridColumn: '1 / 4', gridRow: '11' } }, 'Актиноиды'));
  preview.style.gridColumn = '4 / 14';
  preview.style.gridRow = '2 / 5';
  grid.append(preview);
  grid.append(h('div', { class: 'ct-el ct-el-ph ct-cat-lanthanide', style: { gridColumn: '4', gridRow: '7' } }, h('span', { class: 'ct-el-sym' }, '*'), h('span', { class: 'ct-el-z' }, '57–71')));
  grid.append(h('div', { class: 'ct-el ct-el-ph ct-cat-actinide', style: { gridColumn: '4', gridRow: '8' } }, h('span', { class: 'ct-el-sym' }, '**'), h('span', { class: 'ct-el-z' }, '89–103')));
  grid.append(h('div', { class: 'ct-pt-gap', style: { gridColumn: '1 / -1', gridRow: '9' } }));

  const cells = new Map();
  for (const el of ELEMENTS) {
    const btn = h('button', {
      type: 'button', class: 'ct-el', 'data-z': el.z,
      style: { gridColumn: String(el.x + 1), gridRow: String(el.y + 1) },
      title: `${el.name} (${el.symbol}), №${el.z}`,
      'aria-label': `${el.name}, ${el.symbol}, номер ${el.z}`,
      onclick: () => { selected = el; update(true); },
      onmouseenter: () => showPreview(el),
      onfocus: () => showPreview(el),
    },
    h('span', { class: 'ct-el-z' }, String(el.z)),
    h('span', { class: 'ct-el-sym' }, el.symbol),
    h('span', { class: 'ct-el-name' }, el.name),
    h('span', { class: 'ct-el-mass' }, el.radioactive ? `[${el.mass}]` : fix(el.mass, el.mass < 100 ? 2 : 1)));
    cells.set(el.z, btn);
    grid.append(btn);
  }
  grid.addEventListener('mouseleave', () => showPreview(selected));

  function showPreview(el) {
    if (!el) { preview.innerHTML = ''; return; }
    preview.innerHTML = '';
    preview.append(
      h('div', { class: 'ct-prev-sym ct-cat-' + el.category }, el.symbol),
      h('div', { class: 'ct-prev-info' },
        h('div', { class: 'ct-prev-name' }, `${el.z}. ${el.name}`),
        h('div', { class: 'muted' }, `${el.latin} · ${CATEGORY_NAMES[el.category]}`),
        h('div', null, `Ar = ${massLabel(el)} · χ = ${el.en === null ? '—' : fix(el.en, 2)}`),
        h('div', { class: 'ct-prev-config' }, el.config)));
  }

  function matches(el, q) {
    if (!q) return true;
    if (/^\d+$/.test(q)) return el.z === +q;
    const ql = q.toLowerCase();
    return el.symbol.toLowerCase() === ql || el.name.toLowerCase().startsWith(ql) ||
      el.latin.toLowerCase().startsWith(ql) || (ql.length >= 3 && el.name.toLowerCase().includes(ql));
  }

  function renderLegend() {
    legend.innerHTML = '';
    if (mode === 'category') {
      for (const [id, name] of Object.entries(CATEGORY_NAMES)) {
        legend.append(h('span', { class: 'ct-legend-item' }, h('span', { class: 'ct-swatch ct-cat-' + id }), name));
      }
    } else if (mode === 'state') {
      for (const [id, name] of Object.entries(STATE_NAMES)) {
        legend.append(h('span', { class: 'ct-legend-item' }, h('span', { class: 'ct-swatch ct-state-' + id }), name));
      }
      legend.append(h('span', { class: 'muted ct-legend-note' }, 'при нормальных условиях; для элементов № 104–118 — предположительно'));
    } else {
      const stops = [0.7, 1.5, 2.3, 3.1, 3.98].map(v => enColor(v)).join(', ');
      legend.append(h('span', { class: 'ct-legend-item' }, '0,7'),
        h('span', { class: 'ct-grad', style: { background: `linear-gradient(90deg, ${stops})` } }),
        h('span', { class: 'ct-legend-item' }, '4,0'),
        h('span', { class: 'muted ct-legend-note' }, 'шкала Полинга; серым — нет данных'));
    }
  }

  function renderDetail(el) {
    detail.innerHTML = '';
    const sh = shells(el);
    const ox = el.ox.length ? el.ox.map(signed).join(', ') : 'нет данных';
    const rows = [
      ['Порядковый номер (Z)', `${el.z} (протонов и электронов — ${el.z})`],
      ['Относительная атомная масса', el.radioactive ? `[${el.mass}] — массовое число наиболее устойчивого изотопа` : `Ar = ${massLabel(el)}`],
      ['Молярная масса', el.radioactive ? `≈ ${el.mass} г/моль` : `M = ${massLabel(el)} г/моль`],
      ['Период', String(el.period)],
      ['Группа', el.group === null ? `IIIБ (${el.category === 'lanthanide' ? 'лантаноиды' : 'актиноиды'})` : `${el.group} (${shortGroup(el)})`],
      ['Семейство (блок)', `${block(el)}-элемент`],
      ['Категория', CATEGORY_NAMES[el.category]],
      ['Электронная конфигурация', el.config],
      ['Полная запись', fullConfig(el.config).replace(/([spdf])(\d+)/g, (_, l, n) => l + [...n].map(d => SUPD[d]).join(''))],
      ['Электроны по уровням', sh.join(', ') + ` (энергетических уровней — ${sh.length})`],
      ['Электроотрицательность (Полинг)', el.en === null ? 'нет данных' : fix(el.en, 2)],
      ['Степени окисления', ox],
      ['Агрегатное состояние (н.у.)', STATE_NAMES[el.state] + (el.predicted ? ' (предположительно)' : '')],
    ];
    detail.append(
      h('div', { class: 'ct-detail-head' },
        h('div', { class: 'ct-detail-sym ct-cat-' + el.category },
          h('span', { class: 'ct-detail-z' }, String(el.z)), el.symbol),
        h('div', null,
          h('div', { class: 'ct-detail-name' }, el.name),
          h('div', { class: 'muted' }, `лат. ${el.latin}${el.radioactive ? ' · радиоактивен' : ''}`))),
      h('table', { class: 'ct-table ct-detail-table' },
        h('tbody', null, rows.map(([k, v]) => h('tr', null, h('th', { scope: 'row' }, k), h('td', null, v))))),
      h('div', { class: 'ct-shells', 'aria-label': 'Схема строения атома' },
        h('span', { class: 'ct-shell-core' }, `+${el.z}`), sh.map(n => h('span', { class: 'ct-shell' }, h('span', { class: 'ct-shell-arc' }, ')'), String(n)))));
  }

  function update(scrollToDetail) {
    for (const b of modeBar.children) b.classList.toggle('is-active', b.dataset.mode === mode);
    for (const el of ELEMENTS) {
      const c = cells.get(el.z);
      c.className = 'ct-el';
      if (mode === 'category') c.classList.add('ct-cat-' + el.category);
      else if (mode === 'state') c.classList.add('ct-state-' + el.state);
      else if (el.en === null) c.classList.add('ct-en-none');
      c.style.background = mode === 'en' && el.en !== null ? enColor(el.en) : '';
      if (!matches(el, query)) c.classList.add('ct-dim');
      if (selected && selected.z === el.z) c.classList.add('is-selected');
      c.setAttribute('aria-pressed', selected && selected.z === el.z ? 'true' : 'false');
    }
    renderLegend();
    showPreview(selected);
    renderDetail(selected);
    if (scrollToDetail && window.innerWidth < 900 && detail.scrollIntoView) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  search.addEventListener('input', () => {
    query = search.value.trim();
    const found = ELEMENTS.filter(e => matches(e, query));
    if (query && found.length === 1) selected = found[0];
    update();
  });
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const found = ELEMENTS.filter(el => matches(el, query));
      if (found.length) { selected = found[0]; update(true); }
    }
  });

  panel.append(
    h('div', { class: 'ct-toolbar' }, search, modeBar),
    legend,
    h('div', { class: 'ct-pt-wrap' }, grid),
    h('p', { class: 'muted ct-small' }, 'Нажмите на элемент, чтобы увидеть подробности. На телефоне таблицу можно прокручивать вбок.'),
    detail);
  update();
}

/* ------------------------------------------------------------------ 2. Молярная масса */

function renderMass(panel) {
  const f = field('Формула вещества', { placeholder: 'например, CuSO4*5H2O или Ca(OH)2', value: 'CuSO4*5H2O', text: true });
  f.input.classList.add('ct-formula-input');
  const out = h('div', { class: 'ct-mass-out' });
  const help = h('p', { class: 'muted ct-small', html: 'Скобки: <code>Ca(OH)2</code>, <code>[Cu(NH3)4]SO4</code>; кристаллогидраты: <code>CuSO4*5H2O</code> или <code>CuSO4·5H2O</code>; ионы: <code>SO4^2-</code>.' });

  const known = select('Известная величина', [['m', 'масса m, г'], ['n', 'количество вещества n, моль'], ['N', 'число частиц N'], ['V', 'объём газа V (н.у.), л']], 'm');
  const val = field('Значение', { placeholder: 'например, 10', value: '10' });
  const convOut = resultBox();

  let M = null;
  let formulaText = '';

  function calcMass() {
    const src = f.input.value.trim();
    out.innerHTML = '';
    M = null;
    if (!src) { out.append(h('p', { class: 'muted' }, 'Введите формулу.')); calcConv(); return; }
    let r;
    try { r = molarMass(src); } catch (e) { out.append(h('div', { class: 'ct-error' }, e.message)); calcConv(); return; }
    M = r.total;
    formulaText = src.replace(/\*/g, '·');
    const sumParts = r.parts.map(p => (p.count === 1 ? '' : fmt(p.count, 6) + '·') + fix(bySymbol(p.symbol).mass, 3)).join(' + ');
    out.append(
      h('div', { class: 'ct-answer', html: `M(${chemHTML(formulaText)}) = <b>${fix(M, 2)}</b> г/моль <span class="muted">(≈ ${Math.round(M)} г/моль)</span>` }),
      h('p', { class: 'ct-calc-line', html: chemHTML(`M = ${sumParts} = ${fix(M, 2)} г/моль`) }),
      h('div', { class: 'ct-scroll' },
        h('table', { class: 'ct-table' },
          h('thead', null, h('tr', null, ['Элемент', 'Ar', 'Атомов', 'Вклад, г/моль', 'ω, %', ''].map(t => h('th', null, t)))),
          h('tbody', null, r.parts.map(p => {
            const el = bySymbol(p.symbol);
            return h('tr', null,
              h('td', null, h('b', null, p.symbol), ' ', h('span', { class: 'muted' }, el.name)),
              h('td', null, massLabel(el, 3)),
              h('td', null, fmt(p.count, 6)),
              h('td', null, fix(p.mass, 3)),
              h('td', null, fix(p.fraction * 100, 2)),
              h('td', { class: 'ct-bar-cell' }, h('span', { class: 'ct-bar ct-cat-' + el.category, style: { width: (p.fraction * 100).toFixed(1) + '%' } })));
          })))),
      h('div', { class: 'ct-stack', 'aria-hidden': 'true' }, r.parts.map(p => h('span', {
        class: 'ct-stack-part ct-cat-' + bySymbol(p.symbol).category, style: { flexGrow: String(p.fraction) },
        title: `${p.symbol}: ${fix(p.fraction * 100, 1)} %`,
      }, p.fraction > 0.06 ? p.symbol : ''))),
      h('p', { class: 'muted ct-small', html: chemHTML(`Массовая доля элемента: ω(Э) = n·Ar(Э) / M(вещества). Например, ω(${r.parts[0].symbol}) = ${fix(r.parts[0].mass, 3)} / ${fix(M, 2)} = ${pct(r.parts[0].fraction)}.`) }));
    calcConv();
  }

  function calcConv() {
    if (!M) { showResult(convOut, { hint: 'Сначала введите корректную формулу.' }); return; }
    const v = num(val.input.value);
    if (!has(v) || v < 0) { showResult(convOut, { hint: 'Введите неотрицательное число.' }); return; }
    const k = known.input.value;
    let n;
    const steps = [];
    const F = formulaText;
    if (k === 'm') { n = v / M; steps.push(`n = m / M = ${fmt(v)} г / ${fix(M, 2)} г/моль = ${fmt(n)} моль`); }
    if (k === 'n') { n = v; steps.push(`n = ${fmt(n)} моль`); }
    if (k === 'N') { n = v / N_A; steps.push(`n = N / N_A = ${fmt(v)} / 6,022·10²³ моль⁻¹ = ${fmt(n)} моль`); }
    if (k === 'V') { n = v / V_M; steps.push(`n = V / V_m = ${fmt(v)} л / 22,4 л/моль = ${fmt(n)} моль`); }
    const m = n * M, N = n * N_A, V = n * V_M;
    if (k !== 'm') steps.push(`m = n · M = ${fmt(n)} моль · ${fix(M, 2)} г/моль = ${fmt(m)} г`);
    if (k !== 'N') steps.push(`N = n · N_A = ${fmt(n)} · 6,022·10²³ = ${fmt(N)} частиц`);
    if (k !== 'V') steps.push(`V = n · V_m = ${fmt(n)} · 22,4 = ${fmt(V)} л (только если вещество — газ при н.у.)`);
    showResult(convOut, {
      main: chemHTML(`${F}: m = ${fmt(m)} г; n = ${fmt(n)} моль; N = ${fmt(N)}; V(н.у.) = ${fmt(V)} л`),
      steps,
    });
  }

  f.input.addEventListener('input', calcMass);
  liveInputs([known.input, val.input], calcConv);
  calcMass();

  panel.append(
    card('Калькулятор молярной массы', f.wrap, help, out),
    card('Перевод: масса ↔ количество вещества ↔ число частиц ↔ объём',
      h('div', { class: 'ct-form' }, known.wrap, val.wrap),
      h('p', { class: 'muted ct-small', html: stepHTML('N_A = 6,022·10²³ моль⁻¹; V_m = 22,4 л/моль (н.у.: 0 °C, 101,3 кПа). Вещество берётся из поля выше.') }),
      convOut));
}

/* ------------------------------------------------------------------ 3. Уравнивание */

const BALANCE_EXAMPLES = [
  'Fe + O2 = Fe2O3',
  'Al + HCl = AlCl3 + H2',
  'C6H12O6 + O2 = CO2 + H2O',
  'C3H8 + O2 -> CO2 + H2O',
  'KMnO4 + HCl = KCl + MnCl2 + Cl2 + H2O',
  'Cu + HNO3 = Cu(NO3)2 + NO + H2O',
  'K2Cr2O7 + H2SO4 + KI = Cr2(SO4)3 + I2 + K2SO4 + H2O',
  'NH3 + O2 = NO + H2O',
  'MnO4^- + Fe^2+ + H^+ = Mn^2+ + Fe^3+ + H2O',
  'Ca(OH)2 + H3PO4 = Ca3(PO4)2 + H2O',
];

function renderBalance(panel) {
  const f = field('Схема реакции', { placeholder: 'например, Fe + O2 = Fe2O3', value: BALANCE_EXAMPLES[4], text: true });
  f.input.classList.add('ct-formula-input');
  const btn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Уравнять');
  const out = h('div', { class: 'ct-result', 'aria-live': 'polite' });
  const examples = h('div', { class: 'ct-chips' }, BALANCE_EXAMPLES.map(ex => h('button', {
    type: 'button', class: 'btn btn-ghost ct-chip', html: chemHTML(ex),
    onclick: () => { f.input.value = ex; run(true); },
  })));

  function run(showErrors) {
    const src = f.input.value.trim();
    out.innerHTML = '';
    if (!src) return;
    let r;
    try { r = balanceEquation(src); } catch (e) {
      out.append(h('div', { class: showErrors ? 'ct-error' : 'ct-hint muted' }, e.message));
      return;
    }
    const rows = atomCheck(r);
    out.append(
      h('div', { class: 'ct-equation', html: chemHTML(r.text) }),
      h('p', { class: 'muted ct-small' }, 'Коэффициенты: ' + r.coefficients.join(', ')),
      h('div', { class: 'ct-scroll' }, h('table', { class: 'ct-table ct-check' },
        h('thead', null, h('tr', null, ['Элемент', 'Слева', 'Справа', ''].map(t => h('th', null, t)))),
        h('tbody', null, rows.map(rw => h('tr', null,
          h('td', null, rw.element === 'заряд' ? 'Суммарный заряд' : h('b', null, rw.element)),
          h('td', null, rw.element === 'заряд' ? signed(rw.left) : String(rw.left)),
          h('td', null, rw.element === 'заряд' ? signed(rw.right) : String(rw.right)),
          h('td', { class: rw.left === rw.right ? 'ct-ok' : 'ct-bad' }, rw.left === rw.right ? '✓' : '✗')))))));
  }

  btn.addEventListener('click', () => run(true));
  f.input.addEventListener('keydown', e => { if (e.key === 'Enter') run(true); });
  f.input.addEventListener('input', () => run(false));

  panel.append(card('Уравнивание химических реакций',
    h('div', { class: 'ct-inline' }, f.wrap, btn),
    h('p', { class: 'muted ct-small', html: 'Знак реакции: <code>=</code>, <code>-&gt;</code> или <code>→</code>. Ионы: <code>Fe^3+</code>, <code>SO4^2-</code> (или <code>Fe3+</code>, <code>SO4(2-)</code>); электрон: <code>e^-</code>. Коэффициенты, если они уже стоят, пересчитываются заново.' }),
    h('div', { class: 'ct-steps-title' }, 'Примеры:'), examples, out));
  run(true);
}

/* ------------------------------------------------------------------ 4. Растворы */

function countFilled(vals) { return vals.filter(has).length; }

function renderSolutions(panel) {
  panel.append(h('div', { class: 'ct-cards' },
    solMassFraction(), solMolarity(), solDilution(), solMixing(), solCross(), solConvert()));
}

function solMassFraction() {
  const ms = field('m(в-ва)', { unit: 'г', placeholder: '?' });
  const mw = field('m(воды)', { unit: 'г', placeholder: '?' });
  const msol = field('m(р-ра)', { unit: 'г', placeholder: '?' });
  const w = field('ω(в-ва)', { unit: '%', placeholder: '?' });
  ms.input.value = '20'; mw.input.value = '180';
  const out = resultBox();
  function calc() {
    let [a, b, c, d] = [ms, mw, msol, w].map(x => num(x.input.value));
    if (has(d)) d /= 100;
    const k = countFilled([a, b, c, d]);
    if (k !== 2) return showResult(out, { hint: 'Заполните любые <b>два</b> поля — остальные будут рассчитаны.' });
    const steps = [];
    if (has(a) && has(c)) { b = c - a; steps.push(`m(воды) = m(р-ра) − m(в-ва) = ${fmt(c)} − ${fmt(a)} = ${fmt(b)} г`); }
    else if (has(a) && has(b)) { c = a + b; steps.push(`m(р-ра) = m(в-ва) + m(воды) = ${fmt(a)} + ${fmt(b)} = ${fmt(c)} г`); }
    else if (has(b) && has(c)) { a = c - b; steps.push(`m(в-ва) = m(р-ра) − m(воды) = ${fmt(c)} − ${fmt(b)} = ${fmt(a)} г`); }
    else if (has(d) && has(c)) { a = d * c; steps.push(`m(в-ва) = ω · m(р-ра) = ${fmt(d)} · ${fmt(c)} = ${fmt(a)} г`); b = c - a; steps.push(`m(воды) = ${fmt(c)} − ${fmt(a)} = ${fmt(b)} г`); }
    else if (has(d) && has(a)) { c = a / d; steps.push(`m(р-ра) = m(в-ва) / ω = ${fmt(a)} / ${fmt(d)} = ${fmt(c)} г`); b = c - a; steps.push(`m(воды) = ${fmt(c)} − ${fmt(a)} = ${fmt(b)} г`); }
    else if (has(d) && has(b)) { c = b / (1 - d); steps.push(`m(р-ра) = m(воды) / (1 − ω) = ${fmt(b)} / ${fmt(1 - d)} = ${fmt(c)} г`); a = c - b; steps.push(`m(в-ва) = ${fmt(c)} − ${fmt(b)} = ${fmt(a)} г`); }
    if (!has(d)) { d = a / c; steps.push(`ω(в-ва) = m(в-ва) / m(р-ра) = ${fmt(a)} / ${fmt(c)} = ${fmt(d)} (${pct(d)})`); }
    if (!(a >= 0 && b >= 0 && c > 0 && d >= 0 && d <= 1)) return showResult(out, { error: 'Такие данные невозможны: масса вещества должна быть меньше массы раствора, а ω — от 0 до 100 %.' });
    steps.unshift('ω(в-ва) = m(в-ва) / m(р-ра);  m(р-ра) = m(в-ва) + m(воды)');
    showResult(out, { main: `ω = <b>${pct(d)}</b>; m(в-ва) = ${fmt(a)} г; m(воды) = ${fmt(b)} г; m(р-ра) = ${fmt(c)} г`, steps });
  }
  liveInputs([ms, mw, msol, w].map(x => x.input), calc);
  return card('Массовая доля растворённого вещества', h('p', { class: 'ct-formula', html: 'ω = m(в-ва) / m(р-ра)' }),
    h('div', { class: 'ct-form' }, ms.wrap, mw.wrap, msol.wrap, w.wrap), out);
}

function solMolarity() {
  const sub = field('Вещество (для расчёта M)', { placeholder: 'например, NaOH', value: 'NaOH', text: true });
  const m = field('m(в-ва)', { unit: 'г', placeholder: '?', value: '4' });
  const n = field('n(в-ва)', { unit: 'моль', placeholder: '?' });
  const V = field('V(р-ра)', { unit: 'мл', placeholder: '?', value: '250' });
  const C = field('C (молярная)', { unit: 'моль/л', placeholder: '?' });
  const out = resultBox();
  function calc() {
    const mm = tryMolar(sub.input.value);
    const M = mm ? mm.total : NaN;
    const F = sub.input.value.trim();
    let [vm, vn, vV, vC] = [m, n, V, C].map(x => num(x.input.value));
    const steps = [];
    if (has(vm) && has(vn)) return showResult(out, { hint: 'Укажите либо массу, либо количество вещества.' });
    if (has(vm)) {
      if (!has(M)) return showResult(out, { hint: 'Чтобы перевести массу в моль, введите формулу вещества.' });
      vn = vm / M;
      steps.push(`M(${F}) = ${fix(M, 2)} г/моль`, `n = m / M = ${fmt(vm)} / ${fix(M, 2)} = ${fmt(vn)} моль`);
    }
    const k = countFilled([vn, vV, vC]);
    if (k !== 2) return showResult(out, { hint: 'Заполните два из трёх: n (или m + формула), V, C.' });
    if (!has(vC)) { vC = vn / (vV / 1000); steps.push(`V = ${fmt(vV)} мл = ${fmt(vV / 1000)} л`, `C = n / V = ${fmt(vn)} / ${fmt(vV / 1000)} = ${fmt(vC)} моль/л`); }
    else if (!has(vV)) { vV = vn / vC * 1000; steps.push(`V = n / C = ${fmt(vn)} / ${fmt(vC)} = ${fmt(vV / 1000)} л = ${fmt(vV)} мл`); }
    else {
      vn = vC * vV / 1000; steps.push(`n = C · V = ${fmt(vC)} моль/л · ${fmt(vV / 1000)} л = ${fmt(vn)} моль`);
      if (has(M)) { vm = vn * M; steps.push(`m = n · M = ${fmt(vn)} · ${fix(M, 2)} = ${fmt(vm)} г`); }
    }
    if (!(vn >= 0 && vV > 0 && vC >= 0)) return showResult(out, { error: 'Проверьте данные: значения должны быть положительными.' });
    steps.unshift('C = n / V, где V — объём раствора в литрах');
    showResult(out, { main: `C = <b>${fmt(vC)} моль/л</b>; n = ${fmt(vn)} моль; V = ${fmt(vV)} мл` + (has(vm) ? `; m = ${fmt(vm)} г` : ''), steps });
  }
  liveInputs([sub, m, n, V, C].map(x => x.input), calc);
  return card('Молярная концентрация', h('p', { class: 'ct-formula', html: 'C = n / V(р-ра), моль/л' }),
    h('div', { class: 'ct-form' }, sub.wrap, m.wrap, n.wrap, V.wrap, C.wrap), out);
}

function solDilution() {
  const c1 = field('C₁', { placeholder: '?', value: '2' });
  const v1 = field('V₁', { unit: 'мл', placeholder: '?', value: '50' });
  const c2 = field('C₂', { placeholder: '?', value: '0,5' });
  const v2 = field('V₂', { unit: 'мл', placeholder: '?' });
  const out = resultBox();
  function calc() {
    let [a, b, c, d] = [c1, v1, c2, v2].map(x => num(x.input.value));
    if (countFilled([a, b, c, d]) !== 3) return showResult(out, { hint: 'Заполните любые <b>три</b> поля из четырёх.' });
    const steps = ['Количество растворённого вещества при разбавлении не меняется: C₁·V₁ = C₂·V₂'];
    if (!has(a)) { a = c * d / b; steps.push(`C₁ = C₂·V₂ / V₁ = ${fmt(c)}·${fmt(d)} / ${fmt(b)} = ${fmt(a)}`); }
    else if (!has(b)) { b = c * d / a; steps.push(`V₁ = C₂·V₂ / C₁ = ${fmt(c)}·${fmt(d)} / ${fmt(a)} = ${fmt(b)} мл`); }
    else if (!has(c)) { c = a * b / d; steps.push(`C₂ = C₁·V₁ / V₂ = ${fmt(a)}·${fmt(b)} / ${fmt(d)} = ${fmt(c)}`); }
    else { d = a * b / c; steps.push(`V₂ = C₁·V₁ / C₂ = ${fmt(a)}·${fmt(b)} / ${fmt(c)} = ${fmt(d)} мл`); }
    if (![a, b, c, d].every(x => Number.isFinite(x) && x > 0)) return showResult(out, { error: 'Все величины должны быть положительными.' });
    if (c > a) steps.push('Внимание: C₂ > C₁ — это концентрирование, а не разбавление.');
    else steps.push(`Добавить воды (растворителя): V₂ − V₁ = ${fmt(d)} − ${fmt(b)} = ${fmt(d - b)} мл (если объёмы аддитивны)`);
    showResult(out, { main: `C₁ = ${fmt(a)}; V₁ = ${fmt(b)} мл; C₂ = ${fmt(c)}; V₂ = <b>${fmt(d)}</b> мл`, steps });
  }
  liveInputs([c1, v1, c2, v2].map(x => x.input), calc);
  return card('Разбавление раствора', h('p', { class: 'ct-formula', html: 'C₁·V₁ = C₂·V₂' }),
    h('p', { class: 'muted ct-small' }, 'Концентрации — в любых одинаковых единицах (моль/л, н.). Для массовых долей то же правило работает с массами растворов: ω₁·m₁ = ω₂·m₂.'),
    h('div', { class: 'ct-form ct-form-4' }, c1.wrap, v1.wrap, c2.wrap, v2.wrap), out);
}

function solMixing() {
  const w1 = field('ω₁', { unit: '%', value: '10' });
  const m1 = field('m₁(р-ра)', { unit: 'г', value: '200' });
  const w2 = field('ω₂', { unit: '%', value: '30' });
  const m2 = field('m₂(р-ра)', { unit: 'г', value: '100' });
  const out = resultBox();
  function calc() {
    const [a, b, c, d] = [w1, m1, w2, m2].map(x => num(x.input.value));
    if (countFilled([a, b, c, d]) !== 4) return showResult(out, { hint: 'Заполните все четыре поля (для чистой воды ω = 0).' });
    if (a < 0 || c < 0 || a > 100 || c > 100 || b <= 0 || d <= 0) return showResult(out, { error: 'ω — от 0 до 100 %, массы — положительные.' });
    const s1 = a / 100 * b, s2 = c / 100 * d, w = (s1 + s2) / (b + d);
    showResult(out, {
      main: `ω₃ = <b>${pct(w)}</b>; m₃(р-ра) = ${fmt(b + d)} г`,
      steps: [
        `m₁(в-ва) = ω₁·m₁ = ${fmt(a / 100)}·${fmt(b)} = ${fmt(s1)} г`,
        `m₂(в-ва) = ω₂·m₂ = ${fmt(c / 100)}·${fmt(d)} = ${fmt(s2)} г`,
        `m₃(р-ра) = m₁ + m₂ = ${fmt(b)} + ${fmt(d)} = ${fmt(b + d)} г`,
        `ω₃ = (m₁(в-ва) + m₂(в-ва)) / m₃(р-ра) = ${fmt(s1 + s2)} / ${fmt(b + d)} = ${fmt(w)} (${pct(w)})`,
      ],
    });
  }
  liveInputs([w1, m1, w2, m2].map(x => x.input), calc);
  return card('Смешивание двух растворов', h('p', { class: 'ct-formula', html: 'ω₃ = (ω₁·m₁ + ω₂·m₂) / (m₁ + m₂)' }),
    h('div', { class: 'ct-form ct-form-4' }, w1.wrap, m1.wrap, w2.wrap, m2.wrap), out);
}

function solCross() {
  const w1 = field('ω₁ (более концентрированный)', { unit: '%', value: '40' });
  const w2 = field('ω₂ (менее; вода = 0)', { unit: '%', value: '5' });
  const w3 = field('ω₃ (нужно получить)', { unit: '%', value: '15' });
  const total = field('Масса нужного раствора (необязательно)', { unit: 'г', value: '350' });
  const out = resultBox();
  const fig = h('div', { class: 'ct-cross' });
  function draw(a, b, c, p1, p2) {
    const t = v => escapeHTML(v);
    fig.innerHTML = `<svg viewBox="0 0 320 170" role="img" aria-label="Конверт Пирсона">
      <line x1="62" y1="34" x2="258" y2="136" class="ct-cross-line"/>
      <line x1="62" y1="136" x2="258" y2="34" class="ct-cross-line"/>
      <text x="40" y="38" class="ct-cross-val">${t(a)}</text>
      <text x="40" y="142" class="ct-cross-val">${t(b)}</text>
      <rect x="125" y="70" width="70" height="30" rx="8" class="ct-cross-bg"/>
      <rect x="125" y="70" width="70" height="30" rx="8" class="ct-cross-box"/>
      <text x="160" y="91" class="ct-cross-val ct-cross-mid">${t(c)}</text>
      <text x="282" y="38" class="ct-cross-val ct-cross-part">${t(p1)}</text>
      <text x="282" y="142" class="ct-cross-val ct-cross-part">${t(p2)}</text>
      <text x="282" y="62" class="ct-cross-cap">м. ч. 1-го</text>
      <text x="282" y="166" class="ct-cross-cap">м. ч. 2-го</text>
    </svg>`;
  }
  function calc() {
    const [a, b, c, T] = [w1, w2, w3, total].map(x => num(x.input.value));
    if (countFilled([a, b, c]) !== 3) { fig.innerHTML = ''; return showResult(out, { hint: 'Заполните ω₁, ω₂ и ω₃.' }); }
    if (!(Math.min(a, b) < c && c < Math.max(a, b))) { fig.innerHTML = ''; return showResult(out, { error: 'ω₃ должна лежать строго между ω₁ и ω₂.' }); }
    const p1 = Math.abs(c - b), p2 = Math.abs(a - c);
    draw(fmt(a) + '%', fmt(b) + '%', fmt(c) + '%', fmt(p1), fmt(p2));
    const steps = [
      `Записываем ω₁ и ω₂ слева, ω₃ — в центре; по диагоналям вычитаем меньшее из большего.`,
      `Массовые части 1-го раствора: |ω₃ − ω₂| = |${fmt(c)} − ${fmt(b)}| = ${fmt(p1)}`,
      `Массовые части 2-го раствора: |ω₁ − ω₃| = |${fmt(a)} − ${fmt(c)}| = ${fmt(p2)}`,
      `m₁ : m₂ = ${fmt(p1)} : ${fmt(p2)}` + (p2 ? ` = ${fmt(p1 / p2)} : 1` : ''),
    ];
    let main = `m₁ : m₂ = <b>${fmt(p1)} : ${fmt(p2)}</b>`;
    if (has(T) && T > 0) {
      const x1 = T * p1 / (p1 + p2), x2 = T - x1;
      steps.push(`Всего частей: ${fmt(p1)} + ${fmt(p2)} = ${fmt(p1 + p2)}; на одну часть приходится ${fmt(T)} / ${fmt(p1 + p2)} = ${fmt(T / (p1 + p2))} г`,
        `m₁ = ${fmt(p1)} · ${fmt(T / (p1 + p2))} = ${fmt(x1)} г;  m₂ = ${fmt(p2)} · ${fmt(T / (p1 + p2))} = ${fmt(x2)} г`);
      main += `; для ${fmt(T)} г: m₁ = <b>${fmt(x1)} г</b>, m₂ = <b>${fmt(x2)} г</b>`;
    }
    showResult(out, { main, steps });
  }
  liveInputs([w1, w2, w3, total].map(x => x.input), calc);
  return card('Правило креста (конверт Пирсона)',
    h('p', { class: 'muted ct-small' }, 'Сколько взять двух растворов, чтобы получить раствор нужной концентрации.'),
    h('div', { class: 'ct-form ct-form-4' }, w1.wrap, w2.wrap, w3.wrap, total.wrap), fig, out);
}

function solConvert() {
  const sub = field('Вещество', { value: 'H2SO4', text: true });
  const rho = field('Плотность ρ(р-ра)', { unit: 'г/мл', value: '1,84' });
  const w = field('ω(в-ва)', { unit: '%', value: '96', placeholder: '?' });
  const C = field('C (молярная)', { unit: 'моль/л', placeholder: '?' });
  const out = resultBox();
  function calc() {
    const mm = tryMolar(sub.input.value);
    if (!mm) return showResult(out, { hint: 'Введите корректную формулу вещества.' });
    const M = mm.total;
    const F = sub.input.value.trim();
    const p = num(rho.input.value);
    let a = num(w.input.value), c = num(C.input.value);
    if (!has(p) || p <= 0) return showResult(out, { hint: 'Введите плотность раствора.' });
    if (has(a) === has(c)) return showResult(out, { hint: 'Заполните <b>одно</b> из полей: ω или C.' });
    const steps = [`M(${F}) = ${fix(M, 2)} г/моль. Возьмём 1 л (1000 мл) раствора.`, `m(р-ра) = ρ·V = ${fmt(p)} г/мл · 1000 мл = ${fmt(1000 * p)} г`];
    if (has(a)) {
      const ms = a / 100 * 1000 * p, n = ms / M;
      c = n;
      steps.push(`m(в-ва) = ω·m(р-ра) = ${fmt(a / 100)} · ${fmt(1000 * p)} = ${fmt(ms)} г`,
        `n = m / M = ${fmt(ms)} / ${fix(M, 2)} = ${fmt(n)} моль`,
        `C = n / V = ${fmt(n)} моль / 1 л = ${fmt(c)} моль/л`,
        `Короткая формула: C = 10·ω(%)·ρ / M = 10·${fmt(a)}·${fmt(p)} / ${fix(M, 2)} = ${fmt(c)} моль/л`);
    } else {
      const ms = c * M;
      a = ms / (1000 * p) * 100;
      steps.push(`n = C·V = ${fmt(c)} моль; m(в-ва) = n·M = ${fmt(c)} · ${fix(M, 2)} = ${fmt(ms)} г`,
        `ω = m(в-ва) / m(р-ра) = ${fmt(ms)} / ${fmt(1000 * p)} = ${fmt(a / 100)} (${fix(a, 2)} %)`,
        `Короткая формула: ω(%) = C·M / (10·ρ) = ${fmt(c)}·${fix(M, 2)} / (10·${fmt(p)}) = ${fix(a, 2)} %`);
    }
    if (a > 100 || a < 0) return showResult(out, { error: 'Получилась ω больше 100 % — проверьте концентрацию и плотность.' });
    showResult(out, { main: `ω = <b>${fix(a, 2)} %</b> ⇄ C = <b>${fmt(c)} моль/л</b>`, steps });
  }
  liveInputs([sub, rho, w, C].map(x => x.input), calc);
  return card('Перевод ω ↔ C (с плотностью)', h('p', { class: 'ct-formula', html: 'C = 10·ω(%)·ρ / M;  ω(%) = C·M / (10·ρ)' }),
    h('div', { class: 'ct-form ct-form-4' }, sub.wrap, rho.wrap, w.wrap, C.wrap), out);
}

/* ------------------------------------------------------------------ 5. Газы */

const COMMON_GASES = ['H2', 'He', 'CH4', 'NH3', 'H2O', 'Ne', 'C2H2', 'N2', 'CO', 'C2H4', 'NO', 'C2H6', 'O2', 'SiH4', 'PH3', 'H2S', 'HCl', 'F2', 'Ar', 'C3H6', 'CO2', 'N2O', 'C3H8', 'NO2', 'O3', 'C4H8', 'SO2', 'C4H10', 'Cl2', 'Kr', 'SO3', 'Xe'];

function renderGas(panel) {
  panel.append(h('div', { class: 'ct-cards' }, gasIdeal(), gasNormal(), gasDensity()));
}

function gasIdeal() {
  const p = field('p (давление)', { unit: 'кПа', value: '101,325' });
  const V = field('V (объём)', { unit: 'л', placeholder: '?' });
  const n = field('n', { unit: 'моль', value: '1' });
  const T = field('T (температура)', { value: '0' });
  const tUnit = select('Единицы T', [['C', '°C'], ['K', 'К']], 'C');
  const gas = field('Газ (необязательно, для массы)', { text: true, placeholder: 'например, CO2' });
  const out = resultBox();
  function calc() {
    let [vp, vV, vn, vT] = [p, V, n, T].map(x => num(x.input.value));
    if (countFilled([vp, vV, vn, vT]) !== 3) return showResult(out, { hint: 'Заполните любые <b>три</b> величины из p, V, n, T.' });
    const steps = ['Уравнение Менделеева–Клапейрона: pV = nRT, R = 8,314 Дж/(моль·К). При p в кПа и V в л: кПа·л = Дж.'];
    const unitC = tUnit.input.value === 'C';
    if (has(vT) && unitC) { steps.push(`T = t + 273,15 = ${fmt(vT)} + 273,15 = ${fmt(vT + 273.15, 5)} К`); vT += 273.15; }
    if (!has(vp)) { vp = vn * R_GAS * vT / vV; steps.push(`p = nRT / V = ${fmt(vn)}·8,314·${fmt(vT, 5)} / ${fmt(vV)} = ${fmt(vp)} кПа`); }
    else if (!has(vV)) { vV = vn * R_GAS * vT / vp; steps.push(`V = nRT / p = ${fmt(vn)}·8,314·${fmt(vT, 5)} / ${fmt(vp)} = ${fmt(vV)} л`); }
    else if (!has(vn)) { vn = vp * vV / (R_GAS * vT); steps.push(`n = pV / (RT) = ${fmt(vp)}·${fmt(vV)} / (8,314·${fmt(vT, 5)}) = ${fmt(vn)} моль`); }
    else { vT = vp * vV / (vn * R_GAS); steps.push(`T = pV / (nR) = ${fmt(vp)}·${fmt(vV)} / (${fmt(vn)}·8,314) = ${fmt(vT, 5)} К = ${fmt(vT - 273.15, 4)} °C`); }
    if (![vp, vV, vn, vT].every(x => Number.isFinite(x) && x > 0)) return showResult(out, { error: 'Все величины должны быть положительными (T — выше абсолютного нуля).' });
    let main = `p = ${fmt(vp)} кПа; V = ${fmt(vV)} л; n = ${fmt(vn)} моль; T = ${fmt(vT, 5)} К (${fmt(vT - 273.15, 4)} °C)`;
    const mm = tryMolar(gas.input.value);
    if (mm) {
      const m = vn * mm.total;
      steps.push(`m = n·M = ${fmt(vn)} · ${fix(mm.total, 2)} = ${fmt(m)} г`);
      main += `; m(${gas.input.value.trim()}) = ${fmt(m)} г`;
    }
    showResult(out, { main: chemHTML(main), steps });
  }
  liveInputs([p, V, n, T, tUnit, gas].map(x => x.input), calc);
  return card('Уравнение Менделеева–Клапейрона', h('p', { class: 'ct-formula', html: 'pV = nRT' }),
    h('div', { class: 'ct-form' }, p.wrap, V.wrap, n.wrap, T.wrap, tUnit.wrap, gas.wrap), out);
}

function gasNormal() {
  const gas = field('Газ', { text: true, value: 'CO2' });
  const known = select('Известно', [['V', 'объём V, л'], ['m', 'масса m, г'], ['n', 'количество n, моль'], ['N', 'число молекул N']], 'V');
  const val = field('Значение', { value: '5,6' });
  const out = resultBox();
  function calc() {
    const mm = tryMolar(gas.input.value);
    const v = num(val.input.value);
    const k = known.input.value;
    if (!has(v) || v < 0) return showResult(out, { hint: 'Введите значение.' });
    if (!mm && k === 'm') return showResult(out, { hint: 'Для расчёта по массе введите формулу газа.' });
    const M = mm ? mm.total : NaN;
    const F = gas.input.value.trim();
    const steps = [];
    let n;
    if (k === 'V') { n = v / V_M; steps.push(`n = V / V_m = ${fmt(v)} / 22,4 = ${fmt(n)} моль`); }
    if (k === 'm') { n = v / M; steps.push(`n = m / M = ${fmt(v)} / ${fix(M, 2)} = ${fmt(n)} моль`); }
    if (k === 'n') n = v;
    if (k === 'N') { n = v / N_A; steps.push(`n = N / N_A = ${fmt(v)} / 6,022·10²³ = ${fmt(n)} моль`); }
    const parts = [`n = ${fmt(n)} моль`];
    if (k !== 'V') steps.push(`V = n·V_m = ${fmt(n)} · 22,4 = ${fmt(n * V_M)} л`);
    parts.push(`V = ${fmt(n * V_M)} л`);
    if (mm) {
      if (k !== 'm') steps.push(`m = n·M = ${fmt(n)} · ${fix(M, 2)} = ${fmt(n * M)} г`);
      parts.push(`m = ${fmt(n * M)} г`);
      steps.push(`Плотность при н.у.: ρ = M / V_m = ${fix(M, 2)} / 22,4 = ${fmt(M / V_M)} г/л`);
    }
    if (k !== 'N') steps.push(`N = n·N_A = ${fmt(n)} · 6,022·10²³ = ${fmt(n * N_A)}`);
    parts.push(`N = ${fmt(n * N_A)}`);
    showResult(out, { main: chemHTML((mm ? F + ': ' : '') + parts.join('; ')), steps });
  }
  liveInputs([gas, known, val].map(x => x.input), calc);
  return card('Газы при нормальных условиях', h('p', { class: 'ct-formula', html: 'n = V / V<sub>m</sub>, V<sub>m</sub> = 22,4 л/моль (0 °C, 101,3 кПа)' }),
    h('div', { class: 'ct-form' }, gas.wrap, known.wrap, val.wrap), out);
}

function gasDensity() {
  const REFS = [['H2', 'по водороду (M = 2)'], ['air', 'по воздуху (M = 29)'], ['O2', 'по кислороду (M = 32)'], ['N2', 'по азоту (M = 28)'], ['He', 'по гелию (M = 4)'], ['CO2', 'по углекислому газу (M = 44)']];
  const REF_M = { H2: 2, air: 29, O2: 32, N2: 28, He: 4, CO2: 44 };
  const REF_LABEL = { H2: 'H2', air: 'возд.', O2: 'O2', N2: 'N2', He: 'He', CO2: 'CO2' };
  const ref = select('Относительная плотность', REFS, 'H2');
  const gas = field('Газ (формула) или M, г/моль', { text: true, value: 'CH4' });
  const D = field('…или известна D', { placeholder: 'например, 22' });
  const out = resultBox();
  function calc() {
    const r = ref.input.value, Mr = REF_M[r], lbl = REF_LABEL[r];
    const g = gas.input.value.trim();
    const d = num(D.input.value);
    const sub = r === 'air' ? 'возд.' : chemHTML(lbl);
    const steps = [`D(по ${r === 'air' ? 'воздуху' : lbl}) = M(газа) / M(${lbl}), M(${lbl}) = ${Mr} г/моль`];
    if (has(d)) {
      const M = d * Mr;
      steps.push(`M(газа) = D · M(${lbl}) = ${fmt(d)} · ${Mr} = ${fmt(M)} г/моль`);
      const cand = COMMON_GASES.filter(x => Math.abs(molarMass(x).total - M) <= 0.6);
      if (cand.length) steps.push(`Подходящие газы: ${cand.join(', ')}`);
      return showResult(out, { main: `M(газа) = <b>${fmt(M)} г/моль</b>`, steps });
    }
    if (!g) return showResult(out, { hint: 'Введите формулу газа (или его M) либо значение D.' });
    let M = num(g), name = 'газа';
    if (!has(M)) {
      const mm = tryMolar(g);
      if (!mm) return showResult(out, { error: 'Не удалось распознать формулу.' });
      M = mm.total; name = g;
      steps.push(`M(${g}) = ${fix(M, 2)} г/моль`);
    }
    const res = M / Mr;
    steps.push(`D = ${fix(M, 2)} / ${Mr} = ${fmt(res)}`);
    if (r === 'air') steps.push(res < 1 ? 'D < 1 — газ легче воздуха: его собирают в сосуд, перевёрнутый вверх дном.' : 'D > 1 — газ тяжелее воздуха: его собирают в сосуд, расположенный отверстием вверх.');
    showResult(out, { main: `D<sub>${sub}</sub>(${chemHTML(name)}) = <b>${fmt(res)}</b>`, steps });
  }
  liveInputs([ref, gas, D].map(x => x.input), calc);
  return card('Относительная плотность газов', h('p', { class: 'ct-formula', html: 'D = M₁ / M₂;  D<sub>H₂</sub> = M / 2;  D<sub>возд.</sub> = M / 29' }),
    h('div', { class: 'ct-form' }, ref.wrap, gas.wrap, D.wrap), out);
}

/* ------------------------------------------------------------------ 6. pH */

function renderPH(panel) {
  panel.append(h('div', { class: 'ct-cards' }, phStrong(), phWeak(), phConvert()));
}

function phMedium(pH) {
  if (pH < 6.995) return 'кислая среда';
  if (pH > 7.005) return 'щелочная среда';
  return 'нейтральная среда';
}

function phStrong() {
  const type = select('Электролит', [['acid', 'сильная кислота'], ['base', 'сильное основание (щёлочь)']], 'acid');
  const c = field('C', { unit: 'моль/л', value: '0,01' });
  const k = select('Число H⁺ / OH⁻ (основность / кислотность)', [['1', uniFormula('1 (HCl, HNO3, NaOH, KOH)')], ['2', uniFormula('2 (H2SO4, Ba(OH)2, Ca(OH)2)')], ['3', '3']], '1');
  const out = resultBox();
  function calc() {
    const C = num(c.input.value), n = +k.input.value, acid = type.input.value === 'acid';
    if (!has(C) || C <= 0) return showResult(out, { hint: 'Введите концентрацию.' });
    const x = n * C;
    const steps = [];
    let pH;
    if (acid) {
      steps.push(`Сильная кислота диссоциирует полностью: [H⁺] = ${n > 1 ? n + '·' : ''}C = ${n > 1 ? n + '·' : ''}${fmt(C)} = ${fmt(x)} моль/л`);
      pH = -Math.log10(x);
      steps.push(`pH = −lg[H⁺] = −lg(${fmt(x)}) = ${fix(pH, 2)}`);
    } else {
      steps.push(`Щёлочь диссоциирует полностью: [OH⁻] = ${n > 1 ? n + '·' : ''}C = ${fmt(x)} моль/л`);
      const pOH = -Math.log10(x);
      pH = 14 - pOH;
      steps.push(`pOH = −lg[OH⁻] = −lg(${fmt(x)}) = ${fix(pOH, 2)}`, `pH = 14 − pOH = 14 − ${fix(pOH, 2)} = ${fix(pH, 2)}`);
    }
    if (n > 1 && acid) steps.push('Школьное приближение: кислота диссоциирует полностью по всем ступеням (у H2SO4 вторая ступень на самом деле диссоциирует не полностью).');
    if (x < 1e-6) {
      const exact = (x + Math.sqrt(x * x + 4e-14)) / 2;
      const pe = acid ? -Math.log10(exact) : 14 + Math.log10(exact);
      steps.push(`Концентрация очень мала — нужно учесть диссоциацию воды: [${acid ? 'H⁺' : 'OH⁻'}] = (C + √(C² + 4Kw))/2 = ${fmt(exact)} → pH = ${fix(pe, 2)}`);
      pH = pe;
    }
    showResult(out, { main: `pH = <b>${fix(pH, 2)}</b> — ${phMedium(pH)}`, steps });
  }
  liveInputs([type, c, k].map(x => x.input), calc);
  return card('Сильные кислоты и основания', h('p', { class: 'ct-formula', html: 'pH = −lg[H<sup>+</sup>];  pH + pOH = 14 (25 °C)' }),
    h('div', { class: 'ct-form' }, type.wrap, c.wrap, k.wrap), out);
}

const WEAK = [
  ['custom', 'свой вариант', null, 'acid'],
  ['CH3COOH', 'CH3COOH (уксусная), Ka = 1,75·10⁻⁵', 1.75e-5, 'acid'],
  ['HCOOH', 'HCOOH (муравьиная), Ka = 1,8·10⁻⁴', 1.8e-4, 'acid'],
  ['HF', 'HF (плавиковая), Ka = 6,8·10⁻⁴', 6.8e-4, 'acid'],
  ['HClO', 'HClO (хлорноватистая), Ka = 3,0·10⁻⁸', 3.0e-8, 'acid'],
  ['HCN', 'HCN (циановодородная), Ka = 6,2·10⁻¹⁰', 6.2e-10, 'acid'],
  ['NH3', 'NH3·H2O (аммиак), Kb = 1,8·10⁻⁵', 1.8e-5, 'base'],
];

function phWeak() {
  const preset = select('Вещество', WEAK.map(w => [w[0], uniFormula(w[1])]), 'CH3COOH');
  const type = select('Тип', [['acid', 'слабая кислота (Ka)'], ['base', 'слабое основание (Kb)']], 'acid');
  const K = field('Ka или Kb', { value: '1,75e-5', placeholder: 'например, 1,8e-5' });
  const pK = field('…или pKa / pKb', { placeholder: 'например, 4,76' });
  const c = field('C', { unit: 'моль/л', value: '0,1' });
  const out = resultBox();
  preset.input.addEventListener('change', () => {
    const w = WEAK.find(x => x[0] === preset.input.value);
    if (w && w[2] !== null) { K.input.value = String(w[2]).replace('.', ','); pK.input.value = ''; type.input.value = w[3]; }
  });
  function calc() {
    let Kv = num(K.input.value);
    const pKv = num(pK.input.value);
    const C = num(c.input.value);
    const acid = type.input.value === 'acid';
    const s = acid ? 'a' : 'b';
    const steps = [];
    if (!has(Kv) && has(pKv)) { Kv = 10 ** -pKv; steps.push(`K${s} = 10^(−pK${s}) = ${fmt(Kv)}`); }
    if (!has(Kv) || Kv <= 0 || !has(C) || C <= 0) return showResult(out, { hint: `Введите K${s} (или pK${s}) и концентрацию.` });
    const x = (-Kv + Math.sqrt(Kv * Kv + 4 * Kv * C)) / 2;
    const approx = Math.sqrt(Kv * C);
    const ion = acid ? '[H⁺]' : '[OH⁻]';
    steps.push(acid ? 'HA ⇄ H⁺ + A⁻;  Ka = [H⁺][A⁻] / [HA] = x² / (C − x)' : 'B + H2O ⇄ BH⁺ + OH⁻;  Kb = x² / (C − x)');
    steps.push(`Приближённо (x ≪ C): ${ion} ≈ √(K${s}·C) = √(${fmt(Kv)}·${fmt(C)}) = ${fmt(approx)} моль/л`);
    steps.push(`Точно (квадратное уравнение): x = (−K + √(K² + 4KC)) / 2 = ${fmt(x)} моль/л`);
    const alpha = x / C;
    steps.push(`Степень диссоциации α = x / C = ${fmt(alpha)} (${pct(alpha)})` + (alpha > 0.05 ? ' — больше 5 %, приближённая формула даёт заметную ошибку' : ''));
    let pH;
    if (acid) { pH = -Math.log10(x); steps.push(`pH = −lg(${fmt(x)}) = ${fix(pH, 2)}`); }
    else { const pOH = -Math.log10(x); pH = 14 - pOH; steps.push(`pOH = −lg(${fmt(x)}) = ${fix(pOH, 2)};  pH = 14 − ${fix(pOH, 2)} = ${fix(pH, 2)}`); }
    showResult(out, { main: `pH = <b>${fix(pH, 2)}</b> — ${phMedium(pH)}; α = ${pct(alpha)}`, steps });
  }
  liveInputs([preset, type, K, pK, c].map(x => x.input), calc);
  return card('Слабые кислоты и основания', h('p', { class: 'ct-formula', html: '[H<sup>+</sup>] ≈ √(K<sub>a</sub>·C);  [OH<sup>−</sup>] ≈ √(K<sub>b</sub>·C)' }),
    h('div', { class: 'ct-form' }, preset.wrap, type.wrap, K.wrap, pK.wrap, c.wrap), out);
}

function phConvert() {
  const known = select('Известно', [['pH', 'pH'], ['pOH', 'pOH'], ['H', '[H⁺], моль/л'], ['OH', '[OH⁻], моль/л']], 'H');
  const val = field('Значение', { value: '1e-3' });
  const out = resultBox();
  function calc() {
    const v = num(val.input.value), k = known.input.value;
    if (!has(v)) return showResult(out, { hint: 'Введите значение (например, 1e-3 или 1,5·10^-4).' });
    if ((k === 'H' || k === 'OH') && v <= 0) return showResult(out, { error: 'Концентрация должна быть положительной.' });
    let pH; const steps = [];
    if (k === 'pH') pH = v;
    if (k === 'pOH') { pH = 14 - v; steps.push(`pH = 14 − pOH = 14 − ${fmt(v)} = ${fix(pH, 2)}`); }
    if (k === 'H') { pH = -Math.log10(v); steps.push(`pH = −lg[H⁺] = −lg(${fmt(v)}) = ${fix(pH, 2)}`); }
    if (k === 'OH') { const pOH = -Math.log10(v); pH = 14 - pOH; steps.push(`pOH = −lg[OH⁻] = ${fix(pOH, 2)};  pH = 14 − pOH = ${fix(pH, 2)}`); }
    const H = 10 ** -pH, OH = 10 ** -(14 - pH);
    if (k !== 'pOH') steps.push(`pOH = 14 − pH = ${fix(14 - pH, 2)}`);
    if (k !== 'H') steps.push(`[H⁺] = 10^(−pH) = ${fmt(H, 3)} моль/л`);
    if (k !== 'OH') steps.push(`[OH⁻] = Kw / [H⁺] = 10⁻¹⁴ / ${fmt(H, 3)} = ${fmt(OH, 3)} моль/л`);
    showResult(out, { main: `pH = <b>${fix(pH, 2)}</b>; pOH = ${fix(14 - pH, 2)}; [H⁺] = ${fmt(H, 3)}; [OH⁻] = ${fmt(OH, 3)} моль/л — ${phMedium(pH)}`, steps });
  }
  liveInputs([known.input, val.input], calc);
  const scale = h('div', { class: 'ct-ph-scale', 'aria-hidden': 'true' },
    Array.from({ length: 15 }, (_, i) => h('span', { style: { background: `hsla(${(i / 14) * 270}, 75%, 50%, 0.55)` } }, String(i))));
  return card('Перевод pH ↔ [H⁺] ↔ pOH', h('p', { class: 'ct-formula', html: '[H<sup>+</sup>]·[OH<sup>−</sup>] = K<sub>w</sub> = 10<sup>−14</sup> (25 °C)' }),
    h('div', { class: 'ct-form' }, known.wrap, val.wrap), scale, out);
}

/* ------------------------------------------------------------------ 7. Растворимость */

// Катионы: формула, заряд, многоатомный ли, родительный падеж для названия
const CATIONS = [
  ['H', 1, false, 'водорода'], ['Li', 1, false, 'лития'], ['K', 1, false, 'калия'], ['Na', 1, false, 'натрия'],
  ['NH4', 1, true, 'аммония'], ['Ba', 2, false, 'бария'], ['Ca', 2, false, 'кальция'], ['Mg', 2, false, 'магния'],
  ['Sr', 2, false, 'стронция'], ['Al', 3, false, 'алюминия'], ['Cr', 3, false, 'хрома(III)'], ['Fe', 2, false, 'железа(II)'],
  ['Fe', 3, false, 'железа(III)'], ['Ni', 2, false, 'никеля(II)'], ['Co', 2, false, 'кобальта(II)'], ['Mn', 2, false, 'марганца(II)'],
  ['Zn', 2, false, 'цинка'], ['Ag', 1, false, 'серебра'], ['Hg', 2, false, 'ртути(II)'], ['Pb', 2, false, 'свинца(II)'],
  ['Sn', 2, false, 'олова(II)'], ['Cu', 2, false, 'меди(II)'],
].map(([f, q, poly, gen]) => ({ f, q, poly, gen }));

// Анионы и строка растворимости по катионам (в порядке CATIONS):
// R — растворимо, M — малорастворимо, N — нерастворимо, - — не существует / разлагается водой, . — нет ячейки
const ANIONS = [
  ['OH', 1, true, 'гидроксид', '.RRRRRMNMNNNNNNNN--NNN', null],
  ['F', 1, false, 'фторид', 'RMRRRMNMMMMMMRRRRR-MRM', 'фтороводородная (плавиковая) кислота'],
  ['Cl', 1, false, 'хлорид', 'RRRRRRRRRRRRRRRRRNRMRR', 'хлороводородная (соляная) кислота'],
  ['Br', 1, false, 'бромид', 'RRRRRRRRRRRRRRRRRNMMRR', 'бромоводородная кислота'],
  ['I', 1, false, 'иодид', 'RRRRRRRRRRRR-RRRRNNMM-', 'иодоводородная кислота'],
  ['S', 2, false, 'сульфид', 'RRRRRRM-R--N-NNNNNNNNN', 'сероводородная кислота'],
  ['HS', 1, true, 'гидросульфид', '.RRRRRRRR-------------', null],
  ['SO3', 2, true, 'сульфит', 'RRRRRNNMN--N-NNNMN-N--', 'сернистая кислота'],
  ['HSO3', 1, true, 'гидросульфит', '.RRRRRRRR-------------', null],
  ['SO4', 2, true, 'сульфат', 'RRRRRNMRNRRRRRRRRM-NRR', 'серная кислота'],
  ['HSO4', 1, true, 'гидросульфат', '.RRRR-RR--------------', null],
  ['NO3', 1, true, 'нитрат', 'RRRRRRRRRRRRRRRRRRRR-R', 'азотная кислота'],
  ['NO2', 1, true, 'нитрит', 'RRRRRRRRR----RR-RM-R-R', 'азотистая кислота'],
  ['PO4', 3, true, 'фосфат', 'RMRRRNNNNNNNNNNNNNNNNN', 'фосфорная (ортофосфорная) кислота'],
  ['HPO4', 2, true, 'гидрофосфат', '.RRRRMMMM--N-NNNNN-N-N', null],
  ['H2PO4', 1, true, 'дигидрофосфат', '.RRRRRRRR--R-RRRR-----', null],
  ['CO3', 2, true, 'карбонат', 'RRRRRNNMN--N-NNNNN-N--', 'угольная кислота'],
  ['HCO3', 1, true, 'гидрокарбонат', '.RRRRRRRR--R----------', null],
  ['CH3COO', 1, true, 'ацетат', 'RRRRRRRRR-RR-RRRRMRR-R', 'уксусная кислота'],
  ['SiO3', 2, true, 'силикат', 'NRRR-NNNN--N-NNNN--N--', 'кремниевая кислота'],
].map(([f, q, poly, name, row, acid]) => ({ f, q, poly, name, row, acid }));

const SOL_TEXT = { R: 'растворимо', M: 'малорастворимо', N: 'нерастворимо', '-': 'не существует или разлагается водой' };
const SOL_LETTER = { R: 'Р', M: 'М', N: 'Н', '-': '—', '.': '' };

function gcdInt(a, b) { while (b) [a, b] = [b, a % b]; return a; }
function ionLabel(f, q, sign) { return `${f}^${q > 1 ? q : ''}${sign}`; }

/** Формула и название соединения катиона с анионом. */
function compound(cat, an) {
  if (cat.f === 'H') {
    if (an.f === 'OH') return { formula: 'H2O', name: 'вода' };
    if (!an.acid) return null;
    if (an.f === 'CH3COO') return { formula: 'CH3COOH', name: an.acid };
    return { formula: (an.q > 1 ? 'H' + an.q : 'H') + an.f, name: an.acid };
  }
  const g = gcdInt(cat.q, an.q);
  const nc = an.q / g, na = cat.q / g;
  const part = (f, n, poly) => (n === 1 ? f : poly ? `(${f})${n}` : f + n);
  return { formula: part(cat.f, nc, cat.poly) + part(an.f, na, an.poly), name: `${an.name} ${cat.gen}` };
}

export const SOLUBILITY = { CATIONS, ANIONS };

function renderSolubility(panel) {
  const info = h('div', { class: 'ct-sol-info', 'aria-live': 'polite' }, h('span', { class: 'muted' }, 'Наведите курсор или нажмите на ячейку, чтобы увидеть вещество.'));
  const table = h('table', { class: 'ct-sol' });
  const headRow = h('tr', null, h('th', { class: 'ct-sol-corner' }, 'Анион \\ катион'),
    CATIONS.map((c, j) => h('th', { scope: 'col', 'data-col': j, html: chemHTML(ionLabel(c.f, c.q, '+')) })));
  table.append(h('thead', null, headRow));
  const tbody = h('tbody');
  ANIONS.forEach((an, i) => {
    const tr = h('tr', null, h('th', { scope: 'row', html: chemHTML(ionLabel(an.f, an.q, '-')) }));
    CATIONS.forEach((cat, j) => {
      const code = an.row[j];
      const comp = compound(cat, an);
      const td = h('td', {
        class: 'ct-sol-cell ct-sol-' + ({ R: 'r', M: 'm', N: 'n', '-': 'x', '.': 'e' })[code],
        'data-col': j, 'data-row': i, tabindex: code === '.' ? null : '0',
        title: comp && code !== '.' ? `${comp.formula} — ${comp.name}: ${SOL_TEXT[code]}` : '',
      }, SOL_LETTER[code]);
      td._data = { comp, code };
      tr.append(td);
    });
    tbody.append(tr);
  });
  table.append(tbody);

  let hiCol = null;
  function highlight(td) {
    if (hiCol !== null) for (const el of table.querySelectorAll(`[data-col="${hiCol}"]`)) el.classList.remove('ct-sol-hi');
    for (const el of table.querySelectorAll('tr.ct-sol-hirow')) el.classList.remove('ct-sol-hirow');
    hiCol = null;
    if (!td) return;
    hiCol = td.dataset.col;
    for (const el of table.querySelectorAll(`[data-col="${hiCol}"]`)) el.classList.add('ct-sol-hi');
    td.parentElement.classList.add('ct-sol-hirow');
    const { comp, code } = td._data;
    info.innerHTML = '';
    if (!comp || code === '.') { info.append(h('span', { class: 'muted' }, 'Нет такого соединения в таблице.')); return; }
    info.append(h('span', { class: 'ct-sol-formula', html: chemHTML(comp.formula) }), ' — ', comp.name, ': ',
      h('b', { class: 'ct-sol-txt-' + ({ R: 'r', M: 'm', N: 'n', '-': 'x' })[code] }, SOL_TEXT[code]));
  }
  table.addEventListener('mouseover', e => { const td = e.target.closest('td.ct-sol-cell'); if (td) highlight(td); });
  table.addEventListener('focusin', e => { const td = e.target.closest('td.ct-sol-cell'); if (td) highlight(td); });
  table.addEventListener('click', e => { const td = e.target.closest('td.ct-sol-cell'); if (td) highlight(td); });
  table.addEventListener('mouseleave', () => highlight(null));

  const legend = h('div', { class: 'ct-legend' },
    [['r', 'Р — растворимо (> 1 г в 100 г воды)'], ['m', 'М — малорастворимо (0,01–1 г)'], ['n', 'Н — нерастворимо (< 0,01 г)'], ['x', '— — не существует или разлагается водой']]
      .map(([k, t]) => h('span', { class: 'ct-legend-item' }, h('span', { class: 'ct-swatch ct-sol-' + k }), t)));

  panel.append(card('Таблица растворимости кислот, оснований и солей в воде', legend, info,
    h('div', { class: 'ct-scroll ct-sol-wrap' }, table),
    h('p', { class: 'muted ct-small' }, 'Данные — по школьной таблице растворимости (при 20–25 °C). Для малохарактерных солей (фториды, гидро- и дигидросоли) значения в разных изданиях таблицы могут немного отличаться.')));
}

/* ------------------------------------------------------------------ 8. Ряды */

// [символ, ион, E°, В]
const METAL_SERIES = [
  ['Li', 'Li^+', -3.04], ['K', 'K^+', -2.93], ['Ba', 'Ba^2+', -2.91], ['Ca', 'Ca^2+', -2.87], ['Na', 'Na^+', -2.71],
  ['Mg', 'Mg^2+', -2.37], ['Al', 'Al^3+', -1.66], ['Mn', 'Mn^2+', -1.18], ['Zn', 'Zn^2+', -0.76], ['Cr', 'Cr^3+', -0.74],
  ['Fe', 'Fe^2+', -0.44], ['Cd', 'Cd^2+', -0.40], ['Co', 'Co^2+', -0.28], ['Ni', 'Ni^2+', -0.25], ['Sn', 'Sn^2+', -0.14],
  ['Pb', 'Pb^2+', -0.13], ['H2', '2H^+', 0], ['Cu', 'Cu^2+', 0.34], ['Hg', 'Hg2^2+', 0.80], ['Ag', 'Ag^+', 0.80],
  ['Pt', 'Pt^2+', 1.18], ['Au', 'Au^3+', 1.50],
];

function renderSeries(panel) {
  const hIdx = METAL_SERIES.findIndex(m => m[0] === 'H2');
  const zone = i => (i <= 5 ? 'ct-zone-a' : i < hIdx ? 'ct-zone-b' : i === hIdx ? 'ct-zone-h' : 'ct-zone-c');
  const chips = h('div', { class: 'ct-series' }, METAL_SERIES.map(([s, ion, E], i) => h('div', { class: 'ct-series-item ' + zone(i), title: `${ion.replace('^', '')}/${s}: E° = ${fix(E, 2)} В` },
    h('span', { class: 'ct-series-sym', html: chemHTML(s) }),
    h('span', { class: 'ct-series-ion', html: chemHTML(ion + '/' + (s === 'Hg' ? '2Hg' : s)) }),
    h('span', { class: 'ct-series-e' }, (E > 0 ? '+' : '') + fix(E, 2)))));

  const tips = [
    'Чем левее металл в ряду, тем он активнее (сильнее восстановитель) и тем слабее окислительные свойства его ионов.',
    'Li … Na (самые активные) реагируют с водой при обычных условиях с образованием щёлочи и водорода: 2Na + 2H2O = 2NaOH + H2↑. Mg реагирует с горячей водой, Al — после удаления оксидной плёнки.',
    'Металлы средней активности (Al … Pb) реагируют с водяным паром при нагревании с образованием оксида: 3Fe + 4H2O(пар) = Fe3O4 + 4H2.',
    'Металлы, стоящие левее водорода, вытесняют H2 из растворов кислот-неокислителей (HCl, разб. H2SO4): Zn + 2HCl = ZnCl2 + H2↑. Свинец с HCl и H2SO4 почти не реагирует — образуется нерастворимая плёнка PbCl2 / PbSO4.',
    'Металлы правее водорода (Cu, Hg, Ag) с HCl и разб. H2SO4 не реагируют, но растворяются в кислотах-окислителях: Cu + 4HNO3(конц.) = Cu(NO3)2 + 2NO2↑ + 2H2O. Pt и Au растворяются только в «царской водке» (HNO3 + 3HCl).',
    'Азотная кислота любой концентрации и концентрированная серная кислота при взаимодействии с металлами водород не выделяют. Al, Fe, Cr пассивируются холодными концентрированными HNO3 и H2SO4.',
    'Каждый металл вытесняет из растворов солей металлы, стоящие в ряду правее него: Fe + CuSO4 = FeSO4 + Cu. Исключение — Li … Na: в растворе они в первую очередь реагируют с водой.',
  ];

  // мини-проверка «вытеснит ли»
  const metals = METAL_SERIES.filter(m => m[0] !== 'H2');
  const mA = select('Металл', metals.map(m => [m[0], m[0]]), 'Fe');
  const mB = select('Соль металла (в растворе)', metals.map(m => [m[0], `соль ${m[0]}`]), 'Cu');
  const ans = h('div', { class: 'ct-result' });
  function check() {
    const a = METAL_SERIES.findIndex(m => m[0] === mA.input.value);
    const b = METAL_SERIES.findIndex(m => m[0] === mB.input.value);
    const A = mA.input.value, B = mB.input.value;
    let html;
    if (a === b) html = 'Выберите разные металлы.';
    else if (a <= 4) html = `<b>${A}</b> слишком активен: в растворе он реагирует прежде всего с водой (образуются щёлочь и H₂), а металл ${B} не вытесняется.`;
    else if (a < b) html = `<span class="ct-ok">Да.</span> ${A} стоит левее ${B} (E° ${fix(METAL_SERIES[a][2], 2)} В &lt; ${fix(METAL_SERIES[b][2], 2)} В) и вытесняет его из раствора соли.`;
    else html = `<span class="ct-bad">Нет.</span> ${A} стоит правее ${B} (E° ${fix(METAL_SERIES[a][2], 2)} В &gt; ${fix(METAL_SERIES[b][2], 2)} В), реакция не идёт.`;
    ans.innerHTML = html;
  }
  liveInputs([mA.input, mB.input], check);

  // неметаллы
  const NONMETALS = ['F', 'O', 'Cl', 'N', 'Br', 'I', 'S', 'C', 'Se', 'H', 'P', 'As', 'B', 'Si'].map(bySymbol).sort((a, b) => b.en - a.en);
  const nmSeries = h('div', { class: 'ct-series ct-series-nm' }, NONMETALS.map(e => h('div', { class: 'ct-series-item ct-cat-' + e.category },
    h('span', { class: 'ct-series-sym' }, e.symbol), h('span', { class: 'ct-series-e' }, fix(e.en, 2)))));

  panel.append(
    card('Электрохимический ряд напряжений металлов',
      h('p', { class: 'muted ct-small' }, 'Стандартные электродные потенциалы E° (В) при 25 °C. Активность металлов уменьшается слева направо →'),
      h('div', { class: 'ct-scroll' }, chips),
      h('div', { class: 'ct-legend' },
        h('span', { class: 'ct-legend-item' }, h('span', { class: 'ct-swatch ct-zone-a' }), 'реагируют с водой'),
        h('span', { class: 'ct-legend-item' }, h('span', { class: 'ct-swatch ct-zone-b' }), 'вытесняют H₂ из кислот'),
        h('span', { class: 'ct-legend-item' }, h('span', { class: 'ct-swatch ct-zone-c' }), 'не вытесняют H₂ из кислот')),
      h('ul', { class: 'ct-tips' }, tips.map(t => h('li', { html: chemHTML(t) })))),
    card('Вытеснит ли металл другой металл из раствора соли?', h('div', { class: 'ct-form' }, mA.wrap, mB.wrap), ans),
    card('Ряд электроотрицательности неметаллов',
      h('p', { class: 'muted ct-small' }, 'По шкале Полинга, от самого электроотрицательного. Неметаллические (окислительные) свойства ослабевают слева направо →'),
      h('div', { class: 'ct-scroll' }, nmSeries),
      h('p', { class: 'muted ct-small', html: 'В школьных учебниках часто приводят ряд F &gt; O &gt; N &gt; Cl &gt; Br &gt; I &gt; S &gt; C &gt; H &gt; P &gt; Si: по шкале Олреда–Рохова азот электроотрицательнее хлора, по Полингу — наоборот (3,04 и 3,16).' })));
}

/* ------------------------------------------------------------------ 9. Тренажёр */

const QUIZ_Z = [...Array.from({ length: 38 }, (_, i) => i + 1), 47, 50, 53, 54, 55, 56, 78, 79, 80, 82, 92];
const BEST_KEY = 'ct-quiz-best-streak';

function loadBest() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } }
function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* недоступно */ } }

function optionsFrom(correct, pool, n = 4) {
  const others = shuffle(pool.filter(x => x !== correct)).slice(0, n - 1);
  return shuffle([correct, ...others]);
}

function genQuestion(topic) {
  const els = QUIZ_Z.map(byZ);
  const kinds = topic === 'elements' ? ['sym2name', 'name2sym', 'z2el', 'period', 'group']
    : topic === 'ox' ? ['ox']
    : topic === 'sol' ? ['sol']
    : ['sym2name', 'name2sym', 'z2el', 'period', 'group', 'ox', 'sol', 'sol'];
  const kind = pick(kinds);
  const el = pick(els);
  if (kind === 'sym2name') {
    return { q: `Какой элемент обозначается символом <b>${el.symbol}</b>?`, options: optionsFrom(el.name, els.map(e => e.name)), answer: el.name, explain: `${el.symbol} — ${el.name} (${el.latin}), № ${el.z}.` };
  }
  if (kind === 'name2sym') {
    return { q: `Какой символ у элемента <b>${el.name}</b>?`, options: optionsFrom(el.symbol, els.map(e => e.symbol)), answer: el.symbol, explain: `${el.name} — ${el.symbol} (${el.latin}).` };
  }
  if (kind === 'z2el') {
    return { q: `Какой элемент имеет порядковый номер <b>${el.z}</b>?`, options: optionsFrom(`${el.symbol} — ${el.name}`, els.map(e => `${e.symbol} — ${e.name}`)), answer: `${el.symbol} — ${el.name}`, explain: `Z = ${el.z}: ${el.name}, ${el.period}-й период.` };
  }
  if (kind === 'period') {
    const ans = `${el.period}`;
    const opts = shuffle([ans, ...shuffle(['1', '2', '3', '4', '5', '6', '7'].filter(x => x !== ans)).slice(0, 3)]);
    return { q: `В каком периоде находится <b>${el.name} (${el.symbol})</b>?`, options: opts, answer: ans, explain: `${el.symbol}: ${el.period}-й период, электронов на уровнях — ${shells(el).join(', ')}.` };
  }
  if (kind === 'group') {
    const e2 = el.group === null ? bySymbol('Fe') : el;
    const lab = g => {
      const fake = { group: g };
      return `${shortGroup(fake)} (${g})`;
    };
    const ans = lab(e2.group);
    const pool = Array.from({ length: 18 }, (_, i) => lab(i + 1)).filter(x => x !== ans);
    return { q: `В какой группе находится <b>${e2.name} (${e2.symbol})</b>?`, options: shuffle([ans, ...shuffle(pool).slice(0, 3)]), answer: ans, explain: `${e2.symbol}: группа ${ans}, ${e2.period}-й период.` };
  }
  if (kind === 'ox') {
    const cands = els.filter(e => e.ox.length);
    const e = pick(cands);
    const correct = pick(e.ox);
    const wrongPool = [-4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8].filter(v => !e.ox.includes(v) && v !== 0);
    const opts = shuffle([correct, ...shuffle(wrongPool).slice(0, 3)]).map(signed);
    return { q: `Какую степень окисления может проявлять <b>${e.name} (${e.symbol})</b> в соединениях?`, options: opts, answer: signed(correct), explain: `Характерные степени окисления ${e.symbol}: ${e.ox.map(signed).join(', ')}.` };
  }
  // растворимость
  for (;;) {
    const an = pick(ANIONS), j = rand(CATIONS.length), code = an.row[j];
    if (code === '.') continue;
    const comp = compound(CATIONS[j], an);
    if (!comp || comp.formula === 'H2O') continue;
    const opts = ['растворимо', 'малорастворимо', 'нерастворимо', 'не существует или разлагается водой'];
    return { q: `Растворимо ли в воде вещество <b>${chemHTML(comp.formula)}</b> (${comp.name})?`, options: opts, answer: SOL_TEXT[code], explain: `${chemHTML(comp.formula)}: ${SOL_TEXT[code]} (по таблице растворимости).`, fixedOrder: true, html: true };
  }
}

function renderQuiz(panel) {
  let score = 0, total = 0, streak = 0, best = loadBest();
  let topic = 'all';
  let cur = null, answered = false;
  const topicSel = select('Тема', [['all', 'всё вперемешку'], ['elements', 'элементы: символы, номера, положение'], ['ox', 'степени окисления'], ['sol', 'растворимость']], 'all');
  const stats = h('div', { class: 'ct-quiz-stats' });
  const qEl = h('div', { class: 'ct-quiz-q' });
  const opts = h('div', { class: 'ct-quiz-opts' });
  const fb = h('div', { class: 'ct-quiz-fb', 'aria-live': 'polite' });
  const next = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => ask() }, 'Следующий вопрос →');

  function renderStats() {
    stats.innerHTML = '';
    stats.append(
      h('span', { class: 'ct-stat' }, 'Верно: ', h('b', null, `${score} из ${total}`)),
      h('span', { class: 'ct-stat' }, 'Серия: ', h('b', null, String(streak))),
      h('span', { class: 'ct-stat' }, 'Рекорд серии: ', h('b', null, String(best))));
  }
  function ask() {
    cur = genQuestion(topic);
    answered = false;
    qEl.innerHTML = cur.q;
    fb.innerHTML = '';
    opts.innerHTML = '';
    next.hidden = true;
    cur.options.forEach((o, i) => opts.append(h('button', {
      type: 'button', class: 'btn ct-quiz-opt', 'data-v': o,
      onclick: e => choose(o, e.currentTarget),
    }, h('span', { class: 'ct-quiz-key' }, String(i + 1)), h('span', { html: cur.html ? escapeHTML(o) : chemHTML(o) }))));
  }
  function choose(o, btn) {
    if (answered) return;
    answered = true;
    total++;
    const ok = o === cur.answer;
    if (ok) { score++; streak++; if (streak > best) { best = streak; saveBest(best); } } else streak = 0;
    for (const b of opts.children) {
      b.disabled = true;
      if (b.dataset.v === cur.answer) b.classList.add('is-correct');
    }
    if (!ok) btn.classList.add('is-wrong');
    fb.innerHTML = `<b class="${ok ? 'ct-ok' : 'ct-bad'}">${ok ? 'Верно!' : 'Неверно.'}</b> ${cur.explain}`;
    next.hidden = false;
    next.focus({ preventScroll: true });
    renderStats();
  }
  topicSel.input.addEventListener('change', () => { topic = topicSel.input.value; ask(); });
  const root = card('Тренажёр', h('div', { class: 'ct-toolbar' }, topicSel.wrap, stats), qEl, opts, fb, h('div', { class: 'ct-quiz-next' }, next));
  root.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT') return;
    const k = +e.key;
    if (k >= 1 && k <= 4 && !answered) { const b = opts.children[k - 1]; if (b) b.click(); }
    else if (e.key === 'Enter' && answered && e.target !== next) { ask(); }
  });
  root.tabIndex = -1;
  panel.append(root, h('p', { class: 'muted ct-small' }, 'Подсказка: отвечать можно клавишами 1–4, следующий вопрос — Enter.'));
  renderStats();
  ask();
}
