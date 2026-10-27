import { h, icon, clear, modal, field, select, toast, avatar, money, fmtRelDay, fmtTime, badge, scoreClass, empty, copyBox, formData, timeAgo } from '../ui.js';
import { api } from '../api.js';

export const GOALS = ['ЕГЭ', 'ОГЭ', 'Школьная программа', 'Олимпиада', 'ДВИ / поступление', 'Для себя'];

export default async function students(el, _, app) {
  let archived = false, q = '', sort = 'name';
  const listBox = h('div');
  const search = h('input.input', { placeholder: 'Поиск по имени', oninput: e => { q = e.target.value.toLowerCase(); draw(); } });
  let data = [];
  const load = async () => { data = await api.get(`/api/t/students${archived ? '?archived=1' : ''}`); draw(); };

  el.append(
    h('div.page-head', h('div', h('h1', 'Ученики'), h('div.sub', 'Профили, баланс, прогресс и доступ')),
      h('div.page-actions',
        h('button.btn', { onclick: () => broadcast() }, icon('megaphone'), h('span.hide-m', 'Рассылка')),
        h('button.btn.btn-primary', { onclick: () => addStudentDialog(load) }, icon('plus'), 'Добавить ученика'))),
    h('div.row.mb', h('div.search.grow', { style: { maxWidth: '360px' } }, icon('search'), search),
      select([['name', 'По имени'], ['next', 'По ближайшему занятию'], ['balance', 'По балансу'], ['score', 'По успеваемости'], ['activity', 'По активности']], sort,
        { style: { width: 'auto' }, onchange: e => { sort = e.target.value; draw(); } }),
      h('label.check', h('input', { type: 'checkbox', onchange: e => { archived = e.target.checked; load(); } }), 'Архив')),
    listBox);

  function draw() {
    let rows = data.filter(s => !q || s.name.toLowerCase().includes(q));
    const by = {
      name: (a, b) => a.name.localeCompare(b.name),
      next: (a, b) => (a.next_lesson?.start_at || '9').localeCompare(b.next_lesson?.start_at || '9'),
      balance: (a, b) => a.balance - b.balance,
      score: (a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1),
      activity: (a, b) => (b.last_active_day || '').localeCompare(a.last_active_day || ''),
    };
    rows.sort(by[sort]);
    if (!data.length) {
      clear(listBox).append(h('div.card', empty(archived ? '🗄️' : '👩‍🎓', archived ? 'Архив пуст' : 'Учеников пока нет',
        archived ? 'Сюда попадают ученики, с которыми вы закончили заниматься' : 'Добавьте первого ученика — он получит ссылку-приглашение в личный кабинет',
        archived ? null : h('button.btn.btn-primary', { onclick: () => addStudentDialog(load) }, icon('plus'), 'Добавить ученика'))));
      return;
    }
    clear(listBox).append(h('div.card.pad-0', h('div.table-wrap', h('table.table',
      h('thead', h('tr', h('th', 'Ученик'), h('th.hide-m', 'Цель'), h('th', 'Ближайшее'), h('th.hide-m', 'Успеваемость'), h('th.hide-m', 'ДЗ'), h('th.right', 'Баланс'))),
      h('tbody', rows.map(s => h('tr.click', { onclick: () => location.hash = `#/t/students/${s.id}` },
        h('td', h('div.row.nowrap', avatar(s), h('div', h('div.bold', s.name),
          h('div.muted.tiny', [s.grade && `${s.grade} класс`, !s.registered && 'не зарегистрирован', s.last_active_day && `активность: ${fmtRelDay(s.last_active_day).toLowerCase()}`].filter(Boolean).join(' · '))))),
        h('td.hide-m', s.goal ? badge(s.goal + (s.target_score ? ` · ${s.target_score}` : ''), 'badge-primary') : h('span.muted', '—')),
        h('td.nowrap', s.next_lesson ? [h('div', fmtRelDay(s.next_lesson.start_at)), h('div.muted.tiny', fmtTime(s.next_lesson.start_at))] : h('span.muted', '—')),
        h('td.hide-m', s.avg_score != null ? badge(`${s.avg_score}%`, scoreClass(s.avg_score)) : h('span.muted', '—')),
        h('td.hide-m', h('div.row.nowrap', s.to_check ? badge(`${s.to_check} проверить`, 'badge-primary') : null, s.overdue ? badge(`${s.overdue} просроч.`, 'badge-danger') : null,
          s.pending_hw && !s.overdue ? badge(`${s.pending_hw} в работе`) : null, !s.to_check && !s.pending_hw ? h('span.muted', '—') : null)),
        h('td.right.nowrap.bold', { style: { color: s.balance < 0 ? 'var(--danger)' : s.balance > 0 ? 'var(--success)' : '' } }, money(s.balance)))))))));
  }

  async function broadcast() {
    const text = h('textarea.input', { placeholder: 'Например: на следующей неделе занятий не будет — я на конференции 🙂', rows: 4 });
    modal({ title: 'Сообщение всем ученикам', body: h('div.form', h('p.muted', 'Сообщение придёт каждому активному ученику в личный чат.'), text),
      foot: close => [h('button.btn', { onclick: close }, 'Отмена'), h('button.btn.btn-primary', { onclick: async () => {
        const r = await api.post('/api/t/broadcast', { text: text.value }); toast(`Отправлено: ${r.sent}`, 'success'); close();
      } }, icon('send'), 'Отправить')] });
  }

  await load();
  if (location.hash.includes('new=1')) { history.replaceState(null, '', '#/t/students'); addStudentDialog(load); }
}

export function studentForm(s = {}) {
  return h('div.form',
    h('div.form-row', field('Имя и фамилия', h('input.input', { name: 'name', value: s.name || '', required: true, placeholder: 'Мария Иванова' })),
      field('Класс', select(['', '7', '8', '9', '10', '11', 'Студент', 'Взрослый'].map(v => [v, v || '—']), s.grade, { name: 'grade' }))),
    h('div.form-row', field('Цель', select([['', '—'], ...GOALS], s.goal, { name: 'goal' })),
      field('Целевой балл', h('input.input', { name: 'target_score', type: 'number', value: s.target_score ?? '', placeholder: 'напр. 85' })),
      field('Цена занятия, ₽', h('input.input', { name: 'rate', type: 'number', value: s.rate ?? '', step: 100, placeholder: '2000' }))),
    h('div.form-row', field('Телефон', h('input.input', { name: 'phone', value: s.phone || '', type: 'tel' })), field('Telegram', h('input.input', { name: 'telegram', value: s.telegram || '', placeholder: '@username' }))),
    h('div.form-row', field('Родитель', h('input.input', { name: 'parent_name', value: s.parent_name || '' })), field('Контакт родителя', h('input.input', { name: 'parent_contact', value: s.parent_contact || '' }))),
    field('Заметки (видите только вы)', h('textarea.input', { name: 'notes', rows: 3, placeholder: 'Сильные/слабые стороны, особенности, договорённости' }, s.notes || '')));
}

export function addStudentDialog(onDone) {
  const form = studentForm();
  modal({ title: 'Новый ученик', body: form, foot: close => [h('button.btn', { onclick: close }, 'Отмена'),
    h('button.btn.btn-primary', { onclick: async () => {
      const data = formData(form);
      const r = await api.post('/api/t/students', data);
      close(); onDone?.();
      inviteDialog(data.name, r.invite_code, r.id);
    } }, 'Добавить')] });
}

export function inviteDialog(name, code, id) {
  const url = `${location.origin}/#/join/${code}`;
  const text = `Привет! Это ссылка в личный кабинет для занятий химией: ${url}\nОткрой её и придумай логин и пароль.`;
  modal({ title: 'Приглашение готово 🎉', body: h('div.stack',
    h('p', `Отправьте ${name.split(' ')[0]} эту ссылку — по ней можно один раз зарегистрироваться и придумать логин с паролем.`),
    copyBox(url), h('div.row',
      h('a.btn', { href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Ссылка в личный кабинет по химии')}`, target: '_blank' }, icon('send'), 'Telegram'),
      h('a.btn', { href: `https://wa.me/?text=${encodeURIComponent(text)}`, target: '_blank' }, icon('chat'), 'WhatsApp')),
    h('p.muted.small', `Код приглашения: ${code}. Если ученик потеряет доступ, в его профиле можно выдать новую ссылку или задать пароль вручную.`)),
    foot: close => [h('a.btn.btn-primary', { href: `#/t/students/${id}`, onclick: close }, 'Открыть профиль')] });
}
