# PWA de Actividades y Recordatorios

CRUD + IndexedDB + Service Worker (offline) + Notifications API + Push (web-push) + sincronización + Lighthouse.

## Ejecutar local
    npm install && npm start      # http://localhost:3000 (localhost cuenta como contexto seguro)

## Publicar con HTTPS (Render, gratis)
1. Sube la carpeta a un repositorio de GitHub.
2. Render → New → Web Service → conecta el repo. Build: `npm install`, Start: `npm start`.
3. Variables de entorno (para que push sobreviva a reinicios): genera claves con `npx web-push generate-vapid-keys` y define `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` (mailto:tu@correo).
4. Tu URL `https://xxx.onrender.com` ya es HTTPS: es la URL pública a entregar.
Si solo usas hosting estático (Netlify, GitHub Pages) la app funciona completa excepto sync y push, que requieren el backend.

## Cómo probar cada requisito
- Offline: DevTools → Application → Service Workers → Offline; crea/edita/elimina; verás "cambios pendientes". Al volver a "En línea" se sincronizan.
- Notificaciones: "Activar notificaciones", crea una actividad con recordatorio en 1 minuto y deja la pestaña abierta.
- Push: "Activar push" y "Probar push". Los recordatorios vencidos también los envía el servidor cada 30 s.
- Lighthouse: DevTools → Lighthouse → modo Navigation, categorías Performance/Accessibility/Best practices/SEO (en Chrome actual la instalabilidad aparece en Application → Manifest). Guarda el reporte (Save as HTML), corrige, vuelve a medir y entrega antes/después.

## Decisiones de diseño
- Sync: cola `outbox` en IndexedDB; Background Sync avisa a la página para sincronizar, con respaldo en el evento `online`. Conflictos: gana la última escritura (`updatedAt`).
- Caché: shell con precache + stale-while-revalidate; navegación red primero con respaldo offline; `/api/` nunca se cachea.
- Identidad: UUID por navegador (sin cuentas), suficiente para la práctica.

## Guion sugerido para el video (2–3 min)
URL HTTPS → crear/editar/eliminar → modo avión y repetir → reconectar y ver sincronización → notificación → push de prueba → reporte Lighthouse.


## Estructura
Todos los archivos están en la raíz del repositorio (index.html, app.js, sw.js, styles.css, manifest.json, iconos y server.js). Solo front en GitHub Pages: Settings → Pages → Deploy from branch → main / (root). Sync y push requieren el backend (Render).

## GitHub Pages + Render
Si el front está en GitHub Pages y el backend en Render, pon la URL de Render en  (arriba de app.js). Sin , en github.io la app funciona local y sin sync/push.
Si cambias archivos, recarga con Ctrl+Shift+R o borra el Service Worker (DevTools → Application → Unregister) para no ver la versión vieja en caché.
