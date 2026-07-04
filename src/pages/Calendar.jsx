import { useState } from 'react'
import './Calendar.css'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1 // Monday-first
}

export default function Calendar() {
  const today = new Date()
  const [current, setCurrent] = useState({ year: today.getFullYear(), month: today.getMonth() })

  const { year, month } = current
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const cells = Array(firstDay).fill(null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  )

  const prev = () => setCurrent(c => {
    const m = c.month === 0 ? 11 : c.month - 1
    const y = c.month === 0 ? c.year - 1 : c.year
    return { year: y, month: m }
  })

  const next = () => setCurrent(c => {
    const m = c.month === 11 ? 0 : c.month + 1
    const y = c.month === 11 ? c.year + 1 : c.year
    return { year: y, month: m }
  })

  const isToday = (day) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  return (
    <div className="calendar">
      <div className="calendar-nav">
        <button onClick={prev} aria-label="Предыдущий месяц">&lt;</button>
        <span className="calendar-title">{MONTHS[month]} {year}</span>
        <button onClick={next} aria-label="Следующий месяц">&gt;</button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map(d => (
          <div key={d} className="calendar-weekday">{d}</div>
        ))}
        {cells.map((day, i) => (
          <div
            key={i}
            className={`calendar-day ${day ? '' : 'empty'} ${isToday(day) ? 'today' : ''}`}
          >
            {day || ''}
          </div>
        ))}
      </div>
    </div>
  )
}
