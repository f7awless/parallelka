import { h, icon, toast, busy } from '../ui.js';
import { api } from '../api.js';

const HEX = `<svg class="hex" viewBox="0 0 200 200" fill="none" stroke="#fff" stroke-width="3"><path d="M100 20l60 35v70l-60 35-60-35V55z"/><path d="M100 50l34 20v40l-34 20-34-20V70z"/><path d="M100 20v30M160 55l-26 15M160 125l-26-15M100 160v-30M40 125l26-15M40 55l26 15"/></svg>`;

export default async function auth(el, { mode, code }, app) {
  let invite = null;
  if (mode === 'join') {
    invite = await api.get(`/api/invite/${code}`, { quiet: true }).catch(e => ({ error: e.message }));
  }
  const hero = h('div.auth-hero', { html: HEX },
  );
  hero.append(
    h('div', h('div.row', { style: { gap: '10px', marginBottom: '40px' } }, h('div.brand-logo', 'Хк'), h('b', { style: { fontSize: '18px' } }, 'ХимКабинет')),
      h('h1', mode === 'join' ? 'Добро пожаловать на занятия по химии!' : 'Всё для занятий химией — в одном месте'),
      h('p', 'Расписание, домашние задания с автопроверкой, тесты на время, материалы, карточки, тренажёр и прогресс к экзамену.')),
    h('div.feat',
      h('div', '📅 Расписание и напоминания'), h('div', '✅ Автопроверка ДЗ и тестов'), h('div', '🧪 Таблица Менделеева и калькуляторы'),
      h('div', '🃏 Карточки с интервальным повторением'), h('div', '📈 Карта знаний к ОГЭ/ЕГЭ'), h('div', '💬 Чат и файлы')),
    h('div.small.hide-m', { style: { opacity: .6 } }, '«Химия — это наука о превращениях». Пусть превращение в отличника будет удобным.'));

  let form;
  if (mode === 'setup') {
    form = h('form.form',
      h('div', h('h2', 'Настройка платформы'), h('p.muted', 'Создайте аккаунт преподавателя. Мы сразу добавим банк задач, карточки и конспекты — их можно редактировать.')),
      h('label.field', h('span', 'Ваше имя'), h('input.input', { name: 'name', placeholder: 'Анна Сергеевна', required: true, autocomplete: 'name' })),
      h('label.field', h('span', 'Логин'), h('input.input', { name: 'login', placeholder: 'anna', required: true, autocomplete: 'username', autocapitalize: 'off' })),
      h('label.field', h('span', 'Пароль'), h('input.input', { name: 'password', type: 'password', required: true, minlength: 6, autocomplete: 'new-password' })),
      h('button.btn.btn-primary.btn-lg.btn-block', { type: 'submit' }, 'Создать кабинет'));
  } else if (mode === 'join') {
    form = invite?.error
      ? h('div.stack', h('h2', 'Приглашение не найдено'), h('p.muted', invite.error + '. Попросите преподавателя прислать новую ссылку.'), h('a.btn', { href: '#/login' }, 'Ко входу'))
      : h('form.form',
        h('div', h('h2', `Привет, ${invite.name.split(' ')[0]}! 👋`), h('p.muted', `${invite.teacher} приглашает вас в свой кабинет. Придумайте логин и пароль для входа.`)),
        h('label.field', h('span', 'Логин'), h('input.input', { name: 'login', required: true, autocomplete: 'username', autocapitalize: 'off', placeholder: 'например, masha2009' })),
        h('label.field', h('span', 'Пароль'), h('input.input', { name: 'password', type: 'password', required: true, minlength: 6, autocomplete: 'new-password' }),
          h('div.hint', 'Минимум 6 символов')),
        h('button.btn.btn-primary.btn-lg.btn-block', { type: 'submit' }, 'Начать заниматься'));
  } else {
    form = h('form.form',
      h('div', h('h2', 'Вход'), h('p.muted', 'Для преподавателя и учеников')),
      h('label.field', h('span', 'Логин'), h('input.input', { name: 'login', required: true, autocomplete: 'username', autocapitalize: 'off' })),
      h('label.field', h('span', 'Пароль'), h('input.input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' })),
      h('button.btn.btn-primary.btn-lg.btn-block', { type: 'submit' }, 'Войти'),
      h('p.muted.small.center', 'Нет аккаунта? Попросите у преподавателя ссылку-приглашение.'));
  }
  if (form.tagName === 'FORM') form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('[type=submit]');
    const url = mode === 'setup' ? '/api/setup' : mode === 'join' ? '/api/register' : '/api/login';
    if (mode === 'join') data.code = code;
    await busy(btn, api.post(url, data).then(async () => {
      await app.refresh();
      if (mode !== 'login') toast(mode === 'setup' ? 'Кабинет создан! 🎉' : 'Добро пожаловать! 🎉', 'success');
      location.hash = app.base;
    }).catch(() => { }));
  });

  el.append(h('div.auth', hero, h('div.auth-form', h('div.box', form,
    h('div.row', { style: { justifyContent: 'center', marginTop: '24px' } },
      h('a.btn.btn-ghost.btn-sm', { href: '#/tools' }, icon('flask'), 'Химические инструменты без входа'))))));
}
