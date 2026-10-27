import crypto from 'node:crypto';
import { one, run } from './db.js';
import { fail } from './http.js';

const SESSION_DAYS = 30;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(password, salt, 64);
  const buf = Buffer.from(hash, 'hex');
  return buf.length === calc.length && crypto.timingSafeEqual(buf, calc);
}

export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

/** Short human-friendly code for invites, e.g. "K7Q-4MZP". */
export function inviteCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(7);
  const s = [...b].map(x => abc[x % abc.length]).join('');
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

export function createSession(ctx, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, expires.toISOString());
  ctx.setCookie('sid', token, { maxAge: SESSION_DAYS * 86400 });
}

export function destroySession(ctx) {
  const t = ctx.cookies.sid;
  if (t) run('DELETE FROM sessions WHERE token = ?', t);
  ctx.setCookie('sid', '', { maxAge: 0 });
}

export function loadUser(ctx) {
  const t = ctx.cookies.sid;
  if (!t) return null;
  const s = one('SELECT * FROM sessions WHERE token = ?', t);
  if (!s) return null;
  if (s.expires_at < new Date().toISOString()) { run('DELETE FROM sessions WHERE token = ?', t); return null; }
  const u = one('SELECT * FROM users WHERE id = ?', s.user_id);
  if (!u || u.archived) return null;
  return u;
}

export const requireAuth = ctx => { if (!ctx.user) fail(401, 'Нужно войти'); };
export const requireTeacher = ctx => { requireAuth(ctx); if (ctx.user.role !== 'teacher') fail(403, 'Только для преподавателя'); };
export const requireStudent = ctx => { requireAuth(ctx); if (ctx.user.role !== 'student') fail(403, 'Только для ученика'); };

/** Public shape of a user (no secrets). */
export function publicUser(u) {
  if (!u) return null;
  const { pass_hash, notes, invite_code, ...rest } = u;
  return { ...rest, settings: safeParse(u.settings) };
}
const safeParse = s => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
