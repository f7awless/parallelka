// Student: materials, flashcards, practice, mistakes.
import { h, icon, clear, badge, empty, fmtDate, fileSize, fileUrl, markdown, chemHTML, toast, select } from '../ui.js';
import { api } from '../api.js';
import { questionView, answerText } from './questions.js';

const KIND_ICON = { note: 'book', file: 'file', link: 'link' };

export async function materials(el) {
  const [items, topics] = await Promise.all([api.get('/api/s/materials'), api.get('/api/topics')]);
  const tTitle = Object.fromEntries(topics.map(t => [t.id, t.title]));
  let q = '';
  const grid = h('div.grid.grid-auto');
  const draw = () => {
    const rows = items.filter(m => !q || m.title.toLowerCase().includes(q) || (tTitle[m.topic] || '').toLowerCase().includes(q));
    clear(grid).append(...rows.map(m => h('a.card.stack-sm', { href: m.kind === 'link' ? m.url : `#/s/materials/${m.id}`, target: m.kind === 'link' ? '_blank' : null, style: { color: 'inherit', textDecoration: 'none' },
      onclick: m.kind === 'link' ? () => api.get(`/api/s/materials/${m.id}`, { quiet: true }) : null },
      h('div.row.between.nowrap', h('div.stat-icon', { style: { width: '34px', height: '34px' } }, icon(KIND_ICON[m.kind])), h('div.row', m.pinned ? '📌' : null, !m.viewed ? badge('новое', 'badge-primary') : null)),
      h('h3', { style: { margin: '6px 0 0' } }, m.title),
      h('div.muted.small', [m.topic && tTitle[m.topic], m.file_name && fileSize(m.file_size), fmtDate(m.created_at)].filter(Boolean).join(' · ')))));
    if (!items.length) grid.append(h('div.card', empty('📚', 'Материалов пока нет', 'Преподаватель добавит конспекты и файлы — они появятся здесь')));
  };
  el.append(h('div.page-head', h('div', h('h1', 'Материалы'), h('div.sub', 'Конспекты, файлы и ссылки от преподавателя'))),
    h('div.search.mb', { style: { maxWidth: '360px' } }, icon('search'), h('input.input', { placeholder: 'Поиск по названию или теме', oninput: e => { q = e.target.value.toLowerCase(); draw(); } })), grid);
  draw();
}

export async function material(el, { id }) {
  const m = await api.get(`/api/s/materials/${id}`);
  el.append(h('div.page-head', h('div', h('a.small', { href: '#/s/materials' }, '← Все материалы'), h('h1', m.title)),
    h('div.page-actions', h('button.btn', { onclick: () => window.print() }, icon('print'), 'Распечатать'))));
  const body = h('div.card', { style: { maxWidth: '860px' } });
  if (m.kind === 'file') {
    if (/^image\//.test(m.file_mime)) body.append(h('img', { src: fileUrl(m.file_id), style: { borderRadius: '8px' } }));
    if (m.file_mime === 'application/pdf') body.append(h('iframe', { src: fileUrl(m.file_id), style: { width: '100%', height: '75vh', border: 0, borderRadius: '8px' }, title: m.title }));
    body.append(h('div.row.mt', h('a.btn.btn-primary', { href: fileUrl(m.file_id), target: '_blank', download: m.file_name }, icon('download'), `Скачать ${m.file_name}`)));
  }
  if (m.kind === 'link') body.append(h('a.btn.btn-primary', { href: m.url, target: '_blank' }, icon('link'), 'Открыть ссылку'));
  if (m.content) body.append(h('div.md', { html: markdown(m.content), style: { marginTop: m.kind === 'note' ? 0 : '16px' } }));
  el.append(body);
}

// ---------- flashcards ----------
export async function cards(el) {
  const decks = await api.get('/api/s/decks');
  const totalDue = decks.reduce((a, d) => a + d.due, 0);
  el.append(h('div.page-head', h('div', h('h1', 'Карточки'), h('div.sub', 'Интервальное повторение: знаешь — карточка вернётся позже, не знаешь — завтра снова'))),
    totalDue ? h('div.notice.mb', `Сегодня к повторению ${totalDue} карточек. 10 минут в день — и формулы запомнятся сами 🧠`) : null,
    decks.length ? h('div.grid.grid-auto', decks.map(d => h('div.card.stack-sm',
      h('div.row.between', h('div.stat-icon', icon('cards')), d.due ? badge(`${d.due} к повторению`, 'badge-warning') : badge('повторено', 'badge-success')),
      h('h3', { style: { margin: '6px 0 0' } }, d.title), d.description ? h('div.muted.small', d.description) : null,
      h('div.small', `Выучено ${d.learned || 0} из ${d.total}`), h('div.progress.sm', h('div', { style: { width: (d.learned || 0) / d.total * 100 + '%' } })),
      h('div.row.mt-sm', h('a.btn.btn-primary.btn-sm', { href: `#/s/cards/${d.id}` }, d.due ? 'Учить' : 'Повторить всё'),))))
      : h('div.card', empty('🃏', 'Колод пока нет')));
}

export async function study(el, { id }, app) {
  let d = await api.get(`/api/s/decks/${id}`);
  let allMode = false;
  if (!d.cards.length) { d = await api.get(`/api/s/decks/${id}?all=1`); allMode = true; }
  const queue = [...d.cards];
  let i = 0, known = 0, unknown = 0;
  const stage = h('div');
  const counter = h('span.muted');
  el.append(h('div.page-head', h('div', h('a.small', { href: '#/s/cards' }, '← Все колоды'), h('h1', d.title), h('div.sub', allMode ? 'Все карточки уже повторены — режим свободной тренировки' : 'Нажми на карточку, чтобы перевернуть. Клавиши: пробел — перевернуть, ← не знаю, → знаю')),
    counter), stage);
  const draw = () => {
    counter.textContent = `${Math.min(i + 1, queue.length)} / ${queue.length}`;
    if (i >= queue.length) {
      clear(stage).append(h('div.card.center.stack', { style: { maxWidth: '520px', margin: '0 auto', padding: '32px' } }, h('div', { style: { fontSize: '48px' } }, '🎉'), h('h2', 'Колода пройдена!'),
        h('p', `Знаю: ${known} · Повторить: ${unknown}`), h('div.row', { style: { justifyContent: 'center' } }, h('a.btn', { href: '#/s/cards' }, 'К колодам'), h('button.btn.btn-primary', { onclick: () => app.go(location.hash) }, 'Ещё раз'))));
      app.refresh();
      return;
    }
    const c = queue[i];
    const card = h('div.flash', { onclick: () => card.classList.toggle('flipped') },
      h('div.flash-inner', h('div.flash-face', { html: chemHTML(c.front) }), h('div.flash-face.flash-back', { html: chemHTML(c.back) })));
    clear(stage).append(card, h('div.row.mt', { style: { justifyContent: 'center', gap: '12px' } },
      h('button.btn.btn-lg', { onclick: () => answer(false), style: { color: 'var(--danger)' } }, icon('x'), 'Не знаю'),
      h('button.btn.btn-lg.btn-primary', { onclick: () => answer(true) }, icon('check'), 'Знаю')),
      h('div.center.muted.tiny.mt-sm', `Уровень карточки: ${c.box || 0} из 5`));
  };
  const answer = async ok => {
    const c = queue[i];
    if (!allMode) api.post(`/api/s/cards/${c.id}/review`, { known: ok }, { quiet: true });
    if (ok) known++; else { unknown++; if (queue.filter(x => x.id === c.id).length < 3) queue.push(c); }
    i++; draw();
  };
  const keys = e => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); stage.querySelector('.flash')?.classList.toggle('flipped'); }
    if (e.key === 'ArrowRight') answer(true);
    if (e.key === 'ArrowLeft') answer(false);
  };
  document.addEventListener('keydown', keys);
  draw();
  return () => document.removeEventListener('keydown', keys);
}

// ---------- practice ----------
export async function practice(el, _, app) {
  const topics = await api.get('/api/s/practice/topics');
  if (!topics.length) { el.append(h('h1', 'Тренажёр'), h('div.card', empty('🏋️', 'Пока нет задач', 'Преподаватель ещё не наполнил банк задач'))); return; }
  const bySec = {};
  for (const t of topics) (bySec[t.section] ||= []).push(t);
  const topicSel = select([['', `Все темы (${topics.reduce((a, t) => a + t.count, 0)})`], ...topics.map(t => [t.id, `${t.title} (${t.count})`])], '', { style: { maxWidth: '420px' } });
  const diffSel = select([['', 'Любая сложность'], [1, 'Базовая'], [2, 'Средняя'], [3, 'Сложная']], '', { style: { width: 'auto' } });
  const stage = h('div');
  let score = 0, total = 0;
  const scoreEl = h('b');
  el.append(h('div.page-head', h('div', h('h1', 'Тренажёр'), h('div.sub', 'Решай задачи по любой теме — проверка и разбор сразу. +2 XP за правильный ответ'))),
    h('div.card.mb.row', topicSel, diffSel, h('button.btn.btn-primary', { onclick: start }, icon('dumbbell'), 'Начать'), h('span.grow'), h('span', 'Счёт: ', scoreEl)), stage);
  scoreEl.textContent = '0 / 0';

  async function start() {
    const qs = await api.get(`/api/s/practice?topic=${topicSel.value}&difficulty=${diffSel.value}&count=10`);
    if (!qs.length) { clear(stage).append(h('div.card', empty('🤷', 'Задач с такими фильтрами нет'))); return; }
    let i = 0;
    const next = () => {
      if (i >= qs.length) {
        clear(stage).append(h('div.card.center.stack', { style: { padding: '32px' } }, h('div', { style: { fontSize: '44px' } }, '💪'), h('h2', 'Серия завершена'),
          h('p', `Верно ${score} из ${total}`), h('div', h('button.btn.btn-primary', { onclick: start }, 'Ещё 10 задач'))));
        app.refresh(); return;
      }
      const q = qs[i];
      let value;
      const view = questionView(q, { index: i, onChange: v => { value = v; } });
      const btn = h('button.btn.btn-primary', { onclick: check }, 'Проверить');
      const box = h('div.stack', view, h('div.row', btn, h('span.muted.small', `Задача ${i + 1} из ${qs.length}`)));
      clear(stage).append(box);
      async function check() {
        if (value == null || value === '' || (Array.isArray(value) && !value.length)) return toast('Сначала ответь 🙂');
        const r = await api.post('/api/s/practice/check', { question_id: q.id, value });
        total++; if (r.correct) score++;
        scoreEl.textContent = `${score} / ${total}`;
        const res = questionView({ ...q, answer: r.answer, explanation: r.explanation }, { index: i, disabled: true, reveal: true, value, result: { correct: r.correct ? 1 : 0, points: r.points } });
        clear(box).append(h('div.notice.mb-sm', { class: r.correct ? 'ok' : 'warn' }, r.correct ? '✅ Верно! +2 XP' : `❌ Неверно. Правильный ответ: `, r.correct ? null : h('b', { html: chemHTML(answerText(q, r.answer)) })),
          res, h('div.row', h('button.btn.btn-primary', { onclick: () => { i++; next(); } }, 'Дальше', icon('chevR'))));
      }
    };
    next();
  }
}

// ---------- mistakes ----------
export async function mistakes(el, _, app) {
  const list = await api.get('/api/s/mistakes');
  const open = list.filter(m => !m.fixed), fixed = list.filter(m => m.fixed);
  el.append(h('div.page-head', h('div', h('h1', 'Работа над ошибками'), h('div.sub', 'Сюда автоматически попадают вопросы, где была ошибка. Реши их заново — +4 XP за каждую исправленную'))));
  if (!list.length) { el.append(h('div.card', empty('✨', 'Ошибок нет', 'Когда ошибёшься в задании, вопрос появится здесь, чтобы его можно было разобрать'))); return; }
  el.append(h('div.row.mb', badge(`Осталось: ${open.length}`, 'badge-warning'), badge(`Исправлено: ${fixed.length}`, 'badge-success')));
  const box = h('div.stack');
  el.append(box);
  open.forEach((m, i) => {
    let value;
    const wrap = h('div.stack-sm');
    const draw = () => {
      clear(wrap).append(questionView({ ...m, id: m.question_id }, { index: i, onChange: v => { value = v; } }),
        h('div.row', h('button.btn.btn-primary', { onclick: async () => {
          if (value == null || value === '' || (Array.isArray(value) && !value.length)) return toast('Сначала ответь');
          const r = await api.post(`/api/s/mistakes/${m.id}/retry`, { value });
          if (r.correct) {
            toast('Верно! Ошибка исправлена, +4 XP', 'success');
            clear(wrap).append(questionView({ ...m, id: m.question_id, answer: r.answer, explanation: r.explanation }, { index: i, disabled: true, reveal: true, value, result: { correct: 1, points: m.points } }));
            app.refresh();
          } else toast('Пока неверно — попробуй ещё раз', 'error');
        } }, 'Проверить'),
          h('button.btn.btn-ghost', { onclick: async () => {
            const r = await api.post(`/api/s/mistakes/${m.id}/reveal`);
            clear(wrap).append(questionView({ ...m, id: m.question_id, answer: r.answer, explanation: r.explanation }, { index: i, disabled: true, reveal: true, value: m.wrong_value, result: { correct: 0, points: 0 } }),
              h('div.row', h('span.muted.small', 'Разберись с решением и попробуй позже ещё раз — вопрос останется в списке.'), h('button.btn.btn-sm', { onclick: draw }, 'Решить заново')));
          } }, icon('eye'), 'Показать решение')));
    };
    draw();
    box.append(wrap);
  });
  if (fixed.length) el.append(h('details.mt', h('summary.bold', { style: { cursor: 'pointer' } }, `Исправленные (${fixed.length})`),
    h('div.stack.mt', fixed.map(m => h('div.card.small', { html: '✅ ' + chemHTML(m.text.slice(0, 200)) })))));
}
