import { h, icon, clear, modal, field, select, toast, badge, empty, fmtDate, fileSize, fileUrl, markdown, confirmDialog, avatar } from '../ui.js';
import { api, uploadFile, pickFiles } from '../api.js';

const KIND_ICON = { note: 'book', file: 'file', link: 'link' };
const KIND_NAME = { note: 'Конспект', file: 'Файл', link: 'Ссылка' };

export default async function materials(el) {
  const [items, topics, students] = await Promise.all([api.get('/api/t/materials'), api.get('/api/topics'), api.get('/api/t/students')]);
  const tTitle = Object.fromEntries(topics.map(t => [t.id, t.title]));
  let q = '';
  const grid = h('div.grid.grid-auto');
  const reload = () => location.reload();
  el.append(
    h('div.page-head', h('div', h('h1', 'Материалы'), h('div.sub', 'Конспекты, файлы и полезные ссылки для учеников')),
      h('div.page-actions',
        h('button.btn', { onclick: () => edit({ kind: 'link' }) }, icon('link'), 'Ссылка'),
        h('button.btn', { onclick: () => edit({ kind: 'file' }) }, icon('upload'), 'Файл'),
        h('button.btn.btn-primary', { onclick: () => edit({ kind: 'note' }) }, icon('plus'), 'Конспект'))),
    h('div.search.mb', { style: { maxWidth: '360px' } }, icon('search'), h('input.input', { placeholder: 'Поиск', oninput: e => { q = e.target.value.toLowerCase(); draw(); } })),
    grid);

  function draw() {
    const rows = items.filter(m => !q || m.title.toLowerCase().includes(q));
    clear(grid).append(...rows.map(m => h('div.card.stack-sm', { style: { cursor: 'pointer' }, onclick: e => { if (!e.target.closest('button,a')) preview(m); } },
      h('div.row.between.nowrap', h('div.row.nowrap', h('div.stat-icon', { style: { width: '34px', height: '34px' } }, icon(KIND_ICON[m.kind])), badge(KIND_NAME[m.kind])),
        h('div.row.nowrap', m.pinned ? h('span', { title: 'Закреплено' }, '📌') : null, m.for_all ? null : badge(`${m.access.length} уч.`, 'badge-warning'))),
      h('h3', { style: { margin: '6px 0 0' } }, m.title),
      h('div.muted.small', [m.topic && tTitle[m.topic], m.file_name && fileSize(m.file_size), fmtDate(m.created_at)].filter(Boolean).join(' · ')),
      h('div.row.between.mt-sm', h('span.muted.tiny', `👁 ${m.views} из ${m.for_all ? students.length : m.access.length}`),
        h('div.row.nowrap', h('button.btn.btn-ghost.btn-icon.btn-sm', { onclick: () => edit(m), title: 'Изменить' }, icon('edit')),
          h('button.btn.btn-ghost.btn-icon.btn-sm', { title: 'Удалить', onclick: async () => { if (await confirmDialog(`Удалить «${m.title}»?`)) { await api.del(`/api/t/materials/${m.id}`); reload(); } } }, icon('trash')))))));
    if (!items.length) grid.append(h('div.card', empty('📚', 'Материалов нет', 'Добавьте конспект, файл или ссылку')));
  }

  function preview(m) {
    modal({ title: m.title, wide: true, body: m.kind === 'note' ? h('div.md', { html: markdown(m.content) })
      : m.kind === 'link' ? h('a', { href: m.url, target: '_blank' }, m.url)
      : h('div.stack', /^image\//.test(m.file_mime) ? h('img', { src: fileUrl(m.file_id), style: { borderRadius: '8px' } }) : null,
        h('a.btn', { href: fileUrl(m.file_id), target: '_blank' }, icon('download'), m.file_name), m.content ? h('div.md', { html: markdown(m.content) }) : null) });
  }

  function edit(m) {
    const kind = m.kind;
    const title = h('input.input', { value: m.title || '', placeholder: kind === 'note' ? 'Например: Гидролиз солей — шпаргалка' : '' });
    const topic = select([['', '—'], ...topics.map(t => [t.id, t.title])], m.topic);
    const content = h('textarea.input', { rows: kind === 'note' ? 16 : 3, style: { fontFamily: kind === 'note' ? 'ui-monospace, monospace' : '', fontSize: '14px' },
      placeholder: kind === 'note' ? '# Заголовок\n\nТекст конспекта. **жирный**, *курсив*, списки через «- », таблицы через |.\nФормулы пишите как H2SO4, Fe^3+ — оформятся сами.' : 'Описание (необязательно)' }, m.content || '');
    const prev = h('div.md.card', { style: { maxHeight: '400px', overflowY: 'auto', boxShadow: 'none' } });
    const upd = () => { prev.innerHTML = markdown(content.value) || '<p class="muted">Предпросмотр</p>'; };
    content.addEventListener('input', upd); upd();
    const url = h('input.input', { value: m.url || '', placeholder: 'https://…' });
    let file = m.file_id ? { id: m.file_id, name: m.file_name } : null;
    const fileBox = h('div');
    const drawFile = () => clear(fileBox).append(file ? h('div.file-chip', icon('file'), h('span', file.name), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { file = null; drawFile(); } }, icon('x')))
      : h('div.drop', { onclick: async () => { const [f] = await pickFiles(); if (!f) return; toast('Загрузка…'); file = await uploadFile(f); if (!title.value) title.value = f.name.replace(/\.\w+$/, ''); drawFile(); } }, icon('upload'), ' Выберите файл (PDF, DOCX, картинка… до 15 МБ)'));
    drawFile();
    const forAll = h('input', { type: 'checkbox', checked: m.for_all !== 0 });
    const pinned = h('input', { type: 'checkbox', checked: !!m.pinned });
    const notify = h('input', { type: 'checkbox', checked: !m.id });
    const access = new Set(m.access || []);
    const accBox = h('div.grid.grid-2', { style: { gap: '4px' } }, students.map(s => h('label.check.small', h('input', { type: 'checkbox', checked: access.has(s.id), onchange: e => e.target.checked ? access.add(s.id) : access.delete(s.id) }), s.name)));
    const accWrap = h('div', h('div.label.mb-sm', 'Кому доступно'), accBox);
    const toggle = () => accWrap.classList.toggle('hidden', forAll.checked);
    forAll.addEventListener('change', toggle); toggle();

    const body = h('div.form', field('Название', title), field('Тема', topic),
      kind === 'link' ? field('Ссылка', url) : null, kind === 'file' ? fileBox : null,
      kind === 'note' ? h('div.grid.grid-2', field('Текст (markdown)', content), h('div', h('div.label.mb-sm', 'Как увидит ученик'), prev)) : field('Описание', content),
      h('div.row', h('label.check', forAll, 'Доступно всем ученикам'), h('label.check', pinned, 'Закрепить сверху'), h('label.check', notify, 'Уведомить учеников')),
      accWrap);
    modal({ title: m.id ? 'Редактировать материал' : `Новый материал: ${KIND_NAME[kind].toLowerCase()}`, wide: true, body, foot: close => [h('button.btn', { onclick: close }, 'Отмена'),
      h('button.btn.btn-primary', { onclick: async () => {
        if (kind === 'file' && !file) return toast('Загрузите файл', 'error');
        if (kind === 'link' && !/^https?:\/\//.test(url.value)) return toast('Ссылка должна начинаться с http', 'error');
        const data = { title: title.value, topic: topic.value, kind, content: content.value, url: url.value, file_id: file?.id, for_all: forAll.checked, pinned: pinned.checked, access: [...access], notify: notify.checked };
        if (m.id) await api.put(`/api/t/materials/${m.id}`, data); else await api.post('/api/t/materials', data);
        toast('Сохранено', 'success'); close(); reload();
      } }, 'Сохранить')] });
  }
  draw();
}
