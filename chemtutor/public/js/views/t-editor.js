import { h, icon, clear, modal, field, select, toast, chemHTML, badge, empty } from '../ui.js';
import { api } from '../api.js';
import { questionEditor, validateQuestion, KIND_SHORT, DIFF, answerText } from './questions.js';
import { assignDialog } from './t-assignment.js';

export default async function editor(el, { id }) {
  const topics = await api.get('/api/topics');
  const a = id ? await api.get(`/api/t/assignments/${id}`) : { title: '', kind: 'homework', description: '', topic: '', time_limit: null, show_answers: 1, questions: [] };
  let questions = a.questions.map(q => ({ ...q }));
  const editors = [];
  const qBox = h('div.stack');

  const title = h('input.input', { value: a.title, placeholder: 'Например: ДЗ №5 — гидролиз солей', style: { fontSize: '17px', height: '44px', fontWeight: 600 } });
  const kind = select([['homework', 'Домашнее задание'], ['test', 'Тест (на время)']], a.kind);
  const limit = h('input.input', { type: 'number', min: 1, value: a.time_limit || '', placeholder: 'без ограничения' });
  const limitField = field('Время на тест, мин', limit);
  const topic = select([['', '—'], ...topics.map(t => [t.id, t.title])], a.topic);
  const desc = h('textarea.input', { rows: 2, placeholder: 'Инструкция для ученика (необязательно)' }, a.description || '');
  const show = h('input', { type: 'checkbox', checked: !!a.show_answers });
  const toggleLimit = () => limitField.classList.toggle('hidden', kind.value !== 'test');
  kind.addEventListener('change', toggleLimit); toggleLimit();
  const totalBox = h('span.muted.small');

  const sync = () => { questions = editors.map(e => e.get()); };
  const draw = () => {
    clear(qBox); editors.length = 0;
    questions.forEach((q, i) => {
      const ed = questionEditor(q, { topics, index: i,
        onRemove: () => { sync(); questions.splice(i, 1); draw(); },
        onMove: d => { sync(); const j = i + d; if (j < 0 || j >= questions.length) return; [questions[i], questions[j]] = [questions[j], questions[i]]; draw(); },
        onDuplicate: copy => { sync(); questions.splice(i + 1, 0, { ...copy, id: undefined }); draw(); },
        onSaveToBank: async copy => { await api.post('/api/t/bank', { ...copy, id: undefined }); toast('Сохранено в банк задач', 'success'); } });
      editors.push(ed); qBox.append(ed);
    });
    if (!questions.length) qBox.append(h('div.card', empty('🧩', 'Добавьте вопросы', 'Из банка задач, сгенерируйте вариант или напишите свои')));
    totalBox.textContent = `${questions.length} вопр. · ${questions.reduce((s, q) => s + (Number(q.points) || 1), 0)} баллов`;
  };
  draw();

  const addBtns = () => h('div.row',
    h('button.btn', { onclick: () => { sync(); questions.push({ kind: 'single', options: ['', '', '', ''], points: 1, difficulty: 1 }); draw(); qBox.lastChild.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, icon('plus'), 'Свой вопрос'),
    h('button.btn', { onclick: () => { sync(); questions.push({ kind: 'open', text: '', points: 2, difficulty: 2 }); draw(); } }, icon('edit'), 'Развёрнутый ответ / фото'),
    h('button.btn', { onclick: () => bankPicker(topics, picked => { sync(); questions.push(...picked.map(q => ({ ...q, id: undefined }))); draw(); }) }, icon('db'), 'Из банка'),
    h('button.btn', { onclick: () => generator(topics, picked => { sync(); questions.push(...picked.map(q => ({ ...q, id: undefined }))); draw(); }) }, icon('refresh'), 'Сгенерировать вариант'));

  const save = async (andAssign = false) => {
    sync();
    if (!title.value.trim()) { title.focus(); return toast('Введите название', 'error'); }
    for (const [i, q] of questions.entries()) { const err = validateQuestion(q, i); if (err) { editors[i].scrollIntoView({ behavior: 'smooth', block: 'center' }); return toast(err, 'error'); } }
    const body = { title: title.value, kind: kind.value, time_limit: kind.value === 'test' ? Number(limit.value) || null : null, topic: topic.value, description: desc.value, show_answers: show.checked, questions };
    let aid = id;
    if (id) await api.put(`/api/t/assignments/${id}`, body);
    else aid = (await api.post('/api/t/assignments', body)).id;
    toast('Сохранено', 'success');
    if (andAssign) assignDialog({ id: aid, title: title.value }, () => location.hash = `#/t/homework/${aid}`);
    else location.hash = `#/t/homework/${aid}`;
  };

  el.append(
    h('div.page-head', h('div', h('h1', id ? 'Редактирование задания' : 'Новое задание'), h('div.sub', totalBox)),
      h('div.page-actions', h('a.btn', { href: id ? `#/t/homework/${id}` : '#/t/homework' }, 'Отмена'),
        h('button.btn', { onclick: () => save(false) }, 'Сохранить'), h('button.btn.btn-primary', { onclick: () => save(true) }, icon('send'), 'Сохранить и выдать'))),
    h('div.card.form.mb', field('Название', title), h('div.form-row', field('Тип', kind), limitField, field('Тема', topic)), field('Описание', desc),
      h('label.check', show, 'Показать ученику правильные ответы и разбор после сдачи')),
    h('div.row.between.mb', h('h2', { style: { margin: 0 } }, 'Вопросы'), addBtns()),
    qBox,
    h('div.mt', addBtns()));
}

/** Modal to pick questions from the bank. */
export async function bankPicker(topics, onPick) {
  const picked = new Map();
  const list = h('div.stack-sm', { style: { maxHeight: '55vh', overflowY: 'auto' } });
  const topicSel = select([['', 'Все темы'], ...topics.map(t => [t.id, t.title])], '');
  const diffSel = select([['', 'Любая сложность'], ...Object.entries(DIFF)], '');
  const q = h('input.input', { placeholder: 'Поиск по тексту' });
  const counter = h('b', '0');
  const load = async () => {
    const qs = await api.get(`/api/t/bank?topic=${topicSel.value}&difficulty=${diffSel.value}&q=${encodeURIComponent(q.value)}`);
    clear(list).append(...qs.map(x => h('label.opt', { style: { alignItems: 'flex-start' } },
      h('input', { type: 'checkbox', checked: picked.has(x.id), onchange: e => { e.target.checked ? picked.set(x.id, x) : picked.delete(x.id); counter.textContent = picked.size; } }),
      h('div.grow', h('div', { html: chemHTML(x.text.length > 260 ? x.text.slice(0, 260) + '…' : x.text) }),
        h('div.row.mt-sm', badge(KIND_SHORT[x.kind]), badge(DIFF[x.difficulty]), h('span.muted.tiny', topics.find(t => t.id === x.topic)?.title || ''),
          h('span.muted.tiny', { html: '· ответ: ' + chemHTML(answerText(x)).slice(0, 80) }))))));
    if (!qs.length) list.append(h('p.muted', 'Ничего не найдено'));
  };
  [topicSel, diffSel].forEach(s => s.addEventListener('change', load));
  let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); });
  modal({ title: 'Банк задач', wide: true, body: h('div.stack', h('div.form-row', topicSel, diffSel, q), list),
    foot: close => [h('span.muted', { style: { marginRight: 'auto' } }, 'Выбрано: ', counter), h('button.btn', { onclick: close }, 'Отмена'),
      h('button.btn.btn-primary', { onclick: () => { onPick([...picked.values()]); close(); } }, 'Добавить')] });
  load();
}

/** Random variant generator: N questions per selected topic. */
export async function generator(topics, onPick) {
  const bySection = {};
  for (const t of topics) (bySection[t.section] ||= []).push(t);
  const checks = new Map();
  const count = h('input.input', { type: 'number', value: 2, min: 1, max: 10, style: { width: '80px' } });
  const diff = select([['', 'Любая'], ...Object.entries(DIFF)], '');
  const body = h('div.stack',
    h('p.muted', 'Выберите темы — из банка случайно возьмём по N задач из каждой. Удобно для проверочных и вариантов «как на экзамене».'),
    h('div.row', h('span', 'Задач из каждой темы:'), count, h('span', 'Сложность:'), diff),
    h('div', { style: { maxHeight: '45vh', overflowY: 'auto' } }, Object.entries(bySection).map(([sec, arr]) => h('div.mb',
      h('label.check.bold.mb-sm', h('input', { type: 'checkbox', onchange: e => arr.forEach(t => { checks.get(t.id).checked = e.target.checked; }) }), sec),
      h('div.grid.grid-2', { style: { gap: '4px 16px', paddingLeft: '24px' } }, arr.map(t => { const c = h('input', { type: 'checkbox' }); checks.set(t.id, c); return h('label.check.small', c, t.title); }))))));
  modal({ title: 'Сгенерировать вариант', wide: true, body, foot: close => [h('button.btn', { onclick: close }, 'Отмена'),
    h('button.btn.btn-primary', { onclick: async () => {
      const sel = [...checks].filter(([, c]) => c.checked).map(([id]) => id);
      if (!sel.length) return toast('Выберите хотя бы одну тему', 'error');
      const res = [];
      for (const tid of sel) {
        const qs = await api.get(`/api/t/bank?topic=${tid}&difficulty=${diff.value}`);
        res.push(...qs.sort(() => Math.random() - .5).slice(0, Number(count.value) || 1));
      }
      if (!res.length) return toast('В выбранных темах нет задач', 'error');
      onPick(res); toast(`Добавлено задач: ${res.length}`, 'success'); close();
    } }, 'Сгенерировать')] });
}
