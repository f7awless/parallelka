// End-to-end API tests: start the real server on a temp data dir and drive it over HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3700 + Math.floor(Math.random() * 200);
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chemtutor-test-'));
let server;

class Client {
  cookie = '';
  async req(method, url, body) {
    const res = await fetch(BASE + url, {
      method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
  }
  get(u) { return this.req('GET', u); }
  post(u, b = {}) { return this.req('POST', u, b); }
  put(u, b = {}) { return this.req('PUT', u, b); }
  patch(u, b = {}) { return this.req('PATCH', u, b); }
}

const Y = new Date().getFullYear() + 1;
const teacher = new Client(), student = new Client();
let studentId, assignmentId, targetId;

before(async () => {
  const root = path.resolve(import.meta.dirname, '..');
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.js'], { cwd: root, env: { ...process.env, PORT, DATA_DIR: dataDir } });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/state'); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error('server did not start');
});
after(() => { server?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('setup creates teacher once and seeds content', async () => {
  assert.equal((await teacher.get('/api/state')).data.needsSetup, true);
  assert.equal((await teacher.post('/api/setup', { name: 'Анна', login: 'anna', password: 'secret1' })).status, 200);
  assert.equal((await new Client().post('/api/setup', { name: 'X', login: 'x', password: 'secret1' })).status, 400);
  const bank = await teacher.get('/api/t/bank');
  assert.ok(bank.data.length > 100, 'question bank seeded');
  assert.ok((await teacher.get('/api/t/decks')).data.length >= 5, 'decks seeded');
});

test('invite → registration → login', async () => {
  const r = await teacher.post('/api/t/students', { name: 'Мария Иванова', rate: 2000 });
  studentId = r.data.id;
  assert.match(r.data.invite_code, /^[A-Z0-9]{3}-[A-Z0-9]{4}$/);
  assert.equal((await student.get(`/api/invite/${r.data.invite_code}`)).data.name, 'Мария Иванова');
  assert.equal((await student.post('/api/register', { code: r.data.invite_code, login: 'masha', password: 'masha123' })).status, 200);
  // invite is single-use
  assert.equal((await new Client().post('/api/register', { code: r.data.invite_code, login: 'other', password: 'secret1' })).status, 404);
  assert.equal((await new Client().post('/api/login', { login: 'masha', password: 'wrong' })).status, 400);
  assert.equal((await student.get('/api/state')).data.user.role, 'student');
});

test('roles are enforced', async () => {
  assert.equal((await student.get('/api/t/students')).status, 403);
  assert.equal((await teacher.get('/api/s/dashboard')).status, 403);
  assert.equal((await new Client().get('/api/t/students')).status, 401);
});

test('answers are hidden until submit, then auto-graded', async () => {
  const qs = [
    { kind: 'single', text: 'Q1', options: ['a', 'b', 'c'], answer: 1, points: 1 },
    { kind: 'multi', text: 'Q2', options: ['a', 'b', 'c', 'd'], answer: [0, 2], points: 2 },
    { kind: 'number', text: 'Q3', answer: { value: 5.6, tolerance: 0.1 }, points: 1 },
    { kind: 'text', text: 'Q4', answer: ['этанол', 'этиловый спирт'], points: 1 },
    { kind: 'open', text: 'Q5', points: 3 },
  ];
  assignmentId = (await teacher.post('/api/t/assignments', { title: 'ДЗ', questions: qs })).data.id;
  assert.equal((await teacher.post(`/api/t/assignments/${assignmentId}/assign`, { student_ids: [studentId] })).data.added, 1);
  const list = await student.get('/api/s/assignments');
  targetId = list.data[0].id;
  const before = await student.get(`/api/s/assignments/${targetId}`);
  for (const q of before.data.questions) { assert.equal(q.answer, undefined); assert.equal(q.explanation, undefined); }
  const [q1, q2, q3, q4, q5] = before.data.questions;
  const r = await student.post(`/api/s/assignments/${targetId}/submit`, { answers: [
    { question_id: q1.id, value: 1 }, { question_id: q2.id, value: [0] },          // multi: one mistake → 1 of 2
    { question_id: q3.id, value: '5,65' }, { question_id: q4.id, value: '  Этиловый   СПИРТ ' },
    { question_id: q5.id, value: 'решение' }] });
  assert.equal(r.data.status, 'submitted', 'open question needs review');
  assert.equal(r.data.score, 1 + 1 + 1 + 1);
  assert.equal(r.data.max, 8);
  assert.equal((await student.post(`/api/s/assignments/${targetId}/submit`, {})).status, 400, 'cannot submit twice');
  const after = await student.get(`/api/s/assignments/${targetId}`);
  assert.equal(after.data.questions[0].answer, 1, 'answers revealed after submit');
  assert.equal((await student.get('/api/s/mistakes')).data.length, 1, 'wrong multi answer goes to mistakes');
});

test('teacher grading finalises score and notifies', async () => {
  const t = await teacher.get(`/api/t/targets/${targetId}`);
  const open = t.data.questions.find(q => q.kind === 'open');
  await teacher.post(`/api/t/targets/${targetId}/grade`, { answers: [{ question_id: open.id, points: 2, comment: 'почти' }], teacher_comment: 'Хорошо', status: 'graded' });
  const s = await student.get(`/api/s/assignments/${targetId}`);
  assert.equal(s.data.status, 'graded');
  assert.equal(s.data.score, 6);
  assert.ok((await student.get('/api/notifications')).data.some(n => n.text.includes('проверено')));
});

test('balance = payments − done/missed lessons', async () => {
  const l = await teacher.post('/api/t/lessons', { student_id: studentId, start_at: `${Y}-01-10T16:00`, duration: 60, repeat_weeks: 3 });
  assert.equal(l.data.ids.length, 3);
  assert.equal((await teacher.post('/api/t/lessons', { student_id: studentId, start_at: `${Y}-01-10T16:30` })).status, 409, 'overlap detected');
  await teacher.patch(`/api/t/lessons/${l.data.ids[0]}`, { status: 'done' });
  await teacher.patch(`/api/t/lessons/${l.data.ids[1]}`, { status: 'canceled' });
  await teacher.post('/api/t/payments', { student_id: studentId, amount: 5000, date: `${Y}-01-09` });
  const st = (await teacher.get('/api/t/students')).data.find(s => s.id === studentId);
  assert.equal(st.balance, 3000);
});

test('parent page and calendar feed work by token only', async () => {
  const s = await teacher.get(`/api/t/students/${studentId}`);
  const p = await new Client().get(`/api/parent/${s.data.parent_token}`);
  assert.equal(p.data.student.name, 'Мария Иванова');
  assert.equal(p.data.notes, undefined);
  assert.equal((await new Client().get('/api/parent/nope')).status, 404);
  const ics = await new Client().get(`/api/ics/${s.data.parent_token}.ics`);
  assert.match(ics.data, new RegExp(`BEGIN:VCALENDAR[\\s\\S]*DTSTART[^:]*:${Y}0110T160000`));
});

test('chat between teacher and own student only', async () => {
  const me = (await teacher.get('/api/state')).data.user.id;
  assert.equal((await student.post(`/api/chats/${me}`, { text: 'Здравствуйте!' })).status, 200);
  const c = await teacher.get(`/api/chats/${studentId}`);
  assert.equal(c.data.messages.at(-1).text, 'Здравствуйте!');
  assert.equal((await student.post(`/api/chats/${studentId}`, { text: 'self' })).status, 404);
});

test('cross-site writes are rejected', async () => {
  const res = await fetch(BASE + '/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: teacher.cookie }, body: '{"text":"x"}' });
  assert.equal(res.status, 403);
});
