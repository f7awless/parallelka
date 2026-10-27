import { h, icon, clear, modal, field, select, toast, money, fmtDate, barChart, MONTHS_NOM, today, confirmDialog, empty, copyText } from '../ui.js';
import { api } from '../api.js';

export default async function finance(el, _, app) {
  let year = new Date().getFullYear();
  const body = h('div');
  el.append(h('div.page-head', h('div', h('h1', 'Финансы'), h('div.sub', 'Оплаты, начисления и задолженности')),
    h('div.page-actions',
      h('a.btn', { href: '/api/t/export/payments.csv' }, icon('download'), 'Выгрузить в Excel (CSV)'),
      h('button.btn.btn-primary', { onclick: async () => paymentDialog({ students: await api.get('/api/t/students'), onSaved: draw }) }, icon('plus'), 'Оплата'))), body);

  async function draw() {
    const [f, payments] = await Promise.all([api.get(`/api/t/finance?year=${year}`), api.get('/api/t/payments')]);
    const totalIncome = f.months.reduce((a, m) => a + m.income, 0);
    const totalEarned = f.months.reduce((a, m) => a + m.earned, 0);
    const totalLessons = f.months.reduce((a, m) => a + m.lessons, 0);
    const totalHours = f.months.reduce((a, m) => a + m.hours, 0);
    const debt = f.students.filter(s => s.balance < 0).reduce((a, s) => a - s.balance, 0);
    const curMonth = new Date().getMonth();
    clear(body).append(
      h('div.row.mb', h('button.btn.btn-icon', { onclick: () => { year--; draw(); } }, icon('chevL')), h('h2', { style: { margin: 0 } }, String(year)),
        h('button.btn.btn-icon', { onclick: () => { year++; draw(); } }, icon('chevR'))),
      h('div.grid.grid-4.mb',
        st('Получено за год', money(totalIncome)), st('Начислено за занятия', money(totalEarned)),
        st('Средний доход в час', totalHours ? money(totalEarned / totalHours) : '—', `${totalLessons} занятий · ${Math.round(totalHours)} ч`),
        st('Должны вам сейчас', money(debt), debt ? 'var(--danger)' : null)),
      String(year) === String(new Date().getFullYear()) ? h('div.notice.mb', `📅 В этом месяце запланировано ещё ${f.forecast.c} занятий на ${money(f.forecast.s)}.`) : null,
      h('div.card.mb', h('div.card-head', h('h3', 'По месяцам'), h('div.row.small', h('span', { style: { color: 'var(--primary)' } }, '■ ', 'получено'), h('span', { style: { color: 'var(--info)' } }, '■ ', 'начислено'))),
        barChart(f.months.flatMap((m, i) => [
          { label: MONTHS_NOM[i].slice(0, 3), value: m.income, tip: `получено ${money(m.income)}` },
          { label: '', value: m.earned, color: 'var(--info)', tip: `начислено ${money(m.earned)}, ${m.lessons} зан.` }]), { height: 220 })),
      h('div.grid.grid-2',
        h('div.card.pad-0', h('div.card-head', { style: { padding: '16px 18px 0' } }, h('h3', 'Балансы учеников')),
          h('table.table', h('thead', h('tr', h('th', 'Ученик'), h('th.right', `Оплачено в ${year}`), h('th.right', 'Баланс'), h('th'))),
            h('tbody', f.students.filter(s => !s.archived || s.balance).sort((a, b) => a.balance - b.balance).map(s => h('tr',
              h('td', h('a', { href: `#/t/students/${s.id}/finance` }, s.name)), h('td.right', money(s.year_paid)),
              h('td.right.bold', { style: { color: s.balance < 0 ? 'var(--danger)' : s.balance > 0 ? 'var(--success)' : '' } }, money(s.balance)),
              h('td.right', s.balance < 0 ? h('button.btn.btn-ghost.btn-sm', { title: 'Скопировать напоминание', onclick: () => copyText(`Здравствуйте! Напоминаю об оплате занятий по химии: ${money(-s.balance)}. Спасибо!`, 'Напоминание скопировано') }, icon('copy')) : null)))))),
        h('div.card.pad-0', h('div.card-head', { style: { padding: '16px 18px 0' } }, h('h3', 'Последние оплаты')),
          payments.length ? h('div.table-wrap', { style: { maxHeight: '480px', overflowY: 'auto' } }, h('table.table',
            h('tbody', payments.slice(0, 100).map(p => h('tr', h('td.nowrap', fmtDate(p.date)), h('td', p.student, p.comment ? h('div.muted.tiny', p.comment) : null),
              h('td.right.bold.nowrap', money(p.amount)),
              h('td.right', h('button.btn.btn-ghost.btn-sm', { onclick: async () => { if (await confirmDialog('Удалить оплату?')) { await api.del(`/api/t/payments/${p.id}`); draw(); } } }, icon('trash'))))))))
            : empty('💳', 'Оплат пока нет'))));
  }
  draw();
}

const st = (label, value, sub, color) => {
  if (sub && sub.startsWith('var(')) { color = sub; sub = null; }
  return h('div.card.stat', h('div.label', label), h('div.value', { style: color ? { color } : {} }, value), sub ? h('div.delta', sub) : null);
};

export function paymentDialog({ students, studentId, onSaved }) {
  if (!students.length) return toast('Сначала добавьте ученика', 'error');
  const sel = select(students.map(s => [s.id, s.name]), studentId || students[0].id);
  const rateOf = () => students.find(s => s.id == sel.value)?.rate || 0;
  const amount = h('input.input', { type: 'number', min: 0, step: 100, value: rateOf() * 4 || '' });
  const quick = h('div.row', [1, 4, 8].map(n => h('button.btn.btn-sm', { type: 'button', onclick: () => { amount.value = rateOf() * n; } }, `${n} зан.`)));
  sel.addEventListener('change', () => { amount.value = rateOf() * 4 || ''; });
  const date = h('input.input', { type: 'date', value: today() });
  const method = select(['СБП', 'Перевод на карту', 'Наличные', 'Самозанятость (чек)', 'Другое'], 'СБП');
  const comment = h('input.input', { placeholder: 'Например: абонемент на 4 занятия' });
  modal({ title: 'Записать оплату', body: h('div.form', field('Ученик', sel), field('Сумма, ₽', amount), quick,
    h('div.form-row', field('Дата', date), field('Способ', method)), field('Комментарий', comment)),
    foot: close => [h('button.btn', { onclick: close }, 'Отмена'), h('button.btn.btn-primary', { onclick: async () => {
      await api.post('/api/t/payments', { student_id: Number(sel.value), amount: Number(amount.value), date: date.value, method: method.value, comment: comment.value });
      toast('Оплата записана', 'success'); close(); onSaved?.();
    } }, 'Сохранить')] });
}
