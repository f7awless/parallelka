import { h, icon, badge, fmtDate, lineChart, radarChart, heatmap, skillDots, pct, scoreClass, donut, empty, avatar } from '../ui.js';
import { api } from '../api.js';

export default async function progress(el) {
  const p = await api.get('/api/s/progress');
  const bySec = {};
  for (const s of p.skills) (bySec[s.section] ||= []).push(s);
  const stat = Object.fromEntries(p.topicStats.map(t => [t.topic, pct(t.got, t.max)]));
  const att = p.attendance || {};
  const avg = p.results.length ? Math.round(p.results.reduce((a, r) => a + pct(r.score, r.max_score), 0) / p.results.length) : null;
  const weak = p.topicStats.filter(t => t.max > 0).map(t => ({ ...t, p: pct(t.got, t.max), title: p.skills.find(s => s.id === t.topic)?.title || t.topic })).sort((a, b) => a.p - b.p).slice(0, 5);
  el.append(
    h('div.page-head', h('div', h('h1', 'Мой прогресс'), h('div.sub', `Уровень ${p.level.level} «${p.level.name}» · ${p.level.xp} XP · 🔥 ${p.streak}`))),
    h('div.grid.grid-4.mb',
      st('Средний результат', avg != null ? `${avg}%` : '—'), st('Сдано работ', p.results.length),
      st('Занятий пройдено', att.done || 0), st('Серия дней', `🔥 ${p.streak}`)),
    h('div.grid.grid-2',
      h('div.card', h('h3', 'Результаты заданий'), p.results.length
        ? lineChart([{ name: 'ДЗ', color: 'var(--primary)', points: p.results.map(r => ({ x: fmtDate(r.submitted_at), y: pct(r.score, r.max_score), label: r.title, suffix: '%' })) }], { max: 100 })
        : empty('📈', 'Пока нет данных', 'Сдай первое задание — и здесь появится график')),
      h('div.card', h('h3', 'Пробные экзамены'), p.exams.length
        ? lineChart([{ name: 'Пробник', color: 'var(--warning)', points: p.exams.map(e => ({ x: fmtDate(e.date), y: e.score, label: e.title, suffix: ` / ${e.max_score}` })) }], { max: Math.max(...p.exams.map(e => e.max_score)) })
        : empty('🎯', 'Пробников пока не было', 'Результаты пробных экзаменов добавляет преподаватель'))),
    h('div.grid.grid-2.mt',
      h('div.card', h('h3', 'Карта знаний'), p.skills.some(s => s.level) ? radarChart(Object.entries(bySec).map(([sec, arr]) => ({ label: sec, value: arr.reduce((a, x) => a + x.level, 0) / arr.length })))
        : h('p.muted.small', 'Преподаватель отметит твой уровень по темам после первых занятий.'),
        weak.length ? [h('h3.mt', 'Что подтянуть'), h('div.stack-sm', weak.map(t => h('div', h('div.row.between.small', h('span', t.title), h('b', `${t.p}%`)),
          h('div.progress.sm', h('div', { style: { width: t.p + '%', background: t.p < 50 ? 'var(--danger)' : t.p < 75 ? 'var(--warning)' : 'var(--success)' } }))))),
          h('a.btn.btn-sm.mt', { href: '#/s/practice' }, icon('dumbbell'), 'Потренироваться')] : null),
      h('div.card', h('h3', 'Темы'), Object.entries(bySec).map(([sec, arr]) => h('div.mb', h('div.label.mb-sm', sec),
        arr.map(s => h('div.skill', h('span.small', s.title, stat[s.id] != null ? h('span.badge', { class: scoreClass(stat[s.id]), style: { marginLeft: '6px' } }, `${stat[s.id]}%`) : null), skillDots(s.level))))))),
    h('div.card.mt', h('div.card-head', h('h3', 'Активность'), h('span.muted.small', 'полгода')), heatmap(p.activity, 26)),
    h('div.grid.grid-2.mt',
      h('div.card', h('h3', `Достижения (${p.achievements.filter(a => a.got).length}/${p.achievements.length})`),
        h('div.grid.grid-2', { style: { gap: '8px' } }, p.achievements.map(a => h(`div.ach${a.got ? '' : '.locked'}`, h('div.i', a.icon), h('div', h('div.bold.small', a.title), h('div.muted.tiny', a.desc)))))),
      h('div.card', h('h3', 'Рейтинг учеников по XP'), h('p.muted.small', 'Соревнуйся с другими учениками своего преподавателя'),
        h('div.list', p.leaderboard.map((s, i) => h('div.list-item', { style: s.me ? { background: 'var(--primary-soft)', borderRadius: '8px', padding: '8px', margin: '2px -8px' } : {} },
          h('b', { style: { width: '24px' } }, ['🥇', '🥈', '🥉'][i] || i + 1), avatar(s, 'sm'), h('span.grow', s.name, s.me ? ' (ты)' : ''), h('span.muted.small', `ур. ${s.level}`), h('b', `${s.xp} XP`)))))));
}
const st = (label, value) => h('div.card.stat', h('div.label', label), h('div.value', value));
