// ХимКабинет — entry point. Run: node server/server.js
process.env.TZ ||= 'Europe/Moscow';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Router, HttpError, parseCookies, readBody, send, serveStatic } from './http.js';
import { loadUser } from './auth.js';
import { run } from './db.js';
import { seedTopics } from './seed.js';
import commonRoutes from './routes/common.js';
import teacherRoutes from './routes/teacher.js';
import studentRoutes from './routes/student.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.resolve(import.meta.dirname, '..', 'public');
const HANDLED = Symbol('handled');
const SECURE = process.env.COOKIE_SECURE === '1';

const router = new Router();
commonRoutes(router);
teacherRoutes(router);
studentRoutes(router);
seedTopics();

// naive per-IP limiter for login attempts
const attempts = new Map();
function limited(ip) {
  const now = Date.now(), a = (attempts.get(ip) || []).filter(t => now - t < 10 * 60e3);
  a.push(now); attempts.set(ip, a);
  return a.length > 20;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;
  try {
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      if (serveStatic(PUBLIC, req, res, pathname)) return;
      // SPA fallback
      if (serveStatic(PUBLIC, req, res, '/index.html')) return;
      return send(res, 404, 'Not found');
    }
    const m = router.match(req.method, pathname);
    if (!m) return send(res, 404, { error: 'Не найдено' });

    const cookies = parseCookies(req.headers.cookie);
    const setCookies = [];
    const ctx = {
      req, res, params: m.params, query: Object.fromEntries(url.searchParams), cookies, HANDLED, body: {},
      setCookie(name, value, { maxAge } = {}) {
        setCookies.push(`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${SECURE ? '; Secure' : ''}${maxAge !== undefined ? `; Max-Age=${maxAge}` : ''}`);
      },
    };
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      // CSRF: require same-origin JSON requests
      const origin = req.headers.origin;
      if (origin && URL.parse(origin)?.host !== req.headers.host) return send(res, 403, { error: 'Запрос с чужого сайта' });
      const raw = await readBody(req, pathname === '/api/files' ? 22 * 1024 * 1024 : 2 * 1024 * 1024);
      if (raw.length) {
        if (!(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'Ожидается JSON' });
        try { ctx.body = JSON.parse(raw.toString('utf8')); } catch { return send(res, 400, { error: 'Некорректный JSON' }); }
        if (ctx.body === null || typeof ctx.body !== 'object') return send(res, 400, { error: 'Некорректный JSON' });
      }
      if ((pathname === '/api/login' || pathname === '/api/register' || pathname === '/api/setup') && limited(req.socket.remoteAddress)) {
        return send(res, 429, { error: 'Слишком много попыток, подождите 10 минут' });
      }
    }
    ctx.user = loadUser(ctx);
    let result;
    for (const h of m.handlers) result = await h(ctx);
    if (result === HANDLED) return;
    const headers = setCookies.length ? { 'Set-Cookie': setCookies } : {};
    send(res, 200, result ?? { ok: true }, headers);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Ошибка сервера' });
  }
});

// housekeeping: expired sessions
setInterval(() => run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString()), 3600e3).unref();

server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`Порт ${PORT} занят — возможно, ХимКабинет уже запущен в другом окне. Закройте его или запустите с другим портом (PORT=3001).`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`ХимКабинет запущен: ${url}\nЧтобы остановить, закройте это окно или нажмите Ctrl+C.`);
  // launchers (start.bat / start.command) set OPEN=1 to open the browser
  if (process.env.OPEN === '1') {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => { }).unref();
  }
});
