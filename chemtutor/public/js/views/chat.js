import { h, icon, clear, avatar, fmtTime, fmtDate, timeAgo, fileUrl, lightbox, fileSize, chemHTML, empty } from '../ui.js';
import { api, uploadFile, pickFiles } from '../api.js';

export default async function chat(el, { peer }, app) {
  const isT = app.user.role === 'teacher';
  const peers = await api.get('/api/chats');
  if (!isT) peer = peers[0]?.id;
  if (!peers.length) { el.append(h('h1', 'Сообщения'), h('div.card', empty('💬', 'Пока не с кем переписываться', 'Добавьте учеников — и здесь появятся диалоги'))); return; }

  const listEl = h('div.chat-list');
  const msgs = h('div.chat-msgs');
  const head = h('div.row', { style: { padding: '12px 16px', borderBottom: '1px solid var(--border)' } });
  const input = h('textarea.input', { placeholder: 'Сообщение… (Enter — отправить, Shift+Enter — новая строка)', rows: 1 });
  const wrap = h(`div.card.pad-0.chat${peer ? '.has-peer' : ''}`, isT ? listEl : null,
    h('div.chat-main', head, msgs, h('div.chat-input',
      h('button.btn.btn-ghost.btn-icon', { title: 'Прикрепить файл', onclick: attach }, icon('clip')), input,
      h('button.btn.btn-primary.btn-icon', { onclick: send, title: 'Отправить' }, icon('send')))));
  if (!isT) wrap.style.gridTemplateColumns = '1fr';
  el.append(h('div.page-head', h('h1', isT ? 'Сообщения' : 'Чат с преподавателем')), wrap);

  let lastId = 0, lastDay = '', timer;
  const drawList = () => clear(listEl).append(...peers.map(p => h(`a.chat-peer${String(p.id) === String(peer) ? '.active' : ''}`, { href: `#/t/chat/${p.id}` },
    avatar(p), h('div.grow', { style: { minWidth: 0 } }, h('div.row.between.nowrap', h('b.ellipsis', p.name), p.last ? h('span.muted.tiny.nowrap', timeAgo(p.last.created_at)) : null),
      h('div.row.between.nowrap', h('span.muted.small.ellipsis', p.last ? (p.last.from_id === app.user.id ? 'Вы: ' : '') + (p.last.text || '📎 файл') : 'Нет сообщений'),
        p.unread ? h('span.badge.badge-dot', p.unread) : null)))));
  if (isT) drawList();
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(); } });

  if (!peer) { head.append(h('span.muted', 'Выберите диалог')); msgs.append(h('div.empty', h('div.emoji', '💬'), h('p', 'Выберите ученика слева'))); return; }
  const p = peers.find(x => String(x.id) === String(peer));
  if (!p) { msgs.append(h('p.muted', 'Диалог не найден')); return; }
  head.append(isT ? h('a.btn.btn-ghost.btn-icon.btn-sm', { href: '#/t/chat', class: 'menu-only', title: 'Назад' }, icon('chevL')) : null, avatar(p, 'sm'),
    h('div.grow', h('b', p.name)), isT ? h('a.btn.btn-sm', { href: `#/t/students/${p.id}` }, 'Профиль') : null);

  const bubble = m => {
    const day = (m.created_at || '').slice(0, 10);
    const out = [];
    if (day !== lastDay) { out.push(h('div.chat-day', fmtDate(m.created_at.replace(' ', 'T').slice(0, 10)))); lastDay = day; }
    const isImg = /^image\//.test(m.file_mime || '');
    out.push(h(`div.msg${m.from_id === app.user.id ? '.me' : ''}`,
      m.file_id ? (isImg ? h('img', { src: fileUrl(m.file_id), onclick: () => lightbox(fileUrl(m.file_id)), style: { cursor: 'zoom-in' } })
        : h('a', { href: fileUrl(m.file_id), target: '_blank' }, '📎 ', m.file_name, m.file_size ? ` (${fileSize(m.file_size)})` : '')) : null,
      m.text ? h('div', { html: linkify(chemHTML(m.text)) }) : null,
      h('div.t', fmtTime(m.created_at), m.from_id === app.user.id ? (m.read_at ? ' ✓✓' : ' ✓') : '')));
    return out;
  };
  async function load() {
    const r = await api.get(`/api/chats/${peer}?after=${lastId}`, { quiet: true }).catch(() => null);
    if (!r?.messages.length) return;
    const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    if (!lastId) clear(msgs);
    for (const m of r.messages) msgs.append(...bubble(m));
    lastId = r.messages.at(-1).id;
    if (atBottom || r.messages.at(-1).from_id === app.user.id) msgs.scrollTop = msgs.scrollHeight;
    app.refresh();
  }
  async function send(fileId) {
    const text = input.value.trim();
    if (!text && typeof fileId !== 'number') return;
    input.value = ''; input.style.height = '';
    await api.post(`/api/chats/${peer}`, { text, file_id: typeof fileId === 'number' ? fileId : null });
    await load(); input.focus();
  }
  async function attach() {
    const files = await pickFiles({ multiple: true });
    for (const f of files) { const up = await uploadFile(f); await send(up.id); }
  }
  msgs.append(h('div.empty', h('div.emoji', '👋'), h('p', 'Напишите первое сообщение')));
  await load();
  msgs.scrollTop = msgs.scrollHeight;
  input.focus();
  timer = setInterval(load, 5000);
  return () => clearInterval(timer);
}

const linkify = html => html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
