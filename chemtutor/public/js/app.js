import { h, icon, clear, avatar, toast, spinner, timeAgo, modal, debounce } from './ui.js';
import { api } from './api.js';

// ---------- theme ----------
const THEME_KEY = 'ct-theme';
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };
export { store };
function applyTheme(t) {
  const theme = t || store.get(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  return theme;
}
applyTheme();

// ---------- routes ----------
const TEACHER_NAV = [
  ['', 'home', 'Главная'],
  ['students', 'users', 'Ученики'],
  ['schedule', 'calendar', 'Расписание'],
  ['homework', 'clipboard', 'Задания', 'check'],
  ['bank', 'db', 'Банк задач'],
  ['materials', 'book', 'Материалы'],
  ['decks', 'cards', 'Карточки'],
  ['finance', 'wallet', 'Финансы'],
  ['chat', 'chat', 'Сообщения', 'unread'],
];
const STUDENT_NAV = [
  ['', 'home', 'Главная'],
  ['schedule', 'calendar', 'Расписание'],
  ['homework', 'clipboard', 'Задания', 'hw'],
  ['materials', 'book', 'Материалы'],
  ['cards', 'cards', 'Карточки'],
  ['practice', 'dumbbell', 'Тренажёр'],
  ['mistakes', 'repeat', 'Работа над ошибками'],
  ['progress', 'chart', 'Мой прогресс'],
  ['focus', 'timer', 'Фокус-таймер'],
  ['chat', 'chat', 'Чат с преподавателем', 'unread'],
];
const BOTTOM = { teacher: ['', 'students', 'schedule', 'homework', 'chat'], student: ['', 'schedule', 'homework', 'cards', 'chat'] };

const ROUTES = [
  [/^login$/, 'auth', { mode: 'login' }, 'public'],
  [/^setup$/, 'auth', { mode: 'setup' }, 'public'],
  [/^join\/([\w-]+)$/, 'auth', { mode: 'join' }, 'public', ['code']],
  [/^parent\/([\w-]+)$/, 'parent', {}, 'public', ['token']],
  [/^tools(?:\/(\w+))?$/, 'tools', {}, 'any', ['tab']],
  [/^t$/, 't-dashboard', {}, 'teacher'],
  [/^t\/students$/, 't-students', {}, 'teacher'],
  [/^t\/students\/(\d+)(?:\/(\w+))?$/, 't-student', {}, 'teacher', ['id', 'tab']],
  [/^t\/schedule$/, 't-schedule', {}, 'teacher'],
  [/^t\/homework$/, 't-homework', {}, 'teacher'],
  [/^t\/homework\/new$/, 't-editor', {}, 'teacher'],
  [/^t\/homework\/(\d+)\/edit$/, 't-editor', {}, 'teacher', ['id']],
  [/^t\/homework\/(\d+)$/, 't-assignment', {}, 'teacher', ['id']],
  [/^t\/review\/(\d+)$/, 't-review', {}, 'teacher', ['id']],
  [/^t\/bank$/, 't-bank', {}, 'teacher'],
  [/^t\/materials$/, 't-materials', {}, 'teacher'],
  [/^t\/decks$/, 't-decks', {}, 'teacher'],
  [/^t\/finance$/, 't-finance', {}, 'teacher'],
  [/^t\/chat(?:\/(\d+))?$/, 'chat', {}, 'teacher', ['peer']],
  [/^t\/settings$/, 'settings', {}, 'teacher'],
  [/^s$/, 's-dashboard', {}, 'student'],
  [/^s\/schedule$/, 's-schedule', {}, 'student'],
  [/^s\/homework$/, 's-homework', {}, 'student'],
  [/^s\/homework\/(\d+)$/, 's-solve', {}, 'student', ['id']],
  [/^s\/materials$/, 's-materials', {}, 'student'],
  [/^s\/materials\/(\d+)$/, 's-material', {}, 'student', ['id']],
  [/^s\/cards$/, 's-cards', {}, 'student'],
  [/^s\/cards\/(\d+)$/, 's-study', {}, 'student', ['id']],
  [/^s\/practice$/, 's-practice', {}, 'student'],
  [/^s\/mistakes$/, 's-mistakes', {}, 'student'],
  [/^s\/progress$/, 's-progress', {}, 'student'],
  [/^s\/focus$/, 's-focus', {}, 'student'],
  [/^s\/chat$/, 'chat', {}, 'student'],
  [/^s\/profile$/, 'settings', {}, 'student'],
];

export const app = {
  state: null,
  async refresh() { this.state = await api.get('/api/state', { quiet: true }); updateBadges(); return this.state; },
  get user() { return this.state?.user; },
  get base() { return this.user?.role === 'teacher' ? '#/t' : '#/s'; },
  go(hash) { if (location.hash === hash) render(); else location.hash = hash; },
  toggleTheme() {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    store.set(THEME_KEY, t); applyTheme(t);
    document.querySelectorAll('[data-theme-icon]').forEach(b => b.replaceChildren(icon(t === 'dark' ? 'sun' : 'moon')));
  },
};
window.app = app;

const root = document.getElementById('root');
let shell = null;   // {sidebar, content, role}
let renderSeq = 0;
let viewCleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
  for (const [re, view, extra, access, keys = []] of ROUTES) {
    const m = raw.match(re);
    if (m) return { view, access, params: { ...extra, ...Object.fromEntries(keys.map((k, i) => [k, m[i + 1]])) }, path: raw };
  }
  return null;
}

async function render() {
  const seq = ++renderSeq;
  viewCleanup?.(); viewCleanup = null;
  document.querySelectorAll('.sidebar-back, .modal-back, .dropdown').forEach(e => e.remove());
  if (!app.state) await app.refresh().catch(() => { app.state = { user: null }; });
  let route = parseHash();
  const u = app.user;
  if (!route) {
    if (!u) { location.replace(app.state.needsSetup ? '#/setup' : '#/login'); return; }
    location.replace(app.base); return;
  }
  if (route.access === 'public') {
    if (u && route.params.mode && route.params.mode !== 'join') { location.replace(app.base); return; }
    if (route.params.mode === 'login' && app.state.needsSetup) { location.replace('#/setup'); return; }
    shell = null;
    return mount(seq, route, clear(root));
  }
  if (!u && route.access === 'any') {
    shell = null;
    const wrap = h('div.public', { style: { maxWidth: '1280px' } },
      h('div.row.between.mb', h('a.brand', { href: '#/login' }, h('div.brand-logo', 'Хк'), 'ХимКабинет'),
        h('div.row', h('button.btn.btn-ghost.btn-icon', { onclick: () => app.toggleTheme(), dataset: { themeIcon: '1' } }, icon('moon')), h('a.btn', { href: '#/login' }, 'Войти'))));
    const inner = h('div');
    clear(root).append(wrap); wrap.append(inner);
    return mount(seq, route, inner);
  }
  if (!u) { location.replace(app.state.needsSetup ? '#/setup' : '#/login'); return; }
  if (route.access === 'teacher' && u.role !== 'teacher') { location.replace('#/s'); return; }
  if (route.access === 'student' && u.role !== 'student') { location.replace('#/t'); return; }
  if (!shell || shell.role !== u.role) buildShell(u);
  highlightNav(route.path);
  shell.sidebar.classList.remove('open');
  window.scrollTo(0, 0);
  return mount(seq, route, clear(shell.content));
}

async function mount(seq, route, el) {
  el.append(spinner());
  try {
    const mod = await import(`./views/${route.view}.js`);
    if (seq !== renderSeq) return;
    clear(el);
    const cleanup = await mod.default(el, route.params, app);
    if (typeof cleanup === 'function') { if (seq === renderSeq) viewCleanup = cleanup; else cleanup(); }
    const title = el.querySelector('h1')?.textContent;
    document.title = title ? `${title} · ХимКабинет` : 'ХимКабинет';
  } catch (e) {
    if (seq !== renderSeq) return;
    console.error(e);
    clear(el).append(h('div.empty', h('div.emoji', '🧯'), h('h3', 'Не удалось открыть страницу'), h('p', e.message || String(e)),
      h('button.btn', { onclick: () => render() }, icon('refresh'), 'Попробовать снова')));
  }
}

function buildShell(u) {
  const isT = u.role === 'teacher';
  const base = isT ? '#/t' : '#/s';
  const items = isT ? TEACHER_NAV : STUDENT_NAV;
  const navLink = ([path, ic, label, badgeKey]) => h('a', { href: path ? `${base}/${path}` : base, dataset: { path: (isT ? 't' : 's') + (path ? '/' + path : '') } },
    icon(ic), h('span', label), badgeKey ? h('span.badge.badge-dot.hidden', { dataset: { badge: badgeKey } }) : null);
  const sidebar = h('aside.sidebar',
    h('a.brand', { href: base }, h('div.brand-logo', 'Хк'), 'ХимКабинет'),
    h('nav.nav', items.map(navLink),
      h('div.nav-section', 'Инструменты'),
      h('a', { href: '#/tools', dataset: { path: 'tools' } }, icon('flask'), h('span', 'Химия: таблицы и расчёты')),
      isT ? h('a', { href: '#/t/settings', dataset: { path: 't/settings' } }, icon('settings'), h('span', 'Настройки')) : h('a', { href: '#/s/profile', dataset: { path: 's/profile' } }, icon('user'), h('span', 'Профиль'))),
    h('div.sidebar-foot',
      h('div.user-chip', avatar(u), h('div.meta', h('div.name', u.name), h('div.role', isT ? 'Преподаватель' : `Ученик${u.grade ? ', ' + u.grade + ' класс' : ''}`)),
        h('button.btn.btn-ghost.btn-icon.btn-sm', { title: 'Выйти', onclick: logout }, icon('logout')))));
  const notifBtn = h('button.btn.btn-ghost.btn-icon', { title: 'Уведомления', onclick: e => openNotifications(e.currentTarget.parentElement) },
    icon('bell'), h('span.badge.badge-dot.hidden', { style: { position: 'absolute', top: '2px', right: '2px' }, dataset: { badge: 'notif' } }));
  const topbar = h('header.topbar',
    h('button.btn.btn-ghost.btn-icon.menu-btn', { onclick: () => {
      sidebar.classList.add('open');
      document.body.append(h('div.sidebar-back', { onclick: e => { sidebar.classList.remove('open'); e.target.remove(); } }));
    }, 'aria-label': 'Меню' }, icon('menu')),
    isT ? h('button.btn.btn-ghost.hide-m', { onclick: openSearch, style: { color: 'var(--muted)', gap: '8px' } }, icon('search'), 'Поиск', h('span.kbd', 'Ctrl K')) : streakChip(),
    h('div.spacer'),
    h('div.rel', notifBtn),
    h('button.btn.btn-ghost.btn-icon', { title: 'Тема', onclick: () => app.toggleTheme(), dataset: { themeIcon: '1' } }, icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')));
  const content = h('main.content');
  const bottom = h('nav.bottom-nav', BOTTOM[u.role].map(p => {
    const it = items.find(i => i[0] === p);
    return h('a', { href: p ? `${base}/${p}` : base, dataset: { path: (isT ? 't' : 's') + (p ? '/' + p : '') } }, icon(it[1]), h('span', it[2].split(' ')[0]),
      it[3] ? h('span.badge.badge-dot.hidden', { dataset: { badge: it[3] } }) : null);
  }));
  clear(root).append(h('div.app', sidebar, h('div.main', topbar, content)), bottom);
  shell = { sidebar, content, role: u.role };
  updateBadges();
}

function streakChip() {
  const s = app.state;
  return h('a.btn.btn-ghost', { href: '#/s/progress', title: 'Серия дней и уровень', style: { gap: '10px' } },
    h('span', { style: { color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 } }, icon('fire'), String(s.streak || 0)),
    h('span.muted.small', `Ур. ${s.level?.level || 1} · ${s.level?.xp || 0} XP`));
}

function highlightNav(path) {
  const links = [...document.querySelectorAll('[data-path]')];
  const best = links.map(a => a.dataset.path).filter(p => path === p || path.startsWith(p + '/')).sort((a, b) => b.length - a.length)[0];
  for (const a of links) a.classList.toggle('active', a.dataset.path === best);
}

function updateBadges() {
  const s = app.state; if (!s) return;
  const set = (k, n) => document.querySelectorAll(`[data-badge="${k}"]`).forEach(b => { b.textContent = n > 99 ? '99+' : n; b.classList.toggle('hidden', !n); });
  set('unread', s.unread || 0);
  set('notif', s.notif || 0);
}

async function openNotifications(anchor) {
  if (anchor.querySelector('.dropdown')) { anchor.querySelector('.dropdown').remove(); return; }
  const list = await api.get('/api/notifications');
  const dd = h('div.dropdown',
    h('div.row.between', { style: { padding: '12px 14px', borderBottom: '1px solid var(--border)' } }, h('b', 'Уведомления'),
      list.length ? h('span.muted.tiny', `${list.filter(n => !n.read_at).length} новых`) : null),
    list.length ? list.map(n => h('a.cmdk-item', { href: n.link || '#', style: { alignItems: 'flex-start', borderBottom: '1px solid var(--border)', fontWeight: n.read_at ? 400 : 600 } },
      h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: n.read_at ? 'transparent' : 'var(--primary)', marginTop: '7px', flexShrink: 0 } }),
      h('div', h('div.small', n.text), h('div.muted.tiny', timeAgo(n.created_at)))))
      : h('div.empty', { style: { padding: '28px' } }, h('div.emoji', '🔕'), h('div', 'Пока ничего нет')));
  anchor.append(dd);
  const close = e => { if (!dd.contains(e.target) || e.target.closest('a')) { dd.remove(); document.removeEventListener('click', close, true); } };
  setTimeout(() => document.addEventListener('click', close, true));
  if (list.some(n => !n.read_at)) { await api.post('/api/notifications/read', {}, { quiet: true }); app.state.notif = 0; updateBadges(); }
}

// ---------- quick search (Ctrl+K) for teacher ----------
async function openSearch() {
  if (app.user?.role !== 'teacher' || document.querySelector('.cmdk')) return;
  const pages = [...TEACHER_NAV.map(([p, ic, l]) => ({ label: l, icon: ic, href: p ? `#/t/${p}` : '#/t' })),
    { label: 'Новое задание', icon: 'plus', href: '#/t/homework/new' }, { label: 'Таблица Менделеева', icon: 'flask', href: '#/tools/table' },
    { label: 'Уравнять реакцию', icon: 'flask', href: '#/tools/balance' }, { label: 'Молярная масса', icon: 'flask', href: '#/tools/mass' },
    { label: 'Таблица растворимости', icon: 'flask', href: '#/tools/solubility' }, { label: 'Настройки', icon: 'settings', href: '#/t/settings' }];
  const students = await api.get('/api/t/students', { quiet: true }).catch(() => []);
  const inp = h('input.input', { placeholder: 'Ученик, раздел или инструмент…', style: { border: 0, boxShadow: 'none', height: '48px', fontSize: '16px' } });
  const list = h('div', { style: { maxHeight: '50vh', overflowY: 'auto', borderTop: '1px solid var(--border)' } });
  let items = [], active = 0;
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    items = [...students.map(s => ({ label: s.name, sub: [s.grade && s.grade + ' кл.', s.goal].filter(Boolean).join(' · '), user: s, href: `#/t/students/${s.id}` })), ...pages]
      .filter(i => !q || i.label.toLowerCase().includes(q)).slice(0, 12);
    active = Math.min(active, items.length - 1);
    clear(list).append(...items.map((it, i) => h(`a.cmdk-item${i === active ? '.active' : ''}`, { href: it.href, onclick: () => m.close() },
      it.user ? avatar(it.user, 'sm') : icon(it.icon), h('span', it.label), it.sub ? h('span.muted.small', it.sub) : null)));
    if (!items.length) list.append(h('div.muted', { style: { padding: '14px' } }, 'Ничего не найдено'));
  };
  inp.addEventListener('input', () => { active = 0; draw(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); draw(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); draw(); e.preventDefault(); }
    if (e.key === 'Enter' && items[active]) { location.hash = items[active].href; m.close(); }
  });
  const m = modal({ title: 'Быстрый переход', body: h('div.cmdk', { style: { margin: '-20px' } }, inp, list) });
  draw();
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
});

async function logout() {
  await api.post('/api/logout');
  app.state = null; shell = null;
  location.hash = '#/login';
}

// poll unread counters
const poll = async () => {
  if (!app.user || document.hidden) return;
  const prev = app.state.unread || 0;
  try {
    const s = await api.get('/api/state', { quiet: true });
    if (!s.user) return;
    const old = app.state; app.state = { ...old, ...s };
    updateBadges();
    if ((s.unread || 0) > prev && !location.hash.includes('/chat')) toast('Новое сообщение 💬');
  } catch { }
};
setInterval(poll, 20000);
document.addEventListener('visibilitychange', poll);

window.addEventListener('hashchange', render);
window.addEventListener('unhandledrejection', e => { if (e.reason?.status === undefined) console.error(e.reason); });
render();

// PWA
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => { });

export const debouncedRefresh = debounce(() => app.refresh(), 500);
