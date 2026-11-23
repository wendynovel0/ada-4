'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db;
// URL del backend (Render), sin diagonal final. Ej: "https://mi-app.onrender.com".
// Vacío: en GitHub Pages la app funciona solo local (sin sync ni push); en tu propio servidor usa el mismo origen.
const API_URL = "";
const API = API_URL || (location.hostname.endsWith("github.io") ? null : location.origin);
const CID = localStorage.cid || (localStorage.cid = crypto.randomUUID());

/* ---------- IndexedDB ---------- */
const openDB = () => new Promise((ok, ko) => {
  const r = indexedDB.open('actividades-db', 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore('activities', { keyPath: 'id' });
    r.result.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
  };
  r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
});
const rq = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
const store = (s, m = 'readonly') => db.transaction(s, m).objectStore(s);
const getAll = s => rq(store(s).getAll());
const txDone = t => new Promise((ok, ko) => { t.oncomplete = ok; t.onerror = () => ko(t.error); });

/* ---------- CRUD (cada cambio entra a la cola de sincronización) ---------- */
async function guardar(a) {            // Create / Update
  const t = db.transaction(['activities', 'outbox'], 'readwrite');
  t.objectStore('activities').put(a);
  t.objectStore('outbox').add({ op: 'upsert', id: a.id, data: a });
  await txDone(t); await pintar(); pedirSync();
}
async function eliminar(id) {          // Delete
  const t = db.transaction(['activities', 'outbox'], 'readwrite');
  t.objectStore('activities').delete(id);
  t.objectStore('outbox').add({ op: 'delete', id, ts: Date.now() });
  await txDone(t); await pintar(); pedirSync();
}

/* ---------- Interfaz ---------- */
let filtro = 'todas', q = '';
const ORDEN = ['Vencidas', 'Hoy', 'Próximas', 'Sin fecha', 'Completadas'];
const X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';
function grupo(a, ahora) {
  if (a.done) return 'Completadas';
  if (!a.remindAt) return 'Sin fecha';
  const d = new Date(a.remindAt), fin = new Date(); fin.setHours(23, 59, 59, 999);
  return d < ahora ? 'Vencidas' : d <= fin ? 'Hoy' : 'Próximas';
}
function fmt(iso) {
  const d = new Date(iso), h = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const dias = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
  return dias === 0 ? 'Hoy ' + h : dias === 1 ? 'Mañana ' + h : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' ' + h;
}
async function pintar() {              // Read
  const [items, pend] = [await getAll('activities'), await getAll('outbox')], ahora = new Date();
  const f = items.filter(a => (filtro === 'todas' || (filtro === 'hechas' ? a.done : !a.done)) && (a.title + ' ' + a.desc).toLowerCase().includes(q));
  f.sort((a, b) => (a.remindAt || '9').localeCompare(b.remindAt || '9'));
  $('lista').innerHTML = f.length ? ORDEN.map(g => {
    const xs = f.filter(a => grupo(a, ahora) === g); if (!xs.length) return '';
    return `<section class="grp"><h3 class="${g === 'Vencidas' ? 'bad' : ''}">${g}<span>${xs.length}</span></h3><ul>${xs.map(a => `
      <li class="${a.done ? 'hecha' : ''}">
        <label class="chk"><input type="checkbox" data-a="done" data-id="${a.id}" aria-label="Completar ${esc(a.title)}" ${a.done ? 'checked' : ''}><span></span></label>
        <button class="txt" data-a="edit" data-id="${a.id}"><strong>${esc(a.title)}</strong>${a.desc ? `<small>${esc(a.desc)}</small>` : ''}${a.remindAt ? `<time class="${g === 'Vencidas' ? 'bad' : ''}">${fmt(a.remindAt)}</time>` : ''}</button>
        <button class="ico" data-a="del" data-id="${a.id}" aria-label="Eliminar ${esc(a.title)}">${X}</button>
      </li>`).join('')}</ul></section>`;
  }).join('') : `<div class="vacio"><strong>${items.length ? 'Sin resultados' : 'Todo en orden'}</strong>${items.length ? 'Prueba con otro filtro.' : 'Toca + para crear tu primera actividad.'}</div>`;
  estado(pend.length);
}
function estado(p = 0) {
  $('estado').dataset.on = navigator.onLine ? '1' : '0';
  $('est-txt').textContent = (navigator.onLine ? 'En línea' : 'Sin conexión') + (p && API ? ` · ${p} por sincronizar` : '');
}
function toast(m) {
  const t = $('toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2500);
}
$('buscar').addEventListener('input', e => { q = e.target.value.toLowerCase(); pintar(); });
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  filtro = b.dataset.f;
  document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-pressed', x === b));
  pintar();
});

/* ---------- Formulario (hoja modal) ---------- */
const dlg = $('dlg-form'), aj = $('dlg-aj');
[dlg, aj].forEach(d => d.addEventListener('click', e => e.target === d && d.close()));
function abrir(a) {
  $('form').reset();
  $('id').value = a?.id || ''; $('titulo').value = a?.title || ''; $('desc').value = a?.desc || '';
  $('fecha').value = a?.remindAt ? new Date(new Date(a.remindAt) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
  $('t-form').textContent = a ? 'Editar actividad' : 'Nueva actividad';
  dlg.showModal(); $('titulo').focus();
}
$('fab').onclick = () => abrir();
$('cancelar').onclick = () => dlg.close();
$('form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('id').value || crypto.randomUUID();
  const prev = (await rq(store('activities').get(id))) || {};
  await guardar({ ...prev, id, title: $('titulo').value.trim(), desc: $('desc').value.trim(),
    remindAt: $('fecha').value ? new Date($('fecha').value).toISOString() : '',
    done: prev.done || false, notified: false, pushed: false, updatedAt: Date.now() });
  dlg.close(); toast('Actividad guardada');
});
$('lista').addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = await rq(store('activities').get(b.dataset.id)); if (!a) return;
  if (b.dataset.a === 'del') { await eliminar(a.id); return toast('Actividad eliminada'); }
  if (b.dataset.a === 'done') return guardar({ ...a, done: !a.done, updatedAt: Date.now() });
  abrir(a);
});

/* ---------- Ajustes e instalación ---------- */
$('btn-ajustes').onclick = () => aj.showModal();
$('cerrar-aj').onclick = () => aj.close();
let dip;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); dip = e; $('row-install').hidden = false; });
$('btn-install').onclick = async () => { dip?.prompt(); await dip?.userChoice; $('row-install').hidden = true; };

/* ---------- Sincronización ---------- */
let syncing = false;
async function sync() {
  if (!API || syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const changes = await getAll('outbox');
    const r = await fetch(API + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-client-id': CID }, body: JSON.stringify({ changes }) });
    if (!r.ok) throw new Error(r.status);
    const { activities } = await r.json();
    const t = db.transaction(['activities', 'outbox'], 'readwrite');
    changes.forEach(c => t.objectStore('outbox').delete(c.seq));
    const local = await getAll('activities'), srv = new Map(activities.map(a => [a.id, a]));
    activities.forEach(a => { const l = local.find(x => x.id === a.id); if (!l || a.updatedAt > l.updatedAt) t.objectStore('activities').put(a); });
    if ((await getAll('outbox')).length === changes.length)
      local.forEach(l => { if (!srv.has(l.id)) t.objectStore('activities').delete(l.id); });
    await txDone(t);
  } catch (err) { console.warn('Sync pendiente:', err.message); }
  finally { syncing = false; pintar(); }
}
async function pedirSync() {
  const reg = await navigator.serviceWorker?.ready;
  if (reg?.sync) { try { await reg.sync.register('sync-actividades'); return; } catch {} }
  sync();
}
addEventListener('online', () => { estado(); toast('Conexión recuperada, sincronizando…'); sync(); });
addEventListener('offline', () => { estado(); toast('Sin conexión: tus cambios se guardan en el dispositivo'); });

/* ---------- Notificaciones locales (Notifications API) ---------- */
async function notificar(a) {
  const reg = await navigator.serviceWorker.ready;
  reg.showNotification('⏰ ' + a.title, { body: a.desc || 'Recordatorio', icon: 'icon-192.png', tag: a.id, data: { url: './' } });
}
$('btn-notif').onclick = async () => {
  const p = await Notification.requestPermission();
  $('btn-notif').textContent = p === 'granted' ? 'Activas ✓' : 'Bloqueadas';
};
setInterval(async () => {
  if (Notification.permission !== 'granted') return;
  for (const a of await getAll('activities')) {
    if (a.remindAt && !a.done && !a.notified && new Date(a.remindAt) <= Date.now()) {
      await notificar(a); store('activities', 'readwrite').put({ ...a, notified: true });
    }
  }
}, 15000);

/* ---------- Push (ampliación) ---------- */
const b64 = s => Uint8Array.from(atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
$('btn-push').onclick = async () => {
  if (!API) return toast('Push requiere el backend: configura API_URL en app.js');
  try {
    if (await Notification.requestPermission() !== 'granted') return;
    const { key } = await (await fetch(API + '/api/vapid')).json();
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
    await fetch(API + '/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-client-id': CID }, body: JSON.stringify(sub) });
    $('btn-push').textContent = 'Activo ✓';
  } catch (e) { toast('No se pudo activar push: ' + e.message); }
};
$('btn-test').onclick = () => !API ? toast('Push requiere el backend: configura API_URL en app.js') : fetch(API + '/api/push-test', { method: 'POST', headers: { 'x-client-id': CID } }).then(() => toast('Push de prueba enviado')).catch(() => toast('Sin conexión con el servidor'));

/* ---------- Arranque ---------- */
(async () => {
  db = await openDB(); await pintar(); sync();
  if (Notification.permission === 'granted') $('btn-notif').textContent = 'Activas ✓';
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
    navigator.serviceWorker.addEventListener('message', e => e.data?.type === 'SYNC' && sync());
  }
})();
