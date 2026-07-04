import { useState, useEffect, useRef } from "react";

const STORAGE_KEY = "tutor-parallel-v7";
const SLOT_HEIGHT = 30;
const START_HOUR = 8;
const END_HOUR = 22;
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * 2;
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DURATIONS = [1, 1.5, 2];

const PALETTE = [
  { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a", accent: "#2563eb", light: "#eff6ff" },
  { bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95", accent: "#7c3aed", light: "#f5f3ff" },
  { bg: "#d1fae5", border: "#6ee7b7", text: "#064e3b", accent: "#059669", light: "#ecfdf5" },
  { bg: "#fef3c7", border: "#fcd34d", text: "#78350f", accent: "#d97706", light: "#fffbeb" },
  { bg: "#fee2e2", border: "#fca5a5", text: "#7f1d1d", accent: "#dc2626", light: "#fef2f2" },
  { bg: "#cffafe", border: "#67e8f9", text: "#164e63", accent: "#0891b2", light: "#ecfeff" },
  { bg: "#ecfccb", border: "#bef264", text: "#365314", accent: "#65a30d", light: "#f7fee7" },
];

const DEFAULT_STUDENTS = [
  { id: 1, name: "Алина К.", rate: 3000, active: true, subject: "ЕГЭ химия", weeklyHours: 2, sessionDuration: 1, lessonsPaid: 4, paymentMode: "subscription", lessonsPerBundle: 4, notes: "", parentContact: "" },
  { id: 2, name: "Максим Д.", rate: 3000, active: true, subject: "ОГЭ химия", weeklyHours: 3, sessionDuration: 1.5, lessonsPaid: 2, paymentMode: "subscription", lessonsPerBundle: 4, notes: "", parentContact: "" },
];

const PAYMENT_MODE_LABELS = { subscription: "Абонемент", single: "Разовая" };

const LESSON_QUICK_ADD = [1, 2, 4, 8];

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getPaymentStatus(s) {
  if (s.paymentMode === "single") return null;
  const n = s.lessonsPaid ?? 0;
  if (n <= 0) return "overdue";
  if (n === 1) return "soon";
  return "ok";
}

const STATUS_COLORS = {
  overdue: { bg: "#fee2e2", border: "#fca5a5", text: "#7f1d1d", dot: "#dc2626" },
  soon: { bg: "#fef3c7", border: "#fcd34d", text: "#78350f", dot: "#d97706" },
  ok: { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46", dot: "#16a34a" },
};

function slotToTime(slot) {
  const mins = START_HOUR * 60 + slot * 30;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
}

function timeToSlot(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return ((h * 60 + m) - START_HOUR * 60) / 30;
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function weekdayFromIso(iso) {
  const day = new Date(iso + "T00:00:00").getDay();
  return day === 0 ? 6 : day - 1;
}

function formatShortDate(date) {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

function eventsVisibleInWeek(events, weekStart) {
  return events
    .filter(e => {
      if (e.recurring === false) {
        if (!e.date) return false;
        const d = new Date(e.date + "T00:00:00");
        const diffDays = Math.floor((d - weekStart) / 86400000);
        return diffDays >= 0 && diffDays < 7;
      }
      return true;
    })
    .map(e => (e.recurring === false ? { ...e, day: weekdayFromIso(e.date) } : e));
}

function layoutSessions(daySessions) {
  if (!daySessions.length) return [];
  const sorted = [...daySessions].sort((a, b) => a.startSlot - b.startSlot);
  const result = sorted.map(s => ({ ...s, col: 0, totalCols: 1 }));
  for (let i = 0; i < result.length; i++) {
    const si = result[i];
    const siEnd = si.startSlot + si.duration * 2;
    const usedCols = new Set();
    for (let j = 0; j < i; j++) {
      const sj = result[j];
      if (si.startSlot < sj.startSlot + sj.duration * 2 && siEnd > sj.startSlot) usedCols.add(sj.col);
    }
    let col = 0;
    while (usedCols.has(col)) col++;
    result[i].col = col;
  }
  for (let i = 0; i < result.length; i++) {
    const si = result[i];
    const siEnd = si.startSlot + si.duration * 2;
    let maxCol = si.col;
    for (let j = 0; j < result.length; j++) {
      if (i === j) continue;
      const sj = result[j];
      if (si.startSlot < sj.startSlot + sj.duration * 2 && siEnd > sj.startSlot) maxCol = Math.max(maxCol, sj.col);
    }
    result[i].totalCols = maxCol + 1;
  }
  return result;
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: var(--bg);
    --surface: var(--surface);
    --surface2: var(--surface2);
    --border: var(--border);
    --border2: var(--border2);
    --text: var(--text);
    --text-mid: var(--text-mid);
    --text-muted: var(--text-muted);
    --text-dim: var(--text-dim);
    --text-faint: var(--text-faint);
  }
  [data-theme="dark"] {
    --bg: var(--text);
    --surface: #292524;
    --surface2: #211e1b;
    --border: #44403c;
    --border2: var(--text-mid);
    --text: var(--surface);
    --text-mid: #d6d0ca;
    --text-muted: var(--text-dim);
    --text-dim: var(--text-muted);
    --text-faint: var(--text-mid);
  }

  body { background: var(--bg); }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }

  .tab-btn {
    background: none; border: none; color: var(--text-dim);
    font-family: 'Manrope', sans-serif; font-size: 13px; font-weight: 500;
    padding: 10px 18px; cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
  }
  .tab-btn.active { color: var(--text); border-bottom-color: #2563eb; }
  .tab-btn:hover:not(.active) { color: var(--text-mid); }

  .dur-pill {
    background: none; border: 1px solid var(--border2); color: var(--text-dim);
    border-radius: 4px; padding: 2px 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 11px; cursor: pointer;
    transition: all 0.1s; white-space: nowrap; line-height: 1.6;
  }
  .dur-pill.sel { background: #eff6ff; border-color: #93c5fd; color: #2563eb; }
  .dur-pill:hover:not(.sel) { border-color: var(--text-faint); color: var(--text-muted); }

  .toggle-btn {
    width: 34px; height: 19px; border-radius: 10px;
    border: none; cursor: pointer; position: relative;
    transition: background 0.2s; flex-shrink: 0;
  }
  .toggle-btn::after {
    content: ''; position: absolute;
    width: 13px; height: 13px; border-radius: 50%;
    background: white; top: 3px; transition: left 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
  }
  .toggle-btn.on { background: #16a34a; }
  .toggle-btn.on::after { left: 18px; }
  .toggle-btn.off { background: var(--border2); }
  .toggle-btn.off::after { left: 3px; }

  .edit-inp {
    background: var(--surface); border: 1px solid var(--border2); color: var(--text);
    border-radius: 5px; padding: 5px 8px; font-family: 'Manrope', sans-serif;
    font-size: 13px; outline: none; transition: border-color 0.15s;
  }
  .edit-inp:focus { border-color: #93c5fd; box-shadow: 0 0 0 3px #dbeafe66; }

  .slot-cell {
    position: absolute; left: 0; right: 0;
    cursor: crosshair;
    transition: background 0.08s;
  }
  .slot-cell:hover { background: rgba(37,99,235,0.04) !important; }
  .slot-cell.drag-over { background: rgba(37,99,235,0.08) !important; }

  .student-chip {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px 5px 8px;
    border-radius: 8px; border: 1.5px solid transparent;
    cursor: grab; user-select: none;
    transition: box-shadow 0.12s, transform 0.12s;
  }
  .student-chip:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); transform: translateY(-1px); }
  .student-chip:active { cursor: grabbing; }
  .student-chip.dragging-active { opacity: 0.45; }

  .session-block {
    position: absolute; border-radius: 4px; cursor: pointer;
    overflow: hidden; padding: 4px 6px;
    transition: box-shadow 0.12s;
    border-left: 3px solid transparent;
  }
  .session-block:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.15); z-index: 5 !important; }

  .ghost-btn {
    background: none; border: 1.5px dashed var(--border2); color: var(--text-dim);
    border-radius: 8px; padding: 11px; font-family: 'Manrope', sans-serif;
    font-size: 13px; cursor: pointer; width: 100%;
    transition: border-color 0.15s, color 0.15s;
  }
  .ghost-btn:hover { border-color: var(--text-dim); color: var(--text-mid); }

  .save-btn {
    background: #ecfdf5; border: 1px solid #6ee7b7; color: #065f46;
    border-radius: 6px; padding: 7px 16px; font-family: 'Manrope', sans-serif;
    font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.12s;
  }
  .save-btn:hover { background: #d1fae5; }

  .cancel-btn-sm {
    background: none; border: 1px solid var(--border2); color: var(--text-dim);
    border-radius: 6px; padding: 7px 12px; font-family: 'Manrope', sans-serif;
    font-size: 12px; cursor: pointer; transition: color 0.12s;
  }
  .cancel-btn-sm:hover { color: var(--text-mid); }

  .iBtn {
    background: none; border: none; color: var(--text-faint); cursor: pointer;
    padding: 4px 6px; border-radius: 5px;
    transition: color 0.12s, background 0.12s; font-size: 13px; line-height: 1;
  }
  .iBtn:hover { color: var(--text-mid); background: var(--bg); }
  .iBtn.del:hover { color: #dc2626; background: #fee2e2; }

  .overlay {
    position: fixed; inset: 0; background: rgba(28,25,23,0.4);
    display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px;
    backdrop-filter: blur(2px);
  }
  [data-theme="dark"] .overlay { background: rgba(0,0,0,0.65); }
  .popup-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 20px; width: 100%; max-width: 320px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.2);
  }
  .del-btn {
    width: 100%; background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626;
    border-radius: 7px; padding: 10px; font-family: 'Manrope', sans-serif;
    font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.12s;
  }
  .del-btn:hover { background: #fee2e2; }

  .hint-bar {
    font-family: 'Manrope', sans-serif; font-size: 11px; color: var(--text-faint);
    padding: 7px 16px; border-bottom: 1px solid var(--border);
    background: var(--surface);
    display: flex; align-items: center; gap: 6px;
  }

  @keyframes pulse-move {
    0%, 100% { box-shadow: 0 0 0 2px #2563eb, 0 0 8px rgba(37,99,235,0.2); }
    50% { box-shadow: 0 0 0 3px #2563eb, 0 0 16px rgba(37,99,235,0.4); }
  }
`;

export default function App() {
  const [students, setStudents] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (d?.students) return d.students; } catch {}
    return DEFAULT_STUDENTS;
  });
  const [sessions, setSessions] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (d?.sessions) return d.sessions; } catch {}
    return [];
  });
  const [nextId, setNextId] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY)); return d?.nextId || 3; } catch {}
    return 3;
  });
  const [tab, setTab] = useState("schedule");
  const [popup, setPopup] = useState(null);
  const [chipDurations, setChipDurations] = useState({});
  const [ptrDrag, setPtrDrag] = useState(null); // null | { mode, id?, studentId?, duration, hoverDay, hoverSlot, active, startX, startY, clickSession? }
  const [calendarMode, setCalendarMode] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY)); return d?.calendarMode || "tutor"; } catch {}
    return "tutor";
  });
  const [personalEvents, setPersonalEvents] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (d?.personalEvents) return d.personalEvents; } catch {}
    return [];
  });
  const [examDates, setExamDates] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (d?.examDates) return d.examDates; } catch {}
    return { oge: "", ege: "" };
  });
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(STORAGE_KEY)); return d?.darkMode || false; } catch {}
    return false;
  });
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [calendarZoom, setCalendarZoom] = useState("week"); // "day" | "week" | "month"
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);

  const goPrevWeek = () => {
    if (calendarZoom === "day") setSelectedDayIdx(d => d > 0 ? d - 1 : (setWeekStart(w => addDays(w, -7)), 6));
    else if (calendarZoom === "month") setWeekStart(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return getMonday(n); });
    else setWeekStart(d => addDays(d, -7));
  };
  const goNextWeek = () => {
    if (calendarZoom === "day") setSelectedDayIdx(d => d < 6 ? d + 1 : (setWeekStart(w => addDays(w, 7)), 0));
    else if (calendarZoom === "month") setWeekStart(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return getMonday(n); });
    else setWeekStart(d => addDays(d, 7));
  };
  const goToday = () => { setWeekStart(getMonday(new Date())); setSelectedDayIdx(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1); };

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ students, sessions, nextId, calendarMode, personalEvents, examDates, darkMode })); } catch {}
  }, [students, sessions, nextId, calendarMode, personalEvents, examDates]);

  const getColor = (id) => {
    const stu = students.find(s => s.id === id);
    if (stu && stu.colorIdx != null) return PALETTE[stu.colorIdx % PALETTE.length];
    const idx = students.findIndex(s => s.id === id);
    return PALETTE[Math.max(0, idx) % PALETTE.length];
  };

  const activeStudents = students.filter(s => s.active && !s.archived);
  const getTarget = (s) => Math.ceil(s.weeklyHours / s.sessionDuration);
  const getPlaced = (id) => sessions.filter(s => s.studentId === id).length;

  const getChipDuration = (s) => chipDurations[s.id] ?? s.sessionDuration;

  const updateSession = (id, ch) => setSessions(prev => prev.map(s => s.id === id ? { ...s, ...ch } : s));

  const removeSession = (id) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    setPopup(null);
  };

  const toggleActive = (id) => setStudents(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  const deleteStudent = (id) => { setStudents(prev => prev.filter(s => s.id !== id)); setSessions(prev => prev.filter(s => s.studentId !== id)); };
  const archiveStudent = (id) => { setStudents(prev => prev.map(s => s.id === id ? { ...s, archived: true, active: false } : s)); setSessions(prev => prev.filter(s => s.studentId !== id)); };
  const unarchiveStudent = (id) => { setStudents(prev => prev.map(s => s.id === id ? { ...s, archived: false } : s)); };
  const getStudentLTV = (s) => {
    const lessonsDone = (s.history || []).filter(h => h.type === "lesson").length;
    return lessonsDone * s.rate * s.sessionDuration;
  };
  const updateStudent = (id, ch) => setStudents(prev => prev.map(s => s.id === id ? { ...s, ...ch } : s));
  const addStudent = (data) => { setStudents(prev => [...prev, { id: nextId, ...data, active: true }]); setNextId(n => n + 1); };
  const clearSchedule = () => { if (window.confirm("Очистить всё расписание?")) setSessions([]); };

  const addLessons = (id, n, date) => {
    const d = date || new Date().toISOString().slice(0, 10);
    setStudents(prev => prev.map(s => s.id === id ? {
      ...s,
      lessonsPaid: (s.lessonsPaid ?? 0) + n,
      lastPaymentDate: d,
      lastPaymentAmount: n,
      history: [...(s.history || []), { id: Date.now() + Math.random(), type: "payment", date: d, amount: n }],
    } : s));
  };

  const markLessonDone = (id, date, note) => {
    const d = date || new Date().toISOString().slice(0, 10);
    setStudents(prev => prev.map(s => s.id === id ? {
      ...s,
      lessonsPaid: (s.lessonsPaid ?? 0) - 1,
      lastLessonDate: d,
      lastLessonNote: note || "",
      history: [...(s.history || []), { id: Date.now() + Math.random(), type: "lesson", date: d, note: note || "" }],
    } : s));
  };

  const deleteHistoryEvent = (id, eventId) => {
    setStudents(prev => prev.map(s => {
      if (s.id !== id) return s;
      const ev = (s.history || []).find(h => h.id === eventId);
      if (!ev) return s;
      const delta = ev.type === "payment" ? -ev.amount : 1;
      return { ...s, lessonsPaid: (s.lessonsPaid ?? 0) + delta, history: s.history.filter(h => h.id !== eventId) };
    }));
  };

  const addPersonalEvent = (ev) => setPersonalEvents(prev => [...prev, { id: Date.now(), ...ev }]);
  const updatePersonalEvent = (id, ch) => setPersonalEvents(prev => prev.map(e => e.id === id ? { ...e, ...ch } : e));
  const deletePersonalEvent = (id) => setPersonalEvents(prev => prev.filter(e => e.id !== id));
  const setExamDate = (key, value) => setExamDates(prev => ({ ...prev, [key]: value }));

  const visibleDays = calendarZoom === "day" ? [selectedDayIdx] : [0, 1, 2, 3, 4, 5, 6];

  const dayLayouts = (() => {
    const visible = eventsVisibleInWeek(sessions, weekStart);
    return DAYS.map((_, d) => layoutSessions(visible.filter(s => s.day === d)));
  })();
  const personalDayLayouts = (() => {
    const visible = eventsVisibleInWeek(personalEvents, weekStart);
    return DAYS.map((_, d) => layoutSessions(visible.filter(e => e.day === d)));
  })();

  const daysUntil = (iso) => {
    if (!iso) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(iso); target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  };

  return (
    <div data-theme={darkMode ? "dark" : "light"} style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Manrope', sans-serif" }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "14px 20px 0", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)" }}>Параллелка</span>
          <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>{calendarMode === "tutor" ? "репетиторство" : "личное"}</span>

          {/* Mode switch */}
          <div style={{ display: "flex", gap: 2, marginLeft: "auto", background: "var(--bg)", borderRadius: 8, padding: 2 }}>
            <button onClick={() => setCalendarMode("tutor")} style={{ fontSize: 11, fontFamily: "'Manrope', sans-serif", fontWeight: 600, padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", background: calendarMode === "tutor" ? "var(--surface)" : "transparent", color: calendarMode === "tutor" ? "var(--text)" : "var(--text-dim)", boxShadow: calendarMode === "tutor" ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>
              📚 Репетиторство
            </button>
            <button onClick={() => setCalendarMode("personal")} style={{ fontSize: 11, fontFamily: "'Manrope', sans-serif", fontWeight: 600, padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", background: calendarMode === "personal" ? "var(--surface)" : "transparent", color: calendarMode === "personal" ? "var(--text)" : "var(--text-dim)", boxShadow: calendarMode === "personal" ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>
              🗓 Личное
            </button>
          </div>

          <button onClick={() => setShowSettings(true)} title="Настройки: даты экзаменов" style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: "var(--text-dim)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ⚙
          </button>
          <button onClick={() => setDarkMode(d => !d)} title={darkMode ? "Светлая тема" : "Тёмная тема"} style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: "var(--text-dim)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {darkMode ? "☀" : "🌙"}
          </button>
        </div>

        {/* Exam countdown */}
        {(examDates.oge || examDates.ege) && (
          <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            {examDates.oge && (() => { const n = daysUntil(examDates.oge); return (
              <span style={{ fontSize: 11, color: n < 0 ? "var(--text-dim)" : "#78350f", background: n < 0 ? "var(--bg)" : "#fef3c7", border: `1px solid ${n < 0 ? "var(--border2)" : "#fcd34d"}`, borderRadius: 6, padding: "3px 9px", fontFamily: "'JetBrains Mono', monospace" }}>
                ОГЭ {formatDate(examDates.oge)} {n >= 0 ? `· через ${n} дн.` : "· прошёл"}
              </span>
            ); })()}
            {examDates.ege && (() => { const n = daysUntil(examDates.ege); return (
              <span style={{ fontSize: 11, color: n < 0 ? "var(--text-dim)" : "#7f1d1d", background: n < 0 ? "var(--bg)" : "#fee2e2", border: `1px solid ${n < 0 ? "var(--border2)" : "#fca5a5"}`, borderRadius: 6, padding: "3px 9px", fontFamily: "'JetBrains Mono', monospace" }}>
                ЕГЭ {formatDate(examDates.ege)} {n >= 0 ? `· через ${n} дн.` : "· прошёл"}
              </span>
            ); })()}
          </div>
        )}

        {calendarMode === "tutor" && (
          <div style={{ display: "flex" }}>
            <button className={`tab-btn ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>Расписание</button>
            <button className={`tab-btn ${tab === "students" ? "active" : ""}`} onClick={() => setTab("students")}>Ученики ({students.length})</button>
          </div>
        )}
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="overlay" onClick={() => setShowSettings(false)}>
          <div className="popup-card" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Настройки</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Дата ОГЭ</div>
              <input className="edit-inp" type="date" style={{ width: "100%" }} value={examDates.oge} onChange={e => setExamDate("oge", e.target.value)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Дата ЕГЭ</div>
              <input className="edit-inp" type="date" style={{ width: "100%" }} value={examDates.ege} onChange={e => setExamDate("ege", e.target.value)} />
            </div>
            <button className="save-btn" style={{ width: "100%" }} onClick={() => setShowSettings(false)}>Готово</button>
          </div>
        </div>
      )}

      {/* Payment alerts banner */}
      {(() => {
        const alerts = students
          .filter(s => s.active)
          .map(s => ({ s, status: getPaymentStatus(s) }))
          .filter(x => x.status === "overdue" || x.status === "soon")
          .sort((a, b) => (a.status === "overdue" ? 0 : 1) - (b.status === "overdue" ? 0 : 1));
        if (!alerts.length) return null;
        return (
          <div style={{ background: "#fffaf0", borderBottom: "1px solid #fed7aa", padding: "9px 16px", display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>💰</span>
            {alerts.map(({ s, status }) => {
              const sc = STATUS_COLORS[status];
              const n = s.lessonsPaid ?? 0;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 20, padding: "3px 6px 3px 10px" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: sc.text }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: sc.text, opacity: 0.85 }}>
                    {n < 0 ? `должен ${-n} занятий` : n === 0 ? "оплаченные занятия закончились" : "осталось последнее занятие"}
                  </span>
                  <PayInput onAdd={(n, date) => addLessons(s.id, n, date)} />
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Navigation + zoom */}
      {(calendarMode === "personal" || (calendarMode === "tutor" && tab === "schedule")) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 16px", background: "var(--surface)", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <button onClick={goPrevWeek} style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 6, width: 26, height: 26, cursor: "pointer", color: "var(--text-mid)", fontSize: 13 }}>‹</button>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace", minWidth: 130, textAlign: "center" }}>
            {calendarZoom === "day" ? formatShortDate(addDays(weekStart, selectedDayIdx)) + `, ${DAYS[selectedDayIdx]}` :
             calendarZoom === "month" ? `${MONTHS_SHORT[weekStart.getMonth()]} ${weekStart.getFullYear()}` :
             `${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`}
          </span>
          <button onClick={goNextWeek} style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 6, width: 26, height: 26, cursor: "pointer", color: "var(--text-mid)", fontSize: 13 }}>›</button>
          <button onClick={goToday} style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "var(--text-mid)", fontSize: 11, fontFamily: "'Manrope', sans-serif" }}>Сегодня</button>
          <div style={{ display: "flex", gap: 2, background: "var(--bg)", borderRadius: 6, padding: 2, marginLeft: 8 }}>
            {["day", "week", "month"].map(z => (
              <button key={z} onClick={() => setCalendarZoom(z)} style={{ fontSize: 10, fontFamily: "'Manrope', sans-serif", fontWeight: 600, padding: "4px 9px", borderRadius: 4, border: "none", cursor: "pointer", background: calendarZoom === z ? "var(--surface)" : "transparent", color: calendarZoom === z ? "var(--text)" : "var(--text-dim)", boxShadow: calendarZoom === z ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>
                {z === "day" ? "День" : z === "week" ? "Неделя" : "Месяц"}
              </button>
            ))}
          </div>
        </div>
      )}

      {calendarMode === "tutor" && tab === "schedule" && calendarZoom === "month" && (
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {DAYS.map(d => <div key={d} style={{ fontSize: 10, fontWeight: 600, color: "var(--text-dim)", textAlign: "center", padding: "4px 0" }}>{d}</div>)}
            {(() => {
              const first = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
              const monthStart = getMonday(first);
              const cells = [];
              for (let i = 0; i < 42; i++) {
                const d = addDays(monthStart, i);
                const inMonth = d.getMonth() === weekStart.getMonth();
                const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
                const dayEvents = eventsVisibleInWeek(sessions, getMonday(d)).filter(e => e.day === dayIdx);
                const pEvents = eventsVisibleInWeek(personalEvents, getMonday(d)).filter(e => e.day === dayIdx);
                cells.push(
                  <div key={i} onClick={() => { setSelectedDayIdx(dayIdx); setWeekStart(getMonday(d)); setCalendarZoom("day"); }}
                    style={{ minHeight: 60, background: inMonth ? "var(--surface)" : "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 5px", cursor: "pointer", opacity: inMonth ? 1 : 0.5 }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-mid)", marginBottom: 3 }}>{d.getDate()}</div>
                    {dayEvents.slice(0, 3).map(s => {
                      const st = students.find(x => x.id === s.studentId);
                      const c = getColor(s.studentId);
                      return <div key={s.id} style={{ fontSize: 8, color: c.text, background: c.bg, borderRadius: 3, padding: "1px 4px", marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st?.name?.split(" ")[0]} {slotToTime(s.startSlot)}</div>;
                    })}
                    {pEvents.slice(0, 2).map(e => (
                      <div key={e.id} style={{ fontSize: 8, color: PALETTE[e.colorIdx ?? 0].accent, background: PALETTE[e.colorIdx ?? 0].bg + "88", borderRadius: 3, padding: "1px 4px", marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }}>🗓 {e.title}</div>
                    ))}
                    {dayEvents.length + pEvents.length > 5 && <div style={{ fontSize: 8, color: "var(--text-dim)" }}>+{dayEvents.length + pEvents.length - 5}</div>}
                  </div>
                );
              }
              return cells;
            })()}
          </div>
        </div>
      )}

      {calendarMode === "tutor" && tab === "schedule" && calendarZoom !== "month" && (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 126px)" }}>

          {/* Chips legend with drag hint */}
          <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "10px 14px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
            {activeStudents.map(s => {
              const c = getColor(s.id);
              const placed = getPlaced(s.id);
              const target = getTarget(s);
              const done = placed >= target;
              const dur = getChipDuration(s);
              const payStatus = getPaymentStatus(s);
              const sc = STATUS_COLORS[payStatus] || { bg: "var(--bg)", border: "var(--border2)", text: "var(--text-dim)", dot: "var(--text-faint)" };
              const lessonsLeft = s.lessonsPaid ?? 0;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    className={`student-chip ${ptrDrag?.mode === "new" && ptrDrag?.studentId === s.id ? "dragging-active" : ""}`}
                    style={{ background: c.bg, borderColor: done ? c.border : "var(--border2)", touchAction: "none" }}
                    onPointerDown={e => {
                      e.preventDefault();
                      setPtrDrag({ mode: "new", studentId: s.id, duration: dur, hoverDay: null, hoverSlot: null, active: false, startX: e.clientX, startY: e.clientY });
                    }}
                  >
                    {payStatus && <span title={payStatus === "overdue" ? "Нужно оплатить" : payStatus === "soon" ? "Осталось последнее занятие" : "Оплачено"} style={{ width: 7, height: 7, borderRadius: "50%", background: sc.dot, display: "inline-block", flexShrink: 0, boxShadow: "0 0 0 2px white" }} />}
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.accent, display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{s.name}</span>
                    <span style={{ fontSize: 10, color: done ? c.accent : "var(--text-faint)", background: done ? c.light : "var(--surface2)", padding: "0 5px", borderRadius: 3, fontFamily: "'JetBrains Mono', monospace" }}>
                      {placed}/{target}
                    </span>
                    {s.paymentMode === "single" ? (
                      <span title="Оплата разово за занятие" style={{ fontSize: 10, color: "var(--text-dim)", background: "var(--bg)", padding: "0 5px", borderRadius: 3, fontFamily: "'JetBrains Mono', monospace" }}>разово</span>
                    ) : (
                      <span title={`Осталось оплаченных занятий${s.lastPaymentDate ? ` · последняя оплата ${formatDate(s.lastPaymentDate)} (+${s.lastPaymentAmount})` : ""}${s.lastLessonDate ? ` · последнее занятие ${formatDate(s.lastLessonDate)}` : ""}`} style={{ fontSize: 10, color: sc.text, background: sc.bg, padding: "0 5px", borderRadius: 3, fontFamily: "'JetBrains Mono', monospace", border: `1px solid ${sc.border}` }}>
                        💰{lessonsLeft}
                      </span>
                    )}
                    <button
                      title="Отметить занятие как прошедшее (−1)"
                      onClick={e => {
                        e.stopPropagation();
                        const today = new Date().toISOString().slice(0, 10);
                        const inputDate = window.prompt("Дата занятия (ГГГГ-ММ-ДД):", today);
                        if (inputDate === null) return;
                        const inputNote = window.prompt("Что прошли? (необязательно)", "");
                        markLessonDone(s.id, inputDate.trim() || today, inputNote ? inputNote.trim() : "");
                      }}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ background: "var(--surface)", border: "1px solid var(--border2)", color: "var(--text-mid)", borderRadius: 4, width: 18, height: 18, fontSize: 11, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "inherit" }}
                    >✓</button>
                    {/* Duration pills inside chip */}
                    <div style={{ display: "flex", gap: 3, marginLeft: 2 }}>
                      {DURATIONS.map(d => (
                        <button key={d} className={`dur-pill ${dur === d ? "sel" : ""}`}
                          onClick={e => { e.stopPropagation(); setChipDurations(p => ({ ...p, [s.id]: d })); }}
                          onMouseDown={e => e.stopPropagation()}
                        >{d}ч</button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {activeStudents.length === 0 && <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Нет активных учеников</span>}
            <button onClick={clearSchedule} style={{ marginLeft: "auto", background: "none", border: "1px solid var(--border2)", color: "var(--text-faint)", borderRadius: 5, padding: "4px 10px", fontFamily: "inherit", fontSize: 11, cursor: "pointer" }}>
              Очистить
            </button>
          </div>

          {/* Hint */}
          <div className="hint-bar">
            <span>☝</span>
            <span>{ptrDrag?.active ? "Отпусти, чтобы поставить занятие" : "Зажми блок и перетащи · Перетащи ученика из чипов сверху"}</span>
            {ptrDrag?.active && <button onClick={() => setPtrDrag(null)} style={{ marginLeft: "auto", background: "none", border: "1px solid #93c5fd", color: "#2563eb", borderRadius: 5, padding: "2px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Отмена</button>}
          </div>

          {/* Calendar grid */}
          <div style={{ flex: 1, overflow: "auto", background: "var(--surface2)" }}
            onPointerMove={e => {
              if (!ptrDrag) return;
              if (!ptrDrag.active) {
                const dx = e.clientX - ptrDrag.startX;
                const dy = e.clientY - ptrDrag.startY;
                if (dx * dx + dy * dy < 25) return; // threshold 5px
                setPtrDrag(d => ({ ...d, active: true }));
              }
              const el = document.elementFromPoint(e.clientX, e.clientY);
              if (el?.dataset?.day != null && el?.dataset?.slot != null) {
                setPtrDrag(d => ({ ...d, hoverDay: +el.dataset.day, hoverSlot: +el.dataset.slot }));
              }
            }}
            onPointerUp={() => {
              if (!ptrDrag) return;
              if (!ptrDrag.active) {
                // Was a click, not a drag
                if (ptrDrag.clickSession) {
                  setPopup({ type: "session", session: ptrDrag.clickSession });
                }
                setPtrDrag(null);
                return;
              }
              if (ptrDrag.hoverDay != null && ptrDrag.hoverSlot != null) {
                const dur = ptrDrag.duration;
                if (ptrDrag.hoverSlot + dur * 2 <= TOTAL_SLOTS) {
                  if (ptrDrag.mode === "new") {
                    setSessions(prev => [...prev, { id: Date.now(), studentId: ptrDrag.studentId, day: ptrDrag.hoverDay, startSlot: ptrDrag.hoverSlot, duration: dur, recurring: true }]);
                  } else {
                    setSessions(prev => prev.map(s => s.id === ptrDrag.id ? { ...s, day: ptrDrag.hoverDay, startSlot: ptrDrag.hoverSlot } : s));
                  }
                }
              }
              setPtrDrag(null);
            }}
          >
            <div style={{ display: "flex", minWidth: 500 }}>
              {/* Time labels */}
              <div style={{ width: 44, flexShrink: 0, borderRight: "1px solid var(--border)", paddingTop: 28, background: "var(--surface)" }}>
                {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                  <div key={i} style={{ height: SLOT_HEIGHT, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 7, paddingTop: 2 }}>
                    {i % 2 === 0 && <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{slotToTime(i)}</span>}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {visibleDays.map(dayIdx => { const dayLabel = DAYS[dayIdx]; return (
                <div key={dayIdx} style={{ flex: 1, minWidth: 0, borderRight: "1px solid var(--border)" }}>
                  <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--text-dim)", borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 2, letterSpacing: "0.05em" }}>
                    {dayLabel} <span style={{ fontWeight: 400, color: "var(--text-faint)", fontSize: 10 }}>{addDays(weekStart, dayIdx).getDate()}</span>
                  </div>

                  <div style={{ position: "relative", height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                    {/* Slot cells with data attributes for pointer detection */}
                    {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => {
                      const isHover = ptrDrag?.hoverDay === dayIdx && ptrDrag?.hoverSlot === slotIdx;
                      const hoverC = ptrDrag?.studentId ? getColor(ptrDrag.studentId) : null;
                      return (
                        <div
                          key={slotIdx}
                          data-day={dayIdx}
                          data-slot={slotIdx}
                          className="slot-cell"
                          style={{
                            top: slotIdx * SLOT_HEIGHT, height: SLOT_HEIGHT,
                            borderBottom: `1px solid ${slotIdx % 2 === 1 ? "var(--border2)" : "var(--border)"}`,
                            background: isHover && hoverC ? hoverC.bg + "99" : undefined,
                          }}
                          onClick={() => { if (!ptrDrag) { /* future: click to add */ } }}
                        />
                      );
                    })}

                    {/* Ghost blocks from personal calendar */}
                    {personalDayLayouts[dayIdx]?.map(ev => {
                      const c = PALETTE[ev.colorIdx ?? 0];
                      const height = ev.duration * 2 * SLOT_HEIGHT;
                      return (
                        <div key={"ghost-" + ev.id} style={{ position: "absolute", top: ev.startSlot * SLOT_HEIGHT + 1, left: "1%", width: "98%", height: height - 2, background: `${c.bg}66`, borderLeft: `2px dashed ${c.border}`, borderRadius: 4, padding: "3px 6px", pointerEvents: "none", zIndex: 1, opacity: 0.5 }}>
                          <div style={{ fontSize: 9, color: c.accent, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🗓 {ev.title}</div>
                        </div>
                      );
                    })}

                    {/* Session blocks */}
                    {(() => {
                      const laid = dayLayouts[dayIdx];
                      const rendered = new Set();
                      const elements = [];

                      laid.forEach(session => {
                        if (rendered.has(session.id)) return;
                        const sEnd = session.startSlot + session.duration * 2;
                        const group = laid.filter(other => {
                          const oEnd = other.startSlot + other.duration * 2;
                          return session.startSlot < oEnd && sEnd > other.startSlot;
                        });
                        group.forEach(s => rendered.add(s.id));

                        if (group.length === 1) {
                          const s = group[0];
                          const student = students.find(st => st.id === s.studentId);
                          if (!student) return;
                          const c = getColor(s.studentId);
                          const height = s.duration * 2 * SLOT_HEIGHT;
                          const isMoving = ptrDrag?.id === s.id;
                          elements.push(
                            <div key={s.id} className="session-block"
                              style={{ top: s.startSlot * SLOT_HEIGHT + 1, left: "1%", width: "98%", height: height - 2, background: c.bg, borderLeftColor: c.accent, zIndex: 3, cursor: "grab", opacity: isMoving ? 0.3 : 1, touchAction: "none", userSelect: "none", pointerEvents: ptrDrag?.active ? "none" : "auto" }}
                              onPointerDown={e => { e.preventDefault(); setPtrDrag({ mode: "move", id: s.id, studentId: s.studentId, duration: s.duration, hoverDay: null, hoverSlot: null, active: false, startX: e.clientX, startY: e.clientY, clickSession: s }); }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.accent, flexShrink: 0, display: "inline-block" }} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.recurring === false && "1× "}{student.name}</span>
                                {height > 44 && <span style={{ fontSize: 9, color: c.accent, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{s.duration}ч · {student.rate.toLocaleString()}₽</span>}
                              </div>
                            </div>
                          );
                        } else {
                          const groupStart = Math.min(...group.map(s => s.startSlot));
                          const groupEnd = Math.max(...group.map(s => s.startSlot + s.duration * 2));
                          const groupHeight = (groupEnd - groupStart) * SLOT_HEIGHT;
                          const totalRate = group.reduce((sum, s) => {
                            const st = students.find(st => st.id === s.studentId);
                            return sum + (st ? st.rate : 0);
                          }, 0);

                          elements.push(
                            <div key={`group-${group.map(s=>s.id).join("-")}`}
                              style={{ position: "absolute", top: groupStart * SLOT_HEIGHT, left: 0, right: 0, height: groupHeight, pointerEvents: "none", zIndex: 3 }}
                            >
                              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 18, background: "var(--surface)", borderTop: "2px solid #f59e0b", display: "flex", alignItems: "center", paddingLeft: 6, gap: 5, zIndex: 4, backdropFilter: "blur(2px)", pointerEvents: "none" }}>
                                <span style={{ fontSize: 8, fontWeight: 700, color: "#b45309", letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>× {group.length}</span>
                                <span style={{ fontSize: 8, color: "#92400e", fontFamily: "'Manrope', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.map(s => { const st = students.find(x => x.id === s.studentId); return st?.name?.split(" ")[0] || "?"; }).join(" · ")}</span>
                                <span style={{ fontSize: 8, color: "#d97706", fontFamily: "'JetBrains Mono', monospace", marginLeft: "auto", paddingRight: 6 }}>{totalRate.toLocaleString()} ₽/ч</span>
                              </div>

                              {group.map((s, i) => {
                                const student = students.find(st => st.id === s.studentId);
                                if (!student) return null;
                                const c = getColor(s.studentId);
                                const laneTop = (s.startSlot - groupStart) * SLOT_HEIGHT + 18;
                                const laneHeight = s.duration * 2 * SLOT_HEIGHT - 18;
                                const laneW = 100 / group.length;
                                const isMoving = ptrDrag?.id === s.id;
                                return (
                                  <div key={s.id} className="session-block"
                                    style={{ position: "absolute", top: laneTop, left: `${i * laneW + 0.4}%`, width: `${laneW - 0.8}%`, height: laneHeight - 1, background: c.bg, borderLeft: `3px solid ${c.accent}`, borderRight: i < group.length - 1 ? `1px solid ${c.border}55` : "none", borderRadius: i === 0 ? "0 0 0 4px" : i === group.length-1 ? "0 0 4px 0" : "0", cursor: "grab", padding: "3px 5px", overflow: "hidden", opacity: isMoving ? 0.3 : 1, pointerEvents: ptrDrag?.active ? "none" : "auto", touchAction: "none", userSelect: "none" }}
                                    onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setPtrDrag({ mode: "move", id: s.id, studentId: s.studentId, duration: s.duration, hoverDay: null, hoverSlot: null, active: false, startX: e.clientX, startY: e.clientY, clickSession: s }); }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.accent, flexShrink: 0, display: "inline-block" }} />
                                      <span style={{ fontSize: 10, fontWeight: 700, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.recurring === false && "1× "}{student.name.split(" ")[0]}</span>
                                    </div>
                                    {laneHeight > 46 && (
                                      <div style={{ fontSize: 9, color: c.accent, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                                        {s.duration}ч · {student.rate.toLocaleString()}₽
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                      });
                      return elements;
                    })()}
                  </div>
                </div>
              ); })}
            </div>
          </div>

          {/* Session popup */}
          {popup?.type === "session" && (() => {
            const sess = popup.session;
            const student = students.find(s => s.id === sess.studentId);
            if (!student) return null;
            const c = getColor(sess.studentId);
            return (
              <SessionPopup
                sess={sess} student={student} color={c} weekStart={weekStart}
                onMarkDone={(date, note) => { markLessonDone(student.id, date, note); setPopup(null); }}
                onUpdate={ch => { updateSession(sess.id, ch); setPopup(null); }}
                onDelete={() => removeSession(sess.id)}
                onClose={() => setPopup(null)}
              />
            );
          })()}
        </div>
      )}

      {calendarMode === "tutor" && tab === "students" && (
        <StudentsTab
          students={students} getColor={getColor} getTarget={getTarget} getPlaced={getPlaced}
          toggleActive={toggleActive} deleteStudent={deleteStudent}
          updateStudent={updateStudent} addStudent={addStudent}
          addLessons={addLessons} markLessonDone={markLessonDone} deleteHistoryEvent={deleteHistoryEvent}
          archiveStudent={archiveStudent} unarchiveStudent={unarchiveStudent} getStudentLTV={getStudentLTV}
        />
      )}

      {calendarMode === "personal" && (
        <PersonalCalendarTab
          events={personalEvents}
          dayLayouts={personalDayLayouts}
          weekStart={weekStart}
          onAdd={addPersonalEvent}
          onUpdate={updatePersonalEvent}
          onDelete={deletePersonalEvent}
          ghostLayouts={dayLayouts}
          ghostStudents={students}
          ghostGetColor={getColor}
          visibleDays={visibleDays}
        />
      )}
    </div>
  );
}

function RecurrenceControl({ recurring, date, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <button className={`dur-pill ${recurring ? "sel" : ""}`} onClick={() => onChange(true, date)}>Каждую неделю</button>
      <button className={`dur-pill ${!recurring ? "sel" : ""}`} onClick={() => onChange(false, date)}>Разово</button>
      {!recurring && (
        <input className="edit-inp" type="date" style={{ padding: "4px 7px", fontSize: 12, width: 130 }} value={date} onChange={e => onChange(false, e.target.value)} />
      )}
    </div>
  );
}

function SessionPopup({ sess, student, color, weekStart, onMarkDone, onUpdate, onDelete, onClose }) {
  const [recurring, setRecurring] = useState(sess.recurring !== false);
  const [date, setDate] = useState(sess.date || isoDate(addDays(weekStart, sess.day)));
  const [startTime, setStartTime] = useState(slotToTime(sess.startSlot));
  const c = color;

  const handleRecChange = (rec, d) => {
    setRecurring(rec);
    setDate(d);
  };

  const save = () => {
    const newSlot = timeToSlot(startTime);
    if (recurring) onUpdate({ recurring: true, date: undefined, day: sess.day, startSlot: newSlot });
    else onUpdate({ recurring: false, date, day: weekdayFromIso(date), startSlot: newSlot });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="popup-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: c.bg, border: `1.5px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.accent, display: "inline-block" }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{student.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>
              {DAYS[sess.day]}, {slotToTime(sess.startSlot)}–{slotToTime(sess.startSlot + sess.duration * 2)} · {sess.duration}ч
            </div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, padding: "9px 11px", background: "var(--surface2)", borderRadius: 7, display: "flex", justifyContent: "space-between" }}>
          <span>{student.subject}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{(student.rate * sess.duration).toLocaleString()} ₽</span>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Точное время начала</div>
          <input className="edit-inp" type="time" style={{ width: 120 }} value={startTime} onChange={e => setStartTime(e.target.value)} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Повторение</div>
          <RecurrenceControl recurring={recurring} date={date} onChange={handleRecChange} />
        </div>

        <div style={{ marginBottom: 8 }}>
          <MarkDoneInput label="Занятие прошло, списать −1" onMark={onMarkDone} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="save-btn" style={{ flex: 1 }} onClick={save}>Сохранить</button>
          <button className="del-btn" style={{ width: "auto", padding: "9px 14px" }} onClick={onDelete}>Удалить</button>
        </div>
      </div>
    </div>
  );
}

function PersonalCalendarTab({ events, dayLayouts, weekStart, onAdd, onUpdate, onDelete, ghostLayouts, ghostStudents, ghostGetColor, visibleDays }) {
  const [popup, setPopup] = useState(null);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(1);
  const [colorIdx, setColorIdx] = useState(0);
  const [recurring, setRecurring] = useState(true);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [ptrDrag, setPtrDrag] = useState(null); // { id, duration, hoverDay, hoverSlot }

  const openNew = (day, slot) => {
    setTitle(""); setDuration(1); setColorIdx(0);
    setRecurring(true); setDate(isoDate(addDays(weekStart, day)));
    setStartTime(slotToTime(slot));
    setPopup({ type: "new", day, slot });
  };
  const openEdit = (ev) => {
    setTitle(ev.title); setDuration(ev.duration); setColorIdx(ev.colorIdx ?? 0);
    setRecurring(ev.recurring !== false);
    setDate(ev.date || isoDate(addDays(weekStart, ev.day)));
    setStartTime(slotToTime(ev.startSlot));
    setPopup({ type: "edit", event: ev });
  };

  const handleRecChange = (rec, d) => { setRecurring(rec); setDate(d); };

  const submit = () => {
    if (!title.trim()) return;
    const slot = timeToSlot(startTime);
    if (slot + duration * 2 > TOTAL_SLOTS || slot < 0) return;
    const recFields = recurring ? { recurring: true, date: undefined } : { recurring: false, date };
    if (popup.type === "new") {
      const day = recurring ? popup.day : weekdayFromIso(date);
      onAdd({ day, startSlot: slot, duration, title: title.trim(), colorIdx, ...recFields });
    } else {
      const day = recurring ? popup.event.day : weekdayFromIso(date);
      onUpdate(popup.event.id, { title: title.trim(), duration, colorIdx, day, startSlot: slot, ...recFields });
    }
    setPopup(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)" }}>
      {/* Hint */}
      <div className="hint-bar">
        <span>☝</span>
        <span>{ptrDrag?.active ? "Отпусти, чтобы переместить" : "Зажми блок и перетащи · Кликни на пустое место — добавить"}</span>
        {ptrDrag?.active && <button onClick={() => setPtrDrag(null)} style={{ marginLeft: "auto", background: "none", border: "1px solid #93c5fd", color: "#2563eb", borderRadius: 5, padding: "2px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Отмена</button>}
      </div>

      <div style={{ flex: 1, overflow: "auto", background: "var(--surface2)" }}
        onPointerMove={e => {
          if (!ptrDrag) return;
          if (!ptrDrag.active) {
            const dx = e.clientX - ptrDrag.startX;
            const dy = e.clientY - ptrDrag.startY;
            if (dx * dx + dy * dy < 25) return;
            setPtrDrag(d => ({ ...d, active: true }));
          }
          const el = document.elementFromPoint(e.clientX, e.clientY);
          if (el?.dataset?.pday != null && el?.dataset?.pslot != null) {
            setPtrDrag(d => ({ ...d, hoverDay: +el.dataset.pday, hoverSlot: +el.dataset.pslot }));
          }
        }}
        onPointerUp={() => {
          if (!ptrDrag) return;
          if (!ptrDrag.active) {
            if (ptrDrag.clickEvent) openEdit(ptrDrag.clickEvent);
            setPtrDrag(null);
            return;
          }
          if (ptrDrag.hoverDay != null && ptrDrag.hoverSlot != null) {
            if (ptrDrag.hoverSlot + ptrDrag.duration * 2 <= TOTAL_SLOTS) {
              onUpdate(ptrDrag.id, { day: ptrDrag.hoverDay, startSlot: ptrDrag.hoverSlot });
            }
          }
          setPtrDrag(null);
        }}
      >
        <div style={{ display: "flex", minWidth: 500 }}>
          <div style={{ width: 44, flexShrink: 0, borderRight: "1px solid var(--border)", paddingTop: 28, background: "var(--surface)" }}>
            {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
              <div key={i} style={{ height: SLOT_HEIGHT, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 7, paddingTop: 2 }}>
                {i % 2 === 0 && <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{slotToTime(i)}</span>}
              </div>
            ))}
          </div>

          {visibleDays.map(dayIdx => { const dayLabel = DAYS[dayIdx]; return (
            <div key={dayIdx} style={{ flex: 1, minWidth: 0, borderRight: "1px solid var(--border)" }}>
              <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--text-dim)", borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 2, letterSpacing: "0.05em" }}>
                {dayLabel} <span style={{ fontWeight: 400, color: "var(--text-faint)", fontSize: 10 }}>{addDays(weekStart, dayIdx).getDate()}</span>
              </div>
              <div style={{ position: "relative", height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => {
                  const isHover = ptrDrag?.hoverDay === dayIdx && ptrDrag?.hoverSlot === slotIdx;
                  return (
                    <div key={slotIdx}
                      data-pday={dayIdx}
                      data-pslot={slotIdx}
                      className="slot-cell"
                      style={{ top: slotIdx * SLOT_HEIGHT, height: SLOT_HEIGHT, borderBottom: `1px solid ${slotIdx % 2 === 1 ? "var(--border2)" : "var(--border)"}`, background: isHover ? "rgba(37,99,235,0.08)" : undefined }}
                      onClick={() => { if (!ptrDrag) openNew(dayIdx, slotIdx); }}
                    />
                  );
                })}

                {/* Ghost blocks from tutor calendar */}
                {ghostLayouts[dayIdx]?.map(sess => {
                  const student = ghostStudents.find(st => st.id === sess.studentId);
                  if (!student) return null;
                  const c = ghostGetColor(sess.studentId);
                  const height = sess.duration * 2 * SLOT_HEIGHT;
                  return (
                    <div key={"ghost-" + sess.id} style={{ position: "absolute", top: sess.startSlot * SLOT_HEIGHT + 1, left: "1%", width: "98%", height: height - 2, background: `${c.bg}66`, borderLeft: `2px dashed ${c.border}`, borderRadius: 4, padding: "3px 6px", pointerEvents: "none", zIndex: 1, opacity: 0.5 }}>
                      <div style={{ fontSize: 9, color: c.accent, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📚 {student.name}</div>
                    </div>
                  );
                })}

                {/* Personal event blocks */}
                {dayLayouts[dayIdx].map(ev => {
                  const c = PALETTE[ev.colorIdx ?? 0];
                  const wPct = 100 / ev.totalCols;
                  const height = ev.duration * 2 * SLOT_HEIGHT;
                  const isMoving = ptrDrag?.id === ev.id;
                  return (
                    <div key={ev.id} className="session-block"
                      style={{ top: ev.startSlot * SLOT_HEIGHT + 1, left: `${ev.col * wPct + 0.5}%`, width: `${wPct - 1}%`, height: height - 2, background: c.bg, borderLeftColor: c.accent, zIndex: 2, cursor: "grab", opacity: isMoving ? 0.3 : 1, touchAction: "none", userSelect: "none", pointerEvents: ptrDrag?.active ? "none" : "auto" }}
                      onPointerDown={e => { e.preventDefault(); setPtrDrag({ id: ev.id, duration: ev.duration, hoverDay: null, hoverSlot: null, active: false, startX: e.clientX, startY: e.clientY, clickEvent: ev }); }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>
                        {ev.recurring === false && "1× "}{ev.title}
                      </div>
                      {height > 44 && <div style={{ fontSize: 9, color: c.accent, fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>{ev.duration}ч</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ); })}
        </div>
      </div>

      {popup && (
        <div className="overlay" onClick={() => setPopup(null)}>
          <div className="popup-card" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 12 }}>
              {popup.type === "new" ? `${DAYS[popup.day]}, ${slotToTime(popup.slot)}` : `${DAYS[popup.event.day]}, ${slotToTime(popup.event.startSlot)}`}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Что это</div>
              <input className="edit-inp" style={{ width: "100%" }} placeholder="Пара в вузе / Спортзал / ..." value={title} onChange={e => setTitle(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && submit()} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Точное время начала</div>
              <input className="edit-inp" type="time" style={{ width: 120 }} value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Длительность</div>
              <div style={{ display: "flex", gap: 4 }}>
                {DURATIONS.map(d => <button key={d} className={`dur-pill ${duration === d ? "sel" : ""}`} onClick={() => setDuration(d)}>{d}ч</button>)}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Повторение</div>
              <RecurrenceControl recurring={recurring} date={date} onChange={handleRecChange} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Цвет</div>
              <div style={{ display: "flex", gap: 6 }}>
                {PALETTE.map((c, i) => (
                  <button key={i} onClick={() => setColorIdx(i)} style={{ width: 22, height: 22, borderRadius: "50%", background: c.accent, border: colorIdx === i ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="save-btn" style={{ flex: 1 }} onClick={submit}>{popup.type === "new" ? "Добавить" : "Сохранить"}</button>
              {popup.type === "edit" && (
                  <button className="del-btn" style={{ width: "auto", padding: "9px 14px" }} onClick={() => { onDelete(popup.event.id); setPopup(null); }}>Удалить</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function PayInput({ onAdd, defaultAmount }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [val, setVal] = useState(defaultAmount ? String(defaultAmount) : "");
  const [date, setDate] = useState(todayIso);
  const submit = () => {
    const n = parseInt(val);
    if (!n) return;
    onAdd(n, date);
    setVal(defaultAmount ? String(defaultAmount) : "");
  };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      <input
        className="edit-inp"
        type="number"
        placeholder={defaultAmount ? `напр. ${defaultAmount}` : "кол-во"}
        style={{ width: 64, padding: "4px 7px", fontSize: 12 }}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
      />
      <input
        className="edit-inp"
        type="date"
        style={{ width: 118, padding: "4px 7px", fontSize: 12 }}
        value={date}
        onChange={e => setDate(e.target.value)}
      />
      <button onClick={submit} style={{ fontSize: 11, fontWeight: 600, background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}>
        Внесли оплату
      </button>
    </span>
  );
}

function MarkDoneInput({ onMark, label }) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const submit = () => {
    onMark(date, note.trim());
    setNote("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <input
          className="edit-inp"
          type="date"
          style={{ width: 118, padding: "4px 7px", fontSize: 12 }}
          value={date}
          onChange={e => setDate(e.target.value)}
        />
        <input
          className="edit-inp"
          type="text"
          placeholder="что прошли (необязательно)"
          style={{ flex: 1, minWidth: 140, padding: "4px 7px", fontSize: 12 }}
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
        />
        <button onClick={submit} style={{ fontSize: 11, fontWeight: 600, background: "var(--surface)", border: "1px solid var(--border2)", color: "var(--text-mid)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}>
          {label || "Занятие прошло −1"}
        </button>
      </div>
    </div>
  );
}

function NotesField({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  if (!editing) {
    return (
      <div
        onClick={() => { setText(value); setEditing(true); }}
        style={{ fontSize: 12, color: value ? "var(--text-mid)" : "var(--text-faint)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px", cursor: "pointer", minHeight: 14, fontFamily: "'Manrope', sans-serif" }}
      >
        {value || "+ заметка по ученику (что проходим, слабые темы...)"}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
      <textarea
        className="edit-inp"
        autoFocus
        rows={2}
        style={{ flex: 1, resize: "vertical", fontFamily: "'Manrope', sans-serif" }}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <button className="save-btn" onClick={() => { onSave(text.trim()); setEditing(false); }}>✓</button>
    </div>
  );
}

function StudentsTab({ students, getColor, getTarget, getPlaced, toggleActive, deleteStudent, updateStudent, addStudent, addLessons, markLessonDone, deleteHistoryEvent, archiveStudent, unarchiveStudent, getStudentLTV }) {
  const [editId, setEditId] = useState(null);
  const [openHistoryId, setOpenHistoryId] = useState(null);
  const [ef, setEf] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [af, setAf] = useState({ name: "", subject: "", rate: "3000", weeklyHours: "2", sessionDuration: 1, lessonsPaid: "0", paymentMode: "subscription", lessonsPerBundle: "4", parentContact: "", colorIdx: null });

  const startEdit = (s) => {
    setEditId(s.id);
    setEf({ name: s.name, subject: s.subject, rate: String(s.rate), weeklyHours: String(s.weeklyHours), sessionDuration: s.sessionDuration, paymentMode: s.paymentMode || "subscription", lessonsPerBundle: String(s.lessonsPerBundle ?? 4), parentContact: s.parentContact || "", colorIdx: s.colorIdx ?? null });
  };
  const saveEdit = (id) => {
    updateStudent(id, {
      name: ef.name.trim() || undefined,
      subject: ef.subject.trim() || undefined,
      rate: parseInt(ef.rate) || undefined,
      weeklyHours: parseFloat(ef.weeklyHours) || undefined,
      sessionDuration: ef.sessionDuration,
      paymentMode: ef.paymentMode,
      lessonsPerBundle: parseInt(ef.lessonsPerBundle) || 4,
      parentContact: ef.parentContact.trim(),
      colorIdx: ef.colorIdx,
    });
    setEditId(null);
  };
  const doAdd = () => {
    if (!af.name.trim()) return;
    addStudent({
      name: af.name.trim(), subject: af.subject.trim() || "Химия", rate: parseInt(af.rate) || 3000,
      weeklyHours: parseFloat(af.weeklyHours) || 2, sessionDuration: af.sessionDuration,
      lessonsPaid: parseInt(af.lessonsPaid) || 0, paymentMode: af.paymentMode,
      lessonsPerBundle: parseInt(af.lessonsPerBundle) || 4, parentContact: af.parentContact.trim(), notes: "",
      colorIdx: af.colorIdx,
    });
    setAf({ name: "", subject: "", rate: "3000", weeklyHours: "2", sessionDuration: 1, lessonsPaid: "0", paymentMode: "subscription", lessonsPerBundle: "4", parentContact: "", colorIdx: null });
    setShowAdd(false);
  };

  const Field = ({ label, children }) => (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "20px 16px" }}>
      {students.filter(s => !s.archived).map(s => {
        const c = getColor(s.id);
        const placed = getPlaced(s.id);
        const target = getTarget(s);
        const isEdit = editId === s.id;
        return (
          <div key={s.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 15px", marginBottom: 8, opacity: s.active ? 1 : 0.55, transition: "opacity 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            {isEdit ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Field label="Имя"><input className="edit-inp" style={{ width: "100%", minWidth: 110 }} value={ef.name} onChange={e => setEf(f => ({ ...f, name: e.target.value }))} /></Field>
                  <Field label="Предмет"><input className="edit-inp" style={{ width: "100%", minWidth: 100 }} value={ef.subject} onChange={e => setEf(f => ({ ...f, subject: e.target.value }))} /></Field>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Field label="Ставка ₽/ч"><input className="edit-inp" type="number" style={{ width: 90 }} value={ef.rate} onChange={e => setEf(f => ({ ...f, rate: e.target.value }))} /></Field>
                  <Field label="Часов/нед"><input className="edit-inp" type="number" step="0.5" style={{ width: 70 }} value={ef.weeklyHours} onChange={e => setEf(f => ({ ...f, weeklyHours: e.target.value }))} /></Field>
                  <Field label="Длина занятия">
                    <div style={{ display: "flex", gap: 4 }}>
                      {DURATIONS.map(d => <button key={d} className={`dur-pill ${ef.sessionDuration === d ? "sel" : ""}`} onClick={() => setEf(f => ({ ...f, sessionDuration: d }))}>{d}ч</button>)}
                    </div>
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Field label="Оплата">
                    <div style={{ display: "flex", gap: 4 }}>
                      {Object.entries(PAYMENT_MODE_LABELS).map(([key, label]) => (
                        <button key={key} className={`dur-pill ${ef.paymentMode === key ? "sel" : ""}`} onClick={() => setEf(f => ({ ...f, paymentMode: key }))}>{label}</button>
                      ))}
                    </div>
                  </Field>
                  {ef.paymentMode === "subscription" && (
                    <Field label="Занятий в абонементе"><input className="edit-inp" type="number" style={{ width: 70 }} value={ef.lessonsPerBundle} onChange={e => setEf(f => ({ ...f, lessonsPerBundle: e.target.value }))} /></Field>
                  )}
                  <Field label="Контакт родителя"><input className="edit-inp" style={{ width: 160 }} placeholder="@username / +7..." value={ef.parentContact} onChange={e => setEf(f => ({ ...f, parentContact: e.target.value }))} /></Field>
                  <Field label="Цвет">
                    <div style={{ display: "flex", gap: 5 }}>
                      {PALETTE.map((c, i) => (
                        <button key={i} onClick={() => setEf(f => ({ ...f, colorIdx: i }))} style={{ width: 20, height: 20, borderRadius: "50%", background: c.accent, border: ef.colorIdx === i ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
                      ))}
                    </div>
                  </Field>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="save-btn" onClick={() => saveEdit(s.id)}>Сохранить</button>
                    <button className="cancel-btn-sm" onClick={() => setEditId(null)}>Отмена</button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className={`toggle-btn ${s.active ? "on" : "off"}`} onClick={() => toggleActive(s.id)} />
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.accent, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{s.subject}</span>
                    {s.parentContact && (
                      <button
                        onClick={() => {
                          const c = s.parentContact.trim();
                          if (c.startsWith("@")) window.open(`https://t.me/${c.slice(1)}`, "_blank");
                          else if (c.startsWith("+") || /^\d/.test(c)) window.open(`tel:${c.replace(/\s/g, "")}`, "_blank");
                          else window.open(`https://t.me/${c}`, "_blank");
                        }}
                        title={`Написать родителю: ${s.parentContact}`}
                        style={{ fontSize: 10, color: "#2563eb", background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "1px 7px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}
                      >
                        ✉ {s.parentContact}
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", fontFamily: "'JetBrains Mono', monospace" }}>
                    <span>{s.weeklyHours}ч/нед</span>
                    <span style={{ color: "var(--border2)" }}>·</span>
                    <span>по {s.sessionDuration}ч</span>
                    <span style={{ color: "var(--border2)" }}>·</span>
                    <span>{target} зан.</span>
                    <span style={{ color: placed >= target ? "#16a34a" : "var(--text-faint)" }}>✓ {placed}/{target}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.rate.toLocaleString()} ₽</div>
                  <div style={{ fontSize: 10, color: "var(--text-faint)" }}>в час</div>
                  <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }} title="Lifetime Value">LTV {getStudentLTV(s).toLocaleString()} ₽</div>
                </div>
                <button className="iBtn" onClick={() => startEdit(s)}>✎</button>
                <button className="iBtn" title="В архив" onClick={() => archiveStudent(s.id)} style={{ fontSize: 11 }}>📦</button>
              </div>

              {/* Notes — visible right where you check off a lesson */}
              <div style={{ paddingLeft: 54 }}>
                <NotesField value={s.notes || ""} onSave={notes => updateStudent(s.id, { notes })} />
              </div>

              {/* Payment row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 54, flexWrap: "wrap" }}>
                {(() => {
                  if (s.paymentMode === "single") {
                    return (
                      <>
                        <span style={{ fontSize: 11, color: "var(--text-dim)", background: "var(--bg)", border: "1px solid var(--border2)", borderRadius: 10, padding: "2px 9px" }}>
                          разовая оплата · {(s.rate * s.sessionDuration).toLocaleString()} ₽ за занятие
                        </span>
                        {s.lastLessonDate && (
                          <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace" }}>
                            посл. занятие {formatDate(s.lastLessonDate)}{s.lastLessonNote ? ` · «${s.lastLessonNote}»` : ""}
                          </span>
                        )}
                        <MarkDoneInput onMark={(date, note) => markLessonDone(s.id, date, note)} />
                        <button
                          onClick={() => setOpenHistoryId(openHistoryId === s.id ? null : s.id)}
                          style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "1px solid var(--border2)", borderRadius: 8, padding: "5px 9px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}
                        >
                          История {openHistoryId === s.id ? "▲" : "▼"} {s.history?.length ? `(${s.history.length})` : ""}
                        </button>
                      </>
                    );
                  }
                  const n = s.lessonsPaid ?? 0;
                  const status = getPaymentStatus(s);
                  const sc = STATUS_COLORS[status];
                  return (
                    <>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: sc.text, background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: 10, padding: "2px 9px" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot, display: "inline-block" }} />
                        {n < 0 ? `должен ${-n} занятий` : n === 0 ? "занятий не оплачено" : `осталось занятий: ${n}`}
                      </span>
                      {s.lastPaymentDate && (
                        <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace" }}>
                          (внесли {s.lastPaymentAmount} {formatDate(s.lastPaymentDate)})
                        </span>
                      )}
                      {s.lastLessonDate && (
                        <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace" }}>
                          · посл. занятие {formatDate(s.lastLessonDate)}{s.lastLessonNote ? ` · «${s.lastLessonNote}»` : ""}
                        </span>
                      )}
                      <MarkDoneInput onMark={(date, note) => markLessonDone(s.id, date, note)} />
                      <PayInput onAdd={(n, date) => addLessons(s.id, n, date)} defaultAmount={s.lessonsPerBundle} />
                      <button
                        onClick={() => setOpenHistoryId(openHistoryId === s.id ? null : s.id)}
                        style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "1px solid var(--border2)", borderRadius: 8, padding: "5px 9px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}
                      >
                        История {openHistoryId === s.id ? "▲" : "▼"} {s.history?.length ? `(${s.history.length})` : ""}
                      </button>
                    </>
                  );
                })()}
              </div>

              {/* History panel */}
              {openHistoryId === s.id && (
                <div style={{ paddingLeft: 54, marginTop: 2 }}>
                  {(!s.history || s.history.length === 0) ? (
                    <div style={{ fontSize: 11, color: "var(--text-faint)", padding: "6px 0" }}>Пока нет записей</div>
                  ) : (
                    <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "6px 10px", maxHeight: 180, overflowY: "auto" }}>
                      {[...s.history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)).map(ev => (
                        <div key={ev.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                          <span style={{ fontSize: 12, marginTop: 1 }}>{ev.type === "payment" ? "💰" : "✓"}</span>
                          <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace", width: 48, flexShrink: 0, marginTop: 1 }}>{formatDate(ev.date)}</span>
                          <span style={{ fontSize: 12, color: "var(--text-mid)", flex: 1 }}>
                            {ev.type === "payment" ? `Оплата: +${ev.amount} занятий` : "Занятие прошло (−1)"}
                            {ev.type === "lesson" && ev.note && (
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontStyle: "italic" }}>«{ev.note}»</div>
                            )}
                          </span>
                          <button onClick={() => deleteHistoryEvent(s.id, ev.id)} title="Удалить запись и откатить баланс" className="iBtn del" style={{ fontSize: 11 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>
            )}
          </div>
        );
      })}

      {showAdd ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "15px", marginTop: 6, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 110 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Имя</div>
              <input className="edit-inp" style={{ width: "100%" }} placeholder="Иван П." value={af.name} onChange={e => setAf(f => ({ ...f, name: e.target.value }))} autoFocus onKeyDown={e => e.key === "Enter" && doAdd()} />
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Предмет</div>
              <input className="edit-inp" style={{ width: "100%" }} placeholder="ЕГЭ химия" value={af.subject} onChange={e => setAf(f => ({ ...f, subject: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Ставка ₽/ч</div>
              <input className="edit-inp" type="number" style={{ width: 90 }} value={af.rate} onChange={e => setAf(f => ({ ...f, rate: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Часов/нед</div>
              <input className="edit-inp" type="number" step="0.5" style={{ width: 70 }} value={af.weeklyHours} onChange={e => setAf(f => ({ ...f, weeklyHours: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Длина занятия</div>
              <div style={{ display: "flex", gap: 4 }}>
                {DURATIONS.map(d => <button key={d} className={`dur-pill ${af.sessionDuration === d ? "sel" : ""}`} onClick={() => setAf(f => ({ ...f, sessionDuration: d }))}>{d}ч</button>)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Оплачено занятий</div>
              <input className="edit-inp" type="number" style={{ width: 70 }} value={af.lessonsPaid} onChange={e => setAf(f => ({ ...f, lessonsPaid: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Оплата</div>
              <div style={{ display: "flex", gap: 4 }}>
                {Object.entries(PAYMENT_MODE_LABELS).map(([key, label]) => (
                  <button key={key} className={`dur-pill ${af.paymentMode === key ? "sel" : ""}`} onClick={() => setAf(f => ({ ...f, paymentMode: key }))}>{label}</button>
                ))}
              </div>
            </div>
            {af.paymentMode === "subscription" && (
              <div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Занятий в абонементе</div>
                <input className="edit-inp" type="number" style={{ width: 70 }} value={af.lessonsPerBundle} onChange={e => setAf(f => ({ ...f, lessonsPerBundle: e.target.value }))} />
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Контакт родителя</div>
              <input className="edit-inp" style={{ width: 160 }} placeholder="@username / +7..." value={af.parentContact} onChange={e => setAf(f => ({ ...f, parentContact: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Цвет</div>
              <div style={{ display: "flex", gap: 5 }}>
                {PALETTE.map((c, i) => (
                  <button key={i} onClick={() => setAf(f => ({ ...f, colorIdx: i }))} style={{ width: 20, height: 20, borderRadius: "50%", background: c.accent, border: af.colorIdx === i ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="save-btn" onClick={doAdd}>Добавить</button>
            <button className="cancel-btn-sm" onClick={() => setShowAdd(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <button className="ghost-btn" onClick={() => setShowAdd(true)} style={{ marginTop: 6 }}>+ Добавить ученика</button>
      )}

      {/* Archive section */}
      {students.filter(s => s.archived).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 8 }}>📦 Архив ({students.filter(s => s.archived).length})</div>
          {students.filter(s => s.archived).map(s => {
            const c = getColor(s.id);
            const ltv = getStudentLTV(s);
            const lessonsDone = (s.history || []).filter(h => h.type === "lesson").length;
            return (
              <div key={s.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", marginBottom: 6, opacity: 0.7, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.accent, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name} <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 400 }}>{s.subject}</span></div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                    {lessonsDone} занятий · LTV {ltv.toLocaleString()} ₽
                  </div>
                </div>
                <button onClick={() => unarchiveStudent(s.id)} style={{ fontSize: 11, background: "var(--surface)", border: "1px solid var(--border2)", color: "var(--text-mid)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}>
                  Восстановить
                </button>
                <button className="iBtn del" onClick={() => deleteStudent(s.id)} title="Удалить навсегда">✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
