import { useState } from 'react';
import { auth } from './firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';

export default function AuthScreen({ darkMode }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      const msgs = {
        'auth/invalid-email': 'Некорректный email',
        'auth/user-not-found': 'Пользователь не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/invalid-credential': 'Неверный email или пароль',
        'auth/email-already-in-use': 'Этот email уже зарегистрирован',
        'auth/weak-password': 'Пароль слишком короткий (мин. 6 символов)',
        'auth/too-many-requests': 'Слишком много попыток, подождите',
      };
      setError(msgs[err.code] || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-theme={darkMode ? 'dark' : 'light'} style={{
      minHeight: '100dvh', background: 'var(--bg)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
      fontFamily: "'Manrope', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap');
        :root { --bg:#f0ede8;--surface:#faf9f7;--border:#e8e4df;--border2:#e2ddd8;--text:#1c1917;--text-mid:#57534e;--text-dim:#a8a29e; }
        [data-theme="dark"] { --bg:#1c1917;--surface:#292524;--border:#44403c;--border2:#57534e;--text:#faf9f7;--text-mid:#e2ddd8;--text-dim:#78716c; }
        .auth-inp { width:100%;background:var(--surface);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:10px 12px;font-family:'Manrope',sans-serif;font-size:14px;outline:none;transition:border-color .15s;box-sizing:border-box; }
        .auth-inp:focus { border-color:#93c5fd;box-shadow:0 0 0 3px #dbeafe44; }
        .auth-btn { width:100%;background:#2563eb;color:white;border:none;border-radius:8px;padding:11px;font-family:'Manrope',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s; }
        .auth-btn:hover { background:#1d4ed8; }
        .auth-btn:disabled { opacity:.6;cursor:default; }
      `}</style>

      <div style={{ width: '100%', maxWidth: 340 }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>Параллелька</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {mode === 'login' ? 'Войти в аккаунт' : 'Создать аккаунт'}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Email</div>
              <input className="auth-inp" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Пароль</div>
              <input className="auth-inp" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </div>

            {error && (
              <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 7, padding: '8px 12px' }}>
                {error}
              </div>
            )}

            <button className="auth-btn" type="submit" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? '...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-dim)' }}>
            {mode === 'login' ? 'Ещё нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: 0 }}
            >
              {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
