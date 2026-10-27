import { h, icon, field, toast, formData, copyBox, money, fmtDate, avatar } from '../ui.js';
import { api } from '../api.js';

export default async function settings(el, _, app) {
  const u = app.user;
  const isT = u.role === 'teacher';
  const profile = h('div.form',
    field('Имя', h('input.input', { name: 'name', value: u.name })),
    h('div.form-row', field('Телефон', h('input.input', { name: 'phone', value: u.phone || '' })), field('Telegram', h('input.input', { name: 'telegram', value: u.telegram || '', placeholder: '@username' }))),
    h('div', h('button.btn.btn-primary', { onclick: async () => { await api.patch('/api/me', formData(profile)); await app.refresh(); toast('Сохранено', 'success'); } }, 'Сохранить')));
  const pass = h('div.form',
    field('Текущий пароль', h('input.input', { type: 'password', name: 'old', autocomplete: 'current-password' })),
    field('Новый пароль', h('input.input', { type: 'password', name: 'password', autocomplete: 'new-password' })),
    h('div', h('button.btn', { onclick: async () => { await api.post('/api/me/password', formData(pass)); toast('Пароль изменён', 'success'); pass.querySelectorAll('input').forEach(i => { i.value = ''; }); } }, 'Сменить пароль')));

  const extra = [];
  if (isT) {
    extra.push(h('div.card.stack', h('h3', 'Демо-данные'), h('p.muted.small', 'Создать 3 демо-учеников с занятиями, оплатами и сданными работами (пароль demo123). Их можно потом удалить в профиле ученика.'),
      h('div', h('button.btn', { onclick: async e => { e.target.disabled = true; const r = await api.post('/api/t/demo'); toast(`Созданы: ${r.logins.map(l => l.login).join(', ')}`, 'success'); } }, 'Создать демо-данные'))));
    extra.push(h('div.card.stack', h('h3', 'Резервная копия'), h('p.muted.small', 'Все данные хранятся в файле data/chemtutor.db на сервере. Команда «npm run backup» сохраняет копию в data/backups — настройте её запуск раз в день (см. README).')));
  } else {
    const p = await api.get('/api/s/progress');
    const cal = await api.get('/api/s/calendar');
    extra.push(h('div.card.stack', h('h3', 'Оплата занятий'),
      h('div.row', h('span', 'Баланс:'), h('b', { style: { color: p.balance < 0 ? 'var(--danger)' : 'var(--success)', fontSize: '20px' } }, money(p.balance))),
      h('p.muted.small', p.balance < 0 ? 'Есть задолженность — уточните у преподавателя, как удобнее оплатить.' : 'Спасибо, что оплачиваете вовремя!'),
      p.payments.length ? h('div.list', p.payments.slice(0, 8).map(x => h('div.list-item', h('span.grow', fmtDate(x.date)), h('span.muted.small', x.method || ''), h('b', money(x.amount))))) : null));
    if (cal.token) extra.push(h('div.card.stack', h('h3', 'Календарь занятий'), h('p.muted.small', 'Добавьте ссылку в Google/Яндекс/Apple календарь — занятия будут появляться там автоматически с напоминанием.'),
      copyBox(`${location.origin}/api/ics/${cal.token}.ics`)));
  }

  el.append(h('div.page-head', h('div.row', avatar(u, 'lg'), h('div', h('h1', isT ? 'Настройки' : 'Профиль'), h('div.sub', `Логин: ${u.login}`)))),
    h('div.grid.grid-2', h('div.card', h('h3', 'Профиль'), profile), h('div.card', h('h3', 'Пароль'), pass), ...extra,
      h('div.card.stack', h('h3', 'Оформление'), h('div.row', h('button.btn', { onclick: () => app.toggleTheme() }, icon('moon'), 'Светлая / тёмная тема')),
        h('p.muted.small', 'Платформу можно установить на телефон как приложение: в браузере выберите «На экран Домой» / «Установить приложение».'))));
}
