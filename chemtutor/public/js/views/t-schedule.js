import { h, icon, clear, modal, field, select, toast, confirmDialog, localISO, parseDate, pad, DOW, MONTHS_NOM, fmtDate, fmtTime, money, badge, STATUS, copyBox } from '../ui.js';
import { api } from '../api.js';
import { store } from '../app.js';

const H0 = 8, H1 = 22;

export default async function schedule(el, _, app) {
  let view = store.get('ct-cal-view') || (innerWidth < 860 ? 'list' : 'week');
  let anchor = new Date(); anchor.setHours(0, 0, 0, 0);
  const students = await api.get('/api/t/students');
  const body = h('div');
  const title = h('h2.cal-title', { style: { margin: 0, minWidth: '180px' } });
  const seg = h('div.seg', [['week', 'Неделя'], ['month', 'Месяц'], ['list', 'Список']].map(([k, t]) =>
    h('button', { class: k === view ? 'active' : '', onclick: e => { view = k; store.set('ct-cal-view', k); seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target)); draw(); } }, t)));
  const shift = dir => {
    if (view === 'month') anchor.setMonth(anchor.getMonth() + dir); else anchor.setDate(anchor.getDate() + dir * 7);
    draw();
  };
  el.append(
    h('div.page-head', h('div', h('h1', 'Расписание')),
      h('div.page-actions',
        h('button.btn', { onclick: () => calendarFeed() }, icon('link'), h('span.hide-m', 'Подписка в календарь')),
        h('a.btn', { href: '/api/t/export/lessons.csv' }, icon('download'), h('span.hide-m', 'CSV')),
        h('button.btn.btn-primary', { onclick: () => lessonDialog({ students, onSaved: draw }) }, icon('plus'), 'Занятие'))),
    h('div.row.between.mb', h('div.row',
      h('button.btn.btn-icon', { onclick: () => shift(-1), 'aria-label': 'Назад' }, icon('chevL')),
      h('button.btn', { onclick: () => { anchor = new Date(); anchor.setHours(0, 0, 0, 0); draw(); } }, 'Сегодня'),
      h('button.btn.btn-icon', { onclick: () => shift(1), 'aria-label': 'Вперёд' }, icon('chevR')), title), seg),
    body);

  async function draw() {
    let from, to;
    if (view === 'month') {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      from = new Date(first); from.setDate(1 - ((first.getDay() + 6) % 7));
      to = new Date(from); to.setDate(from.getDate() + 42);
      title.textContent = `${MONTHS_NOM[anchor.getMonth()]} ${anchor.getFullYear()}`;
    } else {
      from = new Date(anchor); from.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
      to = new Date(from); to.setDate(from.getDate() + (view === 'list' ? 14 : 7));
      const last = new Date(to); last.setDate(to.getDate() - 1);
      title.textContent = `${from.getDate()} ${fmtDate(localISO(from)).split(' ')[1]} — ${fmtDate(localISO(last))}`;
    }
    const lessons = await api.get(`/api/t/lessons?from=${localISO(from).slice(0, 10)}&to=${localISO(to).slice(0, 10)}`);
    clear(body).append(view === 'week' ? week(from, lessons) : view === 'month' ? month(from, lessons) : list(from, to, lessons));
  }

  function week(from, lessons) {
    const grid = h('div.cal');
    const todayKey = localISO().slice(0, 10);
    grid.append(h('div.cal-head'));
    const days = [...Array(7)].map((_, i) => { const d = new Date(from); d.setDate(from.getDate() + i); return d; });
    days.forEach(d => grid.append(h(`div.cal-head${localISO(d).slice(0, 10) === todayKey ? '.today' : ''}`, h('div.muted', DOW[d.getDay()]), h('div.num', d.getDate()))));
    for (let hr = H0; hr < H1; hr++) {
      grid.append(h('div.cal-time', `${pad(hr)}:00`));
      days.forEach(d => {
        const key = `${localISO(d).slice(0, 10)}T${pad(hr)}:00`;
        const cell = h('div.cal-cell', { onclick: e => { if (e.target === cell) lessonDialog({ students, start: key, onSaved: draw }); } });
        const here = lessons.filter(l => l.start_at.slice(0, 13) === key.slice(0, 13));
        here.forEach((l, k) => {
          const top = Number(l.start_at.slice(14, 16)) / 60 * 48;
          const w = 100 / here.length;
          cell.append(h(`div.cal-event.${l.status}`, { style: { '--c': l.color, top: top + 'px', height: Math.max(22, l.duration / 60 * 48 - 3) + 'px',
            left: `calc(${k * w}% + 3px)`, right: 'auto', width: `calc(${w}% - 6px)` },
            onclick: () => lessonDialog({ lesson: l, students, onSaved: draw }), title: `${l.student}: ${l.topic || ''}` },
            h('b', fmtTime(l.start_at) + ' ' + l.student.split(' ')[0]), l.duration >= 45 && l.topic ? h('div.ellipsis', l.topic) : null));
        });
        if (key.slice(0, 10) === todayKey && new Date().getHours() === hr) cell.append(h('div.cal-now', { style: { top: new Date().getMinutes() / 60 * 48 + 'px' } }));
        grid.append(cell);
      });
    }
    return h('div.card.pad-0', h('div.table-wrap', { style: { maxHeight: '72vh', overflowY: 'auto' } }, grid));
  }

  function month(from, lessons) {
    const g = h('div.month', ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => h('div.dow', d)));
    const todayKey = localISO().slice(0, 10);
    for (let i = 0; i < 42; i++) {
      const d = new Date(from); d.setDate(from.getDate() + i);
      const key = localISO(d).slice(0, 10);
      const ls = lessons.filter(l => l.start_at.startsWith(key));
      g.append(h(`div.day${d.getMonth() !== anchor.getMonth() ? '.other' : ''}${key === todayKey ? '.today' : ''}`,
        { onclick: e => { if (!e.target.closest('.ev')) lessonDialog({ students, start: `${key}T16:00`, onSaved: draw }); } },
        h('span.n', d.getDate()),
        ls.map(l => h(`span.ev`, { style: { '--c': l.color, opacity: l.status === 'canceled' ? .45 : 1 }, onclick: () => lessonDialog({ lesson: l, students, onSaved: draw }) },
          `${fmtTime(l.start_at)} ${l.student.split(' ')[0]}`))));
    }
    return h('div.card.pad-0', g);
  }

  function list(from, to, lessons) {
    if (!lessons.length) return h('div.card', h('div.empty', h('div.emoji', '🗓️'), h('h3', 'Занятий нет'), h('p', 'На эти две недели ничего не запланировано')));
    const byDay = {};
    for (const l of lessons) (byDay[l.start_at.slice(0, 10)] ||= []).push(l);
    return h('div.stack', Object.entries(byDay).map(([day, ls]) => h('div.card',
      h('h3', fmtDate(day, { dow: true })),
      h('div.stack-sm', ls.map(l => h('div.lesson', { style: { '--c': l.color, cursor: 'pointer' }, onclick: () => lessonDialog({ lesson: l, students, onSaved: draw }) },
        h('div.time', fmtTime(l.start_at), h('small', `${l.duration} мин`)),
        h('div.grow', h('div.bold', l.student), h('div.muted.small', l.topic || '—')),
        l.status !== 'planned' ? badge(...STATUS[l.status]) : null, h('span.muted.small.hide-m', money(l.price))))))));
  }

  async function calendarFeed() {
    const { token } = await api.post('/api/me/calendar-token');
    const url = `${location.origin}/api/ics/${token}.ics`;
    modal({ title: 'Подписка на календарь', body: h('div.stack',
      h('p', 'Добавьте эту ссылку в Google Календарь («Другие календари» → «Добавить по URL»), Яндекс.Календарь или Apple Календарь — все занятия будут появляться там автоматически, с напоминанием за 30 минут.'),
      copyBox(url), h('p.muted.small', 'Ссылка секретная — не публикуйте её. Ученики получают свою ссылку в разделе «Расписание».')) });
  }

  draw();
}

/** Create / edit lesson dialog. */
export async function lessonDialog({ lesson, students, start, onSaved }) {
  students ||= await api.get('/api/t/students');
  if (!students.length) { toast('Сначала добавьте ученика', 'error'); location.hash = '#/t/students?new=1'; return; }
  const l = lesson || {};
  const isNew = !l.id;
  const startVal = l.start_at || start || (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(16, 0, 0, 0); return localISO(d); })();
  const st = select(students.map(s => [s.id, s.name]), l.student_id || students[0].id, { name: 'student_id' });
  const price = h('input.input', { type: 'number', name: 'price', value: l.price ?? (students.find(s => s.id == st.value)?.rate || 0), min: 0, step: 100 });
  st.addEventListener('change', () => { if (isNew) price.value = students.find(s => s.id == st.value)?.rate || 0; });
  const date = h('input.input', { type: 'date', value: startVal.slice(0, 10), required: true });
  const time = h('input.input', { type: 'time', value: startVal.slice(11, 16), step: 300, required: true });
  const dur = select([[45, '45 мин'], [60, '1 час'], [90, '1,5 часа'], [120, '2 часа']], l.duration || 60, { name: 'duration' });
  const topic = h('input.input', { name: 'topic', value: l.topic || '', placeholder: 'Например: ОВР, метод электронного баланса', list: 'topic-suggest' });
  const link = h('input.input', { name: 'link', value: l.link || '', placeholder: 'Zoom / Яндекс Телемост / Google Meet' });
  const plan = h('textarea.input', { name: 'plan', placeholder: 'План занятия (видит ученик)', rows: 3 }, l.plan || '');
  const summary = h('textarea.input', { name: 'summary', placeholder: 'Что прошли, что задано, на что обратить внимание (видит ученик и родитель)', rows: 3 }, l.summary || '');
  const note = h('textarea.input', { name: 'private_note', placeholder: 'Заметка только для вас', rows: 2 }, l.private_note || '');
  const repeat = select([[1, 'Не повторять'], [4, 'Каждую неделю, 4 раза'], [8, 'Каждую неделю, 8 раз'], [12, '12 недель'], [17, 'До конца полугодия (17 нед.)'], [34, 'Весь учебный год (34 нед.)']], 1);
  let status = l.status || 'planned';
  const statusSeg = h('div.seg', Object.entries(STATUS).map(([k, [t]]) =>
    h('button', { type: 'button', class: k === status ? 'active' : '', onclick: e => { status = k; statusSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target)); } }, t)));

  const body = h('div.form',
    h('datalist#topic-suggest', ['Строение атома', 'Химическая связь', 'ОВР', 'Гидролиз', 'Электролиз', 'Задачи на растворы', 'Химическое равновесие', 'Алканы', 'Алкены', 'Спирты', 'Альдегиды и кетоны', 'Карбоновые кислоты', 'Амины', 'Разбор варианта ЕГЭ', 'Разбор варианта ОГЭ'].map(t => h('option', { value: t }))),
    field('Ученик', st),
    h('div.form-row', field('Дата', date), field('Время', time), field('Длительность', dur)),
    field('Тема', topic),
    h('div.form-row', field('Стоимость, ₽', price), field('Ссылка на урок', link)),
    isNew ? field('Повтор', repeat) : field('Статус', statusSeg),
    field('План', plan),
    !isNew ? field('Итоги занятия', summary) : null,
    field('Личная заметка', note));

  const save = async (close, force = false) => {
    if (!date.value || !time.value) return toast('Укажите дату и время', 'error');
    const data = { student_id: Number(st.value), start_at: `${date.value}T${time.value}`, duration: Number(dur.value), topic: topic.value, price: Number(price.value) || 0,
      link: link.value, plan: plan.value, private_note: note.value };
    try {
      if (isNew) {
        await api.post('/api/t/lessons', { ...data, repeat_weeks: Number(repeat.value), force }, { quiet: true });
        toast(Number(repeat.value) > 1 ? `Создано занятий: ${repeat.value}` : 'Занятие создано', 'success');
      } else {
        await api.patch(`/api/t/lessons/${l.id}`, { ...data, status, summary: summary.value });
        toast('Сохранено', 'success');
      }
      close(); onSaved?.();
    } catch (e) {
      if (e.status === 409) { if (await confirmDialog(`${e.message}. Всё равно создать?`, { ok: 'Создать', danger: false })) save(close, true); }
      else toast(e.message, 'error');
    }
  };
  modal({ title: isNew ? 'Новое занятие' : `Занятие · ${fmtDate(l.start_at)}`, body, wide: false,
    foot: close => [
      !isNew ? h('button.btn.btn-danger', { style: { marginRight: 'auto' }, onclick: async () => {
        const series = l.series_id && await confirmDialog('Это занятие из серии. Удалить и все следующие занятия серии?', { ok: 'Удалить серию', title: 'Удаление' });
        if (!series && !(await confirmDialog('Удалить занятие?'))) return;
        await api.del(`/api/t/lessons/${l.id}${series ? '?series=1' : ''}`); close(); onSaved?.();
      } }, icon('trash')) : null,
      !isNew && l.status === 'planned' ? h('button.btn', { onclick: async () => { await api.patch(`/api/t/lessons/${l.id}`, { status: 'done', summary: summary.value }); toast('Отмечено как проведённое', 'success'); close(); onSaved?.(); } }, icon('check'), 'Проведено') : null,
      h('button.btn', { onclick: close }, 'Отмена'),
      h('button.btn.btn-primary', { onclick: () => save(close) }, isNew ? 'Создать' : 'Сохранить')] });
}
