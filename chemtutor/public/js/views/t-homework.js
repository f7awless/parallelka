import { h, icon, clear, badge, empty, fmtDate, scoreClass, confirmDialog, toast, select } from '../ui.js';
import { api } from '../api.js';
import { assignDialog } from './t-assignment.js';

export default async function homework(el) {
  const [list, topics] = await Promise.all([api.get('/api/t/assignments'), api.get('/api/topics')]);
  const topicTitle = Object.fromEntries(topics.map(t => [t.id, t.title]));
  let kind = '', q = '';
  const body = h('div');
  el.append(
    h('div.page-head', h('div', h('h1', 'Задания'), h('div.sub', 'Домашние работы и тесты: создайте один раз — выдавайте кому угодно')),
      h('div.page-actions', h('a.btn', { href: '#/t/bank' }, icon('db'), 'Банк задач'), h('a.btn.btn-primary', { href: '#/t/homework/new' }, icon('plus'), 'Новое задание'))),
    h('div.row.mb',
      h('div.search.grow', { style: { maxWidth: '340px' } }, icon('search'), h('input.input', { placeholder: 'Поиск', oninput: e => { q = e.target.value.toLowerCase(); draw(); } })),
      h('div.seg', [['', 'Все'], ['homework', 'ДЗ'], ['test', 'Тесты']].map(([k, t]) => h('button', { class: k === kind ? 'active' : '', onclick: e => {
        kind = k; e.target.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target)); draw();
      } }, t)))),
    body);

  function draw() {
    const rows = list.filter(a => (!kind || a.kind === kind) && (!q || a.title.toLowerCase().includes(q)));
    if (!list.length) return clear(body).append(h('div.card', empty('📝', 'Заданий пока нет', 'Соберите первое задание из банка задач — это займёт пару минут',
      h('a.btn.btn-primary', { href: '#/t/homework/new' }, icon('plus'), 'Создать задание'))));
    clear(body).append(h('div.grid.grid-auto', rows.map(a => h('div.card.stack-sm', { style: { cursor: 'pointer' }, onclick: e => { if (!e.target.closest('button')) location.hash = `#/t/homework/${a.id}`; } },
      h('div.row.between.nowrap', badge(a.kind === 'test' ? `Тест${a.time_limit ? ` · ${a.time_limit} мин` : ''}` : 'Домашнее задание', a.kind === 'test' ? 'badge-warning' : 'badge-info'),
        a.to_check ? badge(`${a.to_check} на проверку`, 'badge-primary') : null),
      h('h3', { style: { margin: '4px 0 0' } }, a.title),
      h('div.muted.small', [`${a.qcount} ${a.qcount === 1 ? 'вопрос' : a.qcount < 5 ? 'вопроса' : 'вопросов'}`, `${a.max_points} б.`, a.topic && topicTitle[a.topic], fmtDate(a.created_at)].filter(Boolean).join(' · ')),
      h('div.row.between.mt-sm',
        h('div.small', a.assigned ? `Сдали ${a.done} из ${a.assigned}` : h('span.muted', 'Ещё не выдано'), a.avg != null ? badge(`ср. ${Math.round(a.avg)}%`, scoreClass(a.avg)) : null),
        h('div.row.nowrap',
          h('button.btn.btn-sm', { onclick: () => assignDialog(a, () => location.reload()) }, icon('send'), 'Выдать'),
          h('button.btn.btn-ghost.btn-sm.btn-icon', { title: 'Копировать', onclick: async () => { const r = await api.post(`/api/t/assignments/${a.id}/copy`); toast('Копия создана', 'success'); location.hash = `#/t/homework/${r.id}/edit`; } }, icon('copy')))))))
    );
    if (!rows.length) body.append(h('p.muted', 'Ничего не найдено'));
  }
  draw();
}
