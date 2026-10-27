import { h, icon, clear, modal, field, select, toast, avatar, money, fmtDate, fmtTime, fmtDateTime, badge, scoreClass, empty, copyBox, formData, confirmDialog,
  STATUS, T_STATUS, lineChart, radarChart, heatmap, skillDots, today, pct, untilText, donut, copyText } from '../ui.js';
import { api } from '../api.js';
import { studentForm, inviteDialog } from './t-students.js';
import { lessonDialog } from './t-schedule.js';
import { paymentDialog } from './t-finance.js';

export default async function student(el, { id, tab = 'overview' }, app) {
  const s = await api.get(`/api/t/students/${id}`);
  const reload = () => app.go(location.hash);
  const tabs = [['overview', 'Обзор'], ['lessons', `Занятия (${s.lessons.length})`], ['homework', `Задания (${s.targets.length})`], ['skills', 'Карта знаний'], ['finance', 'Оплаты'], ['access', 'Доступ']];
  const parentUrl = `${location.origin}/#/parent/${s.parent_token}`;

  el.append(
    h('div.page-head',
      h('div.row.nowrap', { style: { gap: '14px' } }, avatar(s, 'lg'),
        h('div', h('h1', s.name), h('div.row.small.muted', s.grade ? `${s.grade} класс` : null, s.goal ? badge(s.goal + (s.target_score ? ` → ${s.target_score}` : ''), 'badge-primary') : null,
          !s.registered ? badge('не зарегистрирован', 'badge-warning') : null, s.archived ? badge('в архиве') : null,
          h('span', `ур. ${s.level.level} · ${s.xp} XP`), s.streak ? h('span', `🔥 ${s.streak}`) : null))),
      h('div.page-actions',
        h('a.btn', { href: `#/t/chat/${s.id}` }, icon('chat'), h('span.hide-m', 'Написать')),
        h('button.btn', { onclick: () => lessonDialog({ start: null, lesson: null, onSaved: reload, students: [s] }) }, icon('calendar'), h('span.hide-m', 'Занятие')),
        h('button.btn', { onclick: () => paymentDialog({ students: [s], onSaved: reload }) }, icon('wallet'), h('span.hide-m', 'Оплата')),
        h('button.btn', { onclick: () => editDialog() }, icon('edit')))),
    h('div.tabs', tabs.map(([k, t]) => h('a', { href: `#/t/students/${id}/${k}`, class: k === tab ? 'active' : '' }, t))));

  const box = h('div'); el.append(box);
  ({ overview, lessons, homework, skills, finance, access })[tab]?.();

  function editDialog() {
    const form = studentForm(s);
    modal({ title: 'Редактировать ученика', body: form, foot: close => [
      h('button.btn', { style: { marginRight: 'auto' }, onclick: async () => {
        await api.patch(`/api/t/students/${s.id}`, { archived: s.archived ? 0 : 1 }); toast(s.archived ? 'Возвращён из архива' : 'Перенесён в архив', 'success'); close(); reload();
      } }, s.archived ? 'Вернуть из архива' : 'В архив'),
      h('button.btn', { onclick: close }, 'Отмена'),
      h('button.btn.btn-primary', { onclick: async () => { await api.patch(`/api/t/students/${s.id}`, formData(form)); close(); reload(); } }, 'Сохранить')] });
  }

  function overview() {
    const graded = s.targets.filter(t => t.status === 'graded' && t.max_score > 0).sort((a, b) => (a.submitted_at || '').localeCompare(b.submitted_at || ''));
    const att = { done: s.lessons.filter(l => l.status === 'done').length, missed: s.lessons.filter(l => l.status === 'missed').length, canceled: s.lessons.filter(l => l.status === 'canceled').length };
    const upcoming = s.lessons.filter(l => l.status === 'planned' && l.start_at >= today()).sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 4);
    const weak = s.topicStats.filter(t => t.max > 0).map(t => ({ ...t, p: pct(t.got, t.max), title: s.skills.find(x => x.id === t.topic)?.title || t.topic })).sort((a, b) => a.p - b.p);
    const notes = h('textarea.input', { rows: 5, placeholder: 'Ваши заметки об ученике: что получается, что нет, договорённости…' }, s.notes || '');
    let saveT; notes.addEventListener('input', () => { clearTimeout(saveT); saveT = setTimeout(() => api.patch(`/api/t/students/${s.id}`, { notes: notes.value }, { quiet: true }), 700); });
    box.append(
      h('div.grid.grid-4.mb',
        miniStat('Баланс', money(s.balance), s.balance < 0 ? 'var(--danger)' : s.balance > 0 ? 'var(--success)' : null, s.balance < 0 ? 'задолженность' : 'предоплата'),
        miniStat('Средний балл за ДЗ', s.avg_score != null ? `${s.avg_score}%` : '—', null, `${s.graded_count} проверено`),
        miniStat('Занятий проведено', att.done, null, att.missed ? `${att.missed} пропусков` : 'без пропусков'),
        miniStat('Ошибок исправлено', `${s.mistakes.f || 0} / ${s.mistakes.c || 0}`, null, 'работа над ошибками')),
      h('div.grid.grid-3',
        h('div.card.span-2',
          h('div.card-head', h('h3', 'Динамика результатов')),
          graded.length || s.exams.length ? h('div.stack',
            graded.length ? lineChart([{ name: 'ДЗ', color: 'var(--primary)', points: graded.map(t => ({ x: fmtDate(t.submitted_at).replace(/ \d{4}$/, ''), y: pct(t.score, t.max_score), label: t.title, suffix: '%' })) }], { max: 100, height: 180 }) : null,
            s.exams.length ? [h('h3.mt', 'Пробники'), lineChart([{ name: 'Пробники', color: 'var(--warning)', points: s.exams.map(e => ({ x: fmtDate(e.date), y: e.score, label: e.title, suffix: ` / ${e.max_score}` })) }], { height: 160, max: Math.max(...s.exams.map(e => e.max_score)) })] : null)
            : empty('📈', 'Пока нет данных', 'Здесь появится график, когда ученик сдаст первые задания'),
          h('div.row.mt', h('button.btn.btn-sm', { onclick: () => examDialog() }, icon('plus'), 'Добавить результат пробника'),
            s.exams.map(e => h('span.badge', `${e.title}: ${e.score}/${e.max_score}`, h('button.btn.btn-ghost.btn-icon.btn-sm', { style: { height: '18px', width: '18px' },
              onclick: async () => { if (await confirmDialog('Удалить результат?')) { await api.del(`/api/t/exams/${e.id}`); reload(); } } }, icon('x')))))),
        h('div.stack',
          h('div.card', h('div.card-head', h('h3', 'Ближайшие занятия'), h('a', { href: `#/t/students/${id}/lessons` }, 'Все →')),
            upcoming.length ? h('div.list', upcoming.map(l => h('div.list-item', h('div.grow', h('div.bold', fmtDate(l.start_at, { dow: true })), h('div.muted.small', `${fmtTime(l.start_at)} · ${l.topic || 'без темы'}`)),
              h('button.btn.btn-ghost.btn-sm', { onclick: () => lessonDialog({ lesson: { ...l, student: s.name }, students: [s], onSaved: reload }) }, icon('edit'))))) : h('p.muted.small', 'Не запланировано')),
          h('div.card', h('div.card-head', h('h3', 'Посещаемость')),
            h('div.row.nowrap', { style: { gap: '16px' } },
              donut([{ value: att.done, color: 'var(--success)' }, { value: att.missed, color: 'var(--danger)' }, { value: att.canceled, color: 'var(--muted)' }],
                { label: att.done + att.missed ? `${pct(att.done, att.done + att.missed)}%` : '—', size: 100 }),
              h('div.stack-sm.small', h('div', '🟢 Проведено: ', h('b', att.done)), h('div', '🔴 Пропуски: ', h('b', att.missed)), h('div', '⚪ Отмены: ', h('b', att.canceled))))))),
      h('div.grid.grid-2.mt',
        h('div.card', h('div.card-head', h('h3', 'Слабые темы по результатам')),
          weak.length ? h('div.stack-sm', weak.slice(0, 6).map(t => h('div', h('div.row.between.small', h('span', t.title), h('b', `${t.p}%`)),
            h('div.progress.sm', h('div', { style: { width: t.p + '%', background: t.p < 50 ? 'var(--danger)' : t.p < 75 ? 'var(--warning)' : 'var(--success)' } })))))
            : h('p.muted.small', 'Статистика по темам появится после проверенных заданий.')),
        h('div.card', h('div.card-head', h('h3', 'Заметки'), h('span.muted.tiny', 'сохраняются автоматически')), notes)),
      h('div.card.mt', h('div.card-head', h('h3', 'Активность на платформе'), h('span.muted.small', 'последние 4 месяца')), heatmap(s.activity)),
      h('div.card.mt', h('div.card-head', h('h3', 'Достижения')), h('div.row', s.achievements.map(a => h('span.badge', { class: a.got ? 'badge-success' : '', title: a.desc, style: { opacity: a.got ? 1 : .5 } }, `${a.icon} ${a.title}`)))),
      contacts());
  }

  function contacts() {
    const rows = [['Телефон', s.phone], ['Telegram', s.telegram && h('a', { href: `https://t.me/${s.telegram.replace('@', '')}`, target: '_blank' }, s.telegram)],
      ['Родитель', s.parent_name], ['Контакт родителя', s.parent_contact], ['Цена занятия', money(s.rate)], ['С нами с', fmtDate(s.created_at)]].filter(r => r[1]);
    return h('div.card.mt', h('div.card-head', h('h3', 'Контакты')), h('div.grid.grid-3', rows.map(([k, v]) => h('div', h('div.muted.small', k), h('div.bold', v)))));
  }

  function examDialog() {
    const form = h('div.form', h('div.form-row', field('Дата', h('input.input', { type: 'date', name: 'date', value: today() })),
      field('Название', h('input.input', { name: 'title', value: s.goal === 'ОГЭ' ? 'Пробный ОГЭ' : 'Пробный ЕГЭ' }))),
      h('div.form-row', field('Баллы', h('input.input', { type: 'number', name: 'score' })), field('Из', h('input.input', { type: 'number', name: 'max_score', value: s.goal === 'ОГЭ' ? 40 : 100 }))));
    modal({ title: 'Результат пробника', body: form, foot: close => [h('button.btn', { onclick: close }, 'Отмена'),
      h('button.btn.btn-primary', { onclick: async () => { await api.post(`/api/t/students/${s.id}/exams`, formData(form)); close(); reload(); } }, 'Добавить')] });
  }

  function lessons() {
    if (!s.lessons.length) return box.append(h('div.card', empty('🗓️', 'Занятий пока нет', null, h('button.btn.btn-primary', { onclick: () => lessonDialog({ students: [s], onSaved: reload }) }, 'Запланировать'))));
    box.append(h('div.card.pad-0', h('div.table-wrap', h('table.table',
      h('thead', h('tr', h('th', 'Дата'), h('th', 'Тема'), h('th', 'Статус'), h('th.hide-m', 'Итоги'), h('th.right', 'Цена'), h('th'))),
      h('tbody', s.lessons.map(l => h('tr',
        h('td.nowrap', h('div.bold', fmtDate(l.start_at)), h('div.muted.tiny', `${fmtTime(l.start_at)}, ${l.duration} мин`)),
        h('td', l.topic || h('span.muted', '—'), l.rating ? h('div.tiny', '★'.repeat(l.rating)) : null),
        h('td', select(Object.entries(STATUS).map(([k, [t]]) => [k, t]), l.status, { class: 'input', style: { height: '32px', width: 'auto' },
          onchange: async e => { await api.patch(`/api/t/lessons/${l.id}`, { status: e.target.value }); toast('Статус обновлён', 'success'); } })),
        h('td.hide-m.small.muted', { style: { maxWidth: '320px' } }, l.summary || ''),
        h('td.right.nowrap', money(l.price)),
        h('td', h('button.btn.btn-ghost.btn-sm', { onclick: () => lessonDialog({ lesson: { ...l, student: s.name }, students: [s], onSaved: reload }) }, icon('edit'))))))))));
  }

  function homework() {
    box.append(h('div.row.mb', h('a.btn.btn-primary', { href: '#/t/homework' }, icon('plus'), 'Выдать задание')));
    if (!s.targets.length) return box.append(h('div.card', empty('📝', 'Заданий пока не было')));
    box.append(h('div.card.pad-0', h('div.table-wrap', h('table.table',
      h('thead', h('tr', h('th', 'Задание'), h('th', 'Статус'), h('th.hide-m', 'Срок'), h('th.right', 'Результат'))),
      h('tbody', s.targets.map(t => h('tr.click', { onclick: () => location.hash = ['submitted', 'graded', 'returned'].includes(t.status) ? `#/t/review/${t.id}` : `#/t/homework/${t.assignment_id}` },
        h('td', h('div.bold', t.title), h('div.muted.tiny', t.kind === 'test' ? 'Тест' : 'Домашнее задание')),
        h('td', badge(...T_STATUS[t.status])),
        h('td.hide-m.small', t.due_at ? [fmtDateTime(t.due_at), ['assigned', 'started'].includes(t.status) && t.due_at < new Date().toISOString() ? h('div.text-danger.tiny', untilText(t.due_at)) : null] : '—'),
        h('td.right', t.score != null && t.status === 'graded' ? badge(`${t.score} / ${t.max_score}`, scoreClass(pct(t.score, t.max_score))) : '—'))))))));
  }

  function skills() {
    const bySection = {};
    for (const sk of s.skills) (bySection[sk.section] ||= []).push(sk);
    const stat = Object.fromEntries(s.topicStats.map(t => [t.topic, pct(t.got, t.max)]));
    const avg = s.skills.length ? s.skills.reduce((a, x) => a + x.level, 0) / s.skills.length : 0;
    box.append(
      h('div.notice.mb', 'Отмечайте, насколько ученик владеет каждой темой (0–5). Карту видят ученик и родитель. Рядом — процент верных ответов по теме из заданий.'),
      h('div.grid.grid-2',
        h('div.card', h('div.card-head', h('h3', 'Профиль по разделам')),
          radarChart(Object.entries(bySection).map(([sec, arr]) => ({ label: sec, value: arr.reduce((a, x) => a + x.level, 0) / arr.length }))),
          h('div.center.muted.small', `Средний уровень: ${avg.toFixed(1)} из 5`)),
        h('div.stack', Object.entries(bySection).map(([sec, arr]) => h('div.card', h('h3', sec),
          arr.map(sk => h('div.skill', h('div.small', sk.title, stat[sk.id] != null ? h('span.badge', { class: scoreClass(stat[sk.id]), style: { marginLeft: '6px' } }, `${stat[sk.id]}%`) : null),
            skillDots(sk.level, async lvl => { await api.put(`/api/t/students/${s.id}/skills`, { topic_id: sk.id, level: lvl }); sk.level = lvl; clear(box); skills(); }))))))));
  }

  function finance() {
    box.append(
      h('div.grid.grid-3.mb',
        miniStat('Оплачено всего', money(s.paid)), miniStat('Начислено за занятия', money(s.cost)),
        miniStat('Баланс', money(s.balance), s.balance < 0 ? 'var(--danger)' : 'var(--success)', s.balance < 0 ? `≈ ${Math.ceil(-s.balance / (s.rate || 1))} занятий в долг` : s.rate ? `≈ ${Math.floor(s.balance / s.rate)} занятий оплачено вперёд` : '')),
      h('div.row.mb', h('button.btn.btn-primary', { onclick: () => paymentDialog({ students: [s], onSaved: reload }) }, icon('plus'), 'Записать оплату'),
        s.balance < 0 ? h('button.btn', { onclick: () => copyText(`Здравствуйте! Напоминаю об оплате занятий по химии: ${money(-s.balance)}. Спасибо!`, 'Текст напоминания скопирован') }, icon('copy'), 'Текст напоминания об оплате') : null),
      s.payments.length ? h('div.card.pad-0', h('table.table', h('thead', h('tr', h('th', 'Дата'), h('th', 'Сумма'), h('th.hide-m', 'Способ'), h('th.hide-m', 'Комментарий'), h('th'))),
        h('tbody', s.payments.map(p => h('tr', h('td', fmtDate(p.date)), h('td.bold', money(p.amount)), h('td.hide-m', p.method || '—'), h('td.hide-m.muted', p.comment || ''),
          h('td.right', h('button.btn.btn-ghost.btn-sm', { onclick: async () => { if (await confirmDialog('Удалить оплату?')) { await api.del(`/api/t/payments/${p.id}`); reload(); } } }, icon('trash'))))))))
        : h('div.card', empty('💳', 'Оплат пока не было')));
  }

  function access() {
    const loginInp = h('input.input', { value: s.login || '', placeholder: 'логин' });
    const passInp = h('input.input', { placeholder: 'новый пароль (мин. 6 символов)' });
    box.append(h('div.grid.grid-2',
      h('div.card.stack', h('h3', 'Вход ученика'),
        s.registered ? h('p', 'Ученик зарегистрирован, логин: ', h('b', s.login)) : h('div.stack', h('p', 'Ученик ещё не зарегистрировался. Ссылка-приглашение:'),
          s.invite_code ? copyBox(`${location.origin}/#/join/${s.invite_code}`) : null),
        h('button.btn', { onclick: async () => {
          if (s.registered && !(await confirmDialog('Текущий логин и пароль ученика перестанут работать. Выдать новую ссылку-приглашение?', { ok: 'Выдать', danger: false }))) return;
          const r = await api.post(`/api/t/students/${s.id}/access`, {}); inviteDialog(s.name, r.invite_code, s.id);
        } }, icon('refresh'), 'Новая ссылка-приглашение'),
        h('hr'), h('h3', 'Задать логин и пароль вручную'), h('p.muted.small', 'Удобно для младших школьников: задайте данные сами и продиктуйте их.'),
        h('div.form-row', loginInp, passInp),
        h('button.btn', { onclick: async () => {
          const r = await api.post(`/api/t/students/${s.id}/access`, { login: loginInp.value, password: passInp.value });
          toast(`Готово. Логин: ${r.login}`, 'success'); reload();
        } }, 'Сохранить доступ')),
      h('div.card.stack', h('h3', 'Страница для родителей'),
        h('p.muted', 'Родитель видит посещаемость, результаты, карту знаний, баланс и ближайшие занятия — без входа в систему. Отправьте ссылку родителю:'),
        copyBox(parentUrl),
        h('div.row', h('a.btn', { href: parentUrl, target: '_blank' }, icon('eye'), 'Посмотреть'),
          h('button.btn', { onclick: async () => {
            if (!(await confirmDialog('Старая ссылка перестанет работать. Продолжить?', { ok: 'Обновить', danger: false }))) return;
            await api.post(`/api/t/students/${s.id}/parent-link`); toast('Ссылка обновлена', 'success'); reload();
          } }, icon('refresh'), 'Новая ссылка')),
        h('hr'),
        h('h3.text-danger', 'Удаление'), h('p.muted.small', 'Удалит ученика со всеми занятиями, оплатами и ответами. Если вы просто закончили заниматься — лучше перенести в архив.'),
        h('button.btn.btn-danger', { onclick: async () => {
          if (!(await confirmDialog(`Удалить ${s.name} безвозвратно?`))) return;
          await api.del(`/api/t/students/${s.id}`); toast('Ученик удалён'); location.hash = '#/t/students';
        } }, icon('trash'), 'Удалить ученика'))));
  }
}

function miniStat(label, value, color, sub) {
  return h('div.card.stat', h('div.label', label), h('div.value', { style: color ? { color } : {} }, value), sub ? h('div.delta', sub) : null);
}
