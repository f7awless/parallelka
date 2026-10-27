// Auto-grading of answers and the gamification rules (XP, levels, streaks, achievements).
import { one, all, run, parseJSON } from './db.js';

export const normText = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const toNum = v => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return Number.isFinite(n) ? n : NaN; };

/**
 * Grade one answer. Returns {correct: 1|0|null, points}. null = needs manual review.
 * q.options / q.answer are parsed JSON.
 */
export function gradeAnswer(q, value) {
  const max = q.points || 1;
  const ans = q.answer;
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) {
    return q.kind === 'open' ? { correct: null, points: null } : { correct: 0, points: 0 };
  }
  switch (q.kind) {
    case 'single':
      return ans != null && ans !== '' && Number(value) === Number(ans) ? { correct: 1, points: max } : { correct: 0, points: 0 };
    case 'multi': {
      const a = new Set((ans || []).map(Number)), v = new Set([].concat(value).map(Number));
      let diff = 0;
      for (const x of a) if (!v.has(x)) diff++;
      for (const x of v) if (!a.has(x)) diff++;
      if (diff === 0) return { correct: 1, points: max };
      // как в ЕГЭ: одна ошибка — минус балл (если задание стоит 2+ балла)
      if (diff === 1 && max >= 2) return { correct: 0, points: max - 1 };
      return { correct: 0, points: 0 };
    }
    case 'number': {
      const target = Number(ans?.value), tol = ans?.tolerance != null && ans.tolerance !== '' ? Number(ans.tolerance) : Math.max(Math.abs(target) * 0.01, 0.01);
      const n = toNum(value);
      return Math.abs(n - target) <= tol + 1e-9 ? { correct: 1, points: max } : { correct: 0, points: 0 };
    }
    case 'text': {
      const v = normText(value), vNoSpace = v.replace(/[\s,.;]/g, '');
      const ok = [].concat(ans || []).some(a => { const n = normText(a); return n === v || n.replace(/[\s,.;]/g, '') === vNoSpace; });
      return ok ? { correct: 1, points: max } : { correct: 0, points: 0 };
    }
    default:
      return { correct: null, points: null };
  }
}

export function questionRow(r) {
  return { ...r, options: parseJSON(r.options, []), answer: parseJSON(r.answer, null) };
}

// ---------- gamification ----------
const localDay = (shift = 0) => new Date(Date.now() - new Date().getTimezoneOffset() * 60000 + shift * 864e5).toISOString().slice(0, 10);
const today = () => localDay();

export function addXP(userId, amount) {
  if (!amount) return;
  const u = one('SELECT xp, streak, last_active_day, settings FROM users WHERE id = ?', userId);
  if (!u) return;
  const d = today();
  let streak = u.streak || 0;
  if (u.last_active_day !== d) {
    const y = localDay(-1);
    streak = u.last_active_day === y ? streak + 1 : 1;
  }
  const settings = parseJSON(u.settings, {}) || {};
  settings.best_streak = Math.max(settings.best_streak || 0, streak);
  run('UPDATE users SET xp = xp + ?, streak = ?, last_active_day = ?, settings = ? WHERE id = ?',
    amount, streak, d, JSON.stringify(settings), userId);
  run(`INSERT INTO activity (user_id, day, xp) VALUES (?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET xp = xp + excluded.xp`, userId, d, amount);
}

/** Streak is broken if the student skipped yesterday — reflect that when reading. */
export function currentStreak(u) {
  const d = today(), y = localDay(-1);
  return (u.last_active_day === d || u.last_active_day === y) ? (u.streak || 0) : 0;
}

const LEVELS = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000, 4000, 5200, 6600, 8200, 10000];
const LEVEL_NAMES = ['Атом', 'Ион', 'Молекула', 'Реагент', 'Катализатор', 'Лаборант', 'Аналитик', 'Синтетик',
  'Исследователь', 'Кандидат наук', 'Доктор наук', 'Профессор', 'Академик', 'Менделеев', 'Легенда'];

export function levelInfo(xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1]) i++;
  const next = LEVELS[i + 1] ?? null;
  return { level: i + 1, name: LEVEL_NAMES[i], xp, from: LEVELS[i], to: next,
    progress: next ? (xp - LEVELS[i]) / (next - LEVELS[i]) : 1 };
}

export function achievements(studentId) {
  const u = one('SELECT * FROM users WHERE id = ?', studentId);
  const s = parseJSON(u.settings, {}) || {};
  const done = one(`SELECT COUNT(*) c FROM targets WHERE student_id = ? AND status IN ('submitted','graded')`, studentId).c;
  const perfect = one(`SELECT COUNT(*) c FROM targets WHERE student_id = ? AND status = 'graded' AND max_score > 0 AND score >= max_score`, studentId).c;
  const learned = one('SELECT COUNT(*) c FROM card_progress WHERE student_id = ? AND box >= 3', studentId).c;
  const fixed = one('SELECT COUNT(*) c FROM mistakes WHERE student_id = ? AND fixed = 1', studentId).c;
  const lessons = one(`SELECT COUNT(*) c FROM lessons WHERE student_id = ? AND status = 'done'`, studentId).c;
  const best = Math.max(s.best_streak || 0, u.streak || 0);
  const list = [
    ['first_hw', '⚗️', 'Первая реакция', 'Сдать первое задание', done >= 1],
    ['hw10', '🧪', 'Серийный синтез', 'Сдать 10 заданий', done >= 10],
    ['hw50', '🏭', 'Химкомбинат', 'Сдать 50 заданий', done >= 50],
    ['perfect', '💎', 'Чистое вещество', 'Получить максимум за задание', perfect >= 1],
    ['perfect5', '👑', 'Без примесей', '5 заданий на максимум', perfect >= 5],
    ['streak3', '🔥', 'Цепная реакция', '3 дня занятий подряд', best >= 3],
    ['streak7', '☄️', 'Неделя горения', '7 дней подряд', best >= 7],
    ['streak30', '🌋', 'Вулкан', '30 дней подряд', best >= 30],
    ['cards30', '🃏', 'Память как у Менделеева', 'Выучить 30 карточек', learned >= 30],
    ['cards150', '🧠', 'Периодический закон', 'Выучить 150 карточек', learned >= 150],
    ['fix10', '🛠️', 'Работа над ошибками', 'Исправить 10 ошибок', fixed >= 10],
    ['lessons10', '📚', 'Постоянный реагент', 'Пройти 10 занятий', lessons >= 10],
    ['lessons50', '🎓', 'Выпускник лаборатории', 'Пройти 50 занятий', lessons >= 50],
    ['lvl5', '⭐', 'Катализатор', 'Достичь 5 уровня', levelInfo(u.xp).level >= 5],
  ];
  return list.map(([id, icon, title, desc, got]) => ({ id, icon, title, desc, got: !!got }));
}

export function notify(userId, text, link = null) {
  run('INSERT INTO notifications (user_id, text, link) VALUES (?, ?, ?)', userId, text, link);
}

/** Student balance: payments minus cost of done/missed lessons. */
export function balanceOf(studentId) {
  const paid = one('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE student_id = ?', studentId).s;
  const cost = one(`SELECT COALESCE(SUM(price),0) s FROM lessons WHERE student_id = ? AND status IN ('done','missed')`, studentId).s;
  return { paid, cost, balance: paid - cost };
}

export function allTopics() {
  return all('SELECT * FROM topics ORDER BY position');
}
