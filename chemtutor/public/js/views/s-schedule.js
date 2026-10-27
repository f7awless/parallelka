import { h, icon, badge, fmtDate, fmtTime, STATUS, empty, today, toast, copyBox, modal } from '../ui.js';
import { api } from '../api.js';

export default async function schedule(el) {
  const lessons = await api.get('/api/s/lessons');
  const now = today();
  const upcoming = lessons.filter(l => l.status === 'planned' && l.start_at.slice(0, 10) >= now).reverse();
  const past = lessons.filter(l => !(l.status === 'planned' && l.start_at.slice(0, 10) >= now));
  el.append(
    h('div.page-head', h('div', h('h1', 'Расписание'), h('div.sub', 'Твои занятия, их планы и итоги')),
      h('div.page-actions', h('button.btn', { onclick: async () => {
        const { token } = await api.get('/api/s/calendar');
        modal({ title: 'Добавить в календарь телефона', body: h('div.stack', h('p', 'Скопируй ссылку и добавь её в Google Календарь («Добавить по URL»), Яндекс или Apple Календарь. Занятия будут появляться автоматически, с напоминанием за 30 минут.'),
          copyBox(`${location.origin}/api/ics/${token}.ics`)) });
      } }, icon('calendar'), 'В мой календарь'))),
    h('h2', 'Предстоящие'),
    upcoming.length ? h('div.stack.mb', upcoming.map(l => h('div.card.row', { style: { alignItems: 'flex-start' } },
      h('div', { style: { minWidth: '120px' } }, h('div.bold', fmtDate(l.start_at, { dow: true })), h('div', { style: { fontSize: '22px', fontWeight: 700 } }, fmtTime(l.start_at)), h('div.muted.small', `${l.duration} мин`)),
      h('div.grow', h('div.bold', l.topic || 'Занятие по химии'), l.plan ? h('div.small.muted', { style: { whiteSpace: 'pre-wrap' } }, l.plan) : null),
      l.link ? h('a.btn.btn-primary', { href: l.link, target: '_blank' }, icon('video'), 'Ссылка на урок') : null)))
      : h('div.card.mb', empty('🗓️', 'Пока ничего не запланировано', 'Преподаватель добавит занятия — придёт уведомление')),
    past.length ? [h('h2', 'Прошедшие'), h('div.stack', past.map(l => h('div.card',
      h('div.row.between', h('div', h('b', fmtDate(l.start_at)), h('span.muted.small', ` · ${fmtTime(l.start_at)} · ${l.topic || '—'}`)), badge(...STATUS[l.status])),
      l.summary ? h('div.notice.mt-sm', { style: { whiteSpace: 'pre-wrap' } }, h('b', 'Итоги: '), l.summary) : null,
      l.status === 'done' ? rating(l) : null)))] : null);
}

function rating(l) {
  const box = h('div.row.mt-sm.small', h('span.muted', l.rating ? 'Твоя оценка занятия:' : 'Как прошло занятие?'));
  const stars = [1, 2, 3, 4, 5].map(n => h('button.btn.btn-ghost.btn-sm', { style: { padding: '0 4px', fontSize: '18px', color: n <= (l.rating || 0) ? 'var(--warning)' : 'var(--muted)' },
    onclick: async () => { await api.post(`/api/s/lessons/${l.id}/rate`, { rating: n }); l.rating = n; stars.forEach((s, i) => { s.style.color = i < n ? 'var(--warning)' : 'var(--muted)'; }); toast('Спасибо за оценку!', 'success'); } }, '★'));
  box.append(...stars);
  return box;
}
