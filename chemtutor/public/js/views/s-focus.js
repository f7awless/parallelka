import { h, icon, toast, pad } from '../ui.js';
import { api } from '../api.js';
import { store } from '../app.js';

const MODES = { focus: [25, 'Фокус', '🧠'], short: [5, 'Перерыв', '☕'], long: [15, 'Длинный перерыв', '🌿'] };

export default function focus(el, _, app) {
  let mode = 'focus', left = MODES.focus[0] * 60, running = false, timer = null, startedAt = 0;
  let sessions = Number(store.get('ct-pomo-' + new Date().toDateString()) || 0);
  const time = h('div.pomodoro');
  const label = h('div.center.muted');
  const goal = h('input.input', { placeholder: 'Над чем работаешь? Например: 10 задач на растворы', style: { textAlign: 'center' }, value: store.get('ct-pomo-goal') || '' });
  goal.addEventListener('input', () => store.set('ct-pomo-goal', goal.value));
  const startBtn = h('button.btn.btn-primary.btn-lg', { onclick: toggle });
  const done = h('div.center.small');
  const ring = h('div', { style: { width: '260px', height: '260px', borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto' } }, h('div', time, label));
  const seg = h('div.seg', Object.entries(MODES).map(([k, [m, t]]) => h('button', { class: k === mode ? 'active' : '', onclick: e => { setMode(k); seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target)); } }, `${t} ${m}`)));

  function draw() {
    time.textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
    label.textContent = `${MODES[mode][2]} ${MODES[mode][1]}`;
    const total = MODES[mode][0] * 60, p = (1 - left / total) * 100;
    ring.style.background = `conic-gradient(var(--primary) ${p}%, var(--surface-2) 0)`;
    ring.firstChild.style.cssText = 'width:232px;height:232px;border-radius:50%;background:var(--surface);display:grid;place-items:center;align-content:center';
    startBtn.replaceChildren(icon(running ? 'x' : 'clock'), running ? 'Пауза' : 'Старт');
    done.textContent = `Сегодня фокус-сессий: ${sessions} ${'🍅'.repeat(Math.min(sessions, 12))}`;
    document.title = running ? `${time.textContent} · ${MODES[mode][1]}` : 'Фокус-таймер · ХимКабинет';
  }
  function setMode(k) { mode = k; left = MODES[k][0] * 60; stop(); draw(); }
  function stop() { running = false; clearInterval(timer); }
  function toggle() {
    if (running) { stop(); draw(); return; }
    running = true; startedAt = Date.now();
    const endAt = Date.now() + left * 1000;
    timer = setInterval(() => {
      left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      if (left === 0) finish();
      draw();
    }, 250);
    try { if (Notification?.permission === 'default') Notification.requestPermission(); } catch { }
    draw();
  }
  function finish() {
    stop();
    beep();
    if (mode === 'focus') {
      sessions++; store.set('ct-pomo-' + new Date().toDateString(), sessions);
      api.post('/api/s/focus', { minutes: MODES.focus[0] }, { quiet: true }).then(() => app.refresh());
      notify('Фокус-сессия завершена! +5 XP. Отдохни 5 минут ☕');
      setMode(sessions % 4 === 0 ? 'long' : 'short');
    } else { notify('Перерыв окончен — снова за химию! 🧪'); setMode('focus'); }
    seg.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', Object.keys(MODES)[i] === mode));
  }
  function notify(text) {
    toast(text, 'success');
    try { if (Notification?.permission === 'granted' && document.hidden) new Notification('ХимКабинет', { body: text, icon: '/icon.svg' }); } catch { }
  }
  el.append(h('div.page-head', h('div', h('h1', 'Фокус-таймер'), h('div.sub', 'Метод помодоро: 25 минут работы без отвлечений, 5 минут отдыха. За каждую сессию +5 XP'))),
    h('div.card.stack', { style: { maxWidth: '560px', margin: '0 auto', padding: '28px', alignItems: 'center' } },
      seg, ring, goal, h('div.row', { style: { justifyContent: 'center' } }, startBtn, h('button.btn.btn-lg', { onclick: () => setMode(mode) }, icon('refresh'), 'Сброс')), done,
      h('div.muted.tiny.center', 'Совет: убери телефон в другую комнату. Не выходи со страницы — таймер работает, пока она открыта.')));
  draw();
  return () => { stop(); document.title = 'ХимКабинет'; };
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.2, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
  } catch { }
}
