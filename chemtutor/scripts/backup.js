// Consistent online backup of the SQLite database: npm run backup
// Keeps the last 30 copies in data/backups.
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR } from '../server/db.js';

const dir = path.join(DATA_DIR, 'backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `chemtutor-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.db`);
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
console.log('Резервная копия:', file);
const old = fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort().slice(0, -30);
for (const f of old) fs.unlinkSync(path.join(dir, f));
console.log('Файлы загрузок лежат в', path.join(DATA_DIR, 'uploads'), '— копируйте папку data целиком для полного бэкапа.');
