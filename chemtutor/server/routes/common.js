import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { one, all, run, insert, update, tx, UPLOAD_DIR, parseJSON } from '../db.js';
import { fail } from '../http.js';
import { hashPassword, verifyPassword, createSession, destroySession, publicUser, requireAuth, requireTeacher, randomToken } from '../auth.js';
import { allTopics, balanceOf, levelInfo, notify, currentStreak } from '../grade.js';
import { seedTeacher } from '../seed.js';

const MAX_FILE = 15 * 1024 * 1024;

const validLogin = l => typeof l === 'string' && /^[a-zA-Z0-9_.\-@]{3,40}$/.test(l);
const validPass = p => typeof p === 'string' && p.length >= 6;

/** Is `a` allowed to talk to / see files of `b`? Teacher <-> own students only. */
export function related(a, b) {
  if (a.id === b.id) return true;
  if (a.role === 'teacher' && b.teacher_id === a.id) return true;
  if (a.role === 'student' && a.teacher_id === b.id) return true;
  return false;
}

export default function commonRoutes(r) {
  // ---------- auth ----------
  r.get('/api/state', ctx => {
    const needsSetup = !one(`SELECT id FROM users WHERE role = 'teacher' LIMIT 1`);
    let extra = {};
    if (ctx.user) {
      const unread = one('SELECT COUNT(*) c FROM messages WHERE to_id = ? AND read_at IS NULL', ctx.user.id).c;
      const notif = one('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL', ctx.user.id).c;
      extra = { unread, notif };
      if (ctx.user.role === 'student') {
        const t = one('SELECT id, name, phone, telegram FROM users WHERE id = ?', ctx.user.teacher_id);
        extra.teacher = t;
        extra.level = levelInfo(ctx.user.xp);
        extra.streak = currentStreak(ctx.user);
      }
    }
    return { needsSetup, user: publicUser(ctx.user), ...extra };
  });

  r.post('/api/setup', ctx => {
    if (one(`SELECT id FROM users WHERE role = 'teacher' LIMIT 1`)) fail(400, 'Платформа уже настроена');
    const { name, login, password } = ctx.body;
    if (!name?.trim()) fail(400, 'Укажите имя');
    if (!validLogin(login)) fail(400, 'Логин: 3–40 символов, латиница, цифры, _ . - @');
    if (!validPass(password)) fail(400, 'Пароль — минимум 6 символов');
    const id = tx(() => {
      const id = insert('users', { role: 'teacher', name: name.trim(), login: login.toLowerCase(), pass_hash: hashPassword(password), color: '#0e9f6e' });
      seedTeacher(id);
      return id;
    });
    createSession(ctx, id);
    return { ok: true };
  });

  r.post('/api/login', ctx => {
    const { login, password } = ctx.body;
    const u = one('SELECT * FROM users WHERE login = ?', String(login || '').toLowerCase().trim());
    if (!u || !verifyPassword(String(password || ''), u.pass_hash)) fail(400, 'Неверный логин или пароль');
    if (u.archived) fail(403, 'Аккаунт в архиве — обратитесь к преподавателю');
    createSession(ctx, u.id);
    return { ok: true, role: u.role };
  });

  r.post('/api/logout', ctx => { destroySession(ctx); return { ok: true }; });

  r.get('/api/invite/:code', ctx => {
    const u = one('SELECT u.name, t.name teacher FROM users u JOIN users t ON t.id = u.teacher_id WHERE u.invite_code = ?', ctx.params.code.toUpperCase());
    if (!u) fail(404, 'Приглашение не найдено или уже использовано');
    return u;
  });

  r.post('/api/register', ctx => {
    const { code, login, password } = ctx.body;
    const u = one('SELECT * FROM users WHERE invite_code = ?', String(code || '').toUpperCase().trim());
    if (!u) fail(404, 'Приглашение не найдено или уже использовано');
    if (!validLogin(login)) fail(400, 'Логин: 3–40 символов, латиница, цифры, _ . - @');
    if (!validPass(password)) fail(400, 'Пароль — минимум 6 символов');
    if (one('SELECT id FROM users WHERE login = ?', login.toLowerCase())) fail(400, 'Такой логин уже занят');
    run('UPDATE users SET login = ?, pass_hash = ?, invite_code = NULL WHERE id = ?', login.toLowerCase(), hashPassword(password), u.id);
    notify(u.teacher_id, `${u.name} зарегистрировался(ась) на платформе`, `#/t/students/${u.id}`);
    createSession(ctx, u.id);
    return { ok: true };
  });

  r.patch('/api/me', ctx => {
    requireAuth(ctx);
    const b = ctx.body;
    const allowed = ['name', 'phone', 'telegram'];
    if (b.name !== undefined && !String(b.name).trim()) fail(400, 'Имя не может быть пустым');
    update('users', ctx.user.id, b, allowed);
    if (b.settings && typeof b.settings === 'object') {
      const { best_streak, ...rest } = b.settings;
      const s = { ...(parseJSON(ctx.user.settings, {}) || {}), ...rest };
      run('UPDATE users SET settings = ? WHERE id = ?', JSON.stringify(s), ctx.user.id);
    }
    return { ok: true };
  });

  r.post('/api/me/password', ctx => {
    requireAuth(ctx);
    const { old, password } = ctx.body;
    if (!verifyPassword(String(old || ''), ctx.user.pass_hash)) fail(400, 'Текущий пароль неверен');
    if (!validPass(password)) fail(400, 'Пароль — минимум 6 символов');
    run('UPDATE users SET pass_hash = ? WHERE id = ?', hashPassword(password), ctx.user.id);
    run('DELETE FROM sessions WHERE user_id = ? AND token != ?', ctx.user.id, ctx.cookies.sid);
    return { ok: true };
  });

  r.get('/api/topics', ctx => { requireAuth(ctx); return allTopics(); });

  // ---------- files ----------
  r.post('/api/files', ctx => {
    requireAuth(ctx);
    const { name, mime, data } = ctx.body;
    if (!name || !data) fail(400, 'Нет файла');
    const buf = Buffer.from(String(data).replace(/^data:[^,]*,/, ''), 'base64');
    if (buf.length > MAX_FILE) fail(413, 'Файл больше 15 МБ');
    const stored = crypto.randomBytes(16).toString('hex') + path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '');
    fs.writeFileSync(path.join(UPLOAD_DIR, stored), buf);
    const safeMime = /^[\w.+-]+\/[\w.+-]+$/.test(mime || '') ? mime : 'application/octet-stream';
    const id = insert('files', { owner_id: ctx.user.id, name: String(name).slice(0, 200), mime: safeMime, size: buf.length, stored });
    return { id, name, size: buf.length, mime: safeMime };
  });

  r.get('/api/files/:id', ctx => {
    requireAuth(ctx);
    const f = one('SELECT * FROM files WHERE id = ?', ctx.params.id);
    if (!f) fail(404, 'Файл не найден');
    const owner = one('SELECT * FROM users WHERE id = ?', f.owner_id);
    if (!owner || !related(ctx.user, owner)) fail(403, 'Нет доступа к файлу');
    // a student may get the teacher's file only if it is attached to something visible to them
    if (ctx.user.role === 'student' && owner.id !== ctx.user.id) {
      const ref = `%/api/files/${f.id}%`;
      const visible = one(`SELECT 1 FROM messages WHERE file_id = ? AND to_id = ?
        UNION SELECT 1 FROM questions WHERE image_id = ?
        UNION SELECT 1 FROM materials m WHERE (m.file_id = ? OR m.content LIKE ?)
          AND (m.for_all = 1 OR EXISTS (SELECT 1 FROM material_access a WHERE a.material_id = m.id AND a.student_id = ?))
        UNION SELECT 1 FROM assignments a JOIN targets t ON t.assignment_id = a.id WHERE t.student_id = ? AND a.description LIKE ?`,
        f.id, ctx.user.id, f.id, f.id, ref, ctx.user.id, ctx.user.id, ref);
      if (!visible) fail(403, 'Нет доступа к файлу');
    }
    const p = path.join(UPLOAD_DIR, f.stored);
    if (!fs.existsSync(p)) fail(404, 'Файл удалён');
    const inline = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)/.test(f.mime || '');
    ctx.res.writeHead(200, {
      'Content-Type': f.mime || 'application/octet-stream',
      'Content-Length': fs.statSync(p).size,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(p).pipe(ctx.res);
    return ctx.HANDLED;
  });

  // ---------- chats ----------
  r.get('/api/chats', ctx => {
    requireAuth(ctx);
    const me = ctx.user;
    const peers = me.role === 'teacher'
      ? all(`SELECT id, name, color, grade, goal FROM users WHERE teacher_id = ? AND archived = 0 ORDER BY name`, me.id)
      : all('SELECT id, name, color FROM users WHERE id = ?', me.teacher_id);
    return peers.map(p => {
      const last = one(`SELECT text, file_id, created_at, from_id FROM messages
        WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT 1`, me.id, p.id, p.id, me.id);
      const unread = one('SELECT COUNT(*) c FROM messages WHERE from_id = ? AND to_id = ? AND read_at IS NULL', p.id, me.id).c;
      return { ...p, last, unread };
    }).sort((a, b) => (b.last?.created_at || '').localeCompare(a.last?.created_at || ''));
  });

  r.get('/api/chats/:peer', ctx => {
    requireAuth(ctx);
    const peer = one('SELECT id, name, role, teacher_id, color FROM users WHERE id = ?', ctx.params.peer);
    if (!peer || !related(ctx.user, peer) || peer.id === ctx.user.id) fail(404, 'Собеседник не найден');
    const since = Number(ctx.query.after || 0);
    const msgs = all(`SELECT m.*, f.name file_name, f.mime file_mime, f.size file_size FROM messages m LEFT JOIN files f ON f.id = m.file_id
      WHERE ((m.from_id = ? AND m.to_id = ?) OR (m.from_id = ? AND m.to_id = ?)) AND m.id > ? ORDER BY m.id LIMIT 500`,
      ctx.user.id, peer.id, peer.id, ctx.user.id, since);
    run(`UPDATE messages SET read_at = datetime('now') WHERE from_id = ? AND to_id = ? AND read_at IS NULL`, peer.id, ctx.user.id);
    return { peer: { id: peer.id, name: peer.name, color: peer.color }, messages: msgs };
  });

  r.post('/api/chats/:peer', ctx => {
    requireAuth(ctx);
    const peer = one('SELECT * FROM users WHERE id = ?', ctx.params.peer);
    if (!peer || !related(ctx.user, peer) || peer.id === ctx.user.id) fail(404, 'Собеседник не найден');
    const text = String(ctx.body.text || '').slice(0, 5000).trim();
    const file_id = ctx.body.file_id || null;
    if (!text && !file_id) fail(400, 'Пустое сообщение');
    if (file_id && !one('SELECT id FROM files WHERE id = ? AND owner_id = ?', file_id, ctx.user.id)) fail(400, 'Файл не найден');
    const id = insert('messages', { from_id: ctx.user.id, to_id: peer.id, text, file_id });
    return one('SELECT m.*, f.name file_name, f.mime file_mime, f.size file_size FROM messages m LEFT JOIN files f ON f.id = m.file_id WHERE m.id = ?', id);
  });

  // ---------- notifications ----------
  r.get('/api/notifications', ctx => {
    requireAuth(ctx);
    return all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', ctx.user.id);
  });
  r.post('/api/notifications/read', ctx => {
    requireAuth(ctx);
    run(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`, ctx.user.id);
    return { ok: true };
  });

  // ---------- todos (личный список дел) ----------
  r.get('/api/todos', ctx => { requireAuth(ctx); return all('SELECT * FROM todos WHERE user_id = ? ORDER BY done, id DESC', ctx.user.id); });
  r.post('/api/todos', ctx => {
    requireAuth(ctx);
    const text = String(ctx.body.text || '').trim().slice(0, 500);
    if (!text) fail(400, 'Пустая задача');
    return { id: insert('todos', { user_id: ctx.user.id, text }) };
  });
  r.patch('/api/todos/:id', ctx => {
    requireAuth(ctx);
    run('UPDATE todos SET done = ? WHERE id = ? AND user_id = ?', ctx.body.done ? 1 : 0, ctx.params.id, ctx.user.id);
    return { ok: true };
  });
  r.delete('/api/todos/:id', ctx => { requireAuth(ctx); run('DELETE FROM todos WHERE id = ? AND user_id = ?', ctx.params.id, ctx.user.id); return { ok: true }; });

  // ---------- parent page (public by secret token) ----------
  r.get('/api/parent/:token', ctx => {
    const s = one(`SELECT * FROM users WHERE parent_token = ? AND role = 'student'`, ctx.params.token);
    if (!s) fail(404, 'Ссылка недействительна');
    const teacher = one('SELECT name, phone, telegram FROM users WHERE id = ?', s.teacher_id);
    const lessons = all(`SELECT start_at, duration, topic, status, summary FROM lessons WHERE student_id = ? ORDER BY start_at DESC LIMIT 30`, s.id);
    const upcoming = all(`SELECT start_at, duration, topic FROM lessons WHERE student_id = ? AND status = 'planned' AND start_at >= ? ORDER BY start_at LIMIT 5`, s.id, nowLocal());
    const att = one(`SELECT SUM(status='done') done, SUM(status='missed') missed, SUM(status='canceled') canceled FROM lessons WHERE student_id = ?`, s.id);
    const results = all(`SELECT a.title, a.kind, t.score, t.max_score, t.submitted_at, t.status, t.due_at FROM targets t JOIN assignments a ON a.id = t.assignment_id
      WHERE t.student_id = ? ORDER BY COALESCE(t.submitted_at, t.created_at) DESC LIMIT 30`, s.id);
    const exams = all('SELECT date, title, score, max_score FROM exam_scores WHERE student_id = ? ORDER BY date', s.id);
    const skills = all(`SELECT tp.title, tp.section, COALESCE(sk.level,0) level FROM topics tp LEFT JOIN skills sk ON sk.topic_id = tp.id AND sk.student_id = ? ORDER BY tp.position`, s.id);
    return { student: { name: s.name, grade: s.grade, goal: s.goal, target_score: s.target_score }, teacher, lessons, upcoming, attendance: att,
      results, exams, skills, balance: balanceOf(s.id), payments: all('SELECT amount, date, method FROM payments WHERE student_id = ? ORDER BY date DESC LIMIT 20', s.id) };
  });

  // ---------- calendar feed (.ics) ----------
  r.get('/api/ics/:token', ctx => {
    const u = one('SELECT * FROM users WHERE parent_token = ?', ctx.params.token.replace(/\.ics$/, ''));
    if (!u) fail(404, 'Не найдено');
    const isT = u.role === 'teacher';
    const rows = all(`SELECT l.*, s.name student FROM lessons l JOIN users s ON s.id = l.student_id
      WHERE ${isT ? 'l.teacher_id' : 'l.student_id'} = ? AND l.status != 'canceled' AND l.start_at >= date('now','-60 days') ORDER BY l.start_at`, u.id);
    const fmt = s => s.replace(/[-:]/g, '').slice(0, 13) + '00';
    const esc = s => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const TZ = process.env.TZ || 'Europe/Moscow';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ChemTutor//RU', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${isT ? 'Занятия' : 'Химия'}`, `X-WR-TIMEZONE:${TZ}`];
    for (const l of rows) {
      const end = addMinutes(l.start_at, l.duration || 60);
      lines.push('BEGIN:VEVENT', `UID:lesson-${l.id}@chemtutor`, `DTSTAMP:${fmt(new Date().toISOString())}Z`,
        `DTSTART;TZID=${TZ}:${fmt(l.start_at)}`, `DTEND;TZID=${TZ}:${fmt(end)}`,
        `SUMMARY:${esc(isT ? `Химия — ${l.student}` : 'Занятие по химии')}${l.topic ? esc(': ' + l.topic) : ''}`,
        ...(l.link ? [`URL:${esc(l.link)}`, `LOCATION:${esc(l.link)}`] : []),
        'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Скоро занятие', 'END:VALARM',
        'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    ctx.res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="lessons.ics"' });
    ctx.res.end(lines.join('\r\n'));
    return ctx.HANDLED;
  });

  r.post('/api/me/calendar-token', ctx => {
    requireTeacher(ctx);
    const t = ctx.user.parent_token || randomToken(18);
    run('UPDATE users SET parent_token = ? WHERE id = ?', t, ctx.user.id);
    return { token: t };
  });
}

export function nowLocal() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}
export function addMinutes(local, min) {
  const d = new Date(local + ':00Z');
  return new Date(d.getTime() + min * 60000).toISOString().slice(0, 16);
}
