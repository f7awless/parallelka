// Автоформатирование химических формул в обычном тексте.
import { bySymbol } from './elements.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Экранирует HTML-спецсимволы. */
export function escapeHTML(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => ESC[c]);
}

/** Проверяет, что строка — корректная формула (символы элементов, индексы, сбалансированные скобки). */
function isFormulaBody(s) {
  if (!/[A-Z]/.test(s)) return false;
  const stack = [];
  let i = 0;
  let prevUnit = false; // перед цифрой должен стоять символ или закрывающая скобка
  while (i < s.length) {
    const c = s[i];
    if (c === '(' || c === '[') { stack.push(c === '(' ? ')' : ']'); prevUnit = false; i++; continue; }
    if (c === ')' || c === ']') {
      if (stack.pop() !== c) return false;
      if (s[i - 1] === '(' || s[i - 1] === '[') return false;
      prevUnit = true; i++; continue;
    }
    if (/[0-9]/.test(c)) {
      if (!prevUnit) return false;
      while (i < s.length && /[0-9]/.test(s[i])) i++;
      prevUnit = false;
      continue;
    }
    if (/[A-Z]/.test(c)) {
      let sym = c;
      if (/[a-z]/.test(s[i + 1] || '')) sym = c + s[i + 1];
      if (!bySymbol(sym)) return false;
      i += sym.length;
      prevUnit = true;
      continue;
    }
    return false;
  }
  return stack.length === 0;
}

function renderBody(s) {
  // цифры после символа элемента или «)»/«]» — нижний индекс
  return s.replace(/([A-Za-z)\]])(\d+)/g, '$1<sub>$2</sub>');
}

/** Пытается отформатировать «слово» из латиницы, цифр и скобок. Возвращает null, если это не формула. */
function formatToken(tok) {
  const m = tok.match(/^(\d*)(.+)$/);
  const coef = m[1];
  const body = m[2];
  if (!/\d/.test(body)) return null; // без индексов менять нечего
  if (!isFormulaBody(body)) return null;
  return coef + renderBody(body);
}

const TOKEN_RE = /[A-Za-z0-9()\[\]]+/g;
const LETTER_AROUND = /[A-Za-zА-Яа-яЁё_]/;

function formatTokens(text) {
  return text.replace(TOKEN_RE, (tok, offset, whole) => {
    const before = whole[offset - 1] || '';
    const after = whole[offset + tok.length] || '';
    if (LETTER_AROUND.test(before) && /[A-Za-z0-9]/.test(tok[0])) return tok;
    if (LETTER_AROUND.test(after) && /[A-Za-z0-9]/.test(tok[tok.length - 1])) return tok;
    if (before === '&' || before === '#') return tok; // HTML-сущности
    if (!/[A-Z]/.test(tok) || !/\d/.test(tok)) return tok;
    let res = formatToken(tok);
    if (res !== null) return res;
    // обозначение величины: M(H2SO4), n(CO2), V(NH3)
    const q = tok.match(/^([A-Za-z]{1,3})\((.+)\)$/);
    if (q) {
      res = formatToken(q[2]);
      if (res !== null) return `${q[1]}(${res})`;
    }
    // скобки «прозы» вокруг формулы: (H2SO4  или  H2SO4)
    const mm = tok.match(/^([()\[\]]*)(.*?)([()\[\]]*)$/);
    for (let a = 0; a <= mm[1].length; a++) {
      for (let b = 0; b <= mm[3].length; b++) {
        const core = tok.slice(a, tok.length - b);
        if (!core || core === tok) continue;
        res = formatToken(core);
        if (res !== null) return tok.slice(0, a) + res + tok.slice(tok.length - b);
      }
    }
    return tok;
  });
}

/**
 * HTML-экранирует текст и оформляет химические формулы:
 * H2SO4 → H<sub>2</sub>SO<sub>4</sub>, SO4^2- → SO<sub>4</sub><sup>2−</sup>,
 * -> и => → «→», <-> и <=> → «⇄». Обычный текст и числа не изменяются.
 */
export function chemHTML(text) {
  let s = escapeHTML(text);
  // стрелки (после экранирования)
  s = s.replace(/&lt;-&gt;|&lt;=&gt;/g, '⇄');
  s = s.replace(/-&gt;|=&gt;/g, '→');
  // заряды и степени: ^2-, ^+, ^3+, ^{2-}, ^-2, 10^23
  const SUP_MARK = '\u0001';
  const sups = [];
  s = s.replace(/\^\{?([+-]\d+|\d*[+-]|\d+)\}?/g, (_, v) => {
    sups.push(v.replace(/-/g, '−'));
    return SUP_MARK + (sups.length - 1) + SUP_MARK;
  });
  // формулы (маркеры заряда содержат цифры, поэтому отделены управляющими символами)
  s = s.split(new RegExp(`(${SUP_MARK}\\d+${SUP_MARK})`)).map(part =>
    part.startsWith(SUP_MARK) ? part : formatTokens(part)).join('');
  s = s.replace(new RegExp(`${SUP_MARK}(\\d+)${SUP_MARK}`, 'g'), (_, i) => `<sup>${sups[+i]}</sup>`);
  return s;
}
