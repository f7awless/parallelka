import { h, icon, clear, toast, badge, fmtDateTime, untilText, scoreClass, pct, T_STATUS, confirmDialog, markdown, debounce, pad } from '../ui.js';
import { api } from '../api.js';
import { questionView } from './questions.js';

export default async function solve(el, { id }, app) {
  let t = await api.get(`/api/s/assignments/${id}`);
  let timer = null;
  const cleanup = () => clearInterval(timer);

  const done = ['submitted', 'graded'].includes(t.status);
  if (done) { renderResult(); return cleanup; }

  if (t.kind === 'test' && t.time_limit && t.status === 'assigned') {
    el.append(h('div.card.center.stack', { style: { maxWidth: '560px', margin: '40px auto', padding: '32px' } },
      h('div', { style: { fontSize: '48px' } }, '⏱️'), h('h1', t.title),
      h('p.muted', `${t.qcount} вопросов · ${t.time_limit} минут`),
      t.description ? h('div.md', { html: markdown(t.description) }) : null,
      h('p.small', 'После старта таймер не остановится, даже если закрыть страницу. Ответы сохраняются автоматически. Когда время выйдет, тест сдастся сам.'),
      t.due_at ? h('p.small.muted', `Пройти до ${fmtDateTime(t.due_at)}`) : null,
      h('div', h('button.btn.btn-primary.btn-lg', { onclick: async () => { await api.post(`/api/s/assignments/${id}/start`); app.go(location.hash); } }, 'Начать тест'))));
    return cleanup;
  }
  if (t.status === 'assigned' || t.status === 'returned') api.post(`/api/s/assignments/${id}/start`, {}, { quiet: true });

  // ---------- answering ----------
  const answers = new Map(t.answers.map(a => [a.question_id, { question_id: a.question_id, value: a.value, file_ids: a.file_ids || [] }]));
  const filesById = Object.fromEntries(t.files.map(f => [f.id, f]));
  const savedEl = h('span.muted.small');
  const nav = h('div.qnav');
  const isFilled = q => { const a = answers.get(q.id); if (!a) return false; const v = a.value; return (Array.isArray(v) ? v.length : v !== '' && v != null) || a.file_ids?.length; };
  const drawNav = () => clear(nav).append(...t.questions.map((q, i) => h(`a${isFilled(q) ? '.filled' : ''}`, { href: `#q-${i}`, onclick: e => { e.preventDefault(); document.getElementById(`q-${i}`).scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, i + 1)));
  const save = debounce(async () => {
    savedEl.textContent = 'Сохранение…';
    try { await api.put(`/api/s/assignments/${id}/answers`, { answers: [...answers.values()] }, { quiet: true }); savedEl.textContent = '✓ Сохранено'; }
    catch (e) { savedEl.textContent = '⚠ ' + e.message; }
  }, 800);

  const timerEl = h('span.timer');
  if (t.remaining != null) {
    let left = t.remaining;
    const tick = () => {
      timerEl.textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
      timerEl.classList.toggle('low', left < 60);
      if (left <= 0) { clearInterval(timer); toast('Время вышло — тест отправлен', 'error'); submit(true); }
      left--;
    };
    tick(); timer = setInterval(tick, 1000);
  }

  const qs = t.questions.map((q, i) => {
    const a = answers.get(q.id);
    return questionView(q, { index: i, value: a?.value, files: (a?.file_ids || []).map(f => filesById[f]).filter(Boolean),
      onChange: (value, file_ids) => { answers.set(q.id, { question_id: q.id, value, file_ids }); drawNav(); save(); } });
  });

  async function submit(force = false) {
    const empty = t.questions.filter(q => !isFilled(q)).length;
    if (!force && !(await confirmDialog(empty ? `Без ответа осталось вопросов: ${empty}. Всё равно сдать?` : 'Сдать работу? Изменить ответы будет нельзя.', { ok: 'Сдать', danger: false, title: 'Сдать работу' }))) return;
    clearInterval(timer);
    const r = await api.post(`/api/s/assignments/${id}/submit`, { answers: [...answers.values()] });
    if (r.status === 'graded') celebrate(pct(r.score, r.max));
    toast(r.status === 'graded' ? `Готово! ${r.score} из ${r.max} · +${r.xp} XP` : `Отправлено на проверку · +${r.xp} XP`, 'success');
    t = await api.get(`/api/s/assignments/${id}`);
    app.refresh();
    clear(el); renderResult();
    window.scrollTo(0, 0);
  }

  drawNav();
  el.append(
    h('div.page-head', h('div', h('h1', t.title), h('div.sub.row', badge(...T_STATUS[t.status]), t.due_at ? h('span', { class: new Date(t.due_at) < new Date() ? 'text-danger' : '' }, `срок ${fmtDateTime(t.due_at)} · ${untilText(t.due_at)}`) : null, savedEl)),
      h('div.page-actions', t.remaining != null ? h('div.row', icon('timer'), timerEl) : null)),
    t.status === 'returned' && t.teacher_comment ? h('div.notice.warn.mb', h('b', 'Работа возвращена на доработку: '), t.teacher_comment) : null,
    t.description ? h('div.card.md.mb', { html: markdown(t.description) }) : null,
    h('div.card.mb', { style: { position: 'sticky', top: '62px', zIndex: 10, padding: '10px 14px' } }, h('div.row.between', nav, h('button.btn.btn-primary', { onclick: () => submit() }, icon('check'), 'Сдать'))),
    h('div.stack', qs),
    h('div.row.mt', { style: { justifyContent: 'center' } }, h('button.btn.btn-primary.btn-lg', { onclick: () => submit() }, icon('check'), 'Сдать работу')));
  return cleanup;

  // ---------- result ----------
  function renderResult() {
    const ans = Object.fromEntries(t.answers.map(a => [a.question_id, a]));
    const files = Object.fromEntries(t.files.map(f => [f.id, f]));
    const p = t.max_score ? pct(t.score, t.max_score) : 0;
    const right = t.answers.filter(a => a.correct === 1).length;
    el.append(
      h('div.page-head', h('div', h('h1', t.title), h('div.sub.row', badge(...T_STATUS[t.status]), t.submitted_at ? `сдано ${fmtDateTime(t.submitted_at)}` : null)),
        h('div.page-actions', h('a.btn', { href: '#/s/homework' }, 'К заданиям'))),
      h('div.card.mb.row', { style: { gap: '24px' } },
        h('div', h('div.muted.small', t.status === 'graded' ? 'Результат' : 'Предварительно (автопроверка)'), h('div', { style: { fontSize: '34px', fontWeight: 800 } }, `${t.score ?? 0} / ${t.max_score}`)),
        h('div.grow', h('div.progress', h('div', { style: { width: p + '%', background: p >= 85 ? 'var(--success)' : p >= 60 ? 'var(--warning)' : 'var(--danger)' } })),
          h('div.small.muted.mt-sm', `${right} из ${t.questions.length} верно · ${p}%`, t.status === 'submitted' ? ' · развёрнутые ответы проверяет преподаватель' : '')),
        t.answers.some(a => a.correct === 0) ? h('a.btn', { href: '#/s/mistakes' }, icon('repeat'), 'Работа над ошибками') : null),
      t.teacher_comment ? h('div.notice.mb', h('b', '✍️ Комментарий преподавателя: '), t.teacher_comment) : null,
      !t.reveal ? h('div.notice.mb', 'Преподаватель скрыл правильные ответы для этого задания.') : null,
      h('div.stack', t.questions.map((q, i) => questionView(q, { index: i, disabled: true, reveal: t.reveal, value: ans[q.id]?.value,
        files: (ans[q.id]?.file_ids || []).map(f => files[f]).filter(Boolean), result: { correct: ans[q.id]?.correct ?? null, points: ans[q.id]?.points ?? null }, comment: ans[q.id]?.comment }))));
  }
}

function celebrate(p) {
  if (p < 85) return;
  const box = h('div', { style: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 300, overflow: 'hidden' } });
  const chars = ['⚗️', '🧪', '⭐', '✨', '🎉', '💎'];
  for (let i = 0; i < 36; i++) {
    const s = h('span', { style: { position: 'absolute', left: Math.random() * 100 + '%', top: '-40px', fontSize: 18 + Math.random() * 18 + 'px',
      transition: `transform ${1.6 + Math.random() * 1.4}s cubic-bezier(.2,.6,.4,1), opacity 3s`, opacity: 1 } }, chars[i % chars.length]);
    box.append(s);
    requestAnimationFrame(() => requestAnimationFrame(() => { s.style.transform = `translateY(${innerHeight + 80}px) rotate(${Math.random() * 720 - 360}deg)`; s.style.opacity = 0.3; }));
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 3500);
}
