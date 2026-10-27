import { h, icon, avatar, money, fmtTime, fmtRelDay, fmtDate, barChart, badge, empty, MONTHS_NOM, timeAgo, toast, untilText, clear } from '../ui.js';
import { api } from '../api.js';
import { lessonDialog } from './t-schedule.js';

export default async function dashboard(el, _, app) {
  const d = await api.get('/api/t/dashboard');
  const hour = new Date().getHours();
  const hello = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const reload = () => app.go(location.hash);

  if (!d.stats.students) {
    el.append(h('div.page-head', h('div', h('h1', `${hello}, ${app.user.name.split(' ')[0]}!`), h('div.sub', 'Давайте настроим кабинет'))),
      h('div.grid.grid-3',
        h('div.card.stack', h('div.stat-icon', icon('users')), h('h3', '1. Добавьте учеников'), h('p.muted', 'Каждый получит ссылку-приглашение и свой личный кабинет.'),
          h('a.btn.btn-primary', { href: '#/t/students?new=1' }, icon('plus'), 'Добавить ученика')),
        h('div.card.stack', h('div.stat-icon', icon('db')), h('h3', '2. Посмотрите банк задач'), h('p.muted', 'Мы добавили задачи по темам ЕГЭ/ОГЭ с ответами и разбором. Из них можно собрать ДЗ за минуту.'),
          h('a.btn', { href: '#/t/bank' }, 'Открыть банк')),
        h('div.card.stack', h('div.stat-icon', icon('star')), h('h3', 'Или попробуйте демо'), h('p.muted', 'Создадим 3 демо-ученика с расписанием, оплатами и сданными работами — чтобы всё пощупать.'),
          h('button.btn', { onclick: async e => {
            e.target.disabled = true;
            const r = await api.post('/api/t/demo');
            toast('Демо-ученики созданы', 'success');
            showDemoLogins(el, r.logins);
            setTimeout(reload, 50);
          } }, 'Создать демо-данные'))));
    return;
  }

  const now = new Date();
  const monthName = MONTHS_NOM[now.getMonth()];
  el.append(
    h('div.page-head',
      h('div', h('h1', `${hello}, ${app.user.name.split(' ')[0]}!`),
        h('div.sub', d.today.length ? `Сегодня ${d.today.length} ${d.today.length === 1 ? 'занятие' : d.today.length < 5 ? 'занятия' : 'занятий'}` : 'Сегодня занятий нет — можно спокойно проверить работы')),
      h('div.page-actions',
        h('button.btn', { onclick: () => lessonDialog({ onSaved: reload }) }, icon('calendar'), 'Занятие'),
        h('a.btn.btn-primary', { href: '#/t/homework/new' }, icon('plus'), 'Задание'))),

    h('div.grid.grid-4.mb',
      stat('users', 'Активных учеников', d.stats.students, null, '#/t/students'),
      stat('wallet', `Получено за ${monthName.toLowerCase()}`, money(d.stats.income), `начислено ${money(d.stats.earned)}`, '#/t/finance'),
      stat('calendar', `Занятий в ${monthName.toLowerCase().replace(/ь$/, 'е').replace(/й$/, 'е').replace(/т$/, 'те')}`, d.stats.lessonsMonth, 'проведено', '#/t/schedule'),
      stat('alert', 'Долги учеников', money(d.stats.debt), d.debtors.length ? `${d.debtors.length} уч.` : 'всё оплачено', '#/t/finance', d.stats.debt > 0 ? 'var(--danger)' : null)),

    h('div.grid.grid-3',
      h('div.card.span-2',
        h('div.card-head', h('h3', 'Сегодня'), h('a', { href: '#/t/schedule' }, 'Расписание →')),
        d.today.length ? h('div.stack-sm', d.today.map(l => lessonRow(l, reload))) : empty('☕', 'Свободный день', null),
        d.week.length ? [h('h3.mt', 'Ближайшие дни'), h('div.stack-sm', d.week.slice(0, 6).map(l => lessonRow(l, reload, true)))] : null),
      h('div.stack',
        h('div.card',
          h('div.card-head', h('h3', 'На проверку'), d.toCheck.length ? badge(d.toCheck.length, 'badge-primary') : null),
          d.toCheck.length ? h('div.list', d.toCheck.map(t => h('a.list-item', { href: `#/t/review/${t.id}` },
            h('div.grow', h('div.bold.ellipsis', t.title), h('div.muted.small', `${t.student} · ${timeAgo(t.submitted_at)}`)), icon('chevR'))))
            : h('p.muted.small', 'Все работы проверены 🎉')),
        d.unmarked.length ? h('div.card',
          h('div.card-head', h('h3', 'Отметьте прошедшие'), badge(d.unmarked.length, 'badge-warning')),
          h('p.muted.small', 'Занятия прошли, но статус не выставлен — от этого зависит баланс ученика.'),
          h('div.list', d.unmarked.slice(0, 5).map(l => h('div.list-item',
            h('div.grow', h('div.bold', l.student), h('div.muted.small', `${fmtDate(l.start_at)}, ${fmtTime(l.start_at)}`)),
            h('button.btn.btn-sm', { title: 'Проведено', onclick: async () => { await api.patch(`/api/t/lessons/${l.id}`, { status: 'done' }); reload(); } }, icon('check')),
            h('button.btn.btn-sm.btn-ghost', { title: 'Пропуск', onclick: async () => { await api.patch(`/api/t/lessons/${l.id}`, { status: 'missed' }); reload(); } }, 'Н'))))) : null,
        d.overdue.length ? h('div.card',
          h('div.card-head', h('h3', 'Просрочено'), badge(d.overdue.length, 'badge-danger')),
          h('div.list', d.overdue.slice(0, 6).map(t => h('a.list-item', { href: `#/t/students/${t.student_id}/homework` },
            h('div.grow', h('div.bold.ellipsis', t.title), h('div.muted.small', `${t.student} · ${untilText(t.due_at)}`)))))) : null,
        d.debtors.length ? h('div.card',
          h('div.card-head', h('h3', 'Должники'), h('a', { href: '#/t/finance' }, 'Финансы →')),
          h('div.list', d.debtors.slice(0, 5).map(s => h('a.list-item', { href: `#/t/students/${s.id}/finance` },
            h('div.grow.bold', s.name), h('span.text-danger.bold', money(s.balance)))))) : null)),

    h('div.grid.grid-2.mt',
      h('div.card', h('div.card-head', h('h3', 'Доход по месяцам')),
        barChart(d.months.map(m => ({ label: MONTHS_NOM[Number(m.month.slice(5)) - 1].slice(0, 3), value: m.income, tip: money(m.income) })))),
      h('div.card', h('div.card-head', h('h3', 'Проведено занятий')),
        barChart(d.months.map(m => ({ label: MONTHS_NOM[Number(m.month.slice(5)) - 1].slice(0, 3), value: m.lessons })), { color: 'var(--info)' }))),
    todoCard());
}

function stat(ic, label, value, delta, href, color) {
  return h('a.card.stat', { href, style: { color: 'inherit', textDecoration: 'none' } },
    h('div.row.between.nowrap', h('div.label', label), h('div.stat-icon', { style: color ? { color, background: 'var(--danger-soft)' } : {} }, icon(ic))),
    h('div.value', { style: color ? { color } : {} }, value), delta ? h('div.delta', delta) : null);
}

export function lessonRow(l, onChange, showDay = false) {
  return h('div.lesson', { style: { '--c': l.color } },
    h('div.time', fmtTime(l.start_at), h('small', showDay ? fmtRelDay(l.start_at) : `${l.duration} мин`)),
    avatar({ name: l.student, color: l.color }, 'sm'),
    h('div.grow', h('a.bold', { href: `#/t/students/${l.student_id}` }, l.student), h('div.muted.small.ellipsis', l.topic || 'Тема не указана')),
    l.status !== 'planned' ? badge(...statusBadge(l.status)) : null,
    l.link ? h('a.btn.btn-sm.hide-m', { href: l.link, target: '_blank', title: 'Ссылка на урок' }, icon('video')) : null,
    h('button.btn.btn-sm.btn-ghost', { onclick: () => lessonDialog({ lesson: l, onSaved: onChange }), title: 'Открыть' }, icon('edit')));
}
const statusBadge = s => ({ done: ['Проведено', 'badge-success'], canceled: ['Отменено', ''], missed: ['Пропуск', 'badge-danger'] })[s] || ['', ''];

function showDemoLogins(el, logins) {
  el.prepend(h('div.notice.ok.mb', h('b', 'Демо-ученики созданы. '), 'Войти за ученика можно в другом браузере или окне инкогнито: ',
    logins.map((l, i) => [i ? ', ' : '', h('b', l.login), ' / ', l.password])));
}

function todoCard() {
  const list = h('div.list');
  const inp = h('input.input', { placeholder: 'Например: подготовить вариант ЕГЭ для Алины' });
  const load = async () => {
    const items = await api.get('/api/todos');
    clear(list).append(...items.map(t => h('div.list-item',
      h('label.check.grow', h('input', { type: 'checkbox', checked: !!t.done, onchange: async e => { await api.patch(`/api/todos/${t.id}`, { done: e.target.checked }); load(); } }),
        h('span', { style: t.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : {} }, t.text)),
      h('button.btn.btn-ghost.btn-icon.btn-sm', { onclick: async () => { await api.del(`/api/todos/${t.id}`); load(); } }, icon('x')))));
    if (!items.length) list.append(h('p.muted.small', 'Список пуст. Записывайте сюда всё, что нельзя забыть.'));
  };
  const add = async () => { if (!inp.value.trim()) return; await api.post('/api/todos', { text: inp.value }); inp.value = ''; load(); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  load();
  return h('div.card.mt', h('div.card-head', h('h3', 'Мои дела')), h('div.row.nowrap.mb', inp, h('button.btn', { onclick: add }, icon('plus'))), list);
}
