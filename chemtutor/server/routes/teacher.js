import { one, all, run, insert, update, tx, parseJSON } from '../db.js';
import { fail } from '../http.js';
import { requireTeacher, inviteCode, randomToken, hashPassword } from '../auth.js';
import { balanceOf, levelInfo, notify, questionRow, currentStreak, achievements } from '../grade.js';
import { nowLocal, addMinutes } from './common.js';
import { createDemo } from '../seed.js';

const STUDENT_FIELDS = ['name', 'grade', 'goal', 'target_score', 'phone', 'telegram', 'parent_name', 'parent_contact', 'rate', 'notes', 'color', 'archived'];
const LESSON_FIELDS = ['student_id', 'start_at', 'duration', 'topic', 'status', 'price', 'link', 'plan', 'summary', 'private_note'];
const QUESTION_KINDS = ['single', 'multi', 'number', 'text', 'open'];
const COLORS = ['#0e9f6e', '#3f83f8', '#e74694', '#ff8a4c', '#9061f9', '#16bdca', '#c27803', '#e02424', '#057a55', '#1c64f2'];

function ownStudent(ctx, id) {
  const s = one(`SELECT * FROM users WHERE id = ? AND teacher_id = ? AND role = 'student'`, id, ctx.user.id);
  if (!s) fail(404, 'Ученик не найден');
  return s;
}
function ownRow(ctx, table, id) {
  const r = one(`SELECT * FROM ${table} WHERE id = ? AND teacher_id = ?`, id, ctx.user.id);
  if (!r) fail(404, 'Не найдено');
  return r;
}
const monthKey = d => d.slice(0, 7);

function studentSummary(s) {
  const bal = balanceOf(s.id);
  const next = one(`SELECT start_at, topic FROM lessons WHERE student_id = ? AND status = 'planned' AND start_at >= ? ORDER BY start_at LIMIT 1`, s.id, nowLocal());
  const avg = one(`SELECT AVG(score * 100.0 / max_score) a, COUNT(*) c FROM targets WHERE student_id = ? AND status = 'graded' AND max_score > 0`, s.id);
  const pending = one(`SELECT COUNT(*) c FROM targets WHERE student_id = ? AND status IN ('assigned','started')`, s.id).c;
  const toCheck = one(`SELECT COUNT(*) c FROM targets WHERE student_id = ? AND status = 'submitted'`, s.id).c;
  const overdue = one(`SELECT COUNT(*) c FROM targets WHERE student_id = ? AND status IN ('assigned','started') AND due_at IS NOT NULL AND due_at < ?`, s.id, nowLocal()).c;
  const lessonsDone = one(`SELECT COUNT(*) c FROM lessons WHERE student_id = ? AND status = 'done'`, s.id).c;
  const { pass_hash, ...rest } = s;
  return { ...rest, registered: !!s.login, balance: bal.balance, next_lesson: next, avg_score: avg.a == null ? null : Math.round(avg.a),
    graded_count: avg.c, pending_hw: pending, to_check: toCheck, overdue, lessons_done: lessonsDone, level: levelInfo(s.xp), streak: currentStreak(s) };
}

function saveQuestions(assignmentId, teacherId, questions) {
  const existing = new Set(all('SELECT id FROM questions WHERE assignment_id = ?', assignmentId).map(q => q.id));
  const keep = new Set();
  questions.forEach((q, i) => {
    if (!q.text?.trim()) fail(400, `Вопрос ${i + 1}: нет текста`);
    if (!['single', 'multi', 'number', 'text', 'open'].includes(q.kind)) fail(400, `Вопрос ${i + 1}: неизвестный тип`);
    if ((q.kind === 'single' || q.kind === 'multi') && (!Array.isArray(q.options) || q.options.filter(o => String(o).trim()).length < 2))
      fail(400, `Вопрос ${i + 1}: нужно минимум 2 варианта`);
    if (q.kind === 'single' && (q.answer == null || q.answer === '')) fail(400, `Вопрос ${i + 1}: отметьте верный вариант`);
    if (q.kind === 'multi' && (!Array.isArray(q.answer) || !q.answer.length)) fail(400, `Вопрос ${i + 1}: отметьте верные варианты`);
    if (q.kind === 'number' && !Number.isFinite(Number(q.answer?.value))) fail(400, `Вопрос ${i + 1}: укажите числовой ответ`);
    if (q.kind === 'text' && !(Array.isArray(q.answer) && q.answer.some(a => String(a).trim()))) fail(400, `Вопрос ${i + 1}: укажите верный ответ`);
    const row = { position: i, topic: q.topic || null, difficulty: q.difficulty || 1, kind: q.kind, text: q.text.trim(),
      options: q.options || [], answer: q.answer ?? null, explanation: q.explanation || null, points: Math.max(1, Number(q.points) || 1), image_id: q.image_id || null };
    if (q.id && existing.has(q.id)) {
      update('questions', q.id, row, Object.keys(row));
      keep.add(q.id);
    } else {
      insert('questions', { ...row, assignment_id: assignmentId, teacher_id: teacherId });
    }
  });
  for (const id of existing) if (!keep.has(id)) run('DELETE FROM questions WHERE id = ?', id);
  const max = one('SELECT COALESCE(SUM(points),0) s FROM questions WHERE assignment_id = ?', assignmentId).s;
  run(`UPDATE targets SET max_score = ? WHERE assignment_id = ? AND status IN ('assigned','started')`, max, assignmentId);
}

export default function teacherRoutes(r) {
  const T = '/api/t';

  // ---------- dashboard ----------
  r.get(`${T}/dashboard`, ctx => {
    requireTeacher(ctx);
    const me = ctx.user.id, now = nowLocal(), day = now.slice(0, 10);
    const today = all(`SELECT l.*, s.name student, s.color FROM lessons l JOIN users s ON s.id = l.student_id
      WHERE l.teacher_id = ? AND substr(l.start_at,1,10) = ? ORDER BY l.start_at`, me, day);
    const week = all(`SELECT l.*, s.name student, s.color FROM lessons l JOIN users s ON s.id = l.student_id
      WHERE l.teacher_id = ? AND l.start_at > ? AND l.start_at < date(?, '+8 days') AND l.status = 'planned' ORDER BY l.start_at LIMIT 30`, me, day + 'T23:59', day);
    const toCheck = all(`SELECT t.id, t.submitted_at, a.title, s.name student, s.id student_id FROM targets t
      JOIN assignments a ON a.id = t.assignment_id JOIN users s ON s.id = t.student_id
      WHERE a.teacher_id = ? AND t.status = 'submitted' ORDER BY t.submitted_at`, me);
    const unmarked = all(`SELECT l.*, s.name student FROM lessons l JOIN users s ON s.id = l.student_id
      WHERE l.teacher_id = ? AND l.status = 'planned' AND l.start_at < ? ORDER BY l.start_at DESC LIMIT 20`, me, addMinutes(now, -60));
    const students = all(`SELECT * FROM users WHERE teacher_id = ? AND role = 'student' AND archived = 0`, me);
    const debtors = students.map(s => ({ id: s.id, name: s.name, ...balanceOf(s.id) })).filter(s => s.balance < 0).sort((a, b) => a.balance - b.balance);
    const month = day.slice(0, 7);
    const income = one(`SELECT COALESCE(SUM(amount),0) s FROM payments WHERE teacher_id = ? AND substr(date,1,7) = ?`, me, month).s;
    const earned = one(`SELECT COALESCE(SUM(price),0) s, COUNT(*) c FROM lessons WHERE teacher_id = ? AND status IN ('done','missed') AND substr(start_at,1,7) = ?`, me, month);
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ month: k,
        income: one(`SELECT COALESCE(SUM(amount),0) s FROM payments WHERE teacher_id = ? AND substr(date,1,7) = ?`, me, k).s,
        lessons: one(`SELECT COUNT(*) c FROM lessons WHERE teacher_id = ? AND status = 'done' AND substr(start_at,1,7) = ?`, me, k).c });
    }
    const overdue = all(`SELECT t.id, t.due_at, a.title, s.name student, s.id student_id FROM targets t
      JOIN assignments a ON a.id = t.assignment_id JOIN users s ON s.id = t.student_id
      WHERE a.teacher_id = ? AND t.status IN ('assigned','started') AND t.due_at IS NOT NULL AND t.due_at < ? ORDER BY t.due_at`, me, now);
    const birthdays = [];
    return { today, week, toCheck, unmarked, debtors, overdue, birthdays,
      stats: { students: students.length, income, earned: earned.s, lessonsMonth: earned.c,
        debt: debtors.reduce((a, d) => a - d.balance, 0) }, months };
  });

  // ---------- students ----------
  r.get(`${T}/students`, ctx => {
    requireTeacher(ctx);
    const archived = ctx.query.archived === '1' ? 1 : 0;
    return all(`SELECT * FROM users WHERE teacher_id = ? AND role = 'student' AND archived = ? ORDER BY name`, ctx.user.id, archived).map(studentSummary);
  });

  r.post(`${T}/students`, ctx => {
    requireTeacher(ctx);
    const b = ctx.body;
    if (!b.name?.trim()) fail(400, 'Укажите имя ученика');
    const count = one('SELECT COUNT(*) c FROM users WHERE teacher_id = ?', ctx.user.id).c;
    const data = Object.fromEntries(STUDENT_FIELDS.map(k => [k, b[k]]));
    const id = insert('users', { ...data, name: b.name.trim(), role: 'student', teacher_id: ctx.user.id,
      color: b.color || COLORS[count % COLORS.length], invite_code: inviteCode(), parent_token: randomToken(18) });
    if (b.login && b.password) {
      if (!/^[a-zA-Z0-9_.\-@]{3,40}$/.test(b.login)) fail(400, 'Некорректный логин');
      if (String(b.password).length < 6) fail(400, 'Пароль — минимум 6 символов');
      if (one('SELECT id FROM users WHERE login = ?', b.login.toLowerCase())) fail(400, 'Логин занят');
      run('UPDATE users SET login = ?, pass_hash = ?, invite_code = NULL WHERE id = ?', b.login.toLowerCase(), hashPassword(b.password), id);
    }
    return { id, invite_code: one('SELECT invite_code FROM users WHERE id = ?', id).invite_code };
  });

  r.get(`${T}/students/:id`, ctx => {
    requireTeacher(ctx);
    const s = ownStudent(ctx, ctx.params.id);
    const lessons = all('SELECT * FROM lessons WHERE student_id = ? ORDER BY start_at DESC', s.id);
    const payments = all('SELECT * FROM payments WHERE student_id = ? ORDER BY date DESC, id DESC', s.id);
    const targets = all(`SELECT t.*, a.title, a.kind, a.topic FROM targets t JOIN assignments a ON a.id = t.assignment_id
      WHERE t.student_id = ? ORDER BY t.created_at DESC`, s.id);
    const skills = all(`SELECT tp.*, COALESCE(sk.level,0) level FROM topics tp LEFT JOIN skills sk ON sk.topic_id = tp.id AND sk.student_id = ? ORDER BY tp.position`, s.id);
    const exams = all('SELECT * FROM exam_scores WHERE student_id = ? ORDER BY date', s.id);
    const mistakes = one('SELECT COUNT(*) c, SUM(fixed) f FROM mistakes WHERE student_id = ?', s.id);
    const topicStats = all(`SELECT q.topic, SUM(a.points) got, SUM(q.points) max FROM answers a JOIN questions q ON q.id = a.question_id
      JOIN targets t ON t.id = a.target_id WHERE t.student_id = ? AND a.points IS NOT NULL AND q.topic IS NOT NULL GROUP BY q.topic`, s.id);
    const activity = all(`SELECT day, xp FROM activity WHERE user_id = ? AND day >= date('now','-120 days')`, s.id);
    return { ...studentSummary(s), invite_code: s.invite_code, notes: s.notes, ...balanceOf(s.id), lessons, payments, targets, skills, exams,
      mistakes, topicStats, activity, achievements: achievements(s.id) };
  });

  r.patch(`${T}/students/:id`, ctx => {
    requireTeacher(ctx);
    const s = ownStudent(ctx, ctx.params.id);
    if (ctx.body.name !== undefined && !String(ctx.body.name).trim()) fail(400, 'Имя не может быть пустым');
    update('users', s.id, ctx.body, STUDENT_FIELDS);
    if (ctx.body.archived) run('DELETE FROM sessions WHERE user_id = ?', s.id);
    return { ok: true };
  });

  r.delete(`${T}/students/:id`, ctx => {
    requireTeacher(ctx);
    const s = ownStudent(ctx, ctx.params.id);
    run('DELETE FROM users WHERE id = ?', s.id);
    return { ok: true };
  });

  // reset access: new invite code (old login stops working) or set password directly
  r.post(`${T}/students/:id/access`, ctx => {
    requireTeacher(ctx);
    const s = ownStudent(ctx, ctx.params.id);
    if (ctx.body.password) {
      if (String(ctx.body.password).length < 6) fail(400, 'Пароль — минимум 6 символов');
      const login = (ctx.body.login || s.login || '').toLowerCase();
      if (!/^[a-zA-Z0-9_.\-@]{3,40}$/.test(login)) fail(400, 'Укажите логин');
      if (one('SELECT id FROM users WHERE login = ? AND id != ?', login, s.id)) fail(400, 'Логин занят');
      run('UPDATE users SET login = ?, pass_hash = ?, invite_code = NULL WHERE id = ?', login, hashPassword(ctx.body.password), s.id);
      run('DELETE FROM sessions WHERE user_id = ?', s.id);
      return { ok: true, login };
    }
    const code = inviteCode();
    run('UPDATE users SET invite_code = ?, login = NULL, pass_hash = NULL WHERE id = ?', code, s.id);
    run('DELETE FROM sessions WHERE user_id = ?', s.id);
    return { invite_code: code };
  });

  r.post(`${T}/students/:id/parent-link`, ctx => {
    requireTeacher(ctx);
    const s = ownStudent(ctx, ctx.params.id);
    const t = randomToken(18);
    run('UPDATE users SET parent_token = ? WHERE id = ?', t, s.id);
    return { parent_token: t };
  });

  r.put(`${T}/students/:id/skills`, ctx => {
    requireTeacher(ctx);
    const s = ownStudent(ctx, ctx.params.id);
    const level = Math.max(0, Math.min(5, Number(ctx.body.level) || 0));
    run(`INSERT INTO skills (student_id, topic_id, level) VALUES (?, ?, ?)
      ON CONFLICT(student_id, topic_id) DO UPDATE SET level = excluded.level, updated_at = datetime('now')`, s.id, ctx.body.topic_id, level);
    return { ok: true };
  });

  r.post(`${T}/students/:id/exams`, ctx => {
    requireTeacher(ctx);
    const s = ownStudent(ctx, ctx.params.id);
    const { date, title, score, max_score } = ctx.body;
    if (!date || !Number.isFinite(Number(score)) || !(Number(max_score) > 0)) fail(400, 'Заполните дату и баллы');
    return { id: insert('exam_scores', { student_id: s.id, date, title: title || 'Пробник', score: Number(score), max_score: Number(max_score) }) };
  });
  r.delete(`${T}/exams/:id`, ctx => {
    requireTeacher(ctx);
    const e = one('SELECT e.id FROM exam_scores e JOIN users s ON s.id = e.student_id WHERE e.id = ? AND s.teacher_id = ?', ctx.params.id, ctx.user.id);
    if (!e) fail(404, 'Не найдено');
    run('DELETE FROM exam_scores WHERE id = ?', e.id);
    return { ok: true };
  });

  // ---------- lessons ----------
  r.get(`${T}/lessons`, ctx => {
    requireTeacher(ctx);
    const from = ctx.query.from || '0000', to = ctx.query.to || '9999';
    return all(`SELECT l.*, s.name student, s.color FROM lessons l JOIN users s ON s.id = l.student_id
      WHERE l.teacher_id = ? AND l.start_at >= ? AND l.start_at < ? ORDER BY l.start_at`, ctx.user.id, from, to);
  });

  r.post(`${T}/lessons`, ctx => {
    requireTeacher(ctx);
    const b = ctx.body;
    const s = ownStudent(ctx, b.student_id);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.start_at || '')) fail(400, 'Укажите дату и время');
    const repeat = Math.min(52, Math.max(1, Number(b.repeat_weeks) || 1));
    const series = repeat > 1 ? randomToken(8) : null;
    const ids = tx(() => {
      const ids = [];
      for (let i = 0; i < repeat; i++) {
        const start = addMinutes(b.start_at, i * 7 * 24 * 60);
        const clash = one(`SELECT l.start_at, u.name FROM lessons l JOIN users u ON u.id = l.student_id WHERE l.teacher_id = ? AND l.status != 'canceled'
          AND l.start_at < ? AND datetime(l.start_at, '+' || l.duration || ' minutes') > datetime(?)`, ctx.user.id, addMinutes(start, Number(b.duration) || 60), start);
        if (clash && !b.force) fail(409, `Пересечение: ${clash.start_at.replace('T', ' ')} — ${clash.name}`);
        ids.push(insert('lessons', { teacher_id: ctx.user.id, student_id: s.id, start_at: start, duration: Number(b.duration) || 60,
          topic: b.topic || null, price: b.price === undefined || b.price === '' ? s.rate || 0 : Number(b.price), link: b.link || null, plan: b.plan || null, series_id: series }));
      }
      return ids;
    });
    notify(s.id, repeat > 1 ? `Запланировано ${repeat} занятий, первое ${b.start_at.replace('T', ' в ')}` : `Новое занятие: ${b.start_at.replace('T', ' в ')}`, '#/s/schedule');
    return { ids };
  });

  r.patch(`${T}/lessons/:id`, ctx => {
    requireTeacher(ctx);
    const l = ownRow(ctx, 'lessons', ctx.params.id);
    if (ctx.body.student_id) ownStudent(ctx, ctx.body.student_id);
    if (ctx.body.status && !['planned', 'done', 'canceled', 'missed'].includes(ctx.body.status)) fail(400, 'Неверный статус');
    if (ctx.body.start_at !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(ctx.body.start_at)) fail(400, 'Укажите дату и время');
    update('lessons', l.id, ctx.body, LESSON_FIELDS);
    if (ctx.body.start_at && ctx.body.start_at !== l.start_at) notify(l.student_id, `Занятие перенесено на ${ctx.body.start_at.replace('T', ' в ')}`, '#/s/schedule');
    if (ctx.body.status === 'canceled' && l.status !== 'canceled') notify(l.student_id, `Занятие ${l.start_at.replace('T', ' в ')} отменено`, '#/s/schedule');
    if (ctx.body.summary && ctx.body.summary !== l.summary) notify(l.student_id, `Итоги занятия ${l.start_at.slice(0, 10)} доступны`, '#/s/schedule');
    return { ok: true };
  });

  r.delete(`${T}/lessons/:id`, ctx => {
    requireTeacher(ctx);
    const l = ownRow(ctx, 'lessons', ctx.params.id);
    if (ctx.query.series === '1' && l.series_id) {
      run(`DELETE FROM lessons WHERE series_id = ? AND teacher_id = ? AND start_at >= ? AND status = 'planned'`, l.series_id, ctx.user.id, l.start_at);
    } else run('DELETE FROM lessons WHERE id = ?', l.id);
    return { ok: true };
  });

  // ---------- payments / finance ----------
  r.get(`${T}/payments`, ctx => {
    requireTeacher(ctx);
    return all(`SELECT p.*, s.name student FROM payments p JOIN users s ON s.id = p.student_id WHERE p.teacher_id = ? ORDER BY p.date DESC, p.id DESC LIMIT 500`, ctx.user.id);
  });
  r.post(`${T}/payments`, ctx => {
    requireTeacher(ctx);
    const b = ctx.body;
    const s = ownStudent(ctx, b.student_id);
    const amount = Math.round(Number(b.amount));
    if (!amount) fail(400, 'Укажите сумму');
    const id = insert('payments', { teacher_id: ctx.user.id, student_id: s.id, amount, date: b.date || nowLocal().slice(0, 10), method: b.method || null, comment: b.comment || null });
    notify(s.id, `Оплата ${amount} ₽ получена. Спасибо!`, '#/s/profile');
    return { id };
  });
  r.delete(`${T}/payments/:id`, ctx => {
    requireTeacher(ctx);
    ownRow(ctx, 'payments', ctx.params.id);
    run('DELETE FROM payments WHERE id = ?', ctx.params.id);
    return { ok: true };
  });
  r.get(`${T}/finance`, ctx => {
    requireTeacher(ctx);
    const me = ctx.user.id;
    const year = ctx.query.year || new Date().getFullYear().toString();
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const k = `${year}-${String(m).padStart(2, '0')}`;
      months.push({ month: k,
        income: one(`SELECT COALESCE(SUM(amount),0) s FROM payments WHERE teacher_id = ? AND substr(date,1,7) = ?`, me, k).s,
        earned: one(`SELECT COALESCE(SUM(price),0) s FROM lessons WHERE teacher_id = ? AND status IN ('done','missed') AND substr(start_at,1,7) = ?`, me, k).s,
        lessons: one(`SELECT COUNT(*) c FROM lessons WHERE teacher_id = ? AND status = 'done' AND substr(start_at,1,7) = ?`, me, k).c,
        hours: one(`SELECT COALESCE(SUM(duration),0) s FROM lessons WHERE teacher_id = ? AND status = 'done' AND substr(start_at,1,7) = ?`, me, k).s / 60,
        canceled: one(`SELECT COUNT(*) c FROM lessons WHERE teacher_id = ? AND status IN ('canceled','missed') AND substr(start_at,1,7) = ?`, me, k).c });
    }
    const students = all(`SELECT id, name, rate, archived FROM users WHERE teacher_id = ? AND role = 'student'`, me).map(s => ({ ...s, ...balanceOf(s.id),
      year_paid: one(`SELECT COALESCE(SUM(amount),0) s FROM payments WHERE student_id = ? AND substr(date,1,4) = ?`, s.id, year).s }));
    const forecast = one(`SELECT COALESCE(SUM(price),0) s, COUNT(*) c FROM lessons WHERE teacher_id = ? AND status = 'planned' AND substr(start_at,1,7) = ?`, me, nowLocal().slice(0, 7));
    return { year, months, students, forecast };
  });
  r.get(`${T}/export/payments.csv`, ctx => {
    requireTeacher(ctx);
    const rows = all(`SELECT p.date, s.name, p.amount, p.method, p.comment FROM payments p JOIN users s ON s.id = p.student_id WHERE p.teacher_id = ? ORDER BY p.date`, ctx.user.id);
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + ['Дата;Ученик;Сумма;Способ;Комментарий', ...rows.map(r => [r.date, r.name, r.amount, r.method, r.comment].map(q).join(';'))].join('\r\n');
    ctx.res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="payments.csv"' });
    ctx.res.end(csv);
    return ctx.HANDLED;
  });
  r.get(`${T}/export/lessons.csv`, ctx => {
    requireTeacher(ctx);
    const rows = all(`SELECT l.start_at, s.name, l.duration, l.topic, l.status, l.price FROM lessons l JOIN users s ON s.id = l.student_id WHERE l.teacher_id = ? ORDER BY l.start_at`, ctx.user.id);
    const st = { planned: 'запланировано', done: 'проведено', canceled: 'отменено', missed: 'пропуск' };
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + ['Дата;Ученик;Минут;Тема;Статус;Стоимость', ...rows.map(r => [r.start_at.replace('T', ' '), r.name, r.duration, r.topic, st[r.status], r.price].map(q).join(';'))].join('\r\n');
    ctx.res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="lessons.csv"' });
    ctx.res.end(csv);
    return ctx.HANDLED;
  });

  // ---------- materials ----------
  r.get(`${T}/materials`, ctx => {
    requireTeacher(ctx);
    return all(`SELECT m.*, f.name file_name, f.size file_size, f.mime file_mime,
      (SELECT COUNT(*) FROM material_views v WHERE v.material_id = m.id) views,
      (SELECT json_group_array(student_id) FROM material_access a WHERE a.material_id = m.id) access
      FROM materials m LEFT JOIN files f ON f.id = m.file_id WHERE m.teacher_id = ? ORDER BY m.pinned DESC, m.created_at DESC`, ctx.user.id)
      .map(m => ({ ...m, access: parseJSON(m.access, []) }));
  });
  const saveMaterial = (ctx, id) => {
    const b = ctx.body;
    if (!b.title?.trim()) fail(400, 'Укажите название');
    if (b.file_id && !one('SELECT id FROM files WHERE id = ? AND owner_id = ?', b.file_id, ctx.user.id)) fail(400, 'Файл не найден');
    const row = { title: b.title.trim(), topic: b.topic || null, kind: b.kind || 'note', content: b.content || null, url: b.url || null,
      file_id: b.file_id || null, for_all: b.for_all === false ? 0 : 1, pinned: b.pinned ? 1 : 0 };
    tx(() => {
      if (id) update('materials', id, row, Object.keys(row));
      else id = insert('materials', { ...row, teacher_id: ctx.user.id });
      run('DELETE FROM material_access WHERE material_id = ?', id);
      if (!row.for_all) for (const sid of b.access || []) { ownStudent(ctx, sid); run('INSERT INTO material_access VALUES (?, ?)', id, sid); }
    });
    if (b.notify) {
      const targets = row.for_all ? all(`SELECT id FROM users WHERE teacher_id = ? AND archived = 0`, ctx.user.id).map(x => x.id) : b.access || [];
      for (const sid of targets) notify(sid, `Новый материал: ${row.title}`, `#/s/materials/${id}`);
    }
    return { id };
  };
  r.post(`${T}/materials`, ctx => { requireTeacher(ctx); return saveMaterial(ctx); });
  r.put(`${T}/materials/:id`, ctx => { requireTeacher(ctx); ownRow(ctx, 'materials', ctx.params.id); return saveMaterial(ctx, Number(ctx.params.id)); });
  r.delete(`${T}/materials/:id`, ctx => { requireTeacher(ctx); ownRow(ctx, 'materials', ctx.params.id); run('DELETE FROM materials WHERE id = ?', ctx.params.id); return { ok: true }; });

  // ---------- assignments ----------
  r.get(`${T}/assignments`, ctx => {
    requireTeacher(ctx);
    return all(`SELECT a.*, (SELECT COUNT(*) FROM questions q WHERE q.assignment_id = a.id) qcount,
      (SELECT COALESCE(SUM(points),0) FROM questions q WHERE q.assignment_id = a.id) max_points,
      (SELECT COUNT(*) FROM targets t WHERE t.assignment_id = a.id) assigned,
      (SELECT COUNT(*) FROM targets t WHERE t.assignment_id = a.id AND t.status IN ('submitted','graded')) done,
      (SELECT COUNT(*) FROM targets t WHERE t.assignment_id = a.id AND t.status = 'submitted') to_check,
      (SELECT AVG(score * 100.0 / max_score) FROM targets t WHERE t.assignment_id = a.id AND t.status = 'graded' AND max_score > 0) avg
      FROM assignments a WHERE a.teacher_id = ? ORDER BY a.created_at DESC`, ctx.user.id);
  });

  r.get(`${T}/assignments/:id`, ctx => {
    requireTeacher(ctx);
    const a = ownRow(ctx, 'assignments', ctx.params.id);
    const questions = all('SELECT * FROM questions WHERE assignment_id = ? ORDER BY position', a.id).map(questionRow);
    const targets = all(`SELECT t.*, s.name student, s.color FROM targets t JOIN users s ON s.id = t.student_id WHERE t.assignment_id = ? ORDER BY s.name`, a.id);
    // per-question success rate
    const qstats = all(`SELECT question_id, AVG(CASE WHEN correct = 1 THEN 1.0 ELSE 0 END) rate, COUNT(*) n FROM answers a JOIN targets t ON t.id = a.target_id
      WHERE t.assignment_id = ? AND t.status IN ('submitted','graded') GROUP BY question_id`, a.id);
    return { ...a, questions, targets, qstats };
  });

  r.post(`${T}/assignments`, ctx => {
    requireTeacher(ctx);
    const b = ctx.body;
    if (!b.title?.trim()) fail(400, 'Укажите название');
    const id = tx(() => {
      const id = insert('assignments', { teacher_id: ctx.user.id, title: b.title.trim(), description: b.description || null, topic: b.topic || null,
        kind: b.kind === 'test' ? 'test' : 'homework', time_limit: Number(b.time_limit) || null, show_answers: b.show_answers === false ? 0 : 1, attempts: Number(b.attempts) || 1 });
      saveQuestions(id, ctx.user.id, b.questions || []);
      return id;
    });
    return { id };
  });

  r.put(`${T}/assignments/:id`, ctx => {
    requireTeacher(ctx);
    const a = ownRow(ctx, 'assignments', ctx.params.id);
    const b = ctx.body;
    if (!b.title?.trim()) fail(400, 'Укажите название');
    tx(() => {
      update('assignments', a.id, { title: b.title.trim(), description: b.description || null, topic: b.topic || null, kind: b.kind === 'test' ? 'test' : 'homework',
        time_limit: Number(b.time_limit) || null, show_answers: b.show_answers === false ? 0 : 1, attempts: Number(b.attempts) || 1 },
        ['title', 'description', 'topic', 'kind', 'time_limit', 'show_answers', 'attempts']);
      if (b.questions) saveQuestions(a.id, ctx.user.id, b.questions);
    });
    return { ok: true };
  });

  r.post(`${T}/assignments/:id/copy`, ctx => {
    requireTeacher(ctx);
    const a = ownRow(ctx, 'assignments', ctx.params.id);
    const id = tx(() => {
      const id = insert('assignments', { teacher_id: ctx.user.id, title: a.title + ' (копия)', description: a.description, topic: a.topic, kind: a.kind,
        time_limit: a.time_limit, show_answers: a.show_answers, attempts: a.attempts });
      for (const q of all('SELECT * FROM questions WHERE assignment_id = ?', a.id)) {
        const { id: _, assignment_id, ...rest } = q;
        insert('questions', { ...rest, assignment_id: id });
      }
      return id;
    });
    return { id };
  });

  r.delete(`${T}/assignments/:id`, ctx => {
    requireTeacher(ctx);
    ownRow(ctx, 'assignments', ctx.params.id);
    run('DELETE FROM assignments WHERE id = ?', ctx.params.id);
    return { ok: true };
  });

  r.post(`${T}/assignments/:id/assign`, ctx => {
    requireTeacher(ctx);
    const a = ownRow(ctx, 'assignments', ctx.params.id);
    const ids = ctx.body.student_ids || [];
    if (!ids.length) fail(400, 'Выберите учеников');
    const max = one('SELECT COALESCE(SUM(points),0) s FROM questions WHERE assignment_id = ?', a.id).s;
    if (!max) fail(400, 'В задании нет вопросов');
    let added = 0;
    for (const sid of ids) {
      ownStudent(ctx, sid);
      const ex = one('SELECT id FROM targets WHERE assignment_id = ? AND student_id = ?', a.id, sid);
      if (ex) { run('UPDATE targets SET due_at = ? WHERE id = ?', ctx.body.due_at || null, ex.id); continue; }
      insert('targets', { assignment_id: a.id, student_id: sid, due_at: ctx.body.due_at || null, max_score: max });
      notify(sid, `${a.kind === 'test' ? 'Новый тест' : 'Новое домашнее задание'}: ${a.title}${ctx.body.due_at ? ` (до ${ctx.body.due_at.replace('T', ' ')})` : ''}`, '#/s/homework');
      added++;
    }
    return { added };
  });

  r.get(`${T}/targets/:id`, ctx => {
    requireTeacher(ctx);
    const t = one(`SELECT t.*, a.title, a.kind, a.description, a.teacher_id, s.name student FROM targets t JOIN assignments a ON a.id = t.assignment_id
      JOIN users s ON s.id = t.student_id WHERE t.id = ? AND a.teacher_id = ?`, ctx.params.id, ctx.user.id);
    if (!t) fail(404, 'Не найдено');
    const questions = all('SELECT * FROM questions WHERE assignment_id = ? ORDER BY position', t.assignment_id).map(questionRow);
    const answers = all(`SELECT * FROM answers WHERE target_id = ?`, t.id).map(a => ({ ...a, value: parseJSON(a.value), file_ids: parseJSON(a.file_ids, []) }));
    const files = all(`SELECT id, name, mime, size FROM files WHERE id IN (SELECT j.value FROM answers a2, json_each(a2.file_ids) j WHERE a2.target_id = ?)`, t.id);
    return { ...t, questions, answers, files };
  });

  r.post(`${T}/targets/:id/grade`, ctx => {
    requireTeacher(ctx);
    const t = one(`SELECT t.*, a.title FROM targets t JOIN assignments a ON a.id = t.assignment_id WHERE t.id = ? AND a.teacher_id = ?`, ctx.params.id, ctx.user.id);
    if (!t) fail(404, 'Не найдено');
    const b = ctx.body;
    tx(() => {
      for (const g of Array.isArray(b.answers) ? b.answers : []) {
        if (!g || typeof g !== 'object') continue;
        const q = one('SELECT points FROM questions WHERE id = ? AND assignment_id = ?', g.question_id, t.assignment_id);
        if (!q) continue;
        const pts = Math.max(0, Math.min(q.points, Number(g.points) || 0));
        run(`INSERT INTO answers (target_id, question_id, points, correct, comment) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(target_id, question_id) DO UPDATE SET points = excluded.points, correct = excluded.correct, comment = excluded.comment`,
          t.id, g.question_id, pts, pts >= q.points ? 1 : 0, g.comment || null);
      }
      const score = one('SELECT COALESCE(SUM(points),0) s FROM answers WHERE target_id = ?', t.id).s;
      const status = b.status === 'returned' ? 'returned' : 'graded';
      run(`UPDATE targets SET score = ?, status = ?, teacher_comment = ? WHERE id = ?`, score, status, b.teacher_comment || null, t.id);
      notify(t.student_id, status === 'returned' ? `Задание «${t.title}» возвращено на доработку` : `Задание «${t.title}» проверено: ${score} из ${t.max_score}`, `#/s/homework/${t.id}`);
    });
    return { ok: true };
  });

  r.delete(`${T}/targets/:id`, ctx => {
    requireTeacher(ctx);
    const t = one(`SELECT t.id FROM targets t JOIN assignments a ON a.id = t.assignment_id WHERE t.id = ? AND a.teacher_id = ?`, ctx.params.id, ctx.user.id);
    if (!t) fail(404, 'Не найдено');
    run('DELETE FROM targets WHERE id = ?', t.id);
    return { ok: true };
  });

  // reopen: allow another attempt
  r.post(`${T}/targets/:id/reopen`, ctx => {
    requireTeacher(ctx);
    const t = one(`SELECT t.*, a.title FROM targets t JOIN assignments a ON a.id = t.assignment_id WHERE t.id = ? AND a.teacher_id = ?`, ctx.params.id, ctx.user.id);
    if (!t) fail(404, 'Не найдено');
    run(`UPDATE targets SET status = 'assigned', started_at = NULL, submitted_at = NULL, score = NULL, attempt = attempt + 1 WHERE id = ?`, t.id);
    run('DELETE FROM answers WHERE target_id = ?', t.id);
    notify(t.student_id, `Задание «${t.title}» открыто для повторной попытки`, `#/s/homework/${t.id}`);
    return { ok: true };
  });

  // ---------- question bank ----------
  r.get(`${T}/bank`, ctx => {
    requireTeacher(ctx);
    const where = ['teacher_id = ?', 'in_bank = 1'], p = [ctx.user.id];
    if (ctx.query.topic) { where.push('topic = ?'); p.push(ctx.query.topic); }
    if (ctx.query.kind) { where.push('kind = ?'); p.push(ctx.query.kind); }
    if (ctx.query.difficulty) { where.push('difficulty = ?'); p.push(Number(ctx.query.difficulty)); }
    if (ctx.query.q) { where.push('text LIKE ?'); p.push(`%${ctx.query.q}%`); }
    return all(`SELECT * FROM questions WHERE ${where.join(' AND ')} ORDER BY topic, difficulty, id`, ...p).map(questionRow);
  });
  const bankRow = q => ({ topic: q.topic || null, difficulty: Number(q.difficulty) || 1, kind: q.kind, text: q.text, options: q.options || [],
    answer: q.answer ?? null, explanation: q.explanation || null, points: Number(q.points) || 1, image_id: q.image_id || null });
  r.post(`${T}/bank`, ctx => {
    requireTeacher(ctx);
    const list = Array.isArray(ctx.body) ? ctx.body : [ctx.body];
    const ids = tx(() => list.map(q => {
      if (!q?.text?.trim() || !QUESTION_KINDS.includes(q.kind)) fail(400, 'Нужны текст и тип вопроса');
      return insert('questions', { ...bankRow(q), teacher_id: ctx.user.id, in_bank: 1 });
    }));
    return { ids };
  });
  r.put(`${T}/bank/:id`, ctx => {
    requireTeacher(ctx);
    const q = one('SELECT id FROM questions WHERE id = ? AND teacher_id = ? AND in_bank = 1', ctx.params.id, ctx.user.id);
    if (!q) fail(404, 'Не найдено');
    if (!ctx.body.text?.trim() || !QUESTION_KINDS.includes(ctx.body.kind)) fail(400, 'Нужны текст и тип вопроса');
    const row = bankRow(ctx.body);
    update('questions', q.id, row, Object.keys(row));
    return { ok: true };
  });
  r.delete(`${T}/bank/:id`, ctx => {
    requireTeacher(ctx);
    run('DELETE FROM questions WHERE id = ? AND teacher_id = ? AND in_bank = 1', ctx.params.id, ctx.user.id);
    return { ok: true };
  });

  // ---------- flashcard decks ----------
  r.get(`${T}/decks`, ctx => {
    requireTeacher(ctx);
    return all(`SELECT d.*, (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) count FROM decks d WHERE d.teacher_id = ? ORDER BY d.id`, ctx.user.id);
  });
  r.get(`${T}/decks/:id`, ctx => {
    requireTeacher(ctx);
    const d = ownRow(ctx, 'decks', ctx.params.id);
    return { ...d, cards: all('SELECT * FROM cards WHERE deck_id = ? ORDER BY id', d.id) };
  });
  const saveDeck = (ctx, id) => {
    const b = ctx.body;
    if (!b.title?.trim()) fail(400, 'Укажите название колоды');
    return tx(() => {
      if (id) update('decks', id, { title: b.title.trim(), description: b.description || null }, ['title', 'description']);
      else id = insert('decks', { teacher_id: ctx.user.id, title: b.title.trim(), description: b.description || null });
      const keep = new Set();
      for (const c of b.cards || []) {
        if (!String(c.front || '').trim() || !String(c.back || '').trim()) continue;
        if (c.id && one('SELECT id FROM cards WHERE id = ? AND deck_id = ?', c.id, id)) { run('UPDATE cards SET front = ?, back = ? WHERE id = ?', c.front, c.back, c.id); keep.add(Number(c.id)); }
        else keep.add(insert('cards', { deck_id: id, front: c.front, back: c.back }));
      }
      for (const c of all('SELECT id FROM cards WHERE deck_id = ?', id)) if (!keep.has(c.id)) run('DELETE FROM cards WHERE id = ?', c.id);
      return { id };
    });
  };
  r.post(`${T}/decks`, ctx => { requireTeacher(ctx); return saveDeck(ctx); });
  r.put(`${T}/decks/:id`, ctx => { requireTeacher(ctx); ownRow(ctx, 'decks', ctx.params.id); return saveDeck(ctx, Number(ctx.params.id)); });
  r.delete(`${T}/decks/:id`, ctx => { requireTeacher(ctx); ownRow(ctx, 'decks', ctx.params.id); run('DELETE FROM decks WHERE id = ?', ctx.params.id); return { ok: true }; });

  // ---------- misc ----------
  r.post(`${T}/broadcast`, ctx => {
    requireTeacher(ctx);
    const text = String(ctx.body.text || '').trim();
    if (!text) fail(400, 'Пустое сообщение');
    const ids = ctx.body.student_ids?.length ? ctx.body.student_ids : all(`SELECT id FROM users WHERE teacher_id = ? AND archived = 0`, ctx.user.id).map(x => x.id);
    for (const sid of ids) { ownStudent(ctx, sid); insert('messages', { from_id: ctx.user.id, to_id: sid, text }); }
    return { sent: ids.length };
  });

  r.post(`${T}/demo`, ctx => {
    requireTeacher(ctx);
    return createDemo(ctx.user.id);
  });

  r.get(`${T}/leaderboard`, ctx => {
    requireTeacher(ctx);
    return all(`SELECT id, name, xp, streak, last_active_day, color FROM users WHERE teacher_id = ? AND archived = 0 ORDER BY xp DESC`, ctx.user.id)
      .map(s => ({ ...s, streak: currentStreak(s), level: levelInfo(s.xp) }));
  });
}
