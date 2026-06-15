# Kodami Academy — Sesión 2 (14-15 Jun 2026)

## Contexto General
Plataforma educativa web gratuita con IA, recursos multimedia cloud.
- Matemáticas como primera materia (las demás con badge "Próx.")
- Sin login para estudiantes (solo docentes autenticados para CRUD)
- Diseño samurai/dojo, mascotas Sensei 🦝 y Nova 💙
- Mobile responsive completo

## Stack Técnico
- **Frontend:** HTML/CSS/JS puro → GitHub Pages (kodamiacademy24-cpu.github.io/kodamy-academy)
- **Backend:** Cloudflare Worker unificado → kodami-api.kodami-academy24.workers.dev
- **Storage:** R2 (kodami-recursos público, kodami-cerebro privado)
- **DB:** D1 (kodami-db) — 4 tablas: docentes, recursos, temas, cerebro_chunks
- **AI:** Groq (principal Sensei), Gemini (principal Nova), Workers AI (fallback)
- **Voz:** Web Speech API (0$ servidor, todo cliente)

## Arquitectura Worker
Un solo worker.js con todos los endpoints. ~512 líneas.
Endpoint completo: ver workers/worker.js

## Archivos Clave
| Archivo | Propósito |
|---------|-----------|
| index.html | Frontend principal |
| css/styles.css | Todos los estilos (samurai, responsive, admin, chat, modal) |
| js/app.js | Core (cursor, estrellas, parallax, mascotas drag, stats, reveal) |
| js/chat.js | Chat Sensei + Nova + voz STT/TTS + imagen |
| js/recursos.js | Grid dinámico + filtros + visor modal + descarga |
| js/auth.js | Login/logout JWT |
| admin/login.html | Login docente (con fondo samurai) |
| admin/upload.html | Subir recursos con auto-detección tipo + IA genera descripción |
| admin/dashboard.html | Panel con editar/baja de recursos |
| workers/worker.js | Worker unificado Cloudflare |
| workers/wrangler.toml | Config R2, D1, AI bindings |
| workers/schema.sql | Schema D1 original |
| scripts/process-pdfs.js | Pipeline RAG (Node.js) |
| pdfs-matematicas/ | 9 libros PDF (solo local, NO en git) |
| REPORTE.md | Reporte estado proyecto |
| SESION.md | Esta sesión |

## Estado Actual (al cierre)

### Implementado durante la sesión
1. **API Keys regeneradas** — Groq y Gemini ya no están rate-limited
2. **Endpoint portada** — `GET /api/recurso/:id/portada` sirve imágenes desde R2 con MIME type correcto
3. **Portada en tarjetas** — Las fichas del grid muestran la portada como `background-image` con `background-size:cover; background-position:center` → centrado garantizado. Fallback automático a icono si no hay portada o no carga
4. **Pestaña Descargar** — Modal ahora tiene dos pestañas funcionales: "👁 Vista Previa" y "⬇ Descargar" con info del archivo + botón de descarga para todos los formatos
5. **Fondo samurai en admin** — login.html, upload.html y dashboard.html tienen hero-bg con fondo.png, canvas de estrellas, parallax y partículas (mediante app.js)
6. **Z-index corregido** — `.admin-container` con `position:relative; z-index:2` para que el contenido esté sobre hero-bg y starsCanvas
7. **Inputs más visibles** — Opacidad de fondo subida de 3% a 8%
8. **Cursor invisible en admin** — Corregido: solo se agrega `body.has-mouse` (cursor:none) si `cursorWrap` existe en la página
9. **Ruta fondo.png dinámica** — `app.js` detecta si la URL contiene `/admin/` y usa `../fondo.png` en vez de `fondo.png`

### Problemas Conocidos
1. **Password en texto plano** en D1 — Mejorar con bcrypt si hay más docentes
2. **Solo Matemáticas** disponible como materia activa
3. **PPT/PPTX solo lectura** — Se visualizan con Office Online, no ejecutan macros/animaciones
4. **fondo.png ~893KB** — Podría optimizarse para velocidad de carga
5. **Sin analytics** — No hay registro de uso

## Decisiones Técnicas Clave
- Worker unificado: simplicidad de deploy y secrets
- File serving desde Worker (no r2.dev directo): control de acceso, MIME types
- Portada servida desde Worker con endpoint dedicado (no R2 público)
- Background-image en vez de `<img>` para portada: centrado garantizado sin depender de object-fit/flexbox
- JWT simple (base64 + firma dummy): suficiente para un solo docente
- CORS abierto: necesario porque frontend está en GitHub Pages (dominio diferente)
- app.js compartido entre main y admin: null checks en todos los elementos para evitar errores

## Para Mañana
Ver REPORTE.md para el plan detallado. Puntos clave:
1. Subir recursos educativos (juegos HTML, videos, PDFs, imágenes)
2. Probar flujo completo con portada
3. Verificar chat Sensei + Nova con APIs regeneradas
4. Optimizar fondo.png
