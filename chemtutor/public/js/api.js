import { toast, readFile, shrinkImage } from './ui.js';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, quiet = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    if (!quiet) toast('Нет связи с сервером', 'error');
    throw new ApiError(0, 'Нет связи с сервером');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = data?.error || `Ошибка ${res.status}`;
    if (res.status === 401 && !quiet) { location.hash = '#/login'; }
    if (!quiet) toast(msg, 'error');
    throw new ApiError(res.status, msg);
  }
  return data;
}
api.get = (p, o) => api(p, o);
api.post = (p, body, o) => api(p, { ...o, method: 'POST', body: body ?? {} });
api.put = (p, body, o) => api(p, { ...o, method: 'PUT', body: body ?? {} });
api.patch = (p, body, o) => api(p, { ...o, method: 'PATCH', body: body ?? {} });
api.del = (p, o) => api(p, { ...o, method: 'DELETE' });

/** Upload a File object, returns {id, name, size, mime} */
export async function uploadFile(file) {
  if (file.size > 15 * 1024 * 1024) { toast('Файл больше 15 МБ', 'error'); throw new Error('too big'); }
  const f = await readFile(await shrinkImage(file));
  return api.post('/api/files', f);
}

/** Pick files with a native dialog. */
export function pickFiles({ accept = '', multiple = false } = {}) {
  return new Promise(resolve => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept, multiple });
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}
