import { h, icon, clear, modal, toast, badge, chemHTML, select, confirmDialog, empty } from '../ui.js';
import { api } from '../api.js';
import { questionEditor, validateQuestion, KIND_SHORT, DIFF, answerText, KINDS } from './questions.js';

export default async function bank(el) {
  const topics = await api.get('/api/topics');
  const tTitle = Object.fromEntries(topics.map(t => [t.id, t.title]));
  const f = { topic: '', kind: '', difficulty: '', q: '' };
  const list = h('div.stack-sm');
  const count = h('span.muted');
  const selected = new Set();
  const selBar = h('div.notice.row.between.mb.hidden');

  const topicSel = select([['', 'Все темы'], ...groupTopics(topics)], '', { style: { width: 'auto', maxWidth: '280px' } });
  const kindSel = select([['', 'Все типы'], ...Object.entries(KIND_SHORT)], '', { style: { width: 'auto' } });
  const diffSel = select([['', 'Любая сложность'], ...Object.entries(DIFF)], '', { style: { width: 'auto' } });
  const qInp = h('input.input', { placeholder: 'Поиск по тексту' });
  topicSel.onchange = () => { f.topic = topicSel.value; load(); };
  kindSel.onchange = () => { f.kind = kindSel.value; load(); };
  diffSel.onchange = () => { f.difficulty = diffSel.value; load(); };
  let tm; qInp.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { f.q = qInp.value; load(); }, 300); };

  el.append(
    h('div.page-head', h('div', h('h1', 'Банк задач'), h('div.sub', 'Ваша коллекция вопросов с ответами — из неё собираются задания и тренажёр учеников')),
      h('div.page-actions', h('button.btn.btn-primary', { onclick: () => edit() }, icon('plus'), 'Новый вопрос'))),
    h('div.row.mb', h('div.search', { style: { minWidth: '220px' } }, icon('search'), qInp), topicSel, kindSel, diffSel, count),
    selBar, list);

  const updSel = () => {
    selBar.classList.toggle('hidden', !selected.size);
    clear(selBar).append(h('span', `Выбрано: ${selected.size}`), h('div.row',
      h('button.btn.btn-sm.btn-primary', { onclick: async () => {
        const qs = [...selected.values()];
        const title = `Задание: ${tTitle[qs[0].topic] || 'смешанное'}`;
        const r = await api.post('/api/t/assignments', { title, kind: 'homework', questions: qs.map(q => ({ ...q, id: undefined })) });
        toast('Задание создано — проверьте и выдайте', 'success'); location.hash = `#/t/homework/${r.id}/edit`;
      } }, icon('plus'), 'Создать задание из выбранных'),
      h('button.btn.btn-sm', { onclick: () => { selected.clear(); load(); } }, 'Снять выбор')));
  };

  async function load() {
    const qs = await api.get(`/api/t/bank?topic=${f.topic}&kind=${f.kind}&difficulty=${f.difficulty}&q=${encodeURIComponent(f.q)}`);
    count.textContent = `${qs.length} ${qs.length % 10 === 1 && qs.length % 100 !== 11 ? 'вопрос' : 'вопросов'}`;
    const ids = new Set([...selected].map(q => q.id));
    clear(list).append(...qs.map(q => h('div.card', { style: { padding: '14px 16px' } },
      h('div.row.nowrap', { style: { alignItems: 'flex-start' } },
        h('input', { type: 'checkbox', checked: ids.has(q.id), style: { marginTop: '4px', width: '17px', height: '17px', accentColor: 'var(--primary)' },
          onchange: e => { if (e.target.checked) selected.add(q); else for (const x of selected) if (x.id === q.id) selected.delete(x); updSel(); } }),
        h('div.grow',
          h('div', { html: chemHTML(q.text), style: { whiteSpace: 'pre-wrap' } }),
          q.options?.length ? h('ol.small.muted', { style: { margin: '6px 0 0', paddingLeft: '20px' } }, q.options.map((o, i) => h('li', {
            style: (q.kind === 'single' ? Number(q.answer) === i : (q.answer || []).includes?.(i)) ? { color: 'var(--success)', fontWeight: 600 } : {}, html: chemHTML(o) }))) : null,
          q.kind !== 'single' && q.kind !== 'multi' && q.kind !== 'open' ? h('div.small.mt-sm', h('span.muted', 'Ответ: '), h('b', { html: chemHTML(answerText(q)) })) : null,
          h('div.row.mt-sm', badge(KIND_SHORT[q.kind]), badge(DIFF[q.difficulty], q.difficulty === 3 ? 'badge-danger' : q.difficulty === 2 ? 'badge-warning' : 'badge-success'),
            q.topic ? badge(tTitle[q.topic] || q.topic, 'badge-primary') : null, h('span.muted.tiny', `${q.points} б.`))),
        h('div.row.nowrap', h('button.btn.btn-ghost.btn-icon.btn-sm', { onclick: () => edit(q), title: 'Изменить' }, icon('edit')),
          h('button.btn.btn-ghost.btn-icon.btn-sm', { title: 'Удалить', onclick: async () => { if (await confirmDialog('Удалить вопрос из банка? В уже созданных заданиях он останется.')) { await api.del(`/api/t/bank/${q.id}`); load(); } } }, icon('trash')))))));
    if (!qs.length) list.append(h('div.card', empty('🔍', 'Ничего не найдено', 'Измените фильтры или добавьте свой вопрос')));
    updSel();
  }

  function edit(q) {
    const ed = questionEditor(q || { kind: 'single', options: ['', '', '', ''], points: 1, difficulty: 1, topic: f.topic }, { topics, index: 0 });
    modal({ title: q ? 'Редактировать вопрос' : 'Новый вопрос', wide: true, body: ed, foot: close => [h('button.btn', { onclick: close }, 'Отмена'),
      h('button.btn.btn-primary', { onclick: async () => {
        const v = ed.get(); const err = validateQuestion(v, 0); if (err) return toast(err.replace('Вопрос 1: ', ''), 'error');
        if (q) await api.put(`/api/t/bank/${q.id}`, v); else await api.post('/api/t/bank', v);
        toast('Сохранено', 'success'); close(); load();
      } }, 'Сохранить')] });
  }
  load();
}

function groupTopics(topics) {
  return topics.map(t => [t.id, `${t.section.split(' ')[0].slice(0, 6)}. · ${t.title}`]);
}
