// Shared question widgets: rendering for solving / reviewing, and the editor used by the teacher.
import { h, icon, chem, clear, select, field, fileChip, fileUrl, toast, lightbox, chemHTML } from '../ui.js';
import { uploadFile, pickFiles } from '../api.js';

export const KINDS = {
  single: 'Один ответ', multi: 'Несколько ответов', number: 'Число', text: 'Короткий ответ', open: 'Развёрнутый ответ (проверяет преподаватель)',
};
export const KIND_SHORT = { single: 'один ответ', multi: 'неск. ответов', number: 'число', text: 'кратк. ответ', open: 'развёрнутый' };
export const DIFF = { 1: 'базовый', 2: 'средний', 3: 'сложный' };

export function answerText(q, v = q.answer) {
  if (v == null || v === '') return '—';
  switch (q.kind) {
    case 'single': return q.options?.[v] ?? String(v);
    case 'multi': return [].concat(v).map(i => q.options?.[i] ?? i).join('; ');
    case 'number': return typeof v === 'object' ? `${v.value}${v.tolerance ? ` (±${v.tolerance})` : ''}` : String(v);
    case 'text': return Array.isArray(v) ? v.join(' / ') : String(v);
    default: return String(v);
  }
}

/**
 * Render a question for answering or review.
 * opts: {index, value, files, onChange(value, files), disabled, reveal (answer & explanation present), result {correct, points}, comment}
 */
export function questionView(q, opts = {}) {
  const { index, disabled, reveal, result } = opts;
  let value = opts.value ?? (q.kind === 'multi' ? [] : '');
  let files = [...(opts.files || [])];
  const emit = () => opts.onChange?.(value, files.map(f => f.id));
  const cls = result ? (result.correct === 1 ? '.ok' : result.correct === 0 ? '.bad' : '') : '';
  const el = h(`div.q${cls}`, { id: `q-${index}` });
  el.append(h('div.q-head', h('div.q-num', index + 1), h('span.badge', KIND_SHORT[q.kind]), h('span.muted.small', `${q.points} ${q.points === 1 ? 'балл' : q.points < 5 ? 'балла' : 'баллов'}`),
    result ? h('span', { style: { marginLeft: 'auto' } }, result.points == null ? h('span.badge.badge-primary', 'ждёт проверки')
      : h(`span.badge.${result.correct === 1 ? 'badge-success' : result.points > 0 ? 'badge-warning' : 'badge-danger'}`, `${result.points} / ${q.points}`)) : null));
  const text = chem('div.q-text', q.text);
  el.append(text);
  if (q.image_id) el.append(h('img', { src: fileUrl(q.image_id), style: { maxHeight: '320px', borderRadius: '8px', marginBottom: '12px', cursor: 'zoom-in' }, onclick: () => lightbox(fileUrl(q.image_id)) }));

  if (q.kind === 'single' || q.kind === 'multi') {
    const multi = q.kind === 'multi';
    const name = `q${q.id}-${Math.random().toString(36).slice(2, 6)}`;
    const opts_ = h('div');
    const draw = () => clear(opts_).append(...q.options.map((o, i) => {
      const sel = multi ? value.includes(i) : Number(value) === i && value !== '';
      let c = sel ? '.sel' : '';
      if (reveal) {
        const right = multi ? (q.answer || []).includes(i) : Number(q.answer) === i;
        c = right ? '.right' : sel ? '.wrong' : '';
      }
      return h(`label.opt${c}`, h('input', { type: multi ? 'checkbox' : 'radio', name, checked: sel, disabled,
        onchange: () => { value = multi ? (value.includes(i) ? value.filter(x => x !== i) : [...value, i].sort()) : i; draw(); emit(); } }),
        h('span', { html: chemHTML(o) }));
    }));
    draw(); el.append(opts_);
    if (multi && !disabled) el.append(h('div.muted.tiny', 'Отметьте все верные варианты'));
  } else if (q.kind === 'number' || q.kind === 'text') {
    const inp = h('input.input', { value: value ?? '', disabled, inputmode: q.kind === 'number' ? 'decimal' : 'text', placeholder: q.kind === 'number' ? 'Число, например 12,5' : 'Ваш ответ',
      style: { maxWidth: '320px' }, oninput: e => { value = e.target.value; emit(); } });
    el.append(inp);
  } else if (q.kind === 'open') {
    const ta = h('textarea.input', { rows: 5, disabled, placeholder: 'Запишите решение. Можно приложить фото решения из тетради 📷', oninput: e => { value = e.target.value; emit(); } }, value || '');
    const fbox = h('div.row.mt-sm');
    const drawFiles = () => clear(fbox).append(...files.map(f => disabled ? fileChip(f) : fileChip(f, { onRemove: () => { files = files.filter(x => x !== f); drawFiles(); emit(); } })));
    drawFiles();
    el.append(ta, fbox);
    if (!disabled) {
      const add = async list => {
        for (const file of list) {
          try { const f = await uploadFile(file); files.push(f); drawFiles(); emit(); } catch { }
        }
      };
      const drop = h('div.drop.mt-sm', { onclick: async () => add(await pickFiles({ accept: 'image/*,.pdf,.doc,.docx', multiple: true })) },
        icon('upload'), ' Прикрепить фото или файл (можно перетащить сюда)');
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); add([...e.dataTransfer.files]); });
      el.append(drop);
    }
  }

  if (reveal && q.kind !== 'single' && q.kind !== 'multi' && q.kind !== 'open' && q.answer != null) {
    el.append(h('div.mt-sm.small', h('span.muted', 'Правильный ответ: '), h('b', { html: chemHTML(answerText(q)) })));
  }
  if (reveal && q.explanation) el.append(h('div.explain', h('b', '💡 Разбор: '), h('span', { html: chemHTML(q.explanation) })));
  if (opts.comment) el.append(h('div.explain', { style: { background: 'var(--warning-soft)' } }, h('b', '✍️ Комментарий преподавателя: '), opts.comment));
  return el;
}

/** Editor for one question. Returns element with .get() → question object */
export function questionEditor(q0, { topics, index, onRemove, onMove, onDuplicate, onSaveToBank }) {
  const q = structuredClone({ kind: 'single', text: '', options: ['', '', '', ''], answer: null, points: 1, difficulty: 1, topic: '', explanation: '', ...q0 });
  if (!Array.isArray(q.options)) q.options = [];
  const el = h('div.editor-q');
  const kindSel = select(Object.entries(KINDS), q.kind, { style: { width: 'auto', maxWidth: '230px' } });
  const text = h('textarea.input', { rows: 3, placeholder: 'Текст вопроса. Формулы пишите обычным текстом: H2SO4, Fe^3+, SO4^2- — индексы расставятся сами.' }, q.text);
  const preview = h('div.small.muted', { style: { minHeight: '18px' } });
  const updPreview = () => { preview.innerHTML = text.value ? 'Предпросмотр: ' + chemHTML(text.value.slice(0, 300)) : ''; };
  text.addEventListener('input', updPreview); updPreview();
  const points = h('input.input', { type: 'number', min: 1, max: 10, value: q.points, style: { width: '76px' } });
  const diff = select(Object.entries(DIFF), q.difficulty, { style: { width: 'auto' } });
  const topic = select([['', 'Тема —'], ...topics.map(t => [t.id, t.title])], q.topic, { style: { width: 'auto', maxWidth: '240px' } });
  const expl = h('textarea.input', { rows: 2, placeholder: 'Разбор / пояснение (ученик увидит после сдачи)' }, q.explanation || '');
  const answerBox = h('div');
  let imageId = q.image_id || null;
  const imgBox = h('div.row');
  const drawImg = () => clear(imgBox).append(imageId
    ? h('div.row', h('img.file-thumb', { src: fileUrl(imageId) }), h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: () => { imageId = null; drawImg(); } }, icon('x'), 'Убрать картинку'))
    : h('button.btn.btn-sm.btn-ghost', { type: 'button', onclick: async () => { const [f] = await pickFiles({ accept: 'image/*' }); if (f) { imageId = (await uploadFile(f)).id; drawImg(); } } }, icon('upload'), 'Картинка'));
  drawImg();

  const drawAnswer = () => {
    clear(answerBox);
    const k = kindSel.value;
    if (k === 'single' || k === 'multi') {
      if (q.options.length < 2) q.options = ['', '', '', ''];
      const multi = k === 'multi';
      if (multi && !Array.isArray(q.answer)) q.answer = q.answer != null && q.answer !== '' ? [Number(q.answer)] : [];
      if (!multi && Array.isArray(q.answer)) q.answer = q.answer[0] ?? null;
      const list = h('div.opts');
      q.options.forEach((o, i) => {
        const on = multi ? q.answer.includes(i) : Number(q.answer) === i && q.answer !== null;
        list.append(h('div.opt-row',
          h('input', { type: multi ? 'checkbox' : 'radio', name: `ans-${index}-${el.dataset.uid}`, checked: on, title: 'Верный ответ', style: { width: '18px', height: '18px', accentColor: 'var(--success)' },
            onchange: () => { if (multi) q.answer = q.answer.includes(i) ? q.answer.filter(x => x !== i) : [...q.answer, i].sort((a, b) => a - b); else q.answer = i; } }),
          h('input.input', { value: o, placeholder: `Вариант ${i + 1}`, oninput: e => { q.options[i] = e.target.value; } }),
          h('button.btn.btn-ghost.btn-icon.btn-sm', { type: 'button', title: 'Удалить вариант', onclick: () => {
            q.options.splice(i, 1);
            if (multi) q.answer = q.answer.filter(x => x !== i).map(x => x > i ? x - 1 : x);
            else if (Number(q.answer) === i) q.answer = null; else if (q.answer > i) q.answer--;
            drawAnswer();
          } }, icon('x'))));
      });
      answerBox.append(h('div.label.mb-sm', multi ? 'Варианты (отметьте все верные)' : 'Варианты (отметьте верный)'), list,
        h('button.btn.btn-sm.btn-ghost.mt-sm', { type: 'button', onclick: () => { q.options.push(''); drawAnswer(); } }, icon('plus'), 'Вариант'));
    } else if (k === 'number') {
      const a = typeof q.answer === 'object' && q.answer && !Array.isArray(q.answer) ? q.answer : { value: '', tolerance: '' };
      q.answer = a;
      answerBox.append(h('div.form-row',
        field('Верный ответ', h('input.input', { inputmode: 'decimal', value: a.value ?? '', placeholder: '12.5', oninput: e => { a.value = e.target.value.replace(',', '.'); } })),
        field('Допуск ±', h('input.input', { inputmode: 'decimal', value: a.tolerance ?? '', placeholder: 'авто: 1%', oninput: e => { a.tolerance = e.target.value.replace(',', '.'); } }))));
    } else if (k === 'text') {
      const arr = Array.isArray(q.answer) ? q.answer : q.answer ? [String(q.answer)] : [];
      q.answer = arr;
      answerBox.append(field('Верные ответы (через «;» — если допустимо несколько вариантов написания)',
        h('input.input', { value: arr.join('; '), placeholder: 'например: 3142  или  этанол; этиловый спирт', oninput: e => { q.answer = e.target.value.split(';').map(s => s.trim()).filter(Boolean); } }),
        'Регистр, лишние пробелы и ё/е не учитываются'));
    } else {
      answerBox.append(h('div.notice', 'Ученик напишет решение и может приложить фото. Баллы выставите вы при проверке. В «Разбор» можно положить эталонное решение.'));
    }
  };
  kindSel.addEventListener('change', drawAnswer);
  el.dataset.uid = Math.random().toString(36).slice(2, 7);
  drawAnswer();

  el.append(
    h('div.row.between.mb-sm', h('div.row', h('div.q-num', index + 1), kindSel),
      h('div.row.nowrap',
        onMove ? h('button.btn.btn-ghost.btn-icon.btn-sm', { type: 'button', title: 'Выше', onclick: () => onMove(-1) }, icon('chevU')) : null,
        onMove ? h('button.btn.btn-ghost.btn-icon.btn-sm', { type: 'button', title: 'Ниже', onclick: () => onMove(1) }, icon('chevD')) : null,
        onDuplicate ? h('button.btn.btn-ghost.btn-icon.btn-sm', { type: 'button', title: 'Дублировать', onclick: () => onDuplicate(get()) }, icon('copy')) : null,
        onSaveToBank ? h('button.btn.btn-ghost.btn-icon.btn-sm', { type: 'button', title: 'Сохранить в банк задач', onclick: () => onSaveToBank(get()) }, icon('db')) : null,
        onRemove ? h('button.btn.btn-ghost.btn-icon.btn-sm.btn-danger', { type: 'button', title: 'Удалить', onclick: onRemove }, icon('trash')) : null)),
    text, preview, imgBox, h('div.mt-sm', answerBox),
    h('div.row.mt-sm', h('span.label', 'Баллы'), points, diff, topic),
    h('div.mt-sm', expl));

  function get() {
    const k = kindSel.value;
    const out = { id: q.id, kind: k, text: text.value, points: Number(points.value) || 1, difficulty: Number(diff.value), topic: topic.value || null,
      explanation: expl.value || null, image_id: imageId, options: [], answer: null };
    if (k === 'single' || k === 'multi') {
      // drop empty options and remap answer indices
      const keep = q.options.map((o, i) => [String(o).trim(), i]).filter(([o]) => o);
      out.options = keep.map(([o]) => o);
      const map = Object.fromEntries(keep.map(([, i], j) => [i, j]));
      out.answer = k === 'multi' ? (q.answer || []).filter(i => i in map).map(i => map[i]) : (q.answer != null && q.answer in map ? map[q.answer] : null);
    } else if (k === 'number') out.answer = { value: Number(q.answer?.value), ...(q.answer?.tolerance !== '' && q.answer?.tolerance != null ? { tolerance: Number(q.answer.tolerance) } : {}) };
    else if (k === 'text') out.answer = q.answer;
    return out;
  }
  el.get = get;
  return el;
}

export function validateQuestion(q, i) {
  const n = `Вопрос ${i + 1}`;
  if (!q.text.trim()) return `${n}: нет текста`;
  if (q.kind === 'single' && (q.options.length < 2 || q.answer == null)) return `${n}: нужно ≥2 вариантов и отмеченный верный`;
  if (q.kind === 'multi' && (q.options.length < 2 || !q.answer.length)) return `${n}: отметьте верные варианты`;
  if (q.kind === 'number' && !Number.isFinite(q.answer.value)) return `${n}: укажите числовой ответ`;
  if (q.kind === 'text' && !q.answer?.length) return `${n}: укажите верный ответ`;
  return null;
}
export const toastInvalid = msg => toast(msg, 'error');
