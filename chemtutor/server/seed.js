// Starter content for a new teacher + optional demo data.
import fs from 'node:fs';
import path from 'node:path';
import { one, all, run, insert, tx } from './db.js';
import { inviteCode, randomToken, hashPassword } from './auth.js';
import { gradeAnswer, questionRow } from './grade.js';

const SEED = path.join(import.meta.dirname, 'seed');
const readJSON = f => { try { return JSON.parse(fs.readFileSync(path.join(SEED, f), 'utf8')); } catch { return []; } };

export function seedTopics() {
  readJSON('topics.json').forEach((t, i) =>
    run('INSERT INTO topics (id, section, title, position) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET section = excluded.section, title = excluded.title, position = excluded.position',
      t.id, t.section, t.title, i));
}

export function seedTeacher(teacherId) {
  seedTopics();
  for (const q of readJSON('questions.json')) {
    insert('questions', { teacher_id: teacherId, in_bank: 1, topic: q.topic, difficulty: q.difficulty || 1, kind: q.kind, text: q.text,
      options: q.options || [], answer: q.answer, explanation: q.explanation || null, points: q.points || 1 });
  }
  for (const d of readJSON('flashcards.json')) {
    const id = insert('decks', { teacher_id: teacherId, title: d.title, description: d.description || null });
    for (const c of d.cards) insert('cards', { deck_id: id, front: c.front, back: c.back });
  }
  const dir = path.join(SEED, 'materials');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort() : [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const title = (text.match(/^#\s+(.+)$/m) || [, f.replace(/\.md$/, '')])[1].trim();
    insert('materials', { teacher_id: teacherId, title, kind: 'note', content: text.replace(/^#\s+.+\n+/, ''), for_all: 1 });
  }
}

// ---------- demo ----------
const pad = n => String(n).padStart(2, '0');
const localISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayShift = (days, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };
const pick = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);

/**
 * Creates three demo students with lessons, payments, homework results etc.
 * Returns logins so the teacher can look at the student side.
 */
export function createDemo(teacherId, { password = 'demo123', loginPrefix = 'demo' } = {}) {
  seedTopics();
  const topics = all('SELECT id FROM topics ORDER BY position').map(t => t.id);
  const bank = all('SELECT * FROM questions WHERE teacher_id = ? AND in_bank = 1 AND kind != ?', teacherId, 'open').map(questionRow);
  const people = [
    { name: 'Алина Смирнова', grade: '11', goal: 'ЕГЭ', target_score: 90, rate: 2000, telegram: '@alina_chem', parent_name: 'Ольга Викторовна', parent_contact: '+7 900 000-00-01', skill: 0.8 },
    { name: 'Максим Петров', grade: '9', goal: 'ОГЭ', target_score: 5, rate: 1500, telegram: '@max_p', parent_name: 'Игорь Петрович', parent_contact: '+7 900 000-00-02', skill: 0.55 },
    { name: 'Соня Кузнецова', grade: '10', goal: 'Олимпиада', target_score: null, rate: 1800, telegram: '@sonya_k', skill: 0.7 },
  ];
  const colors = ['#e74694', '#3f83f8', '#ff8a4c'];
  const logins = [];
  tx(() => {
    people.forEach((p, i) => {
      let login = `${loginPrefix}${i + 1}`;
      while (one('SELECT id FROM users WHERE login = ?', login)) login += 'x';
      const { skill, ...data } = p;
      const sid = insert('users', { ...data, role: 'student', teacher_id: teacherId, login, pass_hash: hashPassword(password),
        color: colors[i], parent_token: randomToken(18), xp: 0, notes: i === 0 ? 'Сильная в расчётных задачах, путается в органике (изомерия). Хочет на химфак МГУ.' : null });
      logins.push({ name: p.name, login, password });

      // lessons: 8 weeks back (twice a week), 3 weeks forward
      let paidSum = 0, cost = 0;
      const lessonTopics = ['Строение атома', 'ОВР: электронный баланс', 'Гидролиз солей', 'Задачи на растворы', 'Алканы и алкены', 'Электролиз', 'Химическое равновесие', 'Кислоты и основания', 'Скорость реакции', 'Спирты и фенолы', 'Амины', 'Генетическая связь'];
      for (let w = -8; w <= 3; w++) {
        for (const [dow, hour] of [[1 + i, 15 + i], [4 + (i % 2), 17 + i]]) {
          const d = dayShift(w * 7 + dow - new Date().getDay(), hour);
          const past = d < new Date();
          const r = Math.random();
          const status = past ? (r < 0.08 ? 'canceled' : r < 0.12 ? 'missed' : 'done') : 'planned';
          const topic = lessonTopics[(w + 8 + dow) % lessonTopics.length];
          if (status === 'done' || status === 'missed') cost += p.rate;
          insert('lessons', { teacher_id: teacherId, student_id: sid, start_at: localISO(d), duration: 60, topic, status, price: p.rate,
            link: 'https://telemost.yandex.ru/', summary: status === 'done' ? `Разобрали тему «${topic}». Решили 8 задач, 2 — с ошибками, повторить дома.` : null,
            rating: status === 'done' && Math.random() < 0.5 ? 5 : null });
        }
      }
      // payments: pay in blocks of 4 lessons, the second student owes money
      const blocks = Math.floor(cost / (p.rate * 4)) + (i === 1 ? -1 : 1);
      for (let b = 0; b < blocks; b++) {
        const d = dayShift(-56 + b * 14, 12);
        if (d > new Date()) break;
        insert('payments', { teacher_id: teacherId, student_id: sid, amount: p.rate * 4, date: localISO(d).slice(0, 10), method: b % 2 ? 'перевод' : 'СБП', comment: 'Абонемент 4 занятия' });
        paidSum += p.rate * 4;
      }
      // skills
      for (const t of topics) {
        const lvl = Math.max(0, Math.min(5, Math.round(p.skill * 5 + (Math.random() * 3 - 1.8))));
        run('INSERT OR REPLACE INTO skills (student_id, topic_id, level) VALUES (?, ?, ?)', sid, t, lvl);
      }
      // exam mocks
      if (p.goal === 'ЕГЭ') [[-70, 52], [-42, 61], [-14, 73]].forEach(([d, s], k) =>
        insert('exam_scores', { student_id: sid, date: localISO(dayShift(d, 10)).slice(0, 10), title: `Пробный ЕГЭ №${k + 1}`, score: s, max_score: 100 }));
      if (p.goal === 'ОГЭ') [[-50, 22], [-20, 27]].forEach(([d, s], k) =>
        insert('exam_scores', { student_id: sid, date: localISO(dayShift(d, 10)).slice(0, 10), title: `Пробный ОГЭ №${k + 1}`, score: s, max_score: 40 }));
      // activity heatmap + xp
      let xp = 0;
      for (let d = -90; d <= 0; d++) {
        if (Math.random() < p.skill * 0.8) {
          const v = 5 + Math.floor(Math.random() * 30); xp += v;
          run('INSERT OR REPLACE INTO activity (user_id, day, xp) VALUES (?, ?, ?)', sid, localISO(dayShift(d, 12)).slice(0, 10), v);
        }
      }
      run('UPDATE users SET xp = ?, streak = ?, last_active_day = ? WHERE id = ?', xp, 3 + i * 2, localISO(new Date()).slice(0, 10), sid);
    });

    // demo homework built from the bank
    if (bank.length >= 10) {
      const students = all(`SELECT id FROM users WHERE teacher_id = ? AND login LIKE ?`, teacherId, `${loginPrefix}%`).map(s => s.id).slice(-3);
      const mk = (title, kind, qs, extra = {}) => {
        const aid = insert('assignments', { teacher_id: teacherId, title, kind, description: extra.description || null, time_limit: extra.time_limit || null, show_answers: 1 });
        qs.forEach((q, k) => insert('questions', { assignment_id: aid, teacher_id: teacherId, position: k, topic: q.topic, difficulty: q.difficulty, kind: q.kind,
          text: q.text, options: q.options, answer: q.answer, explanation: q.explanation, points: q.points }));
        return aid;
      };
      const graded = mk('ДЗ: строение атома и периодический закон', 'homework', pick(bank, 6), { description: 'Повторите конспект и решите задания. Не забывайте про единицы измерения!' });
      const open = { kind: 'open', topic: null, difficulty: 2, text: 'Расставьте коэффициенты методом электронного баланса: KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O. Загрузите фото решения.', options: [], answer: null, explanation: null, points: 3 };
      const toReview = mk('ДЗ: ОВР', 'homework', [...pick(bank, 3), open]);
      const fresh = mk('Тест: неорганика, вариант 1', 'test', pick(bank, 8), { time_limit: 20, description: 'На тест 20 минут. Калькулятор можно.' });
      const qsOf = aid => all('SELECT * FROM questions WHERE assignment_id = ?', aid).map(questionRow);
      students.forEach((sid, k) => {
        // graded homework with realistic answers
        const qs = qsOf(graded);
        const max = qs.reduce((a, q) => a + q.points, 0);
        const tid = insert('targets', { assignment_id: graded, student_id: sid, due_at: localISO(dayShift(-5, 20)), status: 'graded',
          started_at: dayShift(-7, 18).toISOString(), submitted_at: localISO(dayShift(-6, 19)), max_score: max });
        let score = 0;
        qs.forEach((q, j) => {
          const right = Math.random() < [0.85, 0.55, 0.7][k];
          const value = right ? rightValue(q) : wrongValue(q);
          const g = gradeAnswer(q, value);
          score += g.points || 0;
          run('INSERT INTO answers (target_id, question_id, value, correct, points) VALUES (?, ?, ?, ?, ?)', tid, q.id, JSON.stringify(value), g.correct, g.points);
          if (g.correct === 0) run('INSERT OR IGNORE INTO mistakes (student_id, question_id, wrong_value) VALUES (?, ?, ?)', sid, q.id, JSON.stringify(value));
        });
        run('UPDATE targets SET score = ? WHERE id = ?', score, tid);
        // homework waiting for review (first student only), others: assigned
        const q2 = qsOf(toReview);
        const max2 = q2.reduce((a, q) => a + q.points, 0);
        if (k === 0) {
          const t2 = insert('targets', { assignment_id: toReview, student_id: sid, due_at: localISO(dayShift(1, 20)), status: 'submitted',
            started_at: dayShift(-1, 18).toISOString(), submitted_at: localISO(dayShift(-1, 19)), max_score: max2 });
          let s2 = 0;
          for (const q of q2) {
            if (q.kind === 'open') { run('INSERT INTO answers (target_id, question_id, value) VALUES (?, ?, ?)', t2, q.id, JSON.stringify('Mn(+7) +5e -> Mn(+2) | 2\n2Cl(-1) -2e -> Cl2(0) | 5\n2KMnO4 + 16HCl = 2KCl + 2MnCl2 + 5Cl2 + 8H2O')); continue; }
            const g = gradeAnswer(q, rightValue(q)); s2 += g.points;
            run('INSERT INTO answers (target_id, question_id, value, correct, points) VALUES (?, ?, ?, ?, ?)', t2, q.id, JSON.stringify(rightValue(q)), g.correct, g.points);
          }
          run('UPDATE targets SET score = ? WHERE id = ?', s2, t2);
        } else {
          insert('targets', { assignment_id: toReview, student_id: sid, due_at: localISO(dayShift(k === 1 ? -1 : 2, 20)), max_score: max2 });
        }
        insert('targets', { assignment_id: fresh, student_id: sid, due_at: localISO(dayShift(4, 21)), max_score: qsOf(fresh).reduce((a, q) => a + q.points, 0) });
      });
    }
    // a little chat history
    const first = one(`SELECT id FROM users WHERE teacher_id = ? AND login LIKE ? ORDER BY id DESC LIMIT 1 OFFSET 2`, teacherId, `${loginPrefix}%`);
    if (first) {
      insert('messages', { from_id: first.id, to_id: teacherId, text: 'Здравствуйте! Можно перенести четверговое занятие на пятницу?', created_at: new Date(Date.now() - 3 * 3600e3).toISOString().replace('T', ' ').slice(0, 19) });
      insert('messages', { from_id: teacherId, to_id: first.id, text: 'Добрый день! Да, давайте в пятницу в 17:00 👍', created_at: new Date(Date.now() - 2.5 * 3600e3).toISOString().replace('T', ' ').slice(0, 19), read_at: new Date().toISOString() });
      insert('messages', { from_id: first.id, to_id: teacherId, text: 'Спасибо! И ещё вопрос по 33 задаче — почему там массовая доля считается от раствора после реакции?' });
    }
    insert('notifications', { user_id: teacherId, text: 'Демо-данные созданы: 3 ученика, занятия, оплаты и задания', link: '#/t/students' });
  });
  return { logins };
}

/** What a student would type for a correct answer. */
function rightValue(q) {
  if (q.kind === 'number') return String(q.answer?.value);
  if (q.kind === 'text') return [].concat(q.answer)[0];
  return q.answer;
}

function wrongValue(q) {
  switch (q.kind) {
    case 'single': return (Number(q.answer) + 1) % Math.max(2, q.options.length);
    case 'multi': return [0, 1].filter(x => !(q.answer || []).includes(x) || Math.random() < 0.5).slice(0, 2);
    case 'number': return Number(q.answer?.value || 0) * 1.5 + 1;
    case 'text': return 'не знаю';
    default: return null;
  }
}
