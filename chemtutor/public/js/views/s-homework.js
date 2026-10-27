import { h, icon, clear, badge, empty, fmtDateTime, untilText, scoreClass, pct, T_STATUS, localISO } from '../ui.js';
import { api } from '../api.js';

export default async function homework(el) {
  const list = await api.get('/api/s/assignments');
  const active = list.filter(t => ['assigned', 'started', 'returned'].includes(t.status));
  const done = list.filter(t => !['assigned', 'started', 'returned'].includes(t.status));
  const card = t => h('a.card.stack-sm', { href: `#/s/homework/${t.id}`, style: { color: 'inherit', textDecoration: 'none' } },
    h('div.row.between.nowrap', badge(t.kind === 'test' ? `Тест${t.time_limit ? ` · ${t.time_limit} мин` : ''}` : 'Домашнее задание', t.kind === 'test' ? 'badge-warning' : 'badge-info'), badge(...T_STATUS[t.status])),
    h('h3', { style: { margin: '4px 0 0' } }, t.title),
    h('div.small.muted', `${t.qcount} вопр.`, t.due_at ? h('span', { class: t.due_at < localISO() && active.includes(t) ? 'text-danger' : '' }, ` · срок ${fmtDateTime(t.due_at)}${active.includes(t) ? ` (${untilText(t.due_at)})` : ''}`) : ''),
    t.status === 'graded' ? h('div.row.between', h('span.small', 'Результат'), badge(`${t.score} / ${t.max_score} · ${pct(t.score, t.max_score)}%`, scoreClass(pct(t.score, t.max_score)))) : null,
    t.teacher_comment ? h('div.small.muted.ellipsis', `✍️ ${t.teacher_comment}`) : null);
  el.append(h('div.page-head', h('div', h('h1', 'Задания'), h('div.sub', 'Домашние работы и тесты'))),
    h('h2', `В работе (${active.length})`),
    active.length ? h('div.grid.grid-auto.mb', active.map(card)) : h('div.card.mb', empty('🎉', 'Всё сдано', 'Новые задания появятся здесь')),
    done.length ? [h('h2', 'Сданные'), h('div.grid.grid-auto', done.map(card))] : null);
}
