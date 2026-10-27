import { h, icon, clear, modal, field, toast, badge, empty, fmtDateTime, scoreClass, pct, confirmDialog, avatar, T_STATUS, localISO, untilText, chemHTML } from '../ui.js';
import { api } from '../api.js';
import { questionView, answerText } from './questions.js';

export default async function assignment(el, { id }, app) {
  const a = await api.get(`/api/t/assignments/${id}`);
  const reload = () => app.go(location.hash);
  const rate = Object.fromEntries(a.qstats.map(s => [s.question_id, s]));
  const max = a.questions.reduce((s, q) => s + q.points, 0);
  const graded = a.targets.filter(t => t.status === 'graded');
  el.append(
    h('div.page-head', h('div', h('h1', a.title), h('div.sub', `${a.kind === 'test' ? 'Тест' + (a.time_limit ? ` · ${a.time_limit} мин` : '') : 'Домашнее задание'} · ${a.questions.length} вопр. · ${max} баллов`)),
      h('div.page-actions',
        h('button.btn', { onclick: () => printSheet(a, false) }, icon('print'), h('span.hide-m', 'Распечатать для ученика')),
        h('button.btn.btn-ghost', { onclick: () => printSheet(a, true), title: 'Версия с ответами для себя' }, h('span.hide-m', 'С ответами')),
        h('a.btn', { href: `#/t/homework/${id}/edit` }, icon('edit'), 'Изменить'),
        h('button.btn.btn-danger', { onclick: async () => { if (await confirmDialog('Удалить задание вместе с ответами учеников?')) { await api.del(`/api/t/assignments/${id}`); location.hash = '#/t/homework'; } } }, icon('trash')),
        h('button.btn.btn-primary', { onclick: () => assignDialog(a, reload) }, icon('send'), 'Выдать'))),
    a.description ? h('div.notice.mb', a.description) : null,
    h('div.grid.grid-3',
      h('div.card.span-2.pad-0',
        h('div.card-head', { style: { padding: '16px 18px 0' } }, h('h3', 'Кому выдано'), graded.length ? h('span.muted.small', `средний результат ${Math.round(graded.reduce((s, t) => s + pct(t.score, t.max_score), 0) / graded.length)}%`) : null),
        a.targets.length ? h('table.table', h('tbody', a.targets.map(t => h('tr',
          h('td', h('div.row.nowrap', avatar({ name: t.student, color: t.color }, 'sm'), h('a.bold', { href: `#/t/students/${t.student_id}` }, t.student))),
          h('td', badge(...T_STATUS[t.status])),
          h('td.small.hide-m', t.submitted_at ? `сдано ${fmtDateTime(t.submitted_at)}` : t.due_at ? h('span', { class: t.due_at < localISO() ? 'text-danger' : '' }, `срок ${fmtDateTime(t.due_at)}`) : 'без срока'),
          h('td.right', t.status === 'graded' ? badge(`${t.score}/${t.max_score}`, scoreClass(pct(t.score, t.max_score))) : null),
          h('td.right.nowrap',
            ['submitted', 'graded', 'returned'].includes(t.status) ? h('a.btn.btn-sm', { href: `#/t/review/${t.id}` }, t.status === 'submitted' ? 'Проверить' : 'Открыть') : null,
            h('button.btn.btn-ghost.btn-sm', { title: 'Отозвать', onclick: async () => { if (await confirmDialog(`Отозвать задание у ${t.student}? Ответы будут удалены.`)) { await api.del(`/api/t/targets/${t.id}`); reload(); } } }, icon('x')))))))
          : h('div', { style: { padding: '0 18px 18px' } }, empty('📤', 'Задание ещё никому не выдано', null, h('button.btn.btn-primary', { onclick: () => assignDialog(a, reload) }, 'Выдать ученикам')))),
      h('div.card', h('h3', 'Сложные вопросы'),
        a.qstats.length ? h('div.stack-sm', a.questions.map((q, i) => ({ q, i, s: rate[q.id] })).filter(x => x.s).sort((x, y) => x.s.rate - y.s.rate).slice(0, 6).map(({ q, i, s }) =>
          h('div', h('div.row.between.small', h('a', { href: `#q-${i}` }, `Вопрос ${i + 1}`), h('b', `${Math.round(s.rate * 100)}% верно`)),
            h('div.progress.sm', h('div', { style: { width: s.rate * 100 + '%', background: s.rate < .5 ? 'var(--danger)' : s.rate < .75 ? 'var(--warning)' : 'var(--success)' } })))))
          : h('p.muted.small', 'Статистика появится, когда ученики сдадут работу.'))),
    h('h2.mt', 'Вопросы и ответы'),
    h('div.stack', a.questions.map((q, i) => questionView(q, { index: i, disabled: true, reveal: true, value: q.answer?.value ?? (q.kind === 'text' ? q.answer?.[0] : q.answer) }))));
}

export function assignDialog(a, onDone) {
  return (async () => {
    const students = await api.get('/api/t/students');
    if (!students.length) return toast('Сначала добавьте учеников', 'error');
    const already = new Set((a.targets || []).map(t => t.student_id));
    const checks = students.map(s => ({ s, c: h('input', { type: 'checkbox', checked: already.has(s.id) }) }));
    const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(20, 0, 0, 0);
    const due = h('input.input', { type: 'datetime-local', value: localISO(d) });
    const noDue = h('input', { type: 'checkbox' });
    const preset = (days, label) => h('button.btn.btn-sm', { type: 'button', onclick: () => { const x = new Date(); x.setDate(x.getDate() + days); x.setHours(20, 0, 0, 0); due.value = localISO(x); noDue.checked = false; } }, label);
    modal({ title: `Выдать: ${a.title}`, body: h('div.form',
      h('div', h('div.row.between.mb-sm', h('span.label', 'Ученики'), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => checks.forEach(x => { x.c.checked = true; }) }, 'Выбрать всех')),
        h('div.grid.grid-2', { style: { gap: '6px' } }, checks.map(({ s, c }) => h('label.opt', { style: { margin: 0 } }, c, avatar(s, 'sm'), h('span', s.name, already.has(s.id) ? h('span.muted.tiny', ' (уже выдано)') : null))))),
      field('Срок сдачи', due), h('div.row', preset(1, 'Завтра'), preset(3, 'Через 3 дня'), preset(7, 'Через неделю'), h('label.check.small', noDue, 'Без срока'))),
      foot: close => [h('button.btn', { onclick: close }, 'Отмена'), h('button.btn.btn-primary', { onclick: async () => {
        const ids = checks.filter(x => x.c.checked).map(x => x.s.id);
        const r = await api.post(`/api/t/assignments/${a.id}/assign`, { student_ids: ids, due_at: noDue.checked ? null : due.value });
        toast(r.added ? `Выдано ${r.added} ученикам — они получили уведомление` : 'Срок обновлён', 'success'); close(); onDone?.();
      } }, icon('send'), 'Выдать')] });
  })();
}

/** Clean printable worksheet (optionally with an answer key at the end). */
function printSheet(a, withAnswers) {
  const w = window.open('', '_blank');
  if (!w) return toast('Разрешите всплывающие окна для печати', 'error');
  const qs = a.questions.map((q, i) => `<div class="q"><b>${i + 1}.</b> ${chemHTML(q.text).replace(/\n/g, '<br>')}
    ${q.options?.length ? `<ol>${q.options.map(o => `<li>${chemHTML(o)}</li>`).join('')}</ol>` : `<div class="line"></div>${q.kind === 'open' ? '<div class="line"></div><div class="line"></div><div class="line"></div>' : ''}`}</div>`).join('');
  const key = withAnswers ? `<h2>Ответы</h2><ol>${a.questions.map(q => `<li>${q.kind === 'single' ? Number(q.answer) + 1 : q.kind === 'multi' ? (q.answer || []).map(x => x + 1).join(', ') : chemHTML(answerText(q))}${q.explanation ? ` — <i>${chemHTML(q.explanation)}</i>` : ''}</li>`).join('')}</ol>` : '';
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${chemHTML(a.title)}</title><style>
    body{font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111}
    h1{font-size:22px;margin:0 0 4px}.meta{color:#555;margin-bottom:18px;display:flex;justify-content:space-between}
    .q{margin:0 0 16px;break-inside:avoid}ol{margin:6px 0 0}.line{border-bottom:1px solid #999;height:26px}
    sub,sup{font-size:.72em;line-height:0}</style></head><body>
    <h1>${chemHTML(a.title)}</h1><div class="meta"><span>Имя: ______________________</span><span>Дата: ___________</span></div>
    ${a.description ? `<p>${chemHTML(a.description)}</p>` : ''}${qs}${key}<script>onload=()=>print()<\/script></body></html>`);
  w.document.close();
}
