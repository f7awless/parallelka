// Creates a demo teacher (teacher / teacher123) with demo students (demo1..3 / demo123)
// in an EMPTY database. Usage: npm run demo
import { one, insert, tx } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { seedTeacher, createDemo } from '../server/seed.js';

if (one(`SELECT id FROM users WHERE role = 'teacher'`)) {
  console.log('В базе уже есть преподаватель — демо не создано. Для чистого демо запустите с DATA_DIR=./demo-data npm run demo');
  process.exit(0);
}
const id = tx(() => {
  const id = insert('users', { role: 'teacher', name: 'Анна Сергеевна', login: 'teacher', pass_hash: hashPassword('teacher123'), color: '#0e9f6e' });
  seedTeacher(id);
  return id;
});
const { logins } = createDemo(id);
console.log('Демо готово.\n  Преподаватель: teacher / teacher123');
for (const l of logins) console.log(`  Ученик ${l.name}: ${l.login} / ${l.password}`);
