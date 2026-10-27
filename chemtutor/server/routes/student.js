import { one, all, run, insert, tx, parseJSON } from '../db.js';
import { fail } from '../http.js';
import { requireStudent } from '../auth.js';
import { gradeAnswer, questionRow, addXP, levelInfo, achievements, balanceOf, notify, currentStreak } from '../grade.js';
import { nowLocal } from './common.js';

const S = '/api/s';

function ownTarget(ctx, id) {
  const t = one(`SELECT t.*, a.title, a.description, a.kind, a.topic, a.time_limit, a.show_answers, a.teacher_id
    FROM targets t JOIN assignments a ON a.id = t.assignment_id WHERE t.id = ? AND t.student_id = ?`, id, ctx.user.id);
  if (!t) fail(404, 'Задание не найдено');
  return t;
}

/** Strip answers unless the student may see them. */
function publicQuestion(q, reveal) {
  const { answer, explanation, teacher_id, in_bank, ...rest } = q;
  return reveal ? { ...rest, answer, explanation } : rest;
}

function deadlinePassed(t) {
  if (t.kind !== 'test' || !t.time_limit || !t.started_at) return false;
  return Date.now() > new Date(t.started_at).getTime() + (t.time_limit + 1) * 60000; // +1 мин на сеть
}

function canSeeMaterial(ctx, m) {
  if (m.teacher_id !== ctx.user.teacher_id) return false;
  return m.for_all || !!one('SELECT 1 FROM material_access WHERE material_id = ? AND student_id = ?', m.id, ctx.user.id);
}

// XP caps against farming the leaderboard (in-memory, reset with the server — good enough)
const xpGate = new Map();
function capped(userId, kind, limit) {
  const key = `${userId}:${kind}:${new Date().toDateString()}`;
  const n = (xpGate.get(key) || 0) + 1;
  xpGate.set(key, n);
  if (xpGate.size > 10000) xpGate.clear();
  return n > limit;
}

const LEITNER_DAYS = [0, 1, 3, 7, 16, 35];

export default function studentRoutes(r) {
  r.get(`${S}/dashboard`, ctx => {
    requireStudent(ctx);
    const me = ctx.user, now = nowLocal();
    const lessons = all(`SELECT * FROM lessons WHERE student_id = ? AND status = 'planned' AND start_at >= ? ORDER BY start_at LIMIT 5`, me.id, now.slice(0, 10));
    const homework = all(`SELECT t.id, t.due_at, t.status, a.title, a.kind, (SELECT COUNT(*) FROM questions q WHERE q.assignment_id = a.id) qcount
      FROM targets t JOIN assignments a ON a.id = t.assignment_id WHERE t.student_id = ? AND t.status IN ('assigned','started','returned')
      ORDER BY t.due_at IS NULL, t.due_at`, me.id);
    const recent = all(`SELECT t.id, t.score, t.max_score, t.status, t.submitted_at, a.title FROM targets t JOIN assignments a ON a.id = t.assignment_id
      WHERE t.student_id = ? AND t.status IN ('submitted','graded') ORDER BY t.submitted_at DESC LIMIT 5`, me.id);
    const cardsDue = one(`SELECT COUNT(*) c FROM cards c JOIN decks d ON d.id = c.deck_id LEFT JOIN card_progress p ON p.card_id = c.id AND p.student_id = ?
      WHERE d.teacher_id = ? AND (p.due_at IS NULL OR p.due_at <= ?)`, me.id, me.teacher_id, now.slice(0, 10)).c;
    const mistakes = one('SELECT COUNT(*) c FROM mistakes WHERE student_id = ? AND fixed = 0', me.id).c;
    const week = all(`SELECT day, xp FROM activity WHERE user_id = ? AND day >= date('now','-120 days') ORDER BY day`, me.id);
    const newMaterials = all(`SELECT m.id, m.title, m.kind FROM materials m WHERE m.teacher_id = ?
      AND (m.for_all = 1 OR EXISTS (SELECT 1 FROM material_access a WHERE a.material_id = m.id AND a.student_id = ?))
      AND NOT EXISTS (SELECT 1 FROM material_views v WHERE v.material_id = m.id AND v.student_id = ?) ORDER BY m.created_at DESC LIMIT 5`, me.teacher_id, me.id, me.id);
    return { lessons, homework, recent, cardsDue, mistakes, activity: week, newMaterials, level: levelInfo(me.xp), streak: currentStreak(me),
      balance: balanceOf(me.id).balance, achievements: achievements(me.id), goal: me.goal, target_score: me.target_score,
      exams: all('SELECT * FROM exam_scores WHERE student_id = ? ORDER BY date', me.id) };
  });

  r.get(`${S}/lessons`, ctx => {
    requireStudent(ctx);
    return all(`SELECT id, start_at, duration, topic, status, price, link, plan, summary, rating FROM lessons WHERE student_id = ? ORDER BY start_at DESC`, ctx.user.id);
  });
  r.post(`${S}/lessons/:id/rate`, ctx => {
    requireStudent(ctx);
    const l = one(`SELECT * FROM lessons WHERE id = ? AND student_id = ? AND status = 'done'`, ctx.params.id, ctx.user.id);
    if (!l) fail(404, 'Занятие не найдено');
    const rating = Math.max(1, Math.min(5, Number(ctx.body.rating) || 5));
    run('UPDATE lessons SET rating = ? WHERE id = ?', rating, l.id);
    return { ok: true };
  });
  r.get(`${S}/calendar`, ctx => {
    requireStudent(ctx);
    return { token: ctx.user.parent_token };
  });

  // ---------- homework / tests ----------
  r.get(`${S}/assignments`, ctx => {
    requireStudent(ctx);
    return all(`SELECT t.*, a.title, a.kind, a.topic, a.time_limit, a.description, (SELECT COUNT(*) FROM questions q WHERE q.assignment_id = a.id) qcount
      FROM targets t JOIN assignments a ON a.id = t.assignment_id WHERE t.student_id = ? ORDER BY
      CASE t.status WHEN 'returned' THEN 0 WHEN 'started' THEN 1 WHEN 'assigned' THEN 2 ELSE 3 END, t.due_at IS NULL, t.due_at, t.created_at DESC`, ctx.user.id);
  });

  r.get(`${S}/assignments/:id`, ctx => {
    requireStudent(ctx);
    const t = ownTarget(ctx, ctx.params.id);
    const done = ['submitted', 'graded'].includes(t.status);
    const reveal = done && !!t.show_answers;
    let questions = all('SELECT * FROM questions WHERE assignment_id = ? ORDER BY position', t.assignment_id).map(questionRow).map(q => publicQuestion(q, reveal));
    const qcount = questions.length;
    // a timed test shows its questions only after the timer has been started
    if (t.kind === 'test' && t.time_limit && !t.started_at && !done) questions = [];
    const answers = all('SELECT question_id, value, file_ids, correct, points, comment FROM answers WHERE target_id = ?', t.id)
      .map(a => ({ ...a, value: parseJSON(a.value), file_ids: parseJSON(a.file_ids, []), ...(done ? {} : { correct: undefined, points: undefined }) }));
    const files = all(`SELECT id, name, mime, size FROM files WHERE id IN (SELECT j.value FROM answers a2, json_each(a2.file_ids) j WHERE a2.target_id = ?)`, t.id);
    const remaining = t.kind === 'test' && t.time_limit && t.started_at && !done
      ? Math.max(0, Math.round((new Date(t.started_at).getTime() + t.time_limit * 60000 - Date.now()) / 1000)) : null;
    return { ...t, questions, qcount, answers, files, remaining, reveal };
  });

  r.post(`${S}/assignments/:id/start`, ctx => {
    requireStudent(ctx);
    const t = ownTarget(ctx, ctx.params.id);
    if (t.status === 'assigned') run(`UPDATE targets SET status = 'started', started_at = ? WHERE id = ?`, new Date().toISOString(), t.id);
    if (t.status === 'returned') run(`UPDATE targets SET status = 'started', started_at = ? WHERE id = ?`, t.time_limit ? new Date().toISOString() : t.started_at, t.id);
    return { ok: true };
  });

  const saveAnswers = (t, list) => {
    for (const a of Array.isArray(list) ? list : []) {
      if (!a || typeof a !== 'object') continue;
      const q = one('SELECT id FROM questions WHERE id = ? AND assignment_id = ?', a.question_id, t.assignment_id);
      if (!q) continue;
      // only the student's own uploads may be attached
      const fileIds = (Array.isArray(a.file_ids) ? a.file_ids : []).filter(id => one('SELECT 1 FROM files WHERE id = ? AND owner_id = ?', id, t.student_id));
      run(`INSERT INTO answers (target_id, question_id, value, file_ids) VALUES (?, ?, ?, ?)
        ON CONFLICT(target_id, question_id) DO UPDATE SET value = excluded.value, file_ids = excluded.file_ids`,
        t.id, q.id, JSON.stringify(a.value ?? null), JSON.stringify(fileIds));
    }
  };

  r.put(`${S}/assignments/:id/answers`, ctx => {
    requireStudent(ctx);
    const t = ownTarget(ctx, ctx.params.id);
    if (!['assigned', 'started', 'returned'].includes(t.status)) fail(400, 'Задание уже сдано');
    if (deadlinePassed(t)) fail(400, 'Время теста истекло');
    tx(() => saveAnswers(t, ctx.body.answers));
    return { ok: true, saved_at: new Date().toISOString() };
  });

  r.post(`${S}/assignments/:id/submit`, ctx => {
    requireStudent(ctx);
    const t = ownTarget(ctx, ctx.params.id);
    if (!['assigned', 'started', 'returned'].includes(t.status)) fail(400, 'Задание уже сдано');
    const late = deadlinePassed(t);
    const result = tx(() => {
      if (!late) saveAnswers(t, ctx.body.answers);
      const qs = all('SELECT * FROM questions WHERE assignment_id = ?', t.assignment_id).map(questionRow);
      let needsReview = false, score = 0, max = 0;
      for (const q of qs) {
        max += q.points;
        const a = one('SELECT * FROM answers WHERE target_id = ? AND question_id = ?', t.id, q.id);
        const value = parseJSON(a?.value);
        if (q.kind === 'open') {
          // keep previous teacher grade if the work was returned and the answer unchanged
          if (a?.points == null) needsReview = true; else score += a.points;
          if (!a) run('INSERT INTO answers (target_id, question_id, value) VALUES (?, ?, ?)', t.id, q.id, 'null');
          if (t.status === 'returned' && a) { run('UPDATE answers SET points = NULL, correct = NULL WHERE id = ?', a.id); needsReview = true; }
          continue;
        }
        const g = gradeAnswer(q, value);
        score += g.points || 0;
        if (a) run('UPDATE answers SET correct = ?, points = ? WHERE id = ?', g.correct, g.points, a.id);
        else run('INSERT INTO answers (target_id, question_id, value, correct, points) VALUES (?, ?, ?, ?, ?)', t.id, q.id, 'null', g.correct, g.points);
        if (g.correct === 0) {
          run(`INSERT INTO mistakes (student_id, question_id, wrong_value) VALUES (?, ?, ?)
            ON CONFLICT(student_id, question_id) DO UPDATE SET wrong_value = excluded.wrong_value, fixed = 0`, ctx.user.id, q.id, JSON.stringify(value));
        }
      }
      const status = needsReview ? 'submitted' : 'graded';
      // while waiting for review `score` holds the auto-graded part
      run(`UPDATE targets SET status = ?, submitted_at = ?, score = ?, max_score = ? WHERE id = ?`, status, nowLocal(), score, max, t.id);
      return { status, score, max };
    });
    const pct = result.max ? result.score / result.max : 0;
    const xp = 10 + Math.round(pct * 20) + (t.due_at && nowLocal() <= t.due_at ? 5 : 0);
    addXP(ctx.user.id, xp);
    notify(t.teacher_id, `${ctx.user.name} сдал(а) «${t.title}»${result.status === 'graded' ? `: ${result.score}/${result.max}` : ' — нужна проверка'}`,
      result.status === 'graded' ? `#/t/students/${ctx.user.id}` : `#/t/review/${t.id}`);
    return { ...result, xp, late };
  });

  // ---------- materials ----------
  r.get(`${S}/materials`, ctx => {
    requireStudent(ctx);
    return all(`SELECT m.id, m.title, m.topic, m.kind, m.url, m.pinned, m.created_at, m.file_id, f.name file_name, f.size file_size, f.mime file_mime,
      EXISTS (SELECT 1 FROM material_views v WHERE v.material_id = m.id AND v.student_id = ?) viewed
      FROM materials m LEFT JOIN files f ON f.id = m.file_id WHERE m.teacher_id = ?
      AND (m.for_all = 1 OR EXISTS (SELECT 1 FROM material_access a WHERE a.material_id = m.id AND a.student_id = ?))
      ORDER BY m.pinned DESC, m.created_at DESC`, ctx.user.id, ctx.user.teacher_id, ctx.user.id);
  });
  r.get(`${S}/materials/:id`, ctx => {
    requireStudent(ctx);
    const m = one('SELECT m.*, f.name file_name, f.size file_size, f.mime file_mime FROM materials m LEFT JOIN files f ON f.id = m.file_id WHERE m.id = ?', ctx.params.id);
    if (!m || !canSeeMaterial(ctx, m)) fail(404, 'Материал не найден');
    const first = !one('SELECT 1 FROM material_views WHERE material_id = ? AND student_id = ?', m.id, ctx.user.id);
    if (first) { run('INSERT INTO material_views (material_id, student_id) VALUES (?, ?)', m.id, ctx.user.id); addXP(ctx.user.id, 3); }
    return m;
  });

  // ---------- flashcards (Leitner) ----------
  r.get(`${S}/decks`, ctx => {
    requireStudent(ctx);
    const day = nowLocal().slice(0, 10);
    return all(`SELECT d.id, d.title, d.description, COUNT(c.id) total,
      SUM(CASE WHEN p.box >= 3 THEN 1 ELSE 0 END) learned,
      SUM(CASE WHEN p.due_at IS NULL OR p.due_at <= ? THEN 1 ELSE 0 END) due
      FROM decks d JOIN cards c ON c.deck_id = d.id LEFT JOIN card_progress p ON p.card_id = c.id AND p.student_id = ?
      WHERE d.teacher_id = ? GROUP BY d.id ORDER BY d.id`, day, ctx.user.id, ctx.user.teacher_id);
  });
  r.get(`${S}/decks/:id`, ctx => {
    requireStudent(ctx);
    const d = one('SELECT * FROM decks WHERE id = ? AND teacher_id = ?', ctx.params.id, ctx.user.teacher_id);
    if (!d) fail(404, 'Колода не найдена');
    const day = nowLocal().slice(0, 10);
    const all_ = ctx.query.all === '1';
    const cards = all(`SELECT c.*, COALESCE(p.box,0) box, p.due_at FROM cards c LEFT JOIN card_progress p ON p.card_id = c.id AND p.student_id = ?
      WHERE c.deck_id = ? ${all_ ? '' : 'AND (p.due_at IS NULL OR p.due_at <= ?)'} ORDER BY COALESCE(p.box,0), RANDOM()`,
      ...(all_ ? [ctx.user.id, d.id] : [ctx.user.id, d.id, day]));
    return { ...d, cards };
  });
  r.post(`${S}/cards/:id/review`, ctx => {
    requireStudent(ctx);
    const c = one('SELECT c.id FROM cards c JOIN decks d ON d.id = c.deck_id WHERE c.id = ? AND d.teacher_id = ?', ctx.params.id, ctx.user.teacher_id);
    if (!c) fail(404, 'Карточка не найдена');
    const p = one('SELECT box FROM card_progress WHERE student_id = ? AND card_id = ?', ctx.user.id, c.id);
    const box = ctx.body.known ? Math.min(5, (p?.box || 0) + 1) : 0;
    const due = new Date(Date.now() - new Date().getTimezoneOffset() * 60000 + LEITNER_DAYS[box] * 864e5).toISOString().slice(0, 10);
    run(`INSERT INTO card_progress (student_id, card_id, box, due_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(student_id, card_id) DO UPDATE SET box = excluded.box, due_at = excluded.due_at`, ctx.user.id, c.id, box, ctx.body.known ? due : nowLocal().slice(0, 10));
    addXP(ctx.user.id, ctx.body.known ? 1 : 0);
    return { box };
  });

  // ---------- mistakes (работа над ошибками) ----------
  r.get(`${S}/mistakes`, ctx => {
    requireStudent(ctx);
    return all(`SELECT m.id, m.fixed, m.wrong_value, m.created_at, q.id question_id, q.kind, q.text, q.options, q.topic, q.points, q.image_id
      FROM mistakes m JOIN questions q ON q.id = m.question_id WHERE m.student_id = ? ORDER BY m.fixed, m.created_at DESC`, ctx.user.id)
      .map(m => ({ ...m, options: parseJSON(m.options, []), wrong_value: parseJSON(m.wrong_value) }));
  });
  r.post(`${S}/mistakes/:id/retry`, ctx => {
    requireStudent(ctx);
    const m = one('SELECT * FROM mistakes WHERE id = ? AND student_id = ?', ctx.params.id, ctx.user.id);
    if (!m) fail(404, 'Не найдено');
    const q = questionRow(one('SELECT * FROM questions WHERE id = ?', m.question_id));
    const g = gradeAnswer(q, ctx.body.value);
    if (g.correct === 1 && !m.fixed) { run('UPDATE mistakes SET fixed = 1 WHERE id = ?', m.id); addXP(ctx.user.id, 4); }
    return { correct: g.correct === 1, answer: g.correct === 1 ? q.answer : undefined, explanation: g.correct === 1 ? q.explanation : undefined };
  });
  r.post(`${S}/mistakes/:id/reveal`, ctx => {
    requireStudent(ctx);
    const m = one('SELECT * FROM mistakes WHERE id = ? AND student_id = ?', ctx.params.id, ctx.user.id);
    if (!m) fail(404, 'Не найдено');
    const q = questionRow(one('SELECT * FROM questions WHERE id = ?', m.question_id));
    return { answer: q.answer, explanation: q.explanation };
  });

  // ---------- self-practice from the bank ----------
  r.get(`${S}/practice`, ctx => {
    requireStudent(ctx);
    const where = ['teacher_id = ?', 'in_bank = 1', `kind != 'open'`], p = [ctx.user.teacher_id];
    if (ctx.query.topic) { where.push('topic = ?'); p.push(ctx.query.topic); }
    if (ctx.query.difficulty) { where.push('difficulty = ?'); p.push(Number(ctx.query.difficulty)); }
    const n = Math.max(1, Math.min(30, Number(ctx.query.count) || 10));
    return all(`SELECT * FROM questions WHERE ${where.join(' AND ')} ORDER BY RANDOM() LIMIT ${n}`, ...p).map(questionRow).map(q => publicQuestion(q, false));
  });
  r.get(`${S}/practice/topics`, ctx => {
    requireStudent(ctx);
    return all(`SELECT tp.id, tp.title, tp.section, COUNT(q.id) count FROM topics tp JOIN questions q ON q.topic = tp.id AND q.in_bank = 1 AND q.teacher_id = ? AND q.kind != 'open'
      GROUP BY tp.id ORDER BY tp.position`, ctx.user.teacher_id);
  });
  r.post(`${S}/practice/check`, ctx => {
    requireStudent(ctx);
    const q0 = one('SELECT * FROM questions WHERE id = ? AND teacher_id = ? AND in_bank = 1', ctx.body.question_id, ctx.user.teacher_id);
    if (!q0) fail(404, 'Вопрос не найден');
    const q = questionRow(q0);
    const g = gradeAnswer(q, ctx.body.value);
    if (g.correct === 1 && !capped(ctx.user.id, 'practice', 30)) addXP(ctx.user.id, 2);
    return { correct: g.correct === 1, points: g.points, answer: q.answer, explanation: q.explanation };
  });

  // ---------- progress ----------
  r.get(`${S}/progress`, ctx => {
    requireStudent(ctx);
    const me = ctx.user;
    const results = all(`SELECT t.id, t.score, t.max_score, t.submitted_at, a.title, a.kind FROM targets t JOIN assignments a ON a.id = t.assignment_id
      WHERE t.student_id = ? AND t.status = 'graded' AND t.max_score > 0 ORDER BY t.submitted_at`, me.id);
    const skills = all(`SELECT tp.*, COALESCE(sk.level,0) level FROM topics tp LEFT JOIN skills sk ON sk.topic_id = tp.id AND sk.student_id = ? ORDER BY tp.position`, me.id);
    const topicStats = all(`SELECT q.topic, SUM(a.points) got, SUM(q.points) max FROM answers a JOIN questions q ON q.id = a.question_id
      JOIN targets t ON t.id = a.target_id WHERE t.student_id = ? AND a.points IS NOT NULL AND q.topic IS NOT NULL GROUP BY q.topic`, me.id);
    const att = one(`SELECT SUM(status='done') done, SUM(status='missed') missed, SUM(status='canceled') canceled FROM lessons WHERE student_id = ?`, me.id);
    const exams = all('SELECT * FROM exam_scores WHERE student_id = ? ORDER BY date', me.id);
    const activity = all(`SELECT day, xp FROM activity WHERE user_id = ? AND day >= date('now','-180 days') ORDER BY day`, me.id);
    const leaderboard = all(`SELECT id, name, xp, color FROM users WHERE teacher_id = ? AND role = 'student' AND archived = 0 ORDER BY xp DESC LIMIT 10`, me.teacher_id)
      .map(s => ({ id: s.id, name: s.id === me.id ? s.name : s.name.split(' ')[0], xp: s.xp, me: s.id === me.id, color: s.color, level: levelInfo(s.xp).level }));
    return { results, skills, topicStats, attendance: att, exams, activity, leaderboard, level: levelInfo(me.xp), streak: currentStreak(me),
      achievements: achievements(me.id), payments: all('SELECT amount, date, method FROM payments WHERE student_id = ? ORDER BY date DESC', me.id), ...balanceOf(me.id) };
  });

  r.post(`${S}/focus`, ctx => {
    requireStudent(ctx);
    const minutes = Math.min(120, Math.max(0, Number(ctx.body.minutes) || 0));
    if (minutes >= 10 && !capped(ctx.user.id, 'focus', 8)) addXP(ctx.user.id, Math.round(minutes / 5));
    return { ok: true };
  });
}
