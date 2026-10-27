import { h, icon, money, fmtDate, fmtTime, fmtDateTime, badge, STATUS, scoreClass, pct, lineChart, skillDots, empty } from '../ui.js';
import { api } from '../api.js';

export default async function parent(el, { token }, app) {
  const d = await api.get(`/api/parent/${token}`, { quiet: true }).catch(e => ({ error: e.message }));
  const wrap = h('div.public');
  el.append(wrap);
  if (d.error) { wrap.append(h('div.card', empty('🔒', 'Ссылка недействительна', 'Попросите преподавателя прислать актуальную ссылку'))); return; }
  const att = d.attendance || {};
  const graded = d.results.filter(r => r.status === 'graded' && r.max_score > 0);
  const avg = graded.length ? Math.round(graded.reduce((a, r) => a + pct(r.score, r.max_score), 0) / graded.length) : null;
  const bySection = {};
  for (const s of d.skills) (bySection[s.section] ||= []).push(s);
  wrap.append(
    h('div.row.between.mb', h('div.row', h('div.brand-logo', 'Хк'), h('b', 'ХимКабинет')),
      h('button.btn.btn-ghost.btn-icon', { onclick: () => app.toggleTheme(), dataset: { themeIcon: '1' } }, icon('moon'))),
    h('div.page-head', h('div', h('h1', d.student.name), h('div.sub', [d.student.grade && `${d.student.grade} класс`, d.student.goal && `цель: ${d.student.goal}${d.student.target_score ? ' ' + d.student.target_score : ''}`, `преподаватель: ${d.teacher.name}`].filter(Boolean).join(' · ')))),
    h('div.grid.grid-4.mb',
      stat('Проведено занятий', att.done || 0), stat('Пропуски', att.missed || 0),
      stat('Средний балл за ДЗ', avg != null ? `${avg}%` : '—'),
      stat('Баланс', money(d.balance.balance), d.balance.balance < 0 ? 'var(--danger)' : 'var(--success)')),
    h('div.grid.grid-2',
      h('div.card', h('h3', 'Ближайшие занятия'), d.upcoming.length ? h('div.list', d.upcoming.map(l => h('div.list-item', h('b.grow', fmtDate(l.start_at, { dow: true })), h('span', fmtTime(l.start_at)), h('span.muted.small', l.topic || ''))))
        : h('p.muted', 'Пока не запланировано')),
      h('div.card', h('h3', 'Результаты'), graded.length ? lineChart([{ name: 'ДЗ', color: 'var(--primary)', points: graded.slice().reverse().map(r => ({ x: fmtDate(r.submitted_at), y: pct(r.score, r.max_score), label: r.title, suffix: '%' })) }], { max: 100, height: 170 })
        : h('p.muted', 'Результатов пока нет'))),
    d.exams.length ? h('div.card.mt', h('h3', 'Пробные экзамены'), h('div.list', d.exams.map(e => h('div.list-item', h('span.grow', `${fmtDate(e.date)} — ${e.title}`), h('b', `${e.score} / ${e.max_score}`))))) : null,
    h('div.card.mt', h('h3', 'Последние задания'), d.results.length ? h('div.table-wrap', h('table.table', h('tbody', d.results.slice(0, 15).map(r => h('tr',
      h('td', r.title), h('td.small.muted.hide-m', r.submitted_at ? fmtDateTime(r.submitted_at) : r.due_at ? `срок ${fmtDateTime(r.due_at)}` : ''),
      h('td.right', r.status === 'graded' ? badge(`${r.score}/${r.max_score}`, scoreClass(pct(r.score, r.max_score))) : badge(r.status === 'submitted' ? 'на проверке' : 'не сдано', r.status === 'submitted' ? 'badge-primary' : 'badge-warning')))))))
      : h('p.muted', 'Заданий пока не было')),
    h('div.card.mt', h('h3', 'Карта знаний'), h('p.muted.small', 'Оценка преподавателя по темам, от 0 до 5'),
      h('div.grid.grid-2', Object.entries(bySection).map(([sec, arr]) => h('div', h('h3.mt', sec), arr.map(s => h('div.skill', h('span.small', s.title), skillDots(s.level))))))),
    h('div.card.mt', h('h3', 'Журнал занятий'), h('div.list', d.lessons.slice(0, 15).map(l => h('div.list-item', { style: { alignItems: 'flex-start' } },
      h('div', { style: { minWidth: '110px' } }, h('div.bold', fmtDate(l.start_at)), badge(...STATUS[l.status])),
      h('div.grow', h('div', l.topic || '—'), l.summary ? h('div.muted.small', l.summary) : null))))),
    h('div.card.mt', h('h3', 'Связь с преподавателем'), h('div.row', h('b', d.teacher.name), d.teacher.phone ? h('a.btn.btn-sm', { href: `tel:${d.teacher.phone}` }, d.teacher.phone) : null,
      d.teacher.telegram ? h('a.btn.btn-sm', { href: `https://t.me/${d.teacher.telegram.replace('@', '')}`, target: '_blank' }, d.teacher.telegram) : null)));
  document.title = `${d.student.name} · ХимКабинет`;
}
const stat = (label, value, color) => h('div.card.stat', h('div.label', label), h('div.value', { style: color ? { color } : {} }, value));
