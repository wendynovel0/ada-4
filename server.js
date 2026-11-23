const express = require('express'), webpush = require('web-push'), fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, 'data.json');
let db; try { db = JSON.parse(fs.readFileSync(FILE)); } catch { db = { users: {} }; }
db.vapid ||= webpush.generateVAPIDKeys();
if (process.env.VAPID_PUBLIC) db.vapid = { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:alumno@example.com', db.vapid.publicKey, db.vapid.privateKey);
const save = () => fs.writeFileSync(FILE, JSON.stringify(db));
const user = r => (db.users[r.get('x-client-id') || 'anon'] ||= { activities: {}, subs: [] });

const app = express();
app.use(express.json());
const PUBLIC = new Set(['index.html', 'app.js', 'sw.js', 'styles.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']);
app.use((req, res, next) => {                    // solo se sirven los archivos de la app (no server.js ni data.json)
  const f = req.path === '/' ? 'index.html' : req.path.slice(1);
  PUBLIC.has(f) ? res.sendFile(path.join(__dirname, f)) : next();
});
app.get('/api/vapid', (_, res) => res.json({ key: db.vapid.publicKey }));
app.post('/api/subscribe', (req, res) => {
  const u = user(req); if (!u.subs.some(s => s.endpoint === req.body.endpoint)) u.subs.push(req.body);
  save(); res.sendStatus(201);
});
app.post('/api/sync', (req, res) => {           // última escritura gana (updatedAt)
  const u = user(req);
  for (const c of req.body.changes || []) {
    if (c.op === 'delete') delete u.activities[c.id];
    else if (!u.activities[c.id] || c.data.updatedAt >= u.activities[c.id].updatedAt) u.activities[c.id] = c.data;
  }
  save(); res.json({ activities: Object.values(u.activities) });
});
const push = (u, p) => u.subs.forEach(s => webpush.sendNotification(s, JSON.stringify(p)).catch(e => {
  if ([404, 410].includes(e.statusCode)) { u.subs = u.subs.filter(x => x !== s); save(); }
}));
app.post('/api/push-test', (req, res) => { push(user(req), { title: 'Push de prueba', body: 'El backend funciona ✓' }); res.sendStatus(202); });
setInterval(() => {                              // envía push de recordatorios vencidos
  for (const u of Object.values(db.users)) for (const a of Object.values(u.activities))
    if (a.remindAt && !a.done && !a.pushed && new Date(a.remindAt) <= Date.now()) {
      a.pushed = true; push(u, { title: '⏰ ' + a.title, body: a.desc || 'Recordatorio', tag: a.id }); save();
    }
}, 30000);
app.listen(process.env.PORT || 3000, () => console.log('Servidor listo'));
