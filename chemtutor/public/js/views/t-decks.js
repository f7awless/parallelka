import { h, icon, clear, modal, field, toast, empty, chemHTML, confirmDialog } from '../ui.js';
import { api } from '../api.js';

export default async function decks(el) {
  const list = await api.get('/api/t/decks');
  el.append(
    h('div.page-head', h('div', h('h1', 'Карточки'), h('div.sub', 'Колоды для запоминания: ученики учат их с интервальным повторением (система Лейтнера)')),
      h('div.page-actions', h('button.btn.btn-primary', { onclick: () => edit() }, icon('plus'), 'Новая колода'))),
    list.length ? h('div.grid.grid-auto', list.map(d => h('div.card.stack-sm',
      h('div.row.between', h('div.stat-icon', icon('cards')), h('span.badge', `${d.count} карточек`)),
      h('h3', { style: { margin: '6px 0 0' } }, d.title), d.description ? h('p.muted.small', d.description) : null,
      h('div.row.mt-sm', h('button.btn.btn-sm', { onclick: () => edit(d.id) }, icon('edit'), 'Редактировать'),
        h('button.btn.btn-ghost.btn-sm.btn-icon', { onclick: async () => { if (await confirmDialog(`Удалить колоду «${d.title}»? Прогресс учеников по ней пропадёт.`)) { await api.del(`/api/t/decks/${d.id}`); location.reload(); } } }, icon('trash'))))))
      : h('div.card', empty('🃏', 'Колод пока нет', 'Создайте колоду: на одной стороне вопрос, на другой — ответ')));
}

async function edit(id) {
  const d = id ? await api.get(`/api/t/decks/${id}`) : { title: '', description: '', cards: [] };
  const cards = d.cards.map(c => ({ ...c }));
  if (!cards.length) cards.push({ front: '', back: '' }, { front: '', back: '' });
  const title = h('input.input', { value: d.title, placeholder: 'Например: Названия кислотных остатков' });
  const desc = h('input.input', { value: d.description || '', placeholder: 'Короткое описание' });
  const box = h('div.stack-sm', { style: { maxHeight: '48vh', overflowY: 'auto', paddingRight: '4px' } });
  const draw = () => clear(box).append(...cards.map((c, i) => h('div.row.nowrap', { style: { alignItems: 'flex-start' } },
    h('span.muted.small', { style: { width: '24px', paddingTop: '9px' } }, i + 1),
    h('textarea.input', { rows: 1, style: { minHeight: '38px' }, placeholder: 'Вопрос / термин', oninput: e => { c.front = e.target.value; } }, c.front),
    h('textarea.input', { rows: 1, style: { minHeight: '38px' }, placeholder: 'Ответ', oninput: e => { c.back = e.target.value; } }, c.back),
    h('button.btn.btn-ghost.btn-icon.btn-sm', { style: { marginTop: '4px' }, onclick: () => { cards.splice(i, 1); draw(); } }, icon('x')))));
  draw();
  const bulk = () => {
    const ta = h('textarea.input', { rows: 10, placeholder: 'H2SO4 — серная кислота\nHNO3 — азотная кислота\n…' });
    modal({ title: 'Вставить списком', body: h('div.stack', h('p.muted.small', 'Каждая строка — карточка. Вопрос и ответ разделяйте « — », « - », табуляцией или «;». Удобно копировать из Excel.'), ta),
      foot: close => [h('button.btn', { onclick: close }, 'Отмена'), h('button.btn.btn-primary', { onclick: () => {
        const add = ta.value.split('\n').map(l => l.split(/\t| [—–-] |;/)).filter(p => p.length >= 2 && p[0].trim()).map(([f, ...b]) => ({ front: f.trim(), back: b.join(' — ').trim() }));
        for (let i = cards.length - 1; i >= 0; i--) if (!cards[i].front && !cards[i].back) cards.splice(i, 1);
        cards.push(...add); draw(); toast(`Добавлено: ${add.length}`, 'success'); close();
      } }, 'Добавить')] });
  };
  modal({ title: id ? 'Редактировать колоду' : 'Новая колода', wide: true,
    body: h('div.form', h('div.form-row', field('Название', title), field('Описание', desc)),
      h('div.row.between', h('span.label', 'Карточки'), h('div.row', h('button.btn.btn-sm', { onclick: bulk }, 'Вставить списком'))), box,
      h('button.btn.btn-sm', { onclick: () => { cards.push({ front: '', back: '' }); draw(); box.scrollTop = box.scrollHeight; box.lastChild.querySelector('textarea').focus(); } }, icon('plus'), 'Карточка')),
    foot: close => [h('button.btn', { onclick: close }, 'Отмена'), h('button.btn.btn-primary', { onclick: async () => {
      if (!title.value.trim()) return toast('Введите название', 'error');
      const body = { title: title.value, description: desc.value, cards: cards.filter(c => c.front.trim() && c.back.trim()) };
      if (id) await api.put(`/api/t/decks/${id}`, body); else await api.post('/api/t/decks', body);
      toast('Сохранено', 'success'); close(); location.reload();
    } }, 'Сохранить')] });
}
