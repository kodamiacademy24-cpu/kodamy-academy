# Kodami Academy — Reporte v1.1

## ✅ Completado

### Infraestructura Cloudflare
- Worker unificado desplegado: `https://kodami-api.kodami-academy24.workers.dev` (v: `f5142aae`)
- R2 bucket público: `kodami-recursos` (archivos de recursos)
- R2 bucket privado: `kodami-cerebro` (PDFs originales)
- D1 database: `kodami-db` con 4 tablas (docentes, recursos, temas, cerebro_chunks)
- Secrets configurados: GROQ_KEY, GROQ_KEY_BACKUP, geminiapi1 (regenerados)

### API Endpoints
- `GET /api/recursos` — listar recursos (público)
- `GET /api/recursos/:id` — detalle recurso (público)
- `GET /api/recurso/:id/archivo` — servir archivo desde R2 (público)
- `GET /api/recurso/:id/portada` — servir portada desde R2 (público) ✨ nuevo
- `GET /api/recursos/admin` — listar todos (requiere auth)
- `PUT /api/recursos/:id` — editar recurso (requiere auth)
- `DELETE /api/recursos/:id` — baja lógica (requiere auth)
- `GET /api/stats` — estadísticas
- `GET /api/temas` — temas disponibles
- `POST /api/auth/login` — login docente
- `POST /api/auth/verify` — verificar token
- `POST /api/upload` — subir recurso (requiere auth)
- `POST /api/chat/sensei` — chat con RAG (Groq + Gemini + Workers AI)
- `POST /api/chat/nova` — chat con búsqueda web (Gemini + Groq)
- `POST /api/vision` — análisis de imágenes
- `GET /api/search` — búsqueda web directa
- `POST /api/cerebro/chunk` — subir chunk RAG
- `GET /api/cerebro/stats` — stats RAG

### RAG Pipeline
- 9 libros procesados → 4,630 chunks en D1
- Sensei responde basado en libros de texto

### Frontend
- Desplegado en GitHub Pages: https://kodamiacademy24-cpu.github.io/kodamy-academy/
- Diseño samurai/dojo con mascotas (Sensei + Nova)
- Chat Sensei (izquierda): RAG + Groq/Gemini/Workers AI
- Chat Nova (derecha): búsqueda web + Gemini
- Voz: Web Speech API (STT/TTS)
- Grid dinámico de recursos con filtros
- Visor modal con pestañas: Vista Previa + ⬇ Descargar ✨
- Portada visible como background-image centrada en cada tarjeta ✨
- Fallback a icono si no hay portada o falla la carga ✨
- Responsive mobile completo
- Admin panel con fondo samurai + estrellas ✨
- Login, upload, dashboard con editar/eliminar

## 📋 Pendiente

### Prioritario
1. **Subir recursos educativos** — Entrar a admin/upload.html, loguearse y subir:
   - Juegos HTML (Geogebra, Desmos embebidos)
   - Videos educativos
   - Documentos/material de apoyo
   - Imágenes

2. **Probar flujo completo** — Subir con portada → ver en grid → abrir visor → probar descarga

### Secundario
3. Agregar más materias (Ciencias, Historia, etc.) cuando haya contenido
4. Mejorar RAG con chunking más sofisticado si es necesario
5. Optimizar fondo.png (~893KB) para velocidad de carga
6. Mejorar seguridad: bcrypt para passwords, JWT con HMAC real
7. Agregar analytics de uso

## 🔑 Credenciales Docente

- **Email:** kodami.academy24@gmail.com
- **Contraseña:** admin123
- **URL login:** https://kodamiacademy24-cpu.github.io/kodamy-academy/admin/login.html

> ⚠️ Cambiar contraseña antes de uso público desde el dashboard de Cloudflare D1.
