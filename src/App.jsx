import Calendar from './pages/Calendar.jsx'
import './styles/app.css'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Параллелька</h1>
      </header>
      <main className="app-main">
        <Calendar />
      </main>
    </div>
  )
}
