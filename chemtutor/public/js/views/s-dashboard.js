import { h, icon, badge, fmtRelDay, fmtTime, untilText, heatmap, scoreClass, pct, empty, T_STATUS, localISO, parseDate } from '../ui.js';
import { api } from '../api.js';

const TIPS = [
  'Молярный объём любого газа при н.у. — 22,4 л/моль. Но только для газов!',
  'В ОВР сначала найдите, кто меняет степень окисления, — остальное дело техники.',
  'Гидролиз идёт «по слабому»: соль сильного основания и слабой кислоты даёт щелочную среду.',
  'Массовая доля — это всегда «часть / целое». Проверьте, что «целое» — это масса раствора, а не воды.',
  'Амфотерные гидроксиды: Al(OH)3, Zn(OH)2, Be(OH)2, Cr(OH)3 — выучите их как стихи.',
  'Правило Марковникова: водород присоединяется к более гидрогенизированному атому углерода.',
  'Перед расчётом по уравнению проверьте коэффициенты — половина ошибок именно здесь.',
  'Качественная реакция на хлорид-ион — AgNO3, белый творожистый осадок AgCl.',
  'Катализатор не смещает равновесие — он лишь ускоряет его достижение.',
  'Десять минут карточек каждый день лучше, чем два часа перед контрольной.',
];

export default async function dashboard(el, _, app) {
  const d = await api.get('/api/s/dashboard');
  const name = app.user.name.split(' ')[0];
  const lv = d.level;
  const next = d.lessons[0];
  const nextSoon = next && (parseDate(next.start_at) - Date.now()) < 30 * 60000 && (parseDate(next.start_at) - Date.now()) > -next.duration * 60000;
  const got = d.achievements.filter(a => a.got);
  const tip = TIPS[Math.floor(Date.now() / 864e5) % TIPS.length];
  const lastExam = d.exams.at(-1);

  el.append(
    h('div.page-head', h('div', h('h1', `Привет, ${name}! 👋`), h('div.sub', d.homework.length ? `У тебя ${d.homework.length} ${d.homework.length === 1 ? 'задание' : d.homework.length < 5 ? 'задания' : 'заданий'} в работе` : 'Все задания сданы — так держать!'))),
    nextSoon ? h('div.notice.ok.mb.row.between', h('span', '🔔 ', h('b', `Занятие ${fmtTime(next.start_at)}`), next.topic ? ` — ${next.topic}` : ''), next.link ? h('a.btn.btn-primary.btn-sm', { href: next.link, target: '_blank' }, icon('video'), 'Подключиться') : null) : null,
    h('div.grid.grid-3.mb',
      h('div.card.hero-card.span-2', h('div.row.nowrap', { style: { gap: '18px' } },
        h('div.level-ring', { style: { '--p': Math.round(lv.progress * 100), background: `conic-gradient(#fff ${Math.round(lv.progress * 100)}%, rgba(255,255,255,.2) 0)` } },
          h('div', { style: { background: 'rgba(15,118,110,.9)', color: '#fff' } }, h('div', h('b', lv.level), h('div.tiny', 'уровень')))),
        h('div.grow',
          h('div', { style: { fontSize: '20px', fontWeight: 700 } }, lv.name),
          h('div.muted.small', lv.to ? `${lv.xp} / ${lv.to} XP до следующего уровня` : `${lv.xp} XP — максимальный уровень!`),
          h('div.progress.mt-sm', h('div', { style: { width: lv.progress * 100 + '%' } })),
          h('div.row.mt-sm.small', h('span', `🔥 Серия: ${d.streak} ${d.streak === 1 ? 'день' : d.streak < 5 && d.streak > 1 ? 'дня' : 'дней'}`), h('span', `🏆 Достижений: ${got.length}/${d.achievements.length}`))))),
      h('div.card.stack-sm', h('h3', 'Цель'),
        d.goal ? h('div', h('div', { style: { fontSize: '22px', fontWeight: 700 } }, d.goal, d.target_score ? ` · ${d.target_score}` : ''),
          lastExam ? h('div.muted.small', `Последний пробник: ${lastExam.score} из ${lastExam.max_score}`) : h('div.muted.small', 'Пробников пока не было')) : h('div.muted', 'Цель не указана'),
        lastExam && d.target_score && lastExam.max_score === 100 ? h('div.progress', h('div', { style: { width: Math.min(100, pct(lastExam.score, d.target_score)) + '%' } })) : null,
        h('div.muted.tiny.mt-sm', '💡 ', tip))),

    h('div.grid.grid-3',
      h('div.card.span-2',
        h('div.card-head', h('h3', 'Задания'), h('a', { href: '#/s/homework' }, 'Все →')),
        d.homework.length ? h('div.list', d.homework.slice(0, 6).map(t => h('a.list-item', { href: `#/s/homework/${t.id}` },
          h('div.stat-icon', { style: { width: '36px', height: '36px' } }, icon(t.kind === 'test' ? 'timer' : 'clipboard')),
          h('div.grow', h('div.bold.ellipsis', t.title), h('div.small', { class: t.due_at && t.due_at < localISO() ? 'text-danger' : 'muted' },
            t.due_at ? `Срок: ${fmtRelDay(t.due_at)} ${fmtTime(t.due_at)} · ${untilText(t.due_at)}` : 'Без срока', ` · ${t.qcount} вопр.`)),
          badge(...T_STATUS[t.status]))))
          : empty('🎉', 'Всё сдано!', 'Новые задания появятся здесь'),
        d.recent.length ? [h('h3.mt', 'Недавние результаты'), h('div.list', d.recent.map(t => h('a.list-item', { href: `#/s/homework/${t.id}` },
          h('div.grow.ellipsis', t.title), t.status === 'graded' ? badge(`${t.score} / ${t.max_score}`, scoreClass(pct(t.score, t.max_score))) : badge('на проверке', 'badge-primary'))))] : null),
      h('div.stack',
        h('div.card', h('div.card-head', h('h3', 'Расписание'), h('a', { href: '#/s/schedule' }, 'Все →')),
          d.lessons.length ? h('div.stack-sm', d.lessons.slice(0, 3).map(l => h('div.lesson',
            h('div.time', fmtTime(l.start_at), h('small', fmtRelDay(l.start_at))), h('div.grow.small', l.topic || 'Занятие по химии'),
            l.link ? h('a.btn.btn-sm', { href: l.link, target: '_blank', title: 'Ссылка на урок' }, icon('video')) : null)))
            : h('p.muted.small', 'Занятий пока не запланировано')),
        h('div.card.stack-sm', h('h3', 'Сегодня можно'),
          quick('#/s/cards', 'cards', 'Повторить карточки', d.cardsDue ? `${d.cardsDue} к повторению` : 'всё повторено'),
          quick('#/s/mistakes', 'repeat', 'Работа над ошибками', d.mistakes ? `${d.mistakes} ошибок ждут` : 'ошибок нет'),
          quick('#/s/practice', 'dumbbell', 'Тренажёр задач', 'случайные задачи по темам'),
          quick('#/s/focus', 'timer', 'Фокус-таймер', 'помодоро 25/5'),
          quick('#/tools', 'flask', 'Таблица и калькуляторы', 'Менделеев, растворимость…')),
        d.newMaterials.length ? h('div.card', h('h3', 'Новые материалы'), h('div.list', d.newMaterials.map(m => h('a.list-item', { href: `#/s/materials/${m.id}` }, icon('book'), h('span.grow', m.title), badge('новое', 'badge-primary'))))) : null)),
    h('div.card.mt', h('div.card-head', h('h3', 'Моя активность'), h('span.muted.small', 'каждый день с заданиями, карточками или тренажёром')), heatmap(d.activity)));
}

const quick = (href, ic, title, sub) => h('a.list-item', { href, style: { padding: '8px 0' } }, h('div.stat-icon', { style: { width: '34px', height: '34px' } }, icon(ic)),
  h('div.grow', h('div.bold.small', title), h('div.muted.tiny', sub)), icon('chevR'));
