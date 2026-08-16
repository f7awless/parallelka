import { useState, useEffect, useRef, useMemo } from "react";
import { SignedIn, SignedOut, SignIn, UserButton, useSession, useUser } from "@clerk/clerk-react";
import { createClerkSupabaseClient } from "./supabase";

const STORAGE_KEY = "parallelka-v1";
const SLOT_HEIGHT = 30;
const START_HOUR = 8;
const END_HOUR = 22;
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * 2;
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DURATIONS = [1, 1.5, 2];

const SMART_LISTS = [
  { key: "inbox", label: "Входящие", icon: "📥" },
  { key: "today", label: "Сегодня", icon: "☀️" },
  { key: "upcoming", label: "Предстоящие", icon: "📅" },
  { key: "anytime", label: "Когда угодно", icon: "📚" },
  { key: "someday", label: "Когда-нибудь", icon: "🗄" },
  { key: "completed", label: "Выполнено", icon: "✅" },
];
const PRIORITY_COLORS = { 1: "#2563eb", 2: "#d97706", 3: "#dc2626" };
const PRIORITY_LABELS = { 0: "Без приоритета", 1: "Низкий", 2: "Средний", 3: "Высокий" };

const PALETTE = [
  { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a", accent: "#2563eb", light: "#eff6ff" },
  { bg: "#ede9fe", border: "#c4b5fd", text: "#4c1d95", accent: "#7c3aed", light: "#f5f3ff" },
  { bg: "#d1fae5", border: "#6ee7b7", text: "#064e3b", accent: "#059669", light: "#ecfdf5" },
  { bg: "#fef3c7", border: "#fcd34d", text: "#78350f", accent: "#d97706", light: "#fffbeb" },
  { bg: "#fee2e2", border: "#fca5a5", text: "#7f1d1d", accent: "#dc2626", light: "#fef2f2" },
  { bg: "#cffafe", border: "#67e8f9", text: "#164e63", accent: "#0891b2", light: "#ecfeff" },
  { bg: "#ecfccb", border: "#bef264", text: "#365314", accent: "#65a30d", light: "#f7fee7" },
];

const DEFAULT_STUDENTS = [];

const PAYMENT_MODE_LABELS = { subscription: "Абонемент", single: "Разовая" };
const WORK_FORMATS = ["ЕГЭ", "ОГЭ", "ПУ", "ВИ"];

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw) return raw;
  } catch {}
  return {};
}

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
  // Zero-pad the hour too — this feeds <input type="time"> values directly, which
  // silently rejects "8:00" (needs "08:00") and renders blank.
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
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

function isToday(date) {
  const t = new Date();
  return date.getFullYear() === t.getFullYear() && date.getMonth() === t.getMonth() && date.getDate() === t.getDate();
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

// Whole weeks between two ISO dates (min 0) — used to project LTV across a
// student's real-world start/end dates, since lesson history before the tutor
// started using this app was never logged.
function weeksBetween(startIso, endIso) {
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  const days = Math.floor((end - start) / 86400000);
  return Math.max(0, days / 7);
}

// Counts how many times a given weekday (0=Пн … 6=Вс, matching DAYS/session.day)
// falls within the given calendar month — used to project recurring-session income.
function weekdayOccurrencesInMonth(year, month, dayIdx) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const jsDay = new Date(year, month, d).getDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    if (idx === dayIdx) count++;
  }
  return count;
}

// Table-import helpers — tolerant parsers for the messy real-world values
// that show up in a tutor's own spreadsheet (transitions like "3000 => 2250",
// dates like "7.6.26", a status column in Russian, "ЕГЭ 11" combo cells).
function parseImportDate(raw) {
  if (!raw && raw !== 0) return "";
  const s = String(raw).trim();
  if (!s || s === "-" || s === "—") return "";
  // A bare Excel date serial (days since 1899-12-30) — happens when a real
  // .xlsx date cell comes through without a recognized display format.
  if (/^\d{4,6}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (!isNaN(d)) return isoDate(d);
    }
  }
  // D.M.Y / D/M/Y / D-M-Y (this sheet's own format) or Y-M-D if the first
  // group is clearly a 4-digit year.
  const m = s.match(/^(\d{1,4})[.\/\-](\d{1,2})[.\/\-](\d{1,4})$/);
  if (m) {
    let [, a, b, c] = m;
    if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
    let y = c;
    if (y.length === 2) y = (Number(y) < 70 ? "20" : "19") + y;
    return `${y}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d) ? "" : isoDate(d);
}
function parseImportNumber(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw);
  const parts = s.split("=>");
  let last = (parts[parts.length - 1] || "").trim().replace(/[^\d.,-]/g, "");
  // A "," or "." followed by exactly 3 digits (and nothing after) is a
  // thousands separator, not a decimal point — rates/hours here never have
  // 3 decimal places. Drop it; any remaining comma is a real decimal comma.
  last = last.replace(/[.,](\d{3})(?!\d)/g, "$1").replace(",", ".");
  const n = parseFloat(last);
  return isNaN(n) ? null : n;
}
function splitFormatGrade(raw) {
  const s = String(raw || "");
  const format = WORK_FORMATS.find(f => s.toUpperCase().includes(f));
  const gradeMatch = s.match(/\d{1,2}/);
  return { workFormat: format || "", grade: gradeMatch ? gradeMatch[0] : "" };
}
function parseImportStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s.includes("переста")) return { active: false, archived: true };
  if (s.includes("перерыв")) return { active: false, archived: false };
  return { active: true, archived: false };
}

// "89365550141 (Paladinlightnin)" → phone + telegram; either half (or both)
// may be missing, and a bare "-" placeholder counts as missing.
function splitPhoneTelegram(raw) {
  const s = String(raw || "").trim();
  if (!s || s === "-" || s === "—") return { phone: "", telegram: "" };
  const m = s.match(/^([^(]*)\(([^)]*)\)?\s*$/);
  if (m) {
    const phone = m[1].trim();
    let tg = m[2].trim();
    if (tg && !tg.startsWith("@")) tg = "@" + tg;
    return { phone, telegram: tg };
  }
  if (/^[+\d][\d\s\-()]{4,}$/.test(s)) return { phone: s, telegram: "" };
  return { phone: "", telegram: s.startsWith("@") ? s : "@" + s };
}

const IMPORT_FIELDS = [
  { key: "ignore", label: "— игнорировать —" },
  { key: "name", label: "Имя ученика" },
  { key: "studentContactCombo", label: "Контакт ученика (тел. + тг вместе)" },
  { key: "studentPhone", label: "Телефон ученика" },
  { key: "studentTelegram", label: "Телеграм ученика" },
  { key: "parentName", label: "Имя родителя" },
  { key: "parentContactCombo", label: "Контакт родителя (тел. + тг вместе)" },
  { key: "parentPhone", label: "Телефон родителя" },
  { key: "parentTelegram", label: "Телеграм родителя" },
  { key: "subject", label: "Предмет (текст)" },
  { key: "formatGrade", label: "Формат + класс (напр. «ЕГЭ 11»)" },
  { key: "grade", label: "Класс (только число)" },
  { key: "workFormat", label: "Формат (ЕГЭ/ОГЭ/ПУ/ВИ)" },
  { key: "rate", label: "Ставка ₽/ч" },
  { key: "weeklyHours", label: "Часов в неделю" },
  { key: "startDate", label: "Дата начала" },
  { key: "endDate", label: "Дата окончания" },
  { key: "notes", label: "Заметка" },
  { key: "status", label: "Статус (учится/перерыв/перестал)" },
];

function truncate(str, n) {
  if (!str) return str;
  return str.length > n ? str.slice(0, n) + "…" : str;
}

function openContact(raw) {
  const c = raw.trim();
  if (!c) return;
  if (c.startsWith("@")) window.open(`https://t.me/${c.slice(1)}`, "_blank");
  else if (c.startsWith("+") || /^\d/.test(c)) window.open(`tel:${c.replace(/\s/g, "")}`, "_blank");
  else window.open(`https://t.me/${c}`, "_blank");
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

// Swipe left/right to step a day, like Google Calendar's day view on a phone.
// Requires a mostly-horizontal, fairly quick flick so it doesn't fire while the
// user is just scrolling the grid vertically or tapping a block.
function useSwipeDay(enabled, onPrev, onNext) {
  const startRef = useRef(null);
  if (!enabled) return {};
  return {
    onTouchStart: (e) => {
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    },
    onTouchEnd: (e) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      if (Date.now() - start.time < 600 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) onNext(); else onPrev();
      }
    },
  };
}

// A popup that's a centered modal on desktop and slides up as an iOS-style bottom
// sheet on phone widths (see the .sheet-* rules in CSS), with a drag handle to
// dismiss by swiping down — the native pattern users already know from iPhone apps.
function Sheet({ onClose, children, className }) {
  const [dragY, setDragY] = useState(0);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const dragYRef = useRef(0);
  const handleRef = useRef(null);

  // React attaches JSX onTouchMove as a passive listener, so preventDefault inside it
  // is silently ignored (and logs a warning) — attach natively with passive:false so
  // dragging the handle doesn't also scroll the page behind the sheet.
  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;
    const onStart = (e) => {
      draggingRef.current = true;
      startYRef.current = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        e.preventDefault();
        dragYRef.current = dy;
        setDragY(dy);
      }
    };
    const onEnd = () => {
      draggingRef.current = false;
      if (dragYRef.current > 80) onClose();
      else setDragY(0);
      dragYRef.current = 0;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [onClose]);

  return (
    <div className="overlay sheet-overlay" onClick={onClose}>
      <div
        className={`popup-card sheet-card ${className || ""}`}
        onClick={e => e.stopPropagation()}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
      >
        <div ref={handleRef} className="sheet-handle" style={{ touchAction: "none" }} />
        {children}
      </div>
    </div>
  );
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #f0ede8;
    --surface: #faf9f7;
    --surface2: #f5f2ed;
    --border: #e8e4df;
    --border2: #e2ddd8;
    --text: #1c1917;
    --text-mid: #57534e;
    --text-muted: #78716c;
    --text-dim: #a8a29e;
    --text-faint: #c4bfba;
    --warn-bg: #fffaf0;
    --warn-border: #fed7aa;
    --safe-top: env(safe-area-inset-top, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
    --safe-left: env(safe-area-inset-left, 0px);
    --safe-right: env(safe-area-inset-right, 0px);
  }
  [data-theme="dark"] {
    --bg: #1c1917;
    --surface: #292524;
    --surface2: #211e1b;
    --border: #44403c;
    --border2: #57534e;
    --text: #faf9f7;
    --text-mid: #e2ddd8;
    --text-muted: #c4bfba;
    --text-dim: #a8a29e;
    --text-faint: #78716c;
    --warn-bg: #241500;
    --warn-border: #78350f;
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
    transition: background-color 130ms ease;
  }
  .slot-cell:hover { background: rgba(37,99,235,0.04) !important; }

  .student-chip {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px 5px 8px;
    border-radius: 8px; border: 1.5px solid transparent;
    cursor: pointer; user-select: none;
    -webkit-user-select: none; -webkit-touch-callout: none;
    transition: box-shadow 0.12s, transform 0.12s, border-color 0.12s;
  }
  .student-chip:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); transform: translateY(-1px); }

  .session-block {
    position: absolute; border-radius: 4px; cursor: pointer;
    overflow: hidden; padding: 4px 6px;
    transition: box-shadow 0.12s;
    border-left: 3px solid transparent;
    -webkit-user-select: none; -webkit-touch-callout: none;
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
  .sheet-handle { display: none; }
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
  @keyframes sheet-slide-up {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .history-modal { max-width: 420px; max-height: 82vh; display: flex; flex-direction: column; }
  .history-list { overflow-y: auto; flex: 1; min-height: 0; }
  .history-row {
    display: flex; align-items: flex-start; gap: 8px; padding: 8px 0;
    border-bottom: 1px solid var(--border);
  }
  .history-row:last-child { border-bottom: none; }

  .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
  .no-scrollbar::-webkit-scrollbar { display: none; }

  @media (max-width: 430px) {
    /* Header clusters become single non-wrapping rows that scroll horizontally
       instead of stacking and eating vertical space on a short iPhone viewport. */
    .app-header-top, .exam-badges, .nav-zoom-row {
      flex-wrap: nowrap !important;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .app-header-top > *, .exam-badges > *, .nav-zoom-row > * { flex-shrink: 0; }
    .mode-switch button { white-space: nowrap; }

    .popup-card { max-width: 100%; padding: 18px; }
    .student-chip { font-size: 11px; }
    .student-chip .chip-name { max-width: 92px; overflow: hidden; text-overflow: ellipsis; }

    /* Apple HIG minimum 44x44 tap target + 8px breathing room between targets, scoped
       to the small icon/toggle/action controls (the compact calendar-grid pills like
       dur-pill are left alone — shrinking those would break the grid layout itself). */
    .iBtn { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
    .toggle-btn { width: 46px; height: 26px; }
    .toggle-btn::after { width: 20px; height: 20px; }
    .toggle-btn.on::after { left: 23px; }
    .toggle-btn.off::after { left: 3px; }
    .save-btn, .del-btn, .cancel-btn-sm, .ghost-btn { min-height: 44px; font-size: 14px; }
    .tab-btn { min-height: 44px; display: inline-flex; align-items: center; }
    .inline-form-row { gap: 8px !important; row-gap: 10px !important; }
    .inline-form-field { font-size: 14px !important; padding: 10px 10px !important; min-height: 44px; }
    .inline-form-btn { font-size: 14px !important; min-height: 44px; padding: 8px 14px !important; }
    .notes-field { min-height: 44px !important; font-size: 14px !important; }
    .popup-card .field-label { font-size: 14px !important; }
    .popup-card .dur-pill { font-size: 14px !important; padding: 8px 13px !important; min-height: 44px; }
    .popup-card input.edit-inp { font-size: 14px !important; padding: 9px 10px !important; }
    .popup-card { font-size: 14px; }

    /* Bottom sheet: popups slide up from the bottom edge instead of centering,
       matching the native iOS action-sheet pattern, with a drag handle to dismiss. */
    .sheet-overlay { align-items: flex-end; padding: 0; }
    .sheet-card {
      max-width: 100%; width: 100%; border-radius: 18px 18px 0 0;
      padding: 10px 18px calc(18px + var(--safe-bottom));
      max-height: 88vh; overflow-y: auto;
      animation: sheet-slide-up 260ms cubic-bezier(0.32, 0.72, 0, 1);
    }
    .sheet-handle {
      display: block; width: 36px; height: 4px; border-radius: 2px;
      background: var(--border2); margin: 2px auto 14px; flex-shrink: 0;
    }

    .planner-root { flex-direction: column; height: auto !important; }
    .planner-sidebar { width: 100% !important; max-height: 220px; border-right: none !important; border-bottom: 1px solid var(--border); }
  }

  .task-row:hover { background: var(--surface2); border-radius: 6px; }
`;

export default function App() {
  return (
    <>
      <SignedOut>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 16 }}>
          <SignIn
            appearance={{
              elements: {
                header: { display: "none" },
                socialButtons: { display: "none" },
                dividerRow: { display: "none" },
              },
            }}
          />
        </div>
      </SignedOut>
      <SignedIn>
        <TutorApp />
      </SignedIn>
    </>
  );
}

function TutorApp() {
  const initial = useRef(loadState());
  const [students, setStudents] = useState(() => initial.current.students || DEFAULT_STUDENTS);
  const [sessions, setSessions] = useState(() => initial.current.sessions || []);
  const [nextId, setNextId] = useState(() => initial.current.nextId || 3);
  const [tab, setTab] = useState("schedule");
  const [popup, setPopup] = useState(null);
  const [newDraft, setNewDraft] = useState(null); // { studentId, duration, day, slot } — confirm-before-create for a dropped chip
  const [chipDurations, setChipDurations] = useState({});
  // appMode: "calendar" | "planner" — the outer switch. Inside calendar, calendarMode
  // is a 3-way sub-choice: "general" (both calendars combined, view-only) or a filtered
  // "tutor"/"personal" view — clicking an already-active filter returns to "general".
  const [appMode, setAppMode] = useState(() => initial.current.appMode || "calendar");
  const [calendarMode, setCalendarMode] = useState(() => initial.current.calendarMode || "general");
  const [personalEvents, setPersonalEvents] = useState(() => initial.current.personalEvents || []);
  const [examDates, setExamDates] = useState(() => initial.current.examDates || { oge: "", ege: "" });
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(() => initial.current.darkMode || false);
  const [taxMode, setTaxMode] = useState(() => initial.current.taxMode || "sz"); // "sz" (самозанятый, 4%) | "ip" (ИП УСН 6%)
  const [tasks, setTasks] = useState(() => initial.current.tasks || []);
  const [taskProjects, setTaskProjects] = useState(() => initial.current.taskProjects || [
    { id: 1, name: "Ученики", color: "#d97706" },
    { id: 2, name: "Личное", color: "#059669" },
  ]);
  const [nextTaskId, setNextTaskId] = useState(() => initial.current.nextTaskId || 1);
  const [nextProjectId, setNextProjectId] = useState(() => initial.current.nextProjectId || 3);
  const { session } = useSession();
  const { user } = useUser();
  const supabase = useMemo(() => createClerkSupabaseClient(session), [session]);
  const hydratedRef = useRef(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  // On a phone-width viewport the 7-column week grid is unreadable, so start on Day —
  // desktop/tablet still default to Week as before.
  const [calendarZoom, setCalendarZoom] = useState(() => (typeof window !== "undefined" && window.innerWidth < 430 ? "day" : "week")); // "day" | "week" | "month"
  const [selectedDayIdx, setSelectedDayIdx] = useState(() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; });

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
  const swipeDayHandlers = useSwipeDay(calendarZoom === "day", goPrevWeek, goNextWeek);

  // Pull this account's data from Supabase once on sign-in, before any local
  // state gets written back up — otherwise the pre-hydration defaults would
  // clobber whatever's already saved in the cloud for this user.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("app_data").select("data").eq("user_id", user.id).maybeSingle();
      if (cancelled) return;
      if (error) console.error("Supabase load error:", error);
      const d = data?.data;
      if (d) {
        if (d.students) setStudents(d.students);
        if (d.sessions) setSessions(d.sessions);
        if (d.nextId) setNextId(d.nextId);
        if (d.calendarMode) setCalendarMode(d.calendarMode);
        if (d.personalEvents) setPersonalEvents(d.personalEvents);
        if (d.examDates) setExamDates(d.examDates);
        if (d.darkMode !== undefined) setDarkMode(d.darkMode);
        if (d.appMode) setAppMode(d.appMode);
        if (d.tasks) setTasks(d.tasks);
        if (d.taskProjects) setTaskProjects(d.taskProjects);
        if (d.nextTaskId) setNextTaskId(d.nextTaskId);
        if (d.nextProjectId) setNextProjectId(d.nextProjectId);
        if (d.taxMode) setTaxMode(d.taxMode);
      }
      hydratedRef.current = true;
      setCloudReady(true);
    })();
    return () => { cancelled = true; };
  }, [user?.id, supabase]);

  const syncTimerRef = useRef(null);
  useEffect(() => {
    const snapshot = {
      students, sessions, nextId, calendarMode, personalEvents, examDates, darkMode,
      appMode, tasks, taskProjects, nextTaskId, nextProjectId, taxMode,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch {}

    if (!hydratedRef.current || !user?.id) return;
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      supabase.from("app_data")
        .upsert({ user_id: user.id, data: snapshot, updated_at: new Date().toISOString() })
        .then(({ error }) => { if (error) console.error("Supabase sync error:", error); });
    }, 800);
    return () => clearTimeout(syncTimerRef.current);
  }, [students, sessions, nextId, calendarMode, personalEvents, examDates, darkMode, appMode, tasks, taskProjects, nextTaskId, nextProjectId, taxMode, cloudReady, user?.id, supabase]);

  // Task CRUD for the planner
  const addTask = (data) => { setTasks(prev => [...prev, { id: nextTaskId, done: false, doneAt: null, dueDate: null, priority: 0, projectId: null, list: "inbox", notes: "", createdAt: isoDate(new Date()), ...data }]); setNextTaskId(n => n + 1); };
  const updateTask = (id, ch) => setTasks(prev => prev.map(t => t.id === id ? { ...t, ...ch } : t));
  const toggleTaskDone = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? isoDate(new Date()) : null } : t));
  const deleteTask = (id) => setTasks(prev => prev.filter(t => t.id !== id));
  const addTaskProject = (name) => { const id = nextProjectId; setTaskProjects(prev => [...prev, { id, name, color: PALETTE[prev.length % PALETTE.length].accent }]); setNextProjectId(n => n + 1); return id; };
  const deleteTaskProject = (id) => { setTaskProjects(prev => prev.filter(p => p.id !== id)); setTasks(prev => prev.map(t => t.projectId === id ? { ...t, projectId: null } : t)); };

  // Tapping an empty grid cell opens the create-session sheet; defaults to the
  // last student picked (or the first active one) so repeat entry is quick, but
  // the sheet always shows a picker to confirm/change who it's actually for.
  const [lastPickedStudentId, setLastPickedStudentId] = useState(null);
  const openNewSessionAt = (day, slot) => {
    const active = students.filter(s => s.active && !s.archived);
    if (!active.length) return;
    const pick = active.find(s => s.id === lastPickedStudentId) || active[0];
    setNewDraft({ studentId: pick.id, duration: pick.sessionDuration || 1, day, slot });
  };

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
  const archiveStudent = (id) => {
    const today = new Date().toISOString().slice(0, 10);
    setStudents(prev => prev.map(s => s.id === id ? { ...s, archived: true, active: false, endDate: s.endDate || today } : s));
    setSessions(prev => prev.filter(s => s.studentId !== id));
  };
  const unarchiveStudent = (id) => { setStudents(prev => prev.map(s => s.id === id ? { ...s, archived: false } : s)); };
  // LTV is a hybrid: an estimate (weekly hours × rate) only for the historical
  // gap between the real-world start date and the first lesson actually logged
  // in the app — that gap is the only period with no record at all — plus the
  // exact sum of every logged lesson from then on, one at a time as they're
  // marked done. Without a start date, it's just the logged-lesson sum.
  const getStudentLTV = (s) => {
    const loggedLessons = (s.history || []).filter(h => h.type === "lesson");
    const loggedLTV = loggedLessons.length * s.rate * s.sessionDuration;
    if (!s.startDate) return loggedLTV;

    const earliestLogged = loggedLessons.reduce((min, h) => (!min || h.date < min ? h.date : min), null);
    const gapEnd = earliestLogged || s.endDate || isoDate(new Date());
    const gapWeeks = weeksBetween(s.startDate, gapEnd);
    const estimatedGapLTV = Math.round(gapWeeks * (s.weeklyHours || 0) * s.rate);
    return estimatedGapLTV + loggedLTV;
  };
  // "Заработано" — сумма за уже отмеченные проведённые занятия в этом месяце.
  // "План" — прогноз по расписанию: сколько принесут все занятия (регулярные и
  // разовые), которые попадают в текущий месяц, если пройдут как запланировано.
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

    let earned = 0;
    students.forEach(s => {
      (s.history || []).forEach(h => {
        if (h.type === "lesson" && h.date && h.date.startsWith(monthPrefix)) {
          earned += (s.rate || 0) * (s.sessionDuration || 1);
        }
      });
    });

    let planned = 0;
    sessions.forEach(sess => {
      const student = students.find(s => s.id === sess.studentId);
      if (!student || !student.active) return;
      const price = (student.rate || 0) * (sess.duration || student.sessionDuration || 1);
      if (sess.recurring === false) {
        if (sess.date && sess.date.startsWith(monthPrefix)) planned += price;
      } else {
        planned += price * weekdayOccurrencesInMonth(year, month, sess.day);
      }
    });

    // Самозанятый: 4% при работе с физлицами — точная сумма за месяц (НПД
    // платится помесячно с фактических поступлений). ИП на УСН «доходы»: 6%,
    // но это без учёта фиксированных страховых взносов за себя (~57 390 ₽/год +
    // 1% с дохода свыше 300 000 ₽/год) — их можно полностью вычесть из налога,
    // но т.к. это годовая, а не помесячная сумма, здесь показываем налог без
    // вычета и отдельно предупреждаем об этом в интерфейсе.
    const taxRate = taxMode === "ip" ? 0.06 : 0.04;
    const tax = Math.round(earned * taxRate);

    return { earned, planned, tax, taxRate };
  }, [students, sessions, taxMode]);

  const updateStudent = (id, ch) => setStudents(prev => prev.map(s => s.id === id ? { ...s, ...ch } : s));
  const addStudent = (data) => { setStudents(prev => [...prev, { id: nextId, ...data, active: true }]); setNextId(n => n + 1); };
  // Batch-assigns ids in one go — calling addStudent() in a loop would reuse
  // the same stale nextId for every row, since setState hasn't flushed yet.
  const importStudents = (rows) => {
    const startId = nextId;
    setStudents(prev => [...prev, ...rows.map((r, i) => ({ id: startId + i, ...r }))]);
    setNextId(startId + rows.length);
  };
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
    <div data-theme={darkMode ? "dark" : "light"} style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text)", fontFamily: "'Manrope', sans-serif", paddingBottom: "var(--safe-bottom)", paddingLeft: "var(--safe-left)", paddingRight: "var(--safe-right)" }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "calc(14px + var(--safe-top)) 14px 0", display: "flex", flexDirection: "column" }}>
        <div className="app-header-top" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span className="app-title-group" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)" }}>Параллелка</span>
            <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>
              {appMode === "planner" ? "планер" : calendarMode === "general" ? "общий календарь" : calendarMode === "tutor" ? "репетиторство" : "личное"}
            </span>
          </span>

          {/* Outer switch: Календарь / Планер */}
          <div className="mode-switch" style={{ display: "flex", gap: 2, marginLeft: "auto", background: "var(--bg)", borderRadius: 8, padding: 2 }}>
            <button onClick={() => setAppMode("calendar")} style={{ fontSize: 11, fontFamily: "'Manrope', sans-serif", fontWeight: 600, padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", background: appMode === "calendar" ? "var(--surface)" : "transparent", color: appMode === "calendar" ? "var(--text)" : "var(--text-dim)", boxShadow: appMode === "calendar" ? "0 1px 2px rgba(0,0,0,0.08)" : "none", whiteSpace: "nowrap" }}>
              📅 Календарь
            </button>
            <button onClick={() => setAppMode("planner")} style={{ fontSize: 11, fontFamily: "'Manrope', sans-serif", fontWeight: 600, padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", background: appMode === "planner" ? "var(--surface)" : "transparent", color: appMode === "planner" ? "var(--text)" : "var(--text-dim)", boxShadow: appMode === "planner" ? "0 1px 2px rgba(0,0,0,0.08)" : "none", whiteSpace: "nowrap" }}>
              📋 Планер
            </button>
          </div>

          <div className="header-icon-btns" style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => setShowSettings(true)} title="Настройки: даты экзаменов" style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: "var(--text-dim)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              ⚙
            </button>
            <button onClick={() => setDarkMode(d => !d)} title={darkMode ? "Светлая тема" : "Тёмная тема"} style={{ background: "none", border: "1px solid var(--border2)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: "var(--text-dim)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {darkMode ? "☀" : "🌙"}
            </button>
            <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: { width: 28, height: 28 } } }} />
          </div>
        </div>

        {/* Inner switch: Общий / Репетиторство / Личное — clicking the already-active
            filter again returns to the combined "Общий" view. */}
        {appMode === "calendar" && (
          <div className="nav-zoom-row" style={{ display: "flex", gap: 2, background: "var(--bg)", borderRadius: 8, padding: 2, marginBottom: 10, alignSelf: "flex-start" }}>
            {[["general", "🔀 Общий"], ["tutor", "📚 Репетиторство"], ["personal", "🗓 Личное"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setCalendarMode(m => (m === key && key !== "general" ? "general" : key))}
                style={{ fontSize: 11, fontFamily: "'Manrope', sans-serif", fontWeight: 600, padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", background: calendarMode === key ? "var(--surface)" : "transparent", color: calendarMode === key ? "var(--text)" : "var(--text-dim)", boxShadow: calendarMode === key ? "0 1px 2px rgba(0,0,0,0.08)" : "none", whiteSpace: "nowrap" }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Exam countdown */}
        {appMode === "calendar" && (examDates.oge || examDates.ege) && (
          <div className="exam-badges" style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
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

        {appMode === "calendar" && calendarMode === "tutor" && (
          <div style={{ display: "flex" }}>
            <button className={`tab-btn ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>Расписание</button>
            <button className={`tab-btn ${tab === "students" ? "active" : ""}`} onClick={() => setTab("students")}>Ученики ({students.length})</button>
          </div>
        )}
      </div>

      {/* Settings modal */}
      {showSettings && (
        <Sheet onClose={() => setShowSettings(false)}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Настройки</div>
          <div style={{ marginBottom: 12 }}>
            <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Дата ОГЭ</div>
            <input className="edit-inp" type="date" style={{ width: "100%", fontSize: 14, padding: "9px 10px" }} value={examDates.oge} onChange={e => setExamDate("oge", e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Дата ЕГЭ</div>
            <input className="edit-inp" type="date" style={{ width: "100%", fontSize: 14, padding: "9px 10px" }} value={examDates.ege} onChange={e => setExamDate("ege", e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Налоговый режим</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className={`dur-pill ${taxMode === "sz" ? "sel" : ""}`} style={{ flex: 1 }} onClick={() => setTaxMode("sz")}>Самозанятый (4%)</button>
              <button className={`dur-pill ${taxMode === "ip" ? "sel" : ""}`} style={{ flex: 1 }} onClick={() => setTaxMode("ip")}>ИП, УСН (6%)</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6, lineHeight: 1.4 }}>
              {taxMode === "sz"
                ? "Ставка для работы с физлицами (родители/ученики). С юрлицами — 6%."
                : "Без учёта фиксированных страховых взносов за себя (~57 390 ₽/год + 1% с дохода свыше 300 000 ₽) — их можно вычесть из налога УСН, но это годовая сумма, посчитать точно по месяцу нельзя."}
            </div>
          </div>
          <button className="save-btn" style={{ width: "100%" }} onClick={() => setShowSettings(false)}>Готово</button>
        </Sheet>
      )}

      {appMode === "calendar" && <>
      {/* Payment alerts banner */}
      {(() => {
        const alerts = students
          .filter(s => s.active)
          .map(s => ({ s, status: getPaymentStatus(s) }))
          .filter(x => x.status === "overdue" || x.status === "soon")
          .sort((a, b) => (a.status === "overdue" ? 0 : 1) - (b.status === "overdue" ? 0 : 1));
        if (!alerts.length) return null;
        return (
          <div style={{ background: "var(--warn-bg)", borderBottom: "1px solid var(--warn-border)", padding: "9px 16px", display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
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
      {(calendarMode === "general" || calendarMode === "personal" || (calendarMode === "tutor" && tab === "schedule")) && (
        <div className="nav-zoom-row" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "8px 16px", background: "var(--surface)", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
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

      {((calendarMode === "tutor" && tab === "schedule") || calendarMode === "personal" || calendarMode === "general") && calendarZoom === "month" && (
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
                const today = isToday(d);
                const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
                const dayEvents = eventsVisibleInWeek(sessions, getMonday(d)).filter(e => e.day === dayIdx);
                const pEvents = eventsVisibleInWeek(personalEvents, getMonday(d)).filter(e => e.day === dayIdx);
                cells.push(
                  <div key={i} onClick={() => { setSelectedDayIdx(dayIdx); setWeekStart(getMonday(d)); setCalendarZoom("day"); }}
                    style={{ minHeight: 60, background: today ? "rgba(37,99,235,0.08)" : inMonth ? "var(--surface)" : "var(--bg)", border: today ? "1.5px solid #2563eb" : "1px solid var(--border)", borderRadius: 6, padding: "4px 5px", cursor: "pointer", opacity: inMonth ? 1 : 0.5 }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: today ? "white" : "var(--text-mid)", marginBottom: 3, ...(today ? { background: "#2563eb", width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" } : {}) }}>{d.getDate()}</div>
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

      {calendarMode === "general" && calendarZoom !== "month" && (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 168px)" }}>
          <div className="hint-bar">
            <span>👁</span>
            <span>Общий обзор: слева — занятия, справа — личное · Только просмотр, редактируй во вкладках выше</span>
          </div>
          <div style={{ flex: 1, overflow: "auto", background: "var(--surface2)", WebkitOverflowScrolling: "touch" }} {...swipeDayHandlers}>
            <div style={{ display: "flex", minWidth: 500 }}>
              <div style={{ width: 44, flexShrink: 0, borderRight: "1px solid var(--border)", paddingTop: 28, background: "var(--surface)" }}>
                {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                  <div key={i} style={{ height: SLOT_HEIGHT, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 7, paddingTop: 2 }}>
                    {i % 2 === 0 && <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{slotToTime(i)}</span>}
                  </div>
                ))}
              </div>
              {visibleDays.map(dayIdx => { const today = isToday(addDays(weekStart, dayIdx)); return (
                <div key={dayIdx} style={{ flex: 1, minWidth: 0, borderRight: "1px solid var(--border)" }}>
                  <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 11, fontWeight: 600, color: today ? "#2563eb" : "var(--text-dim)", borderBottom: today ? "2px solid #2563eb" : "1px solid var(--border)", background: today ? "rgba(37,99,235,0.08)" : "var(--surface)", position: "sticky", top: 0, zIndex: 2, letterSpacing: "0.05em" }}>
                    {DAYS[dayIdx]} <span style={today ? { fontWeight: 700, color: "white", fontSize: 10, background: "#2563eb", borderRadius: "50%", width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } : { fontWeight: 400, color: "var(--text-faint)", fontSize: 10 }}>{addDays(weekStart, dayIdx).getDate()}</span>
                  </div>
                  <div style={{ position: "relative", height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                    {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => (
                      <div key={slotIdx} className="slot-cell" style={{ top: slotIdx * SLOT_HEIGHT, height: SLOT_HEIGHT, borderBottom: `1px solid ${slotIdx % 2 === 1 ? "var(--border2)" : "var(--border)"}`, cursor: "default" }} />
                    ))}
                    <div style={{ position: "absolute", top: 0, left: "50%", bottom: 0, width: 1, background: "var(--border)", opacity: 0.6 }} />
                    {dayLayouts[dayIdx]?.map(s => {
                      const student = students.find(st => st.id === s.studentId);
                      if (!student) return null;
                      const c = getColor(s.studentId);
                      const height = s.duration * 2 * SLOT_HEIGHT;
                      const laneW = 48 / s.totalCols;
                      return (
                        <div key={"t" + s.id} className="session-block" title={`📚 ${student.name} · ${slotToTime(s.startSlot)}–${slotToTime(s.startSlot + s.duration * 2)}`}
                          style={{ top: s.startSlot * SLOT_HEIGHT + 1, left: `${s.col * laneW + 0.5}%`, width: `${laneW - 1}%`, height: height - 2, background: c.bg, borderLeftColor: c.accent, zIndex: 2, cursor: "default" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📚 {student.name.split(" ")[0]}</div>
                        </div>
                      );
                    })}
                    {personalDayLayouts[dayIdx]?.map(ev => {
                      const c = PALETTE[ev.colorIdx ?? 0];
                      const height = ev.duration * 2 * SLOT_HEIGHT;
                      const laneW = 48 / ev.totalCols;
                      return (
                        <div key={"p" + ev.id} className="session-block" title={`🗓 ${ev.title} · ${slotToTime(ev.startSlot)}–${slotToTime(ev.startSlot + ev.duration * 2)}`}
                          style={{ top: ev.startSlot * SLOT_HEIGHT + 1, left: `${50 + ev.col * laneW + 0.5}%`, width: `${laneW - 1}%`, height: height - 2, background: c.bg, borderLeftColor: c.accent, zIndex: 2, cursor: "default" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🗓 {ev.title}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ); })}
            </div>
          </div>
        </div>
      )}

      {calendarMode === "tutor" && tab === "schedule" && calendarZoom !== "month" && (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 126px)" }}>

          {/* Chips legend — tap a chip to pick who the next tapped cell is for */}
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
              const picked = lastPickedStudentId === s.id;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    className="student-chip"
                    title="Тапни, чтобы выбрать — следующая пустая ячейка создаст занятие для этого ученика"
                    style={{ background: c.bg, borderColor: picked ? c.accent : (done ? c.border : "var(--border2)"), boxShadow: picked ? `0 0 0 2px ${c.accent}55` : "none" }}
                    onClick={() => setLastPickedStudentId(s.id)}
                  >
                    {payStatus && <span title={payStatus === "overdue" ? "Нужно оплатить" : payStatus === "soon" ? "Осталось последнее занятие" : "Оплачено"} style={{ width: 7, height: 7, borderRadius: "50%", background: sc.dot, display: "inline-block", flexShrink: 0, boxShadow: "0 0 0 2px white" }} />}
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.accent, display: "inline-block", flexShrink: 0 }} />
                    <span className="chip-name" style={{ fontSize: 12, fontWeight: 600, color: c.text, whiteSpace: "nowrap" }}>{s.name}</span>
                    <span title={done ? "Все занятия на неделю расставлены" : `Расставлено ${placed} из ${target}`} style={{ fontSize: 10, fontWeight: done ? 700 : 400, color: done ? "#065f46" : "var(--text-faint)", background: done ? "#d1fae5" : "var(--surface2)", border: done ? "1px solid #6ee7b7" : "1px solid transparent", padding: "0 5px", borderRadius: 3, fontFamily: "'JetBrains Mono', monospace" }}>
                      {done ? "✓ " : ""}{placed}/{target}
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
            <span>Тапни пустую ячейку — создать занятие · Тапни занятие — открыть детали</span>
          </div>

          {/* Calendar grid */}
          <div style={{ flex: 1, overflow: "auto", background: "var(--surface2)", WebkitOverflowScrolling: "touch" }}
            {...swipeDayHandlers}
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
              {visibleDays.map(dayIdx => { const dayLabel = DAYS[dayIdx]; const today = isToday(addDays(weekStart, dayIdx)); return (
                <div key={dayIdx} style={{ flex: 1, minWidth: 0, borderRight: "1px solid var(--border)" }}>
                  <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 11, fontWeight: 600, color: today ? "#2563eb" : "var(--text-dim)", borderBottom: today ? "2px solid #2563eb" : "1px solid var(--border)", background: today ? "rgba(37,99,235,0.08)" : "var(--surface)", position: "sticky", top: 0, zIndex: 2, letterSpacing: "0.05em" }}>
                    {dayLabel} <span style={today ? { fontWeight: 700, color: "white", fontSize: 10, background: "#2563eb", borderRadius: "50%", width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } : { fontWeight: 400, color: "var(--text-faint)", fontSize: 10 }}>{addDays(weekStart, dayIdx).getDate()}</span>
                  </div>

                  <div style={{ position: "relative", height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                    {/* Slot cells — tap an empty one to create a session here */}
                    {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => (
                      <div
                        key={slotIdx}
                        className="slot-cell"
                        style={{
                          top: slotIdx * SLOT_HEIGHT, height: SLOT_HEIGHT,
                          borderBottom: `1px solid ${slotIdx % 2 === 1 ? "var(--border2)" : "var(--border)"}`,
                        }}
                        onClick={() => openNewSessionAt(dayIdx, slotIdx)}
                      />
                    ))}

                    {/* Ghost blocks from personal calendar */}
                    {personalDayLayouts[dayIdx]?.map(ev => {
                      const c = PALETTE[ev.colorIdx ?? 0];
                      const height = ev.duration * 2 * SLOT_HEIGHT;
                      const timeRange = `${slotToTime(ev.startSlot)}–${slotToTime(ev.startSlot + ev.duration * 2)}`;
                      return (
                        <div key={"ghost-" + ev.id} title={`🗓 ${ev.title} · ${timeRange}`} style={{ position: "absolute", top: ev.startSlot * SLOT_HEIGHT + 1, left: "1%", width: "98%", height: height - 2, background: `${c.bg}66`, borderLeft: `2px dashed ${c.border}`, borderRadius: 4, padding: "3px 6px", zIndex: 1, opacity: 0.5 }}>
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
                          // Only show the rate badge in the single-day (full-width) view — in
                          // week view the column is too narrow for both, and the name always
                          // wins (this is also what was silently squeezing the name to 0 width).
                          const showRate = visibleDays.length === 1 && height > 44;
                          elements.push(
                            <div key={s.id} className="session-block"
                              style={{ top: s.startSlot * SLOT_HEIGHT + 1, left: "1%", width: "98%", height: height - 2, background: c.bg, borderLeftColor: c.accent, zIndex: 3, cursor: "pointer" }}
                              onClick={() => setPopup({ type: "session", session: s })}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.accent, flexShrink: 0, display: "inline-block" }} />
                                <span style={{ fontSize: 11, fontWeight: 700, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{s.recurring === false && "1× "}{student.name}</span>
                                {showRate && <span style={{ fontSize: 9, color: c.accent, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{s.duration}ч · {student.rate.toLocaleString()}₽</span>}
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
                                return (
                                  <div key={s.id} className="session-block"
                                    style={{ position: "absolute", top: laneTop, left: `${i * laneW + 0.4}%`, width: `${laneW - 0.8}%`, height: laneHeight - 1, background: c.bg, borderLeft: `3px solid ${c.accent}`, borderRight: i < group.length - 1 ? `1px solid ${c.border}55` : "none", borderRadius: i === 0 ? "0 0 0 4px" : i === group.length-1 ? "0 0 4px 0" : "0", cursor: "pointer", padding: "3px 5px", overflow: "hidden", pointerEvents: "auto" }}
                                    onClick={e => { e.stopPropagation(); setPopup({ type: "session", session: s }); }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.accent, flexShrink: 0, display: "inline-block" }} />
                                      <span style={{ fontSize: 10, fontWeight: 700, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{s.recurring === false && "1× "}{student.name.split(" ")[0]}</span>
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

          {/* Confirm-before-create — shows which student is picked prominently, with a
              picker to change it, before the session is actually added. */}
          {newDraft && (() => {
            return (
              <NewSessionPopup
                draft={newDraft} students={activeStudents} getColor={getColor} weekStart={weekStart}
                onCreate={(studentId, duration, fields) => {
                  setSessions(prev => [...prev, { id: Date.now(), studentId, duration, ...fields }]);
                  setLastPickedStudentId(studentId);
                  setNewDraft(null);
                }}
                onCancel={() => setNewDraft(null)}
              />
            );
          })()}
        </div>
      )}

      {calendarMode === "tutor" && tab === "students" && (
        <StudentsTab
          students={students} getColor={getColor} getTarget={getTarget} getPlaced={getPlaced}
          toggleActive={toggleActive} deleteStudent={deleteStudent}
          updateStudent={updateStudent} addStudent={addStudent} importStudents={importStudents}
          addLessons={addLessons} markLessonDone={markLessonDone} deleteHistoryEvent={deleteHistoryEvent}
          archiveStudent={archiveStudent} unarchiveStudent={unarchiveStudent} getStudentLTV={getStudentLTV}
          monthlyStats={monthlyStats}
        />
      )}

      {calendarMode === "personal" && calendarZoom !== "month" && (
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
          calendarZoom={calendarZoom}
          goPrevWeek={goPrevWeek}
          goNextWeek={goNextWeek}
        />
      )}
      </>}

      {appMode === "planner" && (
        <PlannerTab
          tasks={tasks} projects={taskProjects}
          addTask={addTask} updateTask={updateTask} toggleTaskDone={toggleTaskDone} deleteTask={deleteTask}
          addProject={addTaskProject} deleteProject={deleteTaskProject}
        />
      )}
    </div>
  );
}

function RecurrenceControl({ recurring, date, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
  const [day, setDay] = useState(sess.day);
  const c = color;

  const handleRecChange = (rec, d) => {
    setRecurring(rec);
    setDate(d);
  };

  const save = () => {
    const newSlot = timeToSlot(startTime);
    if (recurring) onUpdate({ recurring: true, date: undefined, day, startSlot: newSlot });
    else onUpdate({ recurring: false, date, day: weekdayFromIso(date), startSlot: newSlot });
  };

  return (
    <Sheet onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: c.bg, border: `1.5px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.accent, display: "inline-block" }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{student.name}</div>
          <div className="field-label" style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 1, textTransform: "none", letterSpacing: 0 }}>
            {DAYS[sess.day]}, {slotToTime(sess.startSlot)}–{slotToTime(sess.startSlot + sess.duration * 2)} · {sess.duration}ч
          </div>
        </div>
      </div>
      <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 14, padding: "10px 11px", background: "var(--surface2)", borderRadius: 7, display: "flex", justifyContent: "space-between" }}>
        <span>{student.subject}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{(student.rate * sess.duration).toLocaleString()} ₽</span>
      </div>

      {recurring && (
        <div style={{ marginBottom: 14 }}>
          <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>День недели</div>
          <DayOfWeekPicker day={day} onChange={setDay} />
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Точное время начала</div>
        <input className="edit-inp" type="time" style={{ width: 130, fontSize: 14, padding: "8px 10px" }} value={startTime} onChange={e => setStartTime(e.target.value)} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Повторение</div>
        <RecurrenceControl recurring={recurring} date={date} onChange={handleRecChange} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <MarkDoneInput label="Занятие прошло, списать −1" onMark={onMarkDone} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="save-btn" style={{ flex: 1 }} onClick={save}>Сохранить</button>
        <button className="del-btn" style={{ width: "auto", padding: "9px 14px" }} onClick={onDelete}>Удалить</button>
      </div>
    </Sheet>
  );
}

// Confirmation step for a brand-new session dropped from the student chip. Mirrors
// SessionPopup's header (color swatch + bold name) so the student is unmistakable
// before anything is actually saved — the drag gesture alone doesn't make that clear
// on a phone, since the finger covers the chip the whole time.
function DayOfWeekPicker({ day, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {DAYS.map((label, i) => (
        <button key={i} className={`dur-pill ${day === i ? "sel" : ""}`} onClick={() => onChange(i)}>{label}</button>
      ))}
    </div>
  );
}

function NewSessionPopup({ draft, students, getColor, weekStart, onCreate, onCancel }) {
  const [studentId, setStudentId] = useState(draft.studentId);
  const [duration, setDuration] = useState(draft.duration);
  const [day, setDay] = useState(draft.day);
  const [recurring, setRecurring] = useState(true);
  const [date, setDate] = useState(isoDate(addDays(weekStart, draft.day)));
  const [startTime, setStartTime] = useState(slotToTime(draft.slot));

  const student = students.find(s => s.id === studentId) || students[0];
  if (!student) return null;
  const c = getColor(student.id);

  const pickStudent = (s) => {
    setStudentId(s.id);
    setDuration(s.sessionDuration || 1);
  };

  const handleRecChange = (rec, d) => {
    setRecurring(rec);
    setDate(d);
  };

  const create = () => {
    const slot = timeToSlot(startTime);
    if (recurring) onCreate(student.id, duration, { recurring: true, date: undefined, day, startSlot: slot });
    else onCreate(student.id, duration, { recurring: false, date, day: weekdayFromIso(date), startSlot: slot });
  };

  return (
    <Sheet onClose={onCancel}>
      <div className="field-label" style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10, textTransform: "none", letterSpacing: 0 }}>
        Новое занятие
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "10px 12px", background: c.bg, borderRadius: 10, border: `1.5px solid ${c.border}` }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: c.light, border: `1.5px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.accent, display: "inline-block" }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{student.name}</div>
          <div style={{ fontSize: 13, color: c.text, opacity: 0.85, marginTop: 1 }}>{student.subject} · {(student.rate * duration).toLocaleString()} ₽</div>
        </div>
      </div>

      {students.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Другой ученик</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {students.filter(s => s.id !== student.id).map(s => {
              const sc = getColor(s.id);
              return (
                <button key={s.id} onClick={() => pickStudent(s)} className="dur-pill" style={{ borderColor: sc.border, color: sc.text, background: sc.bg }}>
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Длительность</div>
        <div style={{ display: "flex", gap: 6 }}>
          {DURATIONS.map(d => <button key={d} className={`dur-pill ${duration === d ? "sel" : ""}`} onClick={() => setDuration(d)}>{d}ч</button>)}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>День недели</div>
        <DayOfWeekPicker day={day} onChange={setDay} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Точное время начала</div>
        <input className="edit-inp" type="time" style={{ width: 130, fontSize: 14, padding: "8px 10px" }} value={startTime} onChange={e => setStartTime(e.target.value)} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Повторение</div>
        <RecurrenceControl recurring={recurring} date={date} onChange={handleRecChange} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="save-btn" style={{ flex: 1 }} onClick={create}>Создать занятие</button>
        <button className="cancel-btn-sm" onClick={onCancel}>Отмена</button>
      </div>
    </Sheet>
  );
}

function PersonalCalendarTab({ events, dayLayouts, weekStart, onAdd, onUpdate, onDelete, ghostLayouts, ghostStudents, ghostGetColor, visibleDays, calendarZoom, goPrevWeek, goNextWeek }) {
  const [popup, setPopup] = useState(null);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(1);
  const [colorIdx, setColorIdx] = useState(0);
  const [day, setDay] = useState(0);
  const [recurring, setRecurring] = useState(true);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");

  const openNew = (d, slot) => {
    setTitle(""); setDuration(1); setColorIdx(0); setDay(d);
    setRecurring(true); setDate(isoDate(addDays(weekStart, d)));
    setStartTime(slotToTime(slot));
    setPopup({ type: "new", day: d, slot });
  };
  const openEdit = (ev) => {
    setTitle(ev.title); setDuration(ev.duration); setColorIdx(ev.colorIdx ?? 0); setDay(ev.day);
    setRecurring(ev.recurring !== false);
    setDate(ev.date || isoDate(addDays(weekStart, ev.day)));
    setStartTime(slotToTime(ev.startSlot));
    setPopup({ type: "edit", event: ev });
  };

  const handleRecChange = (rec, d) => { setRecurring(rec); setDate(d); };
  const swipeDayHandlers = useSwipeDay(calendarZoom === "day", goPrevWeek, goNextWeek);

  const submit = () => {
    if (!title.trim()) return;
    const slot = timeToSlot(startTime);
    if (slot + duration * 2 > TOTAL_SLOTS || slot < 0) return;
    const recFields = recurring ? { recurring: true, date: undefined } : { recurring: false, date };
    const effectiveDay = recurring ? day : weekdayFromIso(date);
    if (popup.type === "new") {
      onAdd({ day: effectiveDay, startSlot: slot, duration, title: title.trim(), colorIdx, ...recFields });
    } else {
      onUpdate(popup.event.id, { title: title.trim(), duration, colorIdx, day: effectiveDay, startSlot: slot, ...recFields });
    }
    setPopup(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)" }}>
      {/* Hint */}
      <div className="hint-bar">
        <span>☝</span>
        <span>Тапни пустое место — добавить · Тапни событие — открыть детали</span>
      </div>

      <div style={{ flex: 1, overflow: "auto", background: "var(--surface2)", WebkitOverflowScrolling: "touch" }}
        {...swipeDayHandlers}
      >
        <div style={{ display: "flex", minWidth: 500 }}>
          <div style={{ width: 44, flexShrink: 0, borderRight: "1px solid var(--border)", paddingTop: 28, background: "var(--surface)" }}>
            {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
              <div key={i} style={{ height: SLOT_HEIGHT, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 7, paddingTop: 2 }}>
                {i % 2 === 0 && <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{slotToTime(i)}</span>}
              </div>
            ))}
          </div>

          {visibleDays.map(dayIdx => { const dayLabel = DAYS[dayIdx]; const today = isToday(addDays(weekStart, dayIdx)); return (
            <div key={dayIdx} style={{ flex: 1, minWidth: 0, borderRight: "1px solid var(--border)" }}>
              <div style={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 11, fontWeight: 600, color: today ? "#2563eb" : "var(--text-dim)", borderBottom: today ? "2px solid #2563eb" : "1px solid var(--border)", background: today ? "rgba(37,99,235,0.08)" : "var(--surface)", position: "sticky", top: 0, zIndex: 2, letterSpacing: "0.05em" }}>
                {dayLabel} <span style={today ? { fontWeight: 700, color: "white", fontSize: 10, background: "#2563eb", borderRadius: "50%", width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } : { fontWeight: 400, color: "var(--text-faint)", fontSize: 10 }}>{addDays(weekStart, dayIdx).getDate()}</span>
              </div>
              <div style={{ position: "relative", height: TOTAL_SLOTS * SLOT_HEIGHT }}>
                {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => (
                  <div key={slotIdx}
                    className="slot-cell"
                    style={{ top: slotIdx * SLOT_HEIGHT, height: SLOT_HEIGHT, borderBottom: `1px solid ${slotIdx % 2 === 1 ? "var(--border2)" : "var(--border)"}` }}
                    onClick={() => openNew(dayIdx, slotIdx)}
                  />
                ))}

                {/* Ghost blocks from tutor calendar */}
                {ghostLayouts[dayIdx]?.map(sess => {
                  const student = ghostStudents.find(st => st.id === sess.studentId);
                  if (!student) return null;
                  const c = ghostGetColor(sess.studentId);
                  const height = sess.duration * 2 * SLOT_HEIGHT;
                  const timeRange = `${slotToTime(sess.startSlot)}–${slotToTime(sess.startSlot + sess.duration * 2)}`;
                  return (
                    <div key={"ghost-" + sess.id} title={`📚 ${student.name} · ${timeRange}`} style={{ position: "absolute", top: sess.startSlot * SLOT_HEIGHT + 1, left: "1%", width: "98%", height: height - 2, background: `${c.bg}66`, borderLeft: `2px dashed ${c.border}`, borderRadius: 4, padding: "3px 6px", zIndex: 1, opacity: 0.5 }}>
                      <div style={{ fontSize: 9, color: c.accent, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📚 {student.name}</div>
                    </div>
                  );
                })}

                {/* Personal event blocks */}
                {dayLayouts[dayIdx].map(ev => {
                  const c = PALETTE[ev.colorIdx ?? 0];
                  const wPct = 100 / ev.totalCols;
                  const height = ev.duration * 2 * SLOT_HEIGHT;
                  const restStyle = { top: ev.startSlot * SLOT_HEIGHT + 1, left: `${ev.col * wPct + 0.5}%`, width: `${wPct - 1}%`, height: height - 2 };
                  return (
                    <div key={ev.id} className="session-block"
                      style={{ ...restStyle, background: c.bg, borderLeftColor: c.accent, zIndex: 2, cursor: "pointer" }}
                      onClick={() => openEdit(ev)}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>
                        {ev.recurring === false && "1× "}{ev.title}
                      </div>
                      {visibleDays.length === 1 && height > 44 && <div style={{ fontSize: 9, color: c.accent, fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>{ev.duration}ч</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ); })}
        </div>
      </div>

      {popup && (
        <Sheet onClose={() => setPopup(null)}>
          <div className="field-label" style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12, textTransform: "none", letterSpacing: 0 }}>
            {popup.type === "new" ? `${DAYS[popup.day]}, ${slotToTime(popup.slot)}` : `${DAYS[popup.event.day]}, ${slotToTime(popup.event.startSlot)}`}
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Что это</div>
            <input className="edit-inp" style={{ width: "100%", fontSize: 14, padding: "9px 10px" }} placeholder="Пара в вузе / Спортзал / ..." value={title} onChange={e => setTitle(e.target.value)} autoFocus onKeyDown={e => e.key === "Enter" && submit()} />
          </div>
          {recurring && (
            <div style={{ marginBottom: 12 }}>
              <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>День недели</div>
              <DayOfWeekPicker day={day} onChange={setDay} />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Точное время начала</div>
            <input className="edit-inp" type="time" style={{ width: 130, fontSize: 14, padding: "8px 10px" }} value={startTime} onChange={e => setStartTime(e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Длительность</div>
            <div style={{ display: "flex", gap: 6 }}>
              {DURATIONS.map(d => <button key={d} className={`dur-pill ${duration === d ? "sel" : ""}`} onClick={() => setDuration(d)}>{d}ч</button>)}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Повторение</div>
            <RecurrenceControl recurring={recurring} date={date} onChange={handleRecChange} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div className="field-label" style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Цвет</div>
            <div style={{ display: "flex", gap: 10 }}>
              {PALETTE.map((c, i) => (
                <button key={i} onClick={() => setColorIdx(i)} style={{ width: 28, height: 28, borderRadius: "50%", background: c.accent, border: colorIdx === i ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="save-btn" style={{ flex: 1 }} onClick={submit}>{popup.type === "new" ? "Добавить" : "Сохранить"}</button>
            {popup.type === "edit" && (
                <button className="del-btn" style={{ width: "auto", padding: "9px 14px" }} onClick={() => { onDelete(popup.event.id); setPopup(null); }}>Удалить</button>
            )}
          </div>
        </Sheet>
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
    <span className="inline-form-row" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <input
        className="edit-inp inline-form-field"
        type="number"
        placeholder={defaultAmount ? `напр. ${defaultAmount}` : "кол-во"}
        style={{ width: 64, padding: "4px 7px", fontSize: 12 }}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
      />
      <input
        className="edit-inp inline-form-field"
        type="date"
        style={{ width: 118, padding: "4px 7px", fontSize: 12 }}
        value={date}
        onChange={e => setDate(e.target.value)}
      />
      <button className="inline-form-btn" onClick={submit} style={{ fontSize: 11, fontWeight: 600, background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}>
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
      <div className="inline-form-row" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <input
          className="edit-inp inline-form-field"
          type="date"
          style={{ width: 118, padding: "4px 7px", fontSize: 12 }}
          value={date}
          onChange={e => setDate(e.target.value)}
        />
        <input
          className="edit-inp inline-form-field"
          type="text"
          placeholder="что прошли (необязательно)"
          style={{ flex: 1, minWidth: 140, padding: "4px 7px", fontSize: 12 }}
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
        />
        <button className="inline-form-btn" onClick={submit} style={{ fontSize: 11, fontWeight: 600, background: "var(--surface)", border: "1px solid var(--border2)", color: "var(--text-mid)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}>
          {label || "Занятие прошло −1"}
        </button>
      </div>
    </div>
  );
}

// Long freeform notes (or accidental keyboard mashes) shouldn't blow up a
// card — show a short preview with a toggle to read the rest.
function ExpandableText({ text, maxChars = 60, style }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const isLong = text.length > maxChars;
  return (
    <div style={style}>
      <span style={{ overflowWrap: "anywhere" }}>{open || !isLong ? text : text.slice(0, maxChars) + "…"}</span>
      {isLong && (
        <button
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
          style={{ display: "block", marginTop: 3, fontSize: 11, color: "var(--text-dim)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline", fontFamily: "'Manrope', sans-serif" }}
        >
          {open ? "Свернуть" : "Показать полностью"}
        </button>
      )}
    </div>
  );
}

function NotesField({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  if (!editing) {
    return (
      <div
        className="notes-field"
        onClick={() => { setText(value); setEditing(true); }}
        style={{ fontSize: 12, color: value ? "var(--text-mid)" : "var(--text-faint)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px", cursor: "pointer", minHeight: 14, fontFamily: "'Manrope', sans-serif" }}
      >
        {value ? <ExpandableText text={value} maxChars={70} /> : "+ заметка по ученику (что проходим, слабые темы...)"}
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

const Field = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{label}</div>
    {children}
  </div>
);

function buildStudentFromRow(row, mapping) {
  const out = { name: "", subject: "", grade: "", workFormat: "", rate: 3000, weeklyHours: 2, sessionDuration: 1, lessonsPaid: 0, paymentMode: "subscription", lessonsPerBundle: 4, studentPhone: "", studentTelegram: "", parentName: "", parentPhone: "", parentTelegram: "", notes: "", startDate: "", endDate: "", active: true, archived: false, colorIdx: null };
  Object.entries(mapping).forEach(([colIdx, field]) => {
    if (field === "ignore") return;
    const raw = row[colIdx];
    if (raw === undefined || String(raw).trim() === "") return;
    switch (field) {
      case "rate": out.rate = parseImportNumber(raw) ?? out.rate; break;
      case "weeklyHours": out.weeklyHours = parseImportNumber(raw) ?? out.weeklyHours; break;
      case "startDate": out.startDate = parseImportDate(raw); break;
      case "endDate": out.endDate = parseImportDate(raw); break;
      case "formatGrade": { const { workFormat, grade } = splitFormatGrade(raw); if (workFormat) out.workFormat = workFormat; if (grade) out.grade = grade; break; }
      case "status": { const { active, archived } = parseImportStatus(raw); out.active = active; out.archived = archived; break; }
      case "studentContactCombo": { const { phone, telegram } = splitPhoneTelegram(raw); if (phone) out.studentPhone = phone; if (telegram) out.studentTelegram = telegram; break; }
      case "parentContactCombo": { const { phone, telegram } = splitPhoneTelegram(raw); if (phone) out.parentPhone = phone; if (telegram) out.parentTelegram = telegram; break; }
      default: out[field] = String(raw).trim();
    }
  });
  if (!out.subject) out.subject = out.workFormat || "—";
  return out;
}

function ImportStudentsModal({ onClose, onImport }) {
  const [step, setStep] = useState("upload"); // upload | map | preview
  const [matrix, setMatrix] = useState(null);
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState("");

  const handleFile = async (file) => {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      if (!rows.length) { setError("Файл пустой."); return; }
      let bestIdx = 0, bestCount = -1;
      rows.slice(0, 5).forEach((r, i) => {
        const c = r.filter(v => String(v).trim()).length;
        if (c > bestCount) { bestCount = c; bestIdx = i; }
      });
      const headers = rows[bestIdx] || [];
      const colCount = Math.max(...rows.slice(0, bestIdx + 3).map(r => r.length), headers.length);
      const guess = {};
      const used = new Set();
      for (let i = 0; i < colCount; i++) {
        const label = String(headers[i] || "").toLowerCase();
        let field = "ignore";
        if (label.includes("имя") || label.includes("ученик")) field = used.has("name") ? "parentName" : "name";
        else if (label.includes("контакт")) field = used.has("studentContactCombo") ? "parentContactCombo" : "studentContactCombo";
        else if (label.includes("предмет")) field = "formatGrade";
        else if (label.includes("статус")) field = "status";
        else if (label.includes("начал")) field = "startDate";
        else if (label.includes("конец") || label.includes("оконч")) field = "endDate";
        else if (label.includes("ставк")) field = "rate";
        else if (label.includes("час")) field = "weeklyHours";
        else if (label.includes("коммент") || label.includes("заметк")) field = "notes";
        if (field !== "ignore") used.add(field);
        guess[i] = field;
      }
      setMatrix(rows);
      setHeaderRowIdx(bestIdx);
      setMapping(guess);
      setStep("map");
    } catch (e) {
      setError("Не получилось прочитать файл. Сохрани таблицу как .xlsx или .csv и попробуй снова.");
    }
  };

  const headers = matrix ? (matrix[headerRowIdx] || []) : [];
  const colCount = matrix ? Math.max(...matrix.slice(0, headerRowIdx + 3).map(r => r.length), headers.length) : 0;
  const dataRows = matrix ? matrix.slice(headerRowIdx + 1).filter(r => r.some(v => String(v).trim())) : [];
  const parsedStudents = dataRows.map(r => buildStudentFromRow(r, mapping)).filter(s => s.name);

  return (
    <Sheet onClose={onClose}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Загрузить учеников из таблицы</div>

      {step === "upload" && (
        <div>
          <div style={{ fontSize: 13, color: "var(--text-mid)", marginBottom: 12, lineHeight: 1.5 }}>
            Загрузи файл .xlsx или .csv (в Google Таблицах: Файл → Скачать → одна из этих двух).
          </div>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
          {error && <div style={{ fontSize: 12, color: "#dc2626", marginTop: 10 }}>{error}</div>}
        </div>
      )}

      {step === "map" && matrix && (
        <div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
            Строка с заголовками: №{headerRowIdx + 1}
            <button className="iBtn" style={{ marginLeft: 8, fontSize: 11 }} onClick={() => setHeaderRowIdx(i => Math.max(0, i - 1))}>‹</button>
            <button className="iBtn" style={{ fontSize: 11 }} onClick={() => setHeaderRowIdx(i => i + 1)}>›</button>
            {" · "}найдено строк с учениками: {dataRows.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "40vh", overflowY: "auto" }}>
            {Array.from({ length: colCount }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{headers[i] || `Колонка ${i + 1}`}</div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dataRows[0]?.[i] || "—"}</div>
                </div>
                <select className="edit-inp" style={{ width: 190, flexShrink: 0 }} value={mapping[i] || "ignore"} onChange={e => setMapping(m => ({ ...m, [i]: e.target.value }))}>
                  {IMPORT_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="cancel-btn-sm" onClick={() => setStep("upload")}>Назад</button>
            <button className="save-btn" style={{ flex: 1 }} onClick={() => setStep("preview")}>Далее — предпросмотр ({parsedStudents.length})</button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>Будет добавлено учеников: {parsedStudents.length}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "45vh", overflowY: "auto" }}>
            {parsedStudents.map((s, i) => (
              <div key={i} style={{ fontSize: 12, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px" }}>
                <b>{s.name}</b> {s.workFormat} {s.grade && `${s.grade} кл.`} · {s.rate}₽/ч · {s.weeklyHours}ч/нед
                {s.archived && <span style={{ color: "var(--text-faint)" }}> · архив</span>}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="cancel-btn-sm" onClick={() => setStep("map")}>Назад</button>
            <button className="save-btn" style={{ flex: 1 }} onClick={() => { onImport(parsedStudents); onClose(); }}>Импортировать {parsedStudents.length}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function StudentsTab({ students, getColor, getTarget, getPlaced, toggleActive, deleteStudent, updateStudent, addStudent, importStudents, addLessons, markLessonDone, deleteHistoryEvent, archiveStudent, unarchiveStudent, getStudentLTV, monthlyStats }) {
  const [editId, setEditId] = useState(null);
  const [openHistoryId, setOpenHistoryId] = useState(null);
  const [ef, setEf] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [af, setAf] = useState({ name: "", subject: "", grade: "", workFormat: "", rate: "3000", weeklyHours: "2", sessionDuration: 1, lessonsPaid: "0", paymentMode: "subscription", lessonsPerBundle: "4", studentPhone: "", studentTelegram: "", parentName: "", parentPhone: "", parentTelegram: "", colorIdx: null, startDate: isoDate(new Date()) });

  const startEdit = (s) => {
    setEditId(s.id);
    setEf({ name: s.name, subject: s.subject, grade: s.grade || "", workFormat: s.workFormat || "", rate: String(s.rate), weeklyHours: String(s.weeklyHours), sessionDuration: s.sessionDuration, paymentMode: s.paymentMode || "subscription", lessonsPerBundle: String(s.lessonsPerBundle ?? 4), studentPhone: s.studentPhone || "", studentTelegram: s.studentTelegram || "", parentName: s.parentName || "", parentPhone: s.parentPhone || "", parentTelegram: s.parentTelegram || "", colorIdx: s.colorIdx ?? null, startDate: s.startDate || "", endDate: s.endDate || "" });
  };
  const saveEdit = (id) => {
    updateStudent(id, {
      name: ef.name.trim() || undefined,
      subject: ef.subject.trim() || undefined,
      grade: ef.grade.trim(),
      workFormat: ef.workFormat,
      rate: parseInt(ef.rate) || undefined,
      weeklyHours: parseFloat(ef.weeklyHours) || undefined,
      sessionDuration: ef.sessionDuration,
      paymentMode: ef.paymentMode,
      lessonsPerBundle: parseInt(ef.lessonsPerBundle) || 4,
      studentPhone: ef.studentPhone.trim(),
      studentTelegram: ef.studentTelegram.trim(),
      parentName: ef.parentName.trim(),
      parentPhone: ef.parentPhone.trim(),
      parentTelegram: ef.parentTelegram.trim(),
      colorIdx: ef.colorIdx,
      startDate: ef.startDate || "",
      endDate: ef.endDate || "",
    });
    setEditId(null);
  };
  const doAdd = () => {
    if (!af.name.trim()) return;
    addStudent({
      name: af.name.trim(), subject: af.subject.trim() || "Химия", grade: af.grade.trim(), workFormat: af.workFormat, rate: parseInt(af.rate) || 3000,
      weeklyHours: parseFloat(af.weeklyHours) || 2, sessionDuration: af.sessionDuration,
      lessonsPaid: parseInt(af.lessonsPaid) || 0, paymentMode: af.paymentMode,
      lessonsPerBundle: parseInt(af.lessonsPerBundle) || 4, studentPhone: af.studentPhone.trim(), studentTelegram: af.studentTelegram.trim(), parentName: af.parentName.trim(), parentPhone: af.parentPhone.trim(), parentTelegram: af.parentTelegram.trim(), notes: "",
      colorIdx: af.colorIdx, startDate: af.startDate,
    });
    setAf({ name: "", subject: "", grade: "", workFormat: "", rate: "3000", weeklyHours: "2", sessionDuration: 1, lessonsPaid: "0", paymentMode: "subscription", lessonsPerBundle: "4", studentPhone: "", studentTelegram: "", parentName: "", parentPhone: "", parentTelegram: "", colorIdx: null, startDate: isoDate(new Date()) });
    setShowAdd(false);
  };

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "20px 16px" }}>
      {monthlyStats && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Заработано в этом месяце</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>{monthlyStats.earned.toLocaleString()} ₽</div>
          </div>
          <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>План на месяц</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>{monthlyStats.planned.toLocaleString()} ₽</div>
          </div>
          <div style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>Налог ({monthlyStats.taxRate * 100}%)</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#dc2626", fontFamily: "'JetBrains Mono', monospace" }}>{monthlyStats.tax.toLocaleString()} ₽</div>
          </div>
        </div>
      )}
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
                  <Field label="Класс"><input className="edit-inp" style={{ width: 60 }} placeholder="11" value={ef.grade} onChange={e => setEf(f => ({ ...f, grade: e.target.value }))} /></Field>
                  <Field label="Формат">
                    <div style={{ display: "flex", gap: 4 }}>
                      {WORK_FORMATS.map(wf => <button key={wf} className={`dur-pill ${ef.workFormat === wf ? "sel" : ""}`} onClick={() => setEf(f => ({ ...f, workFormat: f.workFormat === wf ? "" : wf }))}>{wf}</button>)}
                    </div>
                  </Field>
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
                  <Field label="Начали заниматься"><input className="edit-inp" type="date" style={{ width: 148 }} value={ef.startDate} onChange={e => setEf(f => ({ ...f, startDate: e.target.value }))} /></Field>
                  <Field label="Закончили (если да)"><input className="edit-inp" type="date" style={{ width: 148 }} value={ef.endDate} onChange={e => setEf(f => ({ ...f, endDate: e.target.value }))} /></Field>
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
                  <Field label="Цвет">
                    <div style={{ display: "flex", gap: 5 }}>
                      {PALETTE.map((c, i) => (
                        <button key={i} onClick={() => setEf(f => ({ ...f, colorIdx: i }))} style={{ width: 20, height: 20, borderRadius: "50%", background: c.accent, border: ef.colorIdx === i ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
                      ))}
                    </div>
                  </Field>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Field label="Телефон ученика"><input className="edit-inp" style={{ width: 130 }} placeholder="+7..." value={ef.studentPhone} onChange={e => setEf(f => ({ ...f, studentPhone: e.target.value }))} /></Field>
                  <Field label="Телеграм ученика"><input className="edit-inp" style={{ width: 130 }} placeholder="@username" value={ef.studentTelegram} onChange={e => setEf(f => ({ ...f, studentTelegram: e.target.value }))} /></Field>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Field label="Имя родителя"><input className="edit-inp" style={{ width: 130 }} placeholder="Ирина" value={ef.parentName} onChange={e => setEf(f => ({ ...f, parentName: e.target.value }))} /></Field>
                  <Field label="Телефон родителя"><input className="edit-inp" style={{ width: 130 }} placeholder="+7..." value={ef.parentPhone} onChange={e => setEf(f => ({ ...f, parentPhone: e.target.value }))} /></Field>
                  <Field label="Телеграм родителя"><input className="edit-inp" style={{ width: 130 }} placeholder="@username" value={ef.parentTelegram} onChange={e => setEf(f => ({ ...f, parentTelegram: e.target.value }))} /></Field>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="save-btn" onClick={() => saveEdit(s.id)}>Сохранить</button>
                  <button className="cancel-btn-sm" onClick={() => setEditId(null)}>Отмена</button>
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
                    {s.workFormat && <span style={{ fontSize: 10, fontWeight: 700, color: c.text, background: c.bg, borderRadius: 5, padding: "1px 6px" }}>{s.workFormat}</span>}
                    {s.grade && <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{s.grade} класс</span>}
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
                  <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }} title={s.startDate ? `С ${formatDate(s.startDate)}: период до первой отметки «занятие прошло» — оценка по ${s.weeklyHours}ч/нед × ${s.rate}₽, дальше — по факту отмеченных занятий` : "Lifetime Value"}>
                    {s.startDate ? "~" : ""}LTV {getStudentLTV(s).toLocaleString()} ₽
                  </div>
                  {s.startDate && <div style={{ fontSize: 9, color: "var(--text-faint)" }}>с {formatDate(s.startDate)}</div>}
                </div>
                <button className="iBtn" onClick={() => startEdit(s)}>✎</button>
                <button className="iBtn" title="В архив" onClick={() => archiveStudent(s.id)} style={{ fontSize: 11 }}>📦</button>
                <button className="iBtn del" title="Удалить навсегда" onClick={() => { if (window.confirm(`Удалить ${s.name} без возможности восстановить?`)) deleteStudent(s.id); }}>✕</button>
              </div>

              {/* Contacts — separate line: student's phone/telegram, then parent's name + phone/telegram */}
              {(s.studentPhone || s.studentTelegram || s.parentName || s.parentPhone || s.parentTelegram) && (
                <div style={{ paddingLeft: 54, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {s.studentPhone && (
                    <button onClick={() => openContact(s.studentPhone)} title={`Позвонить ученику: ${s.studentPhone}`} className="inline-form-btn"
                      style={{ fontSize: 11, color: "var(--text-mid)", background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "3px 9px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}>
                      🎓 📞 {s.studentPhone}
                    </button>
                  )}
                  {s.studentTelegram && (
                    <button onClick={() => openContact(s.studentTelegram)} title={`Написать ученику: ${s.studentTelegram}`} className="inline-form-btn"
                      style={{ fontSize: 11, color: "var(--text-mid)", background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "3px 9px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}>
                      🎓 💬 {s.studentTelegram}
                    </button>
                  )}
                  {s.parentName && !s.parentPhone && !s.parentTelegram && (
                    <span style={{ fontSize: 11, color: "var(--text-faint)", padding: "3px 9px" }}>👪 {s.parentName}</span>
                  )}
                  {s.parentPhone && (
                    <button onClick={() => openContact(s.parentPhone)} title={`Позвонить родителю: ${s.parentPhone}`} className="inline-form-btn"
                      style={{ fontSize: 11, color: "#2563eb", background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "3px 9px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}>
                      👪 📞 {s.parentName ? `${s.parentName}: ` : ""}{s.parentPhone}
                    </button>
                  )}
                  {s.parentTelegram && (
                    <button onClick={() => openContact(s.parentTelegram)} title={`Написать родителю: ${s.parentTelegram}`} className="inline-form-btn"
                      style={{ fontSize: 11, color: "#2563eb", background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 8, padding: "3px 9px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}>
                      👪 💬 {!s.parentPhone && s.parentName ? `${s.parentName}: ` : ""}{s.parentTelegram}
                    </button>
                  )}
                </div>
              )}

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
                            посл. занятие {formatDate(s.lastLessonDate)}{s.lastLessonNote ? ` · «${truncate(s.lastLessonNote, 40)}»` : ""}
                          </span>
                        )}
                        <MarkDoneInput onMark={(date, note) => markLessonDone(s.id, date, note)} />
                        <button
                          onClick={() => setOpenHistoryId(s.id)}
                          className="inline-form-btn"
                          style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "1px solid var(--border2)", borderRadius: 8, padding: "5px 9px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}
                        >
                          История {s.history?.length ? `(${s.history.length})` : ""}
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
                        onClick={() => setOpenHistoryId(s.id)}
                        className="inline-form-btn"
                        style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "1px solid var(--border2)", borderRadius: 8, padding: "5px 9px", cursor: "pointer", fontFamily: "'Manrope', sans-serif" }}
                      >
                        История {s.history?.length ? `(${s.history.length})` : ""}
                      </button>
                    </>
                  );
                })()}
              </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Full history modal — every payment and lesson, oldest to newest, nothing truncated */}
      {openHistoryId && (() => {
        const s = students.find(x => x.id === openHistoryId);
        if (!s) return null;
        const c = getColor(s.id);
        const rows = [...(s.history || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
        return (
          <Sheet onClose={() => setOpenHistoryId(null)} className="history-modal">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.accent, flexShrink: 0 }} />
              <div style={{ fontSize: 15, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name} · история</div>
              <button className="iBtn" onClick={() => setOpenHistoryId(null)} style={{ fontSize: 16 }}>✕</button>
            </div>
            {rows.length === 0 ? (
              <div style={{ fontSize: 14, color: "var(--text-faint)", padding: "12px 0" }}>Пока нет записей</div>
            ) : (
              <div className="history-list">
                {rows.map(ev => (
                  <div key={ev.id} className="history-row">
                    <span style={{ fontSize: 14, marginTop: 1 }}>{ev.type === "payment" ? "💰" : "✓"}</span>
                    <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace", width: 42, flexShrink: 0, marginTop: 2 }}>{formatDate(ev.date)}</span>
                    <span style={{ fontSize: 14, color: "var(--text-mid)", flex: 1, minWidth: 0 }}>
                      {ev.type === "payment" ? `Оплата: +${ev.amount} занятий` : "Занятие прошло (−1)"}
                      {ev.type === "lesson" && ev.note && (
                        <ExpandableText text={`«${ev.note}»`} maxChars={80} style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2, fontStyle: "italic" }} />
                      )}
                    </span>
                    <button onClick={() => deleteHistoryEvent(s.id, ev.id)} title="Удалить запись и откатить баланс" className="iBtn del" style={{ fontSize: 13, flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </Sheet>
        );
      })()}

      {showAdd ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "15px", marginTop: 6, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 110 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Имя</div>
              <input className="edit-inp" style={{ width: "100%" }} placeholder="Иван П." value={af.name} onChange={e => setAf(f => ({ ...f, name: e.target.value }))} autoFocus onKeyDown={e => e.key === "Enter" && doAdd()} />
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Предмет</div>
              <input className="edit-inp" style={{ width: "100%" }} placeholder="Химия" value={af.subject} onChange={e => setAf(f => ({ ...f, subject: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Класс</div>
              <input className="edit-inp" style={{ width: 60 }} placeholder="11" value={af.grade} onChange={e => setAf(f => ({ ...f, grade: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Формат</div>
              <div style={{ display: "flex", gap: 4 }}>
                {WORK_FORMATS.map(f => <button key={f} className={`dur-pill ${af.workFormat === f ? "sel" : ""}`} onClick={() => setAf(v => ({ ...v, workFormat: v.workFormat === f ? "" : f }))}>{f}</button>)}
              </div>
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
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Начали заниматься</div>
              <input className="edit-inp" type="date" style={{ width: 148 }} value={af.startDate} onChange={e => setAf(f => ({ ...f, startDate: e.target.value }))} />
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
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Цвет</div>
              <div style={{ display: "flex", gap: 5 }}>
                {PALETTE.map((c, i) => (
                  <button key={i} onClick={() => setAf(f => ({ ...f, colorIdx: i }))} style={{ width: 20, height: 20, borderRadius: "50%", background: c.accent, border: af.colorIdx === i ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Телефон ученика</div>
              <input className="edit-inp" style={{ width: 130 }} placeholder="+7..." value={af.studentPhone} onChange={e => setAf(f => ({ ...f, studentPhone: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Телеграм ученика</div>
              <input className="edit-inp" style={{ width: 130 }} placeholder="@username" value={af.studentTelegram} onChange={e => setAf(f => ({ ...f, studentTelegram: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Имя родителя</div>
              <input className="edit-inp" style={{ width: 130 }} placeholder="Ирина" value={af.parentName} onChange={e => setAf(f => ({ ...f, parentName: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Телефон родителя</div>
              <input className="edit-inp" style={{ width: 130 }} placeholder="+7..." value={af.parentPhone} onChange={e => setAf(f => ({ ...f, parentPhone: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Телеграм родителя</div>
              <input className="edit-inp" style={{ width: 130 }} placeholder="@username" value={af.parentTelegram} onChange={e => setAf(f => ({ ...f, parentTelegram: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="save-btn" onClick={doAdd}>Добавить</button>
            <button className="cancel-btn-sm" onClick={() => setShowAdd(false)}>Отмена</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button className="ghost-btn" style={{ flex: 1 }} onClick={() => setShowAdd(true)}>+ Добавить ученика</button>
          <button className="ghost-btn" style={{ flex: 1 }} onClick={() => setShowImport(true)}>⇪ Загрузить из таблицы</button>
        </div>
      )}
      {showImport && <ImportStudentsModal onClose={() => setShowImport(false)} onImport={importStudents} />}

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
                    {lessonsDone} занятий · {s.startDate ? "~" : ""}LTV {ltv.toLocaleString()} ₽
                    {s.startDate && ` · ${formatDate(s.startDate)}–${s.endDate ? formatDate(s.endDate) : "?"}`}
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

// A small dropdown pill (due date / priority / project pickers in the planner's
// add-task bar). Closes on outside click; `extra` renders below the option list
// for the due-date picker's custom date input.
function PillDropdown({ renderValue, options, onChange, extra }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="dur-pill" onClick={() => setOpen(o => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px" }}>
        {renderValue()} <span style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.16)", zIndex: 60, minWidth: 170, padding: 4 }}>
          {options.map(opt => (
            <button key={String(opt.value)} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontFamily: "'Manrope', sans-serif", color: "var(--text)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              {opt.icon}{opt.label}
            </button>
          ))}
          {extra && <div style={{ padding: "4px 6px" }}>{extra}</div>}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, project, onToggle, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const today = isoDate(new Date());
  const overdue = !task.done && task.dueDate && task.dueDate < today;

  const save = () => {
    onEdit(task.id, { title: title.trim() || task.title });
    setEditing(false);
  };

  return (
    <div className="task-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid var(--border)" }}>
      <button onClick={() => onToggle(task.id)} title="Отметить выполненной"
        style={{ width: 21, height: 21, borderRadius: "50%", border: `2px solid ${task.done ? "#16a34a" : "var(--border2)"}`, background: task.done ? "#16a34a" : "none", flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 11, padding: 0 }}
      >
        {task.done && "✓"}
      </button>
      {editing ? (
        <input
          className="edit-inp" autoFocus value={title} onChange={e => setTitle(e.target.value)}
          onBlur={save} onKeyDown={e => e.key === "Enter" && e.currentTarget.blur()}
          style={{ flex: 1, fontSize: 14, minWidth: 0 }}
        />
      ) : (
        <span onClick={() => setEditing(true)} style={{ flex: 1, minWidth: 0, fontSize: 14, textDecoration: task.done ? "line-through" : "none", color: task.done ? "var(--text-faint)" : "var(--text)", cursor: "text", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </span>
      )}
      {task.priority > 0 && <span title={PRIORITY_LABELS[task.priority]} style={{ width: 8, height: 8, borderRadius: "50%", background: PRIORITY_COLORS[task.priority], flexShrink: 0 }} />}
      {task.dueDate && <span style={{ fontSize: 11, color: overdue ? "#dc2626" : "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{formatDate(task.dueDate)}</span>}
      {project && <span style={{ fontSize: 10, color: project.color, background: project.color + "1e", padding: "2px 7px", borderRadius: 8, flexShrink: 0, whiteSpace: "nowrap" }}>{project.name}</span>}
      <button className="iBtn del" onClick={() => onDelete(task.id)} title="Удалить">✕</button>
    </div>
  );
}

function PlannerTab({ tasks, projects, addTask, updateTask, toggleTaskDone, deleteTask, addProject, deleteProject }) {
  const [activeList, setActiveList] = useState("inbox");
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState({ mode: "none", date: "" });
  const [newPriority, setNewPriority] = useState(0);
  const [newProjectId, setNewProjectId] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("manual");
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const bucketOf = (t) => {
    if (t.done) return "completed";
    const today = isoDate(new Date());
    if (t.dueDate === today) return "today";
    if (t.dueDate && t.dueDate > today) return "upcoming";
    if (t.list === "someday") return "someday";
    if (t.list === "anytime") return "anytime";
    return "inbox";
  };

  const counts = {};
  tasks.forEach(t => { const b = bucketOf(t); counts[b] = (counts[b] || 0) + 1; });

  const isProjectView = activeList.startsWith("project-");
  const activeProjectId = isProjectView ? parseInt(activeList.slice(8)) : null;

  let visible = isProjectView
    ? tasks.filter(t => t.projectId === activeProjectId && !t.done)
    : tasks.filter(t => bucketOf(t) === activeList);

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    visible = visible.filter(t => t.title.toLowerCase().includes(q));
  }
  visible = [...visible].sort((a, b) => {
    if (sortBy === "due") return (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99");
    if (sortBy === "priority") return b.priority - a.priority;
    return a.id - b.id;
  });

  const currentLabel = isProjectView
    ? (projects.find(p => p.id === activeProjectId)?.name || "Проект")
    : (SMART_LISTS.find(l => l.key === activeList)?.label || "");

  const submitTask = () => {
    if (!newTitle.trim()) return;
    let dueDate = null, list = "inbox";
    if (newDue.mode === "today") dueDate = isoDate(new Date());
    else if (newDue.mode === "tomorrow") dueDate = isoDate(addDays(new Date(), 1));
    else if (newDue.mode === "date" && newDue.date) dueDate = newDue.date;
    else if (newDue.mode === "someday") list = "someday";
    if (isProjectView && !newProjectId) {
      addTask({ title: newTitle.trim(), dueDate, priority: newPriority, projectId: activeProjectId, list: dueDate ? list : "anytime" });
    } else {
      if (newProjectId && list === "inbox" && !dueDate) list = "anytime";
      addTask({ title: newTitle.trim(), dueDate, priority: newPriority, projectId: newProjectId, list });
    }
    setNewTitle(""); setNewDue({ mode: "none", date: "" }); setNewPriority(0); setNewProjectId(null);
  };

  const doAddProject = () => {
    if (!newProjectName.trim()) return;
    const id = addProject(newProjectName.trim());
    setNewProjectName(""); setShowAddProject(false);
    setActiveList(`project-${id}`);
  };

  const dueDateLabel = newDue.mode === "none" ? "Без срока" : newDue.mode === "today" ? "Сегодня" : newDue.mode === "tomorrow" ? "Завтра" : newDue.mode === "someday" ? "Когда-нибудь" : newDue.date ? formatDate(newDue.date) : "Без срока";
  const projectLabel = newProjectId ? (projects.find(p => p.id === newProjectId)?.name || "Проект") : "Без проекта";

  return (
    <div className="planner-root" style={{ display: "flex", height: "calc(100vh - 62px)" }}>
      {/* Sidebar: smart lists + projects */}
      <div className="planner-sidebar no-scrollbar" style={{ width: 240, flexShrink: 0, borderRight: "1px solid var(--border)", background: "var(--surface)", overflowY: "auto", padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--surface2)", borderRadius: 8, marginBottom: 14 }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#2563eb", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>✓</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Мой план</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{tasks.filter(t => !t.done).length} открытых задач</div>
          </div>
        </div>
        {SMART_LISTS.map(l => (
          <button key={l.key} onClick={() => setActiveList(l.key)}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: activeList === l.key ? "var(--bg)" : "none", border: activeList === l.key ? "1px solid var(--border2)" : "1px solid transparent", borderRadius: 7, padding: "8px 9px", marginBottom: 2, cursor: "pointer", fontSize: 13, fontFamily: "'Manrope', sans-serif", color: activeList === l.key ? "var(--text)" : "var(--text-mid)", fontWeight: activeList === l.key ? 600 : 500 }}>
            <span>{l.icon}</span><span style={{ flex: 1 }}>{l.label}</span>
            {counts[l.key] > 0 && <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace" }}>{counts[l.key]}</span>}
          </button>
        ))}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 6, padding: "0 9px" }}>
          <span style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Проекты</span>
          <button className="iBtn" onClick={() => setShowAddProject(v => !v)} style={{ fontSize: 14 }}>+</button>
        </div>
        {showAddProject && (
          <div style={{ display: "flex", gap: 4, padding: "0 9px", marginBottom: 8 }}>
            <input className="edit-inp" autoFocus placeholder="Название" style={{ flex: 1, fontSize: 12, padding: "5px 8px" }} value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onKeyDown={e => e.key === "Enter" && doAddProject()} />
            <button className="save-btn" style={{ padding: "5px 9px", fontSize: 11 }} onClick={doAddProject}>✓</button>
          </div>
        )}
        {projects.map(p => {
          const count = tasks.filter(t => t.projectId === p.id && !t.done).length;
          const key = `project-${p.id}`;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center" }}>
              <button onClick={() => setActiveList(key)}
                style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, textAlign: "left", background: activeList === key ? "var(--bg)" : "none", border: activeList === key ? "1px solid var(--border2)" : "1px solid transparent", borderRadius: 7, padding: "8px 9px", marginBottom: 2, cursor: "pointer", fontSize: 13, fontFamily: "'Manrope', sans-serif", color: activeList === key ? "var(--text)" : "var(--text-mid)", fontWeight: activeList === key ? 600 : 500 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                {count > 0 && <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'JetBrains Mono', monospace" }}>{count}</span>}
              </button>
              <button className="iBtn del" title="Удалить проект" onClick={() => deleteProject(p.id)} style={{ fontSize: 11, flexShrink: 0 }}>✕</button>
            </div>
          );
        })}
      </div>

      {/* Main panel */}
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "24px 28px" }}>
        <div style={{ fontSize: 10, color: "#2563eb", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{isProjectView ? "Проект" : "Умный список"}</div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>{currentLabel}</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18 }}>{visible.length} {visible.length === 1 ? "задача" : "задач"}</div>

        {/* Add task bar */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, marginBottom: 18 }}>
          <input className="edit-inp" placeholder="Добавить задачу..." style={{ width: "100%", fontSize: 15, padding: "9px 4px", border: "none", marginBottom: 10 }} value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && submitTask()} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <PillDropdown
              renderValue={() => `📅 ${dueDateLabel}`}
              options={[{ value: "none", label: "Без срока" }, { value: "today", label: "Сегодня" }, { value: "tomorrow", label: "Завтра" }, { value: "someday", label: "Когда-нибудь" }]}
              onChange={(v) => setNewDue({ mode: v, date: "" })}
              extra={<input type="date" className="edit-inp" style={{ width: "100%", fontSize: 12 }} value={newDue.mode === "date" ? newDue.date : ""} onChange={e => setNewDue({ mode: "date", date: e.target.value })} />}
            />
            <PillDropdown
              renderValue={() => `🚩 ${PRIORITY_LABELS[newPriority]}`}
              options={[0, 1, 2, 3].map(v => ({ value: v, label: PRIORITY_LABELS[v] }))}
              onChange={setNewPriority}
            />
            <PillDropdown
              renderValue={() => `📁 ${projectLabel}`}
              options={[{ value: null, label: "Без проекта" }, ...projects.map(p => ({ value: p.id, label: p.name }))]}
              onChange={setNewProjectId}
            />
            <button className="save-btn" style={{ marginLeft: "auto", opacity: newTitle.trim() ? 1 : 0.5 }} onClick={submitTask}>Добавить</button>
          </div>
        </div>

        {/* Search + sort */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <input className="edit-inp" placeholder="🔍 Поиск" style={{ flex: 1, minWidth: 120, fontSize: 13 }} value={search} onChange={e => setSearch(e.target.value)} />
          <select className="edit-inp" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ fontSize: 12 }}>
            <option value="manual">Мой порядок</option>
            <option value="due">По сроку</option>
            <option value="priority">По приоритету</option>
          </select>
        </div>

        {visible.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-faint)" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-mid)", marginBottom: 4 }}>Задач пока нет</div>
            <div style={{ fontSize: 13 }}>Добавьте задачу сверху или выберите другой список.</div>
          </div>
        ) : (
          <div>
            {visible.map(t => (
              <TaskRow key={t.id} task={t} project={projects.find(p => p.id === t.projectId)} onToggle={toggleTaskDone} onDelete={deleteTask} onEdit={updateTask} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
