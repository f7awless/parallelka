import { h, icon, clear, toast, badge, fmtDateTime, fileChip, T_STATUS, confirmDialog } from '../ui.js';
import { api } from '../api.js';
import { questionView } from './questions.js';

export default async function review(el, { id }, app) {
  const t = await api.get(`/api/t/targets/${id}`);
  const ans = Object.fromEntries(t.answers.map(a => [a.question_id, a]));
  const files = Object.fromEntries(t.files.map(f => [f.id, f]));
  const grades = new Map();
  const totalEl = h('b');
  const recalc = () => {
    let s = 0;
    for (const q of t.questions) s += grades.has(q.id) ? Number(grades.get(q.id).points) || 0 : ans[q.id]?.points || 0;
    totalEl.textContent = `${s} / ${t.max_score}`;
  };
  const comment = h('textarea.input', { rows: 3, placeholder: 'Общий комментарий ученику: что получилось, над чем поработать' }, t.teacher_comment || '');

  const blocks = t.questions.map((q, i) => {
    const a = ans[q.id] || {};
    const wrap = h('div.stack-sm');
    const view = questionView(q, { index: i, disabled: true, reveal: true, value: a.value, files: (a.file_ids || []).map(fid => files[fid]).filter(Boolean),
      result: { correct: a.correct ?? null, points: a.points ?? null } });
    wrap.append(view);
    // manual grading control for every question (teacher may override autograde)
    const pts = h('input.input', { type: 'number', min: 0, max: q.points, step: 0.5, value: a.points ?? '', style: { width: '90px' }, placeholder: '—' });
    const cmt = h('input.input', { value: a.comment || '', placeholder: 'Комментарий к ответу' });
    const set = () => { grades.set(q.id, { question_id: q.id, points: pts.value === '' ? 0 : Number(pts.value), comment: cmt.value }); recalc(); };
    pts.addEventListener('input', set); cmt.addEventListener('input', set);
    if (q.kind === 'open' && a.points == null) { view.style.borderColor = 'var(--primary)'; }
    wrap.append(h('div.row.nowrap', { style: { paddingLeft: '4px' } }, h('span.small.muted.nowrap', q.kind === 'open' ? 'Баллы:' : 'Исправить баллы:'), pts,
      h('span.muted.small.nowrap', `из ${q.points}`), cmt,
      h('button.btn.btn-sm', { type: 'button', title: 'Полный балл', onclick: () => { pts.value = q.points; set(); } }, icon('check')),
      h('button.btn.btn-sm', { type: 'button', title: '0 баллов', onclick: () => { pts.value = 0; set(); } }, icon('x'))));
    return wrap;
  });
  recalc();

  const send = async status => {
    // include ungraded open questions as 0 only when explicitly graded; auto-graded ones keep their points
    const list = t.questions.map(q => grades.get(q.id) || (ans[q.id]?.points != null ? { question_id: q.id, points: ans[q.id].points, comment: ans[q.id].comment } : null)).filter(Boolean);
    const missing = t.questions.filter(q => q.kind === 'open' && !grades.has(q.id) && ans[q.id]?.points == null);
    if (status === 'graded' && missing.length && !(await confirmDialog(`Не выставлены баллы за ${missing.length} развёрнутых вопроса — будет 0. Продолжить?`, { ok: 'Продолжить', danger: false }))) return;
    for (const q of missing) list.push({ question_id: q.id, points: 0 });
    await api.post(`/api/t/targets/${t.id}/grade`, { answers: list, teacher_comment: comment.value, status });
    toast(status === 'returned' ? 'Отправлено на доработку' : 'Проверено — ученик получил уведомление', 'success');
    history.back();
  };

  el.append(
    h('div.page-head', h('div', h('h1', t.title), h('div.sub.row', h('a', { href: `#/t/students/${t.student_id}` }, t.student), badge(...T_STATUS[t.status]),
      t.submitted_at ? h('span', `сдано ${fmtDateTime(t.submitted_at)}`) : null, t.attempt > 1 ? badge(`попытка ${t.attempt}`) : null)),
      h('div.page-actions', h('span', 'Итого: ', totalEl),
        h('button.btn', { onclick: async () => { if (await confirmDialog('Дать ученику пройти задание заново? Текущие ответы будут удалены.', { ok: 'Открыть заново', danger: false })) { await api.post(`/api/t/targets/${t.id}/reopen`); toast('Задание открыто повторно', 'success'); history.back(); } } }, icon('repeat'), h('span.hide-m', 'Пересдача')))),
    h('div.stack', blocks),
    h('div.card.mt.stack', h('h3', 'Итог проверки'), comment,
      h('div.row', h('button.btn.btn-primary', { onclick: () => send('graded') }, icon('check'), 'Завершить проверку'),
        h('button.btn', { onclick: () => send('returned') }, icon('repeat'), 'Вернуть на доработку'))));
}
