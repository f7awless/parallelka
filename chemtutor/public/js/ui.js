// UI toolkit: DOM builder, icons, modal/toast, formatting, markdown, charts.
import { chemHTML, escapeHTML } from './chem/format.js';
export { chemHTML, escapeHTML };

// Let views pass optional children (cond ? node : null) and arrays straight to append/prepend.
for (const m of ['append', 'prepend']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...nodes) { return orig.apply(this, nodes.flat(Infinity).filter(n => n != null && n !== false)); };
}

/** h('div.card#id', {onclick, class, style}, ...children) */
export function h(sel, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) { children.unshift(attrs); attrs = {}; }
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m?.[1] || 'div');
  for (const part of (m?.[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled') el[k] = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
/** Element with chemistry-formatted inner HTML. */
export const chem = (sel, text, attrs = {}) => h(sel, { ...attrs, html: chemHTML(text ?? '') });
export const clear = el => { el.replaceChildren(); return el; };

// ---------- icons (24x24 stroke) ----------
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  clipboard: 'M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2M9 12l2 2 4-4',
  flask: 'M9 3h6M10 3v6.5L4.6 18.4A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.4-2.6L14 9.5V3M7.5 15h9',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  cards: 'M2 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM7 5V4a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3',
  db: 'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4 3 9 3s9-1.34 9-3',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1',
  plus: 'M12 5v14M5 12h14',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.35-4.35',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 12h18M3 6h18M3 18h18',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  chevL: 'M15 18l-6-6 6-6', chevU: 'M18 15l-6-6-6 6', chevR: 'M9 18l6-6-6-6', chevD: 'M6 9l6 6 6-6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  copy: 'M9 9h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  clip: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  video: 'M23 7l-7 5 7 5zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  fire: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  timer: 'M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16',
  alert: 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0M12 9v4M12 17h.01',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  award: 'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14M8.21 13.89 7 23l5-3 5 3-1.21-9.12',
  repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  dumbbell: 'M6.5 6.5h11M6.5 17.5h11M3 9v6M21 9v6M6 5v14M18 5v14',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2',
  pin: 'M12 17v5M9 10.76V6h6v4.76l2 3.24H7z M8 2h8',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('class', cls ? `ic ${cls}` : 'ic');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', P[name] || P.more); s.append(p);
  return s;
}

// ---------- formatting ----------
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const DOW_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const pad = n => String(n).padStart(2, '0');
/** Local 'YYYY-MM-DDTHH:MM' string from Date */
export const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const today = () => localISO().slice(0, 10);
/** Parse local 'YYYY-MM-DD[THH:MM]' or SQL UTC 'YYYY-MM-DD HH:MM:SS' */
export function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return new Date(s.replace(' ', 'T') + 'Z');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) { const [d, t] = s.split('T'); const [y, mo, da] = d.split('-').map(Number); const [hh, mm] = t.split(':').map(Number); return new Date(y, mo - 1, da, hh, mm); }
  return new Date(s);
}
export function fmtDate(s, { year = false, dow = false } = {}) {
  const d = parseDate(s); if (!d) return '';
  const showYear = year || d.getFullYear() !== new Date().getFullYear();
  return `${dow ? DOW_FULL[d.getDay()] + ', ' : ''}${d.getDate()} ${MONTHS[d.getMonth()]}${showYear ? ' ' + d.getFullYear() : ''}`;
}
export const fmtTime = s => { const d = parseDate(s); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; };
export const fmtDateTime = s => `${fmtDate(s)}, ${fmtTime(s)}`;
export function fmtRelDay(s) {
  const d = parseDate(s); if (!d) return '';
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const diff = Math.round((b - a) / 864e5);
  if (diff === 0) return 'Сегодня'; if (diff === 1) return 'Завтра'; if (diff === -1) return 'Вчера';
  if (diff > 1 && diff < 7) return DOW_FULL[d.getDay()][0].toUpperCase() + DOW_FULL[d.getDay()].slice(1);
  return fmtDate(s);
}
export function timeAgo(s) {
  const d = parseDate(s); if (!d) return '';
  const sec = (Date.now() - d) / 1000;
  if (sec < 60) return 'только что';
  if (sec < 3600) return `${Math.floor(sec / 60)} мин назад`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ч назад`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} дн назад`;
  return fmtDate(s);
}
export function untilText(s) {
  const d = parseDate(s); if (!d) return '';
  const min = Math.round((d - Date.now()) / 60000);
  if (min < 0) { const m = -min; return m < 60 ? `просрочено на ${m} мин` : m < 1440 ? `просрочено на ${Math.floor(m / 60)} ч` : `просрочено на ${Math.floor(m / 1440)} дн`; }
  if (min < 60) return `через ${min} мин`;
  if (min < 1440) return `через ${Math.floor(min / 60)} ч`;
  return `через ${Math.floor(min / 1440)} ${plural(Math.floor(min / 1440), 'день', 'дня', 'дней')}`;
}
export const money = n => `${Math.round(n || 0).toLocaleString('ru-RU')} ₽`;
export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many;
};
export const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
export const fileSize = n => n < 1024 ? `${n} Б` : n < 1048576 ? `${(n / 1024).toFixed(0)} КБ` : `${(n / 1048576).toFixed(1)} МБ`;
export const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
export const avatar = (u, size = '') => h(`div.avatar${size ? '.' + size : ''}`, { style: { background: u?.color || '#64748b' }, title: u?.name }, initials(u?.name));
export const scoreClass = p => p == null ? '' : p >= 85 ? 'badge-success' : p >= 60 ? 'badge-warning' : 'badge-danger';

export const STATUS = {
  planned: ['Запланировано', 'badge-info'], done: ['Проведено', 'badge-success'], canceled: ['Отменено', ''], missed: ['Пропуск', 'badge-danger'],
};
export const T_STATUS = {
  assigned: ['Не начато', 'badge-info'], started: ['В процессе', 'badge-warning'], submitted: ['На проверке', 'badge-primary'],
  graded: ['Проверено', 'badge-success'], returned: ['На доработке', 'badge-danger'],
};
export const badge = (text, cls = '') => h(`span.badge${cls ? '.' + cls.split(' ').join('.') : ''}`, text);

// ---------- toast / modal ----------
let toastBox;
export function toast(msg, type = '') {
  toastBox ||= document.body.appendChild(h('div.toasts'));
  const t = h(`div.toast${type ? '.' + type : ''}`, msg);
  toastBox.append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, type === 'error' ? 4500 : 2600);
}

/** modal({title, body, foot, wide}) → {el, close}. `foot` may be a function(close) returning nodes. */
export function modal({ title, body, foot, wide = false, onClose }) {
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); onClose?.(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const box = h(`div.modal${wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true' },
    h('div.modal-head', h('h2', title), h('button.btn.btn-ghost.btn-icon.btn-sm', { onclick: close, 'aria-label': 'Закрыть' }, icon('x'))),
    h('div.modal-body', typeof body === 'function' ? body(close) : body),
    foot ? h('div.modal-foot', typeof foot === 'function' ? foot(close) : foot) : null);
  const back = h('div.modal-back', { onmousedown: e => { if (e.target === back) close(); } }, box);
  document.body.append(back);
  document.addEventListener('keydown', esc);
  setTimeout(() => box.querySelector('input:not([type=checkbox]):not([type=radio]), textarea, select')?.focus(), 30);
  return { el: box, close };
}

export function confirmDialog(text, { ok = 'Удалить', danger = true, title = 'Подтверждение' } = {}) {
  return new Promise(resolve => {
    let done = false;
    const m = modal({ title, body: h('p', text), onClose: () => { if (!done) resolve(false); },
      foot: close => [h('button.btn', { onclick: close }, 'Отмена'),
        h(`button.btn${danger ? '.btn-danger' : '.btn-primary'}`, { onclick: () => { done = true; close(); resolve(true); } }, ok)] });
    m.el.querySelector('.modal-foot .btn:last-child').focus();
  });
}

export function promptDialog(title, { label = '', value = '', placeholder = '', ok = 'Сохранить', textarea = false } = {}) {
  return new Promise(resolve => {
    let done = false;
    const inp = textarea ? h('textarea.input', { placeholder }, value) : h('input.input', { value, placeholder });
    const submit = close => { done = true; close(); resolve(inp.value); };
    const m = modal({ title, body: h('label.field', label ? h('span', label) : null, inp), onClose: () => { if (!done) resolve(null); },
      foot: close => [h('button.btn', { onclick: close }, 'Отмена'), h('button.btn.btn-primary', { onclick: () => submit(close) }, ok)] });
    if (!textarea) inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(m.close); });
  });
}

export function lightbox(src) {
  const b = h('div.lightbox', { onclick: () => b.remove() }, h('img', { src }));
  document.body.append(b);
}

export async function copyText(text, msg = 'Скопировано') {
  try { await navigator.clipboard.writeText(text); toast(msg, 'success'); }
  catch { promptDialog('Скопируйте вручную', { value: text, ok: 'Готово' }); }
}
export const copyBox = (text, label = 'Копировать') => h('div.copy-box', h('span', text),
  h('button.btn.btn-sm', { onclick: () => copyText(text) }, icon('copy'), label));

// ---------- forms ----------
/** field('Имя', inputEl, 'hint') */
export const field = (label, input, hint) => h('label.field', h('span', label), input, hint ? h('div.hint', hint) : null);
export function select(options, value, attrs = {}) {
  return h('select.input', attrs, options.map(o => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return h('option', { value: v, selected: String(v) === String(value ?? '') }, t);
  }));
}
/** Collect values of named inputs inside root into an object. */
export function formData(root) {
  const out = {};
  for (const el of root.querySelectorAll('[name]')) {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}
export function busy(btn, promise) {
  btn.disabled = true;
  return Promise.resolve(promise).finally(() => { btn.disabled = false; });
}

/** Read File → {name, mime, data(base64)} */
export function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mime: file.type || 'application/octet-stream', data: String(r.result).split(',')[1] });
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
/** Downscale big photos before upload (homework photos from phones are huge). */
export async function shrinkImage(file, max = 1800) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

export const fileUrl = id => `/api/files/${id}`;
export function fileChip(f, { onRemove } = {}) {
  const isImg = /^image\//.test(f.mime || '');
  if (isImg && !onRemove) return h('img.file-thumb', { src: fileUrl(f.id), alt: f.name, onclick: () => lightbox(fileUrl(f.id)) });
  return h('span.file-chip', icon('file'), h('a', { href: fileUrl(f.id), target: '_blank' }, h('span', f.name)),
    f.size ? h('span.muted.tiny', fileSize(f.size)) : null,
    onRemove ? h('button.btn.btn-ghost.btn-icon.btn-sm', { onclick: onRemove, type: 'button' }, icon('x')) : null);
}

export const empty = (emoji, title, text, action) => h('div.empty', h('div.emoji', emoji), h('h3', title), text ? h('p', text) : null, action || null);
export const spinner = () => h('div.spinner');

// ---------- markdown (safe subset) ----------
export function markdown(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let html = '', i = 0;
  const inline = s => {
    // code spans and link/image URLs are pulled out first so chemHTML never touches them
    const codes = [], urls = [];
    const keepUrl = u => { urls.push(u); return `\uE000${String.fromCharCode(0xE100 + urls.length - 1)}\uE000`; };
    const url = c => escapeHTML(urls[c.charCodeAt(0) - 0xE100]);
    const raw = c => urls[c.charCodeAt(0) - 0xE100];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; })
      .replace(/(!?\[[^\]]*\])\(([^)\s]+)\)/g, (_, label, u) => `${label}(${keepUrl(u)})`);
    s = chemHTML(s)
      .replace(/!\[([^\]]*)\]\(\uE000(.)\uE000\)/g, (_, a, n) => /^(https?:|\/api\/files\/)/.test(raw(n)) ? `<img src="${url(n)}" alt="${a}">` : '')
      .replace(/\[([^\]]+)\]\(\uE000(.)\uE000\)/g, (_, t, n) => /^(https?:|mailto:|#|\/)/.test(raw(n)) ? `<a href="${url(n)}" target="_blank" rel="noopener">${t}</a>` : t)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${escapeHTML(codes[n])}</code>`);
  };
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; html += `<pre><code>${escapeHTML(buf.join('\n'))}</code></pre>`; continue;
    }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; i++; continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { html += '<hr>'; i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] || '') && (lines[i + 1] || '').includes('-')) {
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      let t = '<table><thead><tr>' + cells(l).map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { t += '<tr>' + cells(lines[i]).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>'; i++; }
      html += t + '</tbody></table>'; continue;
    }
    if (/^\s*[-*]\s+/.test(l)) {
      html += '<ul>';
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) html += `<li>${inline(lines[i++].replace(/^\s*[-*]\s+/, ''))}</li>`;
      html += '</ul>'; continue;
    }
    if (/^\s*\d+[.)]\s+/.test(l)) {
      html += '<ol>';
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) html += `<li>${inline(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))}</li>`;
      html += '</ol>'; continue;
    }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(inline(lines[i++].replace(/^>\s?/, '')));
      html += `<blockquote>${buf.join('<br>')}</blockquote>`; continue;
    }
    if (!l.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*[-*]\s|\s*\d+[.)]\s|\s*\|)/.test(lines[i])) buf.push(inline(lines[i++]));
    if (!buf.length) buf.push(inline(lines[i++]));
    html += `<p>${buf.join('<br>')}</p>`;
  }
  return html;
}

// ---------- charts (inline SVG) ----------
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
// max of the axis such that each of the 4 gridline steps is a round number
const niceMax = v => {
  if (v <= 0) return 4;
  const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p * 4;
};
/** Re-render an SVG chart at the container's real pixel width so text keeps its size. */
function responsive(build) {
  const host = h('div');
  let last = 0;
  const draw = w => { last = w; host.replaceChildren(build(w)); };
  draw(600);
  if ('ResizeObserver' in window) new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w > 50 && Math.abs(w - last) > 4) draw(w); }).observe(host);
  return host;
}
const short = n => Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + 'м' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'к' : String(Math.round(n * 10) / 10);

/** Bar chart: data [{label, value, color?}] */
export const barChart = (data, opts) => responsive(W => barChartAt(W, data, opts));
function barChartAt(W, data, { height = 200, format = short, color = 'var(--primary)' } = {}) {
  const H = height, padL = 36, padB = 24, padT = 10;
  const max = niceMax(Math.max(...data.map(d => d.value), 0));
  const wrap = h('div.chart.rel');
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  for (let k = 0; k <= 4; k++) {
    const y = padT + (H - padB - padT) * (1 - k / 4);
    s.append(svg('line', { x1: padL, x2: W, y1: y, y2: y, class: 'gridline' }));
    const t = svg('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end' }); t.textContent = format(max * k / 4); s.append(t);
  }
  const bw = (W - padL) / Math.max(data.length, 1);
  const tip = h('div.tip.hidden'); wrap.append(tip);
  data.forEach((d, i) => {
    const bh = (H - padB - padT) * (d.value / max);
    const x = padL + i * bw + bw * 0.18, y = H - padB - bh;
    const r = svg('rect', { x, y, width: bw * 0.64, height: Math.max(bh, d.value ? 2 : 0), rx: 4, fill: d.color || color });
    r.addEventListener('mouseenter', () => { tip.textContent = `${d.label}: ${d.tip ?? format(d.value)}`; tip.classList.remove('hidden');
      tip.style.left = `${(x + bw * 0.32) / W * 100}%`; tip.style.top = `${y / H * 100}%`; });
    r.addEventListener('mouseleave', () => tip.classList.add('hidden'));
    s.append(r);
    if (bw > 26 || i % Math.ceil(26 / bw) === 0) { const t = svg('text', { x: x + bw * 0.32, y: H - 6, 'text-anchor': 'middle' }); t.textContent = d.label; s.append(t); }
  });
  wrap.append(s);
  return wrap;
}

/** Line chart: series [{name, color, points:[{x:label, y}]}] */
export const lineChart = (series, opts) => responsive(W => lineChartAt(W, series, opts));
function lineChartAt(W, series, { height = 200, max: fixedMax, format = short, area = true } = {}) {
  const H = height, padL = 36, padB = 24, padT = 12, padR = 12;
  const pts = series.flatMap(s => s.points);
  const labels = series[0]?.points.map(p => p.x) || [];
  const max = fixedMax ?? niceMax(Math.max(...pts.map(p => p.y), 0));
  const wrap = h('div.chart.rel');
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}` });
  for (let k = 0; k <= 4; k++) {
    const y = padT + (H - padB - padT) * (1 - k / 4);
    s.append(svg('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: 'gridline' }));
    const t = svg('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end' }); t.textContent = format(max * k / 4); s.append(t);
  }
  const n = Math.max(labels.length - 1, 1);
  const X = i => padL + (W - padL - padR) * (labels.length === 1 ? 0.5 : i / n);
  const Y = v => padT + (H - padB - padT) * (1 - v / max);
  const step = Math.ceil(labels.length / 8);
  labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) { const t = svg('text', { x: X(i), y: H - 6, 'text-anchor': 'middle' }); t.textContent = l; s.append(t); } });
  const tip = h('div.tip.hidden'); wrap.append(tip);
  series.forEach(se => {
    const d = se.points.map((p, i) => `${i ? 'L' : 'M'}${X(i)},${Y(p.y)}`).join(' ');
    if (area && se.points.length > 1) s.append(svg('path', { d: `${d} L${X(se.points.length - 1)},${Y(0)} L${X(0)},${Y(0)} Z`, fill: se.color, opacity: 0.1 }));
    s.append(svg('path', { d, fill: 'none', stroke: se.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    se.points.forEach((p, i) => {
      const c = svg('circle', { cx: X(i), cy: Y(p.y), r: 4, fill: 'var(--surface)', stroke: se.color, 'stroke-width': 2 });
      c.addEventListener('mouseenter', () => { tip.textContent = `${p.label || p.x}: ${format(p.y)}${p.suffix || ''}`; tip.classList.remove('hidden');
        tip.style.left = `${X(i) / W * 100}%`; tip.style.top = `${Y(p.y) / H * 100}%`; });
      c.addEventListener('mouseleave', () => tip.classList.add('hidden'));
      s.append(c);
    });
  });
  wrap.append(s);
  return wrap;
}

/** Radar chart for skills: items [{label, value 0..max}] */
export function radarChart(items, { max = 5, size = 380 } = {}) {
  const c = size / 2, R = c - 95, n = items.length;
  const s = svg('svg', { viewBox: `0 0 ${size} ${size}` });
  const pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v]; };
  for (let k = 1; k <= max; k++) s.append(svg('polygon', { points: items.map((_, i) => pt(i, k / max).join(',')).join(' '), fill: 'none', class: 'gridline' }));
  items.forEach((it, i) => {
    const [x, y] = pt(i, 1); s.append(svg('line', { x1: c, y1: c, x2: x, y2: y, class: 'axis' }));
    const [lx, ly] = pt(i, 1.13);
    const t = svg('text', { x: lx, y: ly + 4, 'text-anchor': Math.abs(lx - c) < 8 ? 'middle' : lx > c ? 'start' : 'end' });
    t.textContent = it.label.length > 18 ? it.label.slice(0, 17) + '…' : it.label; s.append(t);
  });
  s.append(svg('polygon', { points: items.map((it, i) => pt(i, it.value / max).join(',')).join(' '), fill: 'var(--primary)', 'fill-opacity': 0.22, stroke: 'var(--primary)', 'stroke-width': 2 }));
  return h('div.chart', { style: { maxWidth: '400px', margin: '0 auto' } }, s);
}

/** Donut: parts [{value, color, label}] */
export function donut(parts, { size = 130, label = '', sub = '' } = {}) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = 50, C = 2 * Math.PI * r;
  const s = svg('svg', { viewBox: '0 0 120 120', width: size, height: size });
  s.append(svg('circle', { cx: 60, cy: 60, r, fill: 'none', stroke: 'var(--surface-2)', 'stroke-width': 14 }));
  let off = 0;
  for (const p of parts) {
    const len = C * p.value / total;
    s.append(svg('circle', { cx: 60, cy: 60, r, fill: 'none', stroke: p.color, 'stroke-width': 14, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 60 60)' }));
    off += len;
  }
  const t = svg('text', { x: 60, y: sub ? 60 : 66, 'text-anchor': 'middle', style: 'font-size:20px;font-weight:700;fill:var(--text)' }); t.textContent = label; s.append(t);
  if (sub) { const t2 = svg('text', { x: 60, y: 78, 'text-anchor': 'middle' }); t2.textContent = sub; s.append(t2); }
  return h('div.chart', { style: { width: size + 'px' } }, s);
}

/** GitHub-style activity heatmap: days [{day:'YYYY-MM-DD', xp}] */
export function heatmap(days, weeks = 17) {
  const map = Object.fromEntries(days.map(d => [d.day, d.xp]));
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end); start.setDate(end.getDate() - (weeks * 7 - 1) - ((end.getDay() + 6) % 7 === 6 ? 0 : 0));
  // align to Monday
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const grid = h('div.heat');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const k = localISO(d).slice(0, 10), v = map[k] || 0;
    const l = v === 0 ? '' : v < 10 ? 'l1' : v < 25 ? 'l2' : v < 50 ? 'l3' : 'l4';
    grid.append(h(`div${l ? '.' + l : ''}`, { title: `${fmtDate(k)}: ${v} XP` }));
  }
  return grid;
}

export function skillDots(level, onSet) {
  const box = h('div.dots');
  for (let i = 1; i <= 5; i++) {
    const on = i <= level;
    box.append(onSet
      ? h(`button${on ? '.on.l' + level : ''}`, { title: `Уровень ${i}`, type: 'button', onclick: () => onSet(i === level ? i - 1 : i) })
      : h(`span${on ? '.on.l' + level : ''}`));
  }
  return box;
}

export function debounce(fn, ms = 300) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
