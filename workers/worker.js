// KODAMI WORKER UNIFICADO v1.0
// Maneja: recursos, auth, upload, chat sensei, chat nova, search, vision
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      // ============================================
      // RECURSOS
      // ============================================
      if (path === '/api/recursos' && request.method === 'GET') {
        const materia = url.searchParams.get('materia') || 'matematicas';
        const tipo = url.searchParams.get('tipo') || '';
        const q = url.searchParams.get('q') || '';
        let sql = 'SELECT * FROM recursos WHERE materia = ? AND activo = 1';
        const params = [materia];
        if (tipo && tipo !== 'all') { sql += ' AND tipo = ?'; params.push(tipo); }
        if (q) { sql += ' AND (titulo LIKE ? OR descripcion LIKE ? OR tema LIKE ?)'; const s = `%${q}%`; params.push(s, s, s); }
        sql += ' ORDER BY created_at DESC LIMIT 100';
        const { results } = await env.DB.prepare(sql).bind(...params).all();
        return json({ success: true, data: results }, cors);
      }

      const idMatch = path.match(/^\/api\/recursos\/(\d+)$/);
      if (idMatch && request.method === 'GET') {
        const rec = await env.DB.prepare('SELECT * FROM recursos WHERE id = ? AND activo = 1').bind(idMatch[1]).first();
        if (!rec) return json({ success: false, error: 'No encontrado' }, cors, 404);
        await env.DB.prepare('UPDATE recursos SET visitas = visitas + 1 WHERE id = ?').bind(idMatch[1]).run();
        return json({ success: true, data: rec }, cors);
      }

      // Admin: listar todos (incluyendo inactivos) — requiere auth
      if (path === '/api/recursos/admin' && request.method === 'GET') {
        const auth = request.headers.get('Authorization') || '';
        const payload = await verifyJWT(auth.replace('Bearer ', ''), env.JWT_SECRET);
        if (!payload) return json({ success: false, error: 'No autorizado' }, cors, 401);
        const { results } = await env.DB.prepare('SELECT * FROM recursos ORDER BY created_at DESC LIMIT 200').all();
        return json({ success: true, data: results }, cors);
      }

      // PUT /api/recursos/:id — editar recurso (requiere auth)
      const putMatch = path.match(/^\/api\/recursos\/(\d+)$/);
      if (putMatch && request.method === 'PUT') {
        const auth = request.headers.get('Authorization') || '';
        const payload = await verifyJWT(auth.replace('Bearer ', ''), env.JWT_SECRET);
        if (!payload) return json({ success: false, error: 'No autorizado' }, cors, 401);
        const body = await request.json();
        const { titulo, descripcion, tipo, tema, nivel } = body;
        if (!titulo) return json({ success: false, error: 'Título requerido' }, cors, 400);
        await env.DB.prepare('UPDATE recursos SET titulo=?, descripcion=?, tipo=?, tema=?, nivel=? WHERE id=?')
          .bind(titulo, descripcion || '', tipo || '', tema || '', nivel || 1, putMatch[1]).run();
        return json({ success: true }, cors);
      }

      // DELETE /api/recursos/:id — baja lógica (requiere auth)
      if (putMatch && request.method === 'DELETE') {
        const auth = request.headers.get('Authorization') || '';
        const payload = await verifyJWT(auth.replace('Bearer ', ''), env.JWT_SECRET);
        if (!payload) return json({ success: false, error: 'No autorizado' }, cors, 401);
        await env.DB.prepare('UPDATE recursos SET activo=0 WHERE id=?').bind(putMatch[1]).run();
        return json({ success: true }, cors);
      }

      if (path === '/api/stats' && request.method === 'GET') {
        const total = await env.DB.prepare('SELECT COUNT(*) as count FROM recursos WHERE activo = 1').first();
        return json({ success: true, data: { total: total.count } }, cors);
      }

      if (path === '/api/temas' && request.method === 'GET') {
        const materia = url.searchParams.get('materia') || 'matematicas';
        const { results } = await env.DB.prepare('SELECT * FROM temas WHERE materia = ? ORDER BY nombre').bind(materia).all();
        return json({ success: true, data: results }, cors);
      }



      // ============================================
      // AUTH
      // ============================================
      if (path === '/api/auth/login' && request.method === 'POST') {
        const { email, password } = await request.json();
        if (!email || !password) return json({ success: false, error: 'Credenciales requeridas' }, cors, 400);
        const docente = await env.DB.prepare('SELECT * FROM docentes WHERE email = ?').bind(email).first();
        if (!docente) return json({ success: false, error: 'Credenciales inválidas' }, cors, 401);

        // Soporte dual: hash PBKDF2 (nuevo) o texto plano (legacy, migración pendiente)
        let valid = false;
        if (docente.password_hash.includes(':')) {
          // Formato nuevo: salt:hash
          valid = await verifyPassword(password, docente.password_hash);
        } else {
          // Formato legacy: texto plano — comparación directa
          valid = docente.password_hash === password;
        }
        if (!valid) return json({ success: false, error: 'Credenciales inválidas' }, cors, 401);

        const token = await createJWT({ id: docente.id, nombre: docente.nombre, email: docente.email }, env.JWT_SECRET);
        return json({ success: true, data: { token, nombre: docente.nombre, email: docente.email } }, cors);
      }

      if (path === '/api/auth/verify' && request.method === 'POST') {
        const auth = request.headers.get('Authorization') || '';
        const payload = await verifyJWT(auth.replace('Bearer ', ''), env.JWT_SECRET);
        if (!payload) return json({ success: false, error: 'Token inválido' }, cors, 401);
        return json({ success: true, data: payload }, cors);
      }

      // POST /api/auth/setup-hash — migra contraseña de texto plano a PBKDF2
      // Úsalo UNA VEZ desde el panel de docente o con curl. Luego ya no es necesario.
      if (path === '/api/auth/setup-hash' && request.method === 'POST') {
        const auth = request.headers.get('Authorization') || '';
        const payload = await verifyJWT(auth.replace('Bearer ', ''), env.JWT_SECRET);
        if (!payload) return json({ success: false, error: 'No autorizado' }, cors, 401);
        const { password } = await request.json();
        if (!password) return json({ success: false, error: 'Password requerido' }, cors, 400);
        const hashed = await hashPassword(password);
        await env.DB.prepare('UPDATE docentes SET password_hash = ? WHERE id = ?')
          .bind(hashed, payload.id).run();
        return json({ success: true, message: 'Contraseña migrada a hash seguro' }, cors);
      }

      // ============================================
      // UPLOAD
      // ============================================
      if (path === '/api/upload' && request.method === 'POST') {
        const auth = request.headers.get('Authorization') || '';
        const payload = await verifyJWT(auth.replace('Bearer ', ''), env.JWT_SECRET);
        if (!payload) return json({ success: false, error: 'No autorizado' }, cors, 401);

        const formData = await request.formData();
        const titulo = formData.get('titulo')?.trim();
        const materia = formData.get('materia') || 'matematicas';
        const tema = formData.get('tema') || '';
        const tipo = formData.get('tipo') || '';
        const nivel = parseInt(formData.get('nivel') || '1');
        const descripcion = formData.get('descripcion')?.trim() || '';
        const archivo = formData.get('archivo');
        const portada = formData.get('portada');
        const embedUrl = formData.get('url')?.trim();

        if (!titulo) return json({ success: false, error: 'Título requerido' }, cors, 400);

        // MODO EMBED: URL externa
        if (embedUrl) {
          const domain = new URL(embedUrl).hostname.replace('www.', '');
          let embedTipo = 'embed';
          let ext = 'link';
          if (domain.includes('youtube') || domain.includes('youtu.be')) ext = 'youtube';
          else if (domain.includes('geogebra')) ext = 'geogebra';
          else if (domain.includes('khanacademy')) ext = 'khanacademy';
          else if (domain.includes('desmos')) ext = 'desmos';
          else if (embedUrl.match(/\.(mp4|webm)$/i)) ext = 'video';
          const tipoReal = tipo || embedTipo;
          const descFinal = descripcion || `Recurso externo de ${tema || 'matemáticas'}: ${titulo}`;
          await env.DB.prepare('INSERT INTO recursos (titulo, materia, tema, tipo, extension, descripcion, descripcion_ia, portada_url, archivo_url, nivel, docente_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
            .bind(titulo, materia, tema, tipoReal, ext, descFinal, descripcion ? 0 : 1, '', embedUrl, nivel, payload.id).run();
          return json({ success: true, data: { titulo, tipo: tipoReal, embed: true, url: embedUrl } }, cors);
        }

        // MODO ARCHIVO
        if (!archivo) return json({ success: false, error: 'Archivo o URL requerido' }, cors, 400);
        const ext = archivo.name.split('.').pop().toLowerCase();
        const tiposPermitidos = ['pdf','epub','html','zip','apk','mp4','webm','mp3','wav','png','jpg','jpeg','gif','webp','doc','docx','ppt','pptx','txt'];
        if (!tiposPermitidos.includes(ext)) return json({ success: false, error: `Extensión .${ext} no permitida` }, cors, 400);

        const tipoMap = { pdf:'libro', epub:'libro', html:'juego', zip:'juego', apk:'juego', mp4:'video', webm:'video', mp3:'audio', wav:'audio', png:'imagen', jpg:'imagen', jpeg:'imagen', gif:'imagen', webp:'imagen', doc:'documento', docx:'documento', ppt:'documento', pptx:'documento', txt:'documento' };
        const tipoReal = tipo || tipoMap[ext] || 'documento';

        const uuid = crypto.randomUUID();
        const rutaArchivo = `${materia}/${tema}/${tipoReal}/${uuid}.${ext}`;

        await env.RECURSOS.put(rutaArchivo, archivo.stream(), { httpMetadata: { contentType: archivo.type } });

        let portadaUrl = '';
        if (portada && portada.size > 0) {
          const pext = portada.name.split('.').pop().toLowerCase() || 'webp';
          portadaUrl = `portadas/${uuid}.${pext}`;
          await env.RECURSOS.put(portadaUrl, portada.stream(), { httpMetadata: { contentType: portada.type } });
        }
        let descFinal = descripcion;
        if (!descFinal) descFinal = `Recurso educativo de ${tema || 'matemáticas'}: ${titulo}`;

        await env.DB.prepare('INSERT INTO recursos (titulo, materia, tema, tipo, extension, descripcion, descripcion_ia, portada_url, archivo_url, nivel, docente_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .bind(titulo, materia, tema, tipoReal, ext, descFinal, descripcion ? 0 : 1, portadaUrl, rutaArchivo, nivel, payload.id).run();

        return json({ success: true, data: { titulo, tipo: tipoReal, url: rutaArchivo } }, cors);
      }

      // GET /api/debug/groq — Probar Groq directamente desde el worker
      if (path === '/api/debug/groq' && request.method === 'GET') {
        try {
          const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.GROQ_KEY}` },
            body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: 'Hola' }], max_tokens: 50 })
          });
          if (!r.ok) {
            const txt = await r.text();
            return json({ success: false, status: r.status, body: txt.substring(0, 500) }, cors);
          }
          const d = await r.json();
          return json({ success: true, respuesta: d.choices?.[0]?.message?.content, modelo: d.model }, cors);
        } catch (e) {
          return json({ success: false, error: e.message }, cors);
        }
      }

      // GET /api/recurso/:id/archivo — Sirve archivo desde R2
      const fileMatch = path.match(/^\/api\/recurso\/(\d+)\/archivo$/);
      if (fileMatch && request.method === 'GET') {
        const rec = await env.DB.prepare('SELECT archivo_url, extension, tipo FROM recursos WHERE id = ? AND activo = 1').bind(fileMatch[1]).first();
        if (!rec) return json({ success: false, error: 'No encontrado' }, cors, 404);
        const obj = await env.RECURSOS.get(rec.archivo_url);
        if (!obj) return json({ success: false, error: 'Archivo no encontrado' }, cors, 404);
        const mimeTypes = {
          pdf:'application/pdf', epub:'application/epub+zip', html:'text/html',
          zip:'application/zip', apk:'application/vnd.android.package-archive',
          mp4:'video/mp4', webm:'video/webm', mp3:'audio/mpeg', wav:'audio/wav',
          png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp',
          doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ppt:'application/vnd.ms-powerpoint', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          txt:'text/plain'
        };
        const headers = new Headers({
          'Content-Type': mimeTypes[rec.extension] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
          'Content-Disposition': rec.tipo === 'juego' && rec.extension !== 'apk' ? 'inline' : 'inline'
        });
        return new Response(obj.body, { headers });
      }

      // GET /api/recurso/:id/portada — Sirve portada desde R2
      const portadaMatch = path.match(/^\/api\/recurso\/(\d+)\/portada$/);
      if (portadaMatch && request.method === 'GET') {
        const rec = await env.DB.prepare('SELECT portada_url FROM recursos WHERE id = ? AND activo = 1').bind(portadaMatch[1]).first();
        if (!rec || !rec.portada_url) return json({ success: false, error: 'Sin portada' }, cors, 404);
        const obj = await env.RECURSOS.get(rec.portada_url);
        if (!obj) return json({ success: false, error: 'Portada no encontrada' }, cors, 404);
        const ext = rec.portada_url.split('.').pop().toLowerCase();
        const mimeTypes = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp' };
        const headers = new Headers({
          'Content-Type': mimeTypes[ext] || 'image/webp',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        });
        return new Response(obj.body, { headers });
      }

      // CEREBRO: endpoint para subir chunks de libros (RAG)
      if (path === '/api/cerebro/chunk' && request.method === 'POST') {
        const { materia, libro, chunk_index, contenido } = await request.json();
        if (!libro || !contenido) return json({ success: false, error: 'Datos incompletos' }, cors, 400);
        await env.DB.prepare('INSERT INTO cerebro_chunks (materia, libro, chunk_index, contenido) VALUES (?,?,?,?)')
          .bind(materia || 'matematicas', libro, chunk_index || 0, contenido).run();
        return json({ success: true }, cors);
      }

      if (path === '/api/cerebro/stats' && request.method === 'GET') {
        const total = await env.DB.prepare('SELECT COUNT(*) as count FROM cerebro_chunks').first();
        const libros = await env.DB.prepare('SELECT COUNT(DISTINCT libro) as count FROM cerebro_chunks').first();
        return json({ success: true, data: { total: total.count, libros: libros.count } }, cors);
      }

      // ============================================
      // SENSEI CHAT (RAG + Groq + Gemini + Workers AI)
      // ============================================
      if (path === '/api/chat/sensei' && request.method === 'POST') {
        const { message, history = [], imagen } = await request.json();
        if (!message && !imagen) return json({ choices: [{ message: { content: '¿En qué puedo ayudarte, guerrero? ⚔️' } }] }, cors);

        // Procesar imagen si existe
        let imageContext = '';
        if (imagen) {
          imageContext = await analizarImagen(env, imagen, message || 'Describe esta imagen');
        }

        // RAG: buscar en chunks
        const chunks = await buscarChunks(env, message);

        if (chunks.length > 0) {
          const contextoLibros = chunks.map(c => `[${c.libro}] ${c.contenido}`).join('\n\n');
          let recursosLocales = [];
          try {
            const { results } = await env.DB.prepare(
              'SELECT titulo, tipo, descripcion, archivo_url FROM recursos WHERE materia = ? AND activo = 1 ORDER BY visitas DESC LIMIT 5'
            ).bind('matematicas').all();
            recursosLocales = results;
          } catch {}
          const recursosCtx = recursosLocales.map(r => `- ${r.titulo} (${r.tipo})`).join('\n');

          const systemPrompt = `Eres Sensei 🦝⚔️, Guardián del Conocimiento de KodamiAcademy.
Usa los fragmentos de libros como referencia principal, pero si la pregunta va más allá de lo que cubren, complementa con tu conocimiento general.
NUNCA inventes información ni URLs falsas. Usa emojis.

Estructura tus respuestas así:
## Título del tema
**Explicación:** una o dos oraciones claras y directas.
- Punto clave 1
- Punto clave 2
- Punto clave 3
**Ejemplo:** si aplica, un ejemplo breve y práctico.
📚 **Fuentes:** libros consultados

Al final, verifica cada afirmación contra los fragmentos de libros. Si algo no se sostiene con los libros ni con tu conocimiento seguro, omítelo. Marca con "(según fuentes externas)" lo que no venga de los libros.
${imageContext ? '\n## IMAGEN:\n' + imageContext : ''}
${contextoLibros ? '\n## LIBROS:\n' + contextoLibros : '\n## Aún no hay libros cargados en mi cerebro.'}
${recursosCtx ? '\n## RECURSOS KODAMI:\n' + recursosCtx : ''}`;

          const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-8),
            { role: 'user', content: message || 'Analiza esta imagen' }
          ];

          let respuesta = await tryGroq(env.GROQ_KEY, messages, 'llama-3.1-8b-instant', 800, 0.7);
          if (!respuesta && env.GROQ_KEY_BACKUP) respuesta = await tryGroq(env.GROQ_KEY_BACKUP, messages, 'llama3-8b-8192', 800, 0.7);
          if (!respuesta && env.geminiapi1) respuesta = await tryGemini(env.geminiapi1, systemPrompt, message || 'Analiza la imagen', history);
          if (!respuesta) respuesta = await tryWorkersAI(env, messages);
          if (!respuesta) respuesta = 'Los modelos están recargando, guerrero. Intenta en un momento. ⚔️';

          // Si la IA no encontró la respuesta en los chunks, caer a web
          if (/no (lo |la )?encontr[ée]|no encontr[ée]|no (est[áa]|estaba)|no (hay|tengo)/i.test(respuesta)) {
            let resultadosWeb = await buscarWeb(message);
            const webCtx2 = resultadosWeb.length > 0
              ? '\n## WEB:\n' + resultadosWeb.map(r => `- ${r.titulo}: ${r.url} (${r.fuente})`).join('\n')
              : '';
            const novaPrompt2 = `Eres Sensei 🦝⚔️, Guardián del Conocimiento de KodamiAcademy.
No encontraste la respuesta en los libros, pero consultaste la web para ayudar.
Proporciona información actualizada con URLs verificadas. NUNCA inventes enlaces. Usa emojis.

Estructura tus respuestas así:
## Título del tema
**Explicación:** una o dos oraciones claras.
- Punto clave 1
- Punto clave 2
- Punto clave 3
🌐 **Fuentes:**
- [título](url) — dominio

Al final, verifica cada afirmación contra los resultados web. Si algo no se sostiene, omítelo.
${webCtx2}`;
            if (env.geminiapi1) respuesta = await tryGemini(env.geminiapi1, novaPrompt2, message, history);
            if (!respuesta && env.GROQ_KEY) respuesta = await tryGroq(env.GROQ_KEY, [{ role: 'system', content: novaPrompt2 }, ...history.slice(-8), { role: 'user', content: message }], 'llama-3.1-8b-instant', 600, 0.7);
            if (!respuesta) respuesta = await tryWorkersAI(env, [{ role: 'system', content: novaPrompt2 }, ...history.slice(-8), { role: 'user', content: message }]);
            if (!respuesta) respuesta = 'Los modelos están recargando, guerrero. Intenta en un momento. ⚔️';
          }

          return json({ choices: [{ message: { content: respuesta } }] }, cors);
        }

        // Fallback a búsqueda web (sin chunks)
        let resultadosWeb = await buscarWeb(message);
        const webCtx = resultadosWeb.length > 0
          ? '\n## WEB:\n' + resultadosWeb.map(r => `- ${r.titulo}: ${r.url} (${r.fuente})`).join('\n')
          : '\n## Sin resultados web confiables.';

        const novaPrompt = `Eres Sensei 🦝⚔️, Guardián del Conocimiento de KodamiAcademy.
No hay libros cargados con esta información, pero consultaste la web para ayudar.
Proporciona información actualizada con URLs verificadas. NUNCA inventes enlaces. Usa emojis.

Estructura tus respuestas así:
## Título del tema
**Explicación:** una o dos oraciones claras.
- Punto clave 1
- Punto clave 2
- Punto clave 3
🌐 **Fuentes:**
- [título](url) — dominio

Al final, verifica cada afirmación contra los resultados web. Si algo no se sostiene, omítelo.
${webCtx}`;

        let respuesta = null;
        if (env.geminiapi1) respuesta = await tryGemini(env.geminiapi1, novaPrompt, message, history);
        if (!respuesta && env.GROQ_KEY) respuesta = await tryGroq(env.GROQ_KEY, [{ role: 'system', content: novaPrompt }, ...history.slice(-8), { role: 'user', content: message }], 'llama-3.1-8b-instant', 600, 0.7);
        if (!respuesta) respuesta = await tryWorkersAI(env, [{ role: 'system', content: novaPrompt }, ...history.slice(-8), { role: 'user', content: message }]);
        if (!respuesta) respuesta = 'Los modelos están recargando, guerrero. Intenta en un momento. ⚔️';

        return json({ choices: [{ message: { content: respuesta } }] }, cors);
      }

      // ============================================
      // NOVA CHAT (Búsqueda web + Gemini + Groq)
      // ============================================
      if (path === '/api/chat/nova' && request.method === 'POST') {
        const { message, history = [] } = await request.json();
        if (!message) return json({ choices: [{ message: { content: '¡Dime qué buscas, explorador! 💙' } }] }, cors);

        let resultadosWeb = await buscarWeb(message);
        const webCtx = resultadosWeb.length > 0
          ? '\n## WEB:\n' + resultadosWeb.map(r => `- ${r.titulo}: ${r.url} (${r.fuente})`).join('\n')
          : '\n## Sin resultados web confiables.';

        const systemPrompt = `Eres Nova 💙🚀, Exploradora Digital de KodamiAcademy.
Proporciona información actualizada y URLs funcionales verificadas.
NUNCA inventes enlaces. Prioriza fuentes .edu, .gob, .org. Usa emojis (💙🔍🎯).

Estructura tus respuestas así:
## Título del tema
**Resumen:** una oración clara.
- Recurso 1 — descripción breve
- Recurso 2 — descripción breve
- Recurso 3 — descripción breve
🌐 **Fuentes:**
- [título](url) — dominio
${webCtx}`;

        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-8),
          { role: 'user', content: message }
        ];

        let respuesta = null;
        if (env.geminiapi1) respuesta = await tryGemini(env.geminiapi1, systemPrompt, message, history);
        if (!respuesta && env.GROQ_KEY) respuesta = await tryGroq(env.GROQ_KEY, messages, 'llama-3.1-8b-instant', 600, 0.7);
        if (!respuesta) respuesta = await tryWorkersAI(env, messages);
        if (!respuesta) respuesta = 'Los buscadores están recargando. Intenta en un momento. 💙';

        // Renderizar links
        return json({ choices: [{ message: { content: respuesta } }] }, cors);
      }

      // ============================================
      // VISIÓN (imagen)
      // ============================================
      if (path === '/api/vision' && request.method === 'POST') {
        const { imagen, pregunta } = await request.json();
        if (!imagen) return json({ success: false, error: 'Imagen requerida' }, cors, 400);
        const desc = await analizarImagen(env, imagen, pregunta || 'Describe esta imagen');
        return json({ success: true, data: { descripcion: desc } }, cors);
      }

      // ============================================
      // STT (Speech-to-Text con Groq Whisper)
      // ============================================
      if (path === '/api/stt' && request.method === 'POST') {
        const { audio } = await request.json();
        if (!audio) return json({ success: false, error: 'Audio requerido' }, cors, 400);
        const binary = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
        const form = new FormData();
        form.append('model', 'whisper-large-v3-turbo');
        form.append('language', 'es');
        form.append('file', new Blob([binary], { type: 'audio/webm' }), 'audio.webm');
        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.GROQ_KEY}` },
          body: form
        });
        if (!res.ok) return json({ success: false, error: 'Whisper falló' }, cors, 500);
        const data = await res.json();
        return json({ success: true, data: { text: data.text } }, cors);
      }

      // ============================================
      // SEARCH (búsqueda web directa)
      // ============================================
      if (path === '/api/search' && request.method === 'GET') {
        const q = url.searchParams.get('q');
        if (!q) return json({ success: false, error: 'Query requerida' }, cors, 400);
        const results = await buscarWeb(q);
        return json({ success: true, data: results }, cors);
      }

      return json({ success: false, error: 'Ruta no encontrada' }, cors, 404);
    } catch (e) {
      return json({ success: false, error: e.message }, cors, 500);
    }
  }
};

// ============================================
// HELPERS
// ============================================

function json(data, cors, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ============================================
// JWT con HMAC-SHA256 real (crypto.subtle nativo)
// ============================================

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getHMACKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']
  );
}

async function createJWT(payload, secret) {
  const s = secret || 'kodami-secret-2026';
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body   = b64url(new TextEncoder().encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now()/1000) + 86400 })));
  const key    = await getHMACKey(s);
  const sig    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

async function verifyJWT(token, secret) {
  try {
    const s = secret || 'kodami-secret-2026';
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;

    // Verificar firma HMAC
    const key = await getHMACKey(s);
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${header}.${body}`));
    if (!valid) return null;

    // Verificar expiración
    const p = JSON.parse(atob(body.replace(/-/g,'+').replace(/_/g,'/')));
    return p.exp > Math.floor(Date.now()/1000) ? p : null;
  } catch { return null; }
}

// ============================================
// PBKDF2 para contraseñas (crypto.subtle nativo)
// ============================================

async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password, stored) {
  try {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;

    const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
    const enc = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial, 256
    );
    const candidateHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    return candidateHex === hashHex;
  } catch { return false; }
}

async function buscarChunks(env, query) {
  if (!query || !env.DB) return [];
  try {
    let palabras = query.toLowerCase()
      .replace(/[¿?¡!,.;:()\-"'«»]/g, '')
      .split(' ').filter(p => p.length > 3).slice(0, 5);
    if (palabras.length === 0) return [];
    const toGlob = w => {
      const s = w.replace(/[áä]/g, 'a').replace(/[éë]/g, 'e').replace(/[íï]/g, 'i')
        .replace(/[óö]/g, 'o').replace(/[úü]/g, 'u').replace(/ñ/g, 'n');
      return '*'+s.replace(/a/g,'[aá]').replace(/e/g,'[eé]').replace(/i/g,'[ií]')
                  .replace(/o/g,'[oó]').replace(/u/g,'[uú]').replace(/n/g,'[nñ]')+'*';
    };
    const globs = palabras.map(toGlob);
    const cond = globs.map(() => 'contenido GLOB ?').join(' OR ');
    let { results } = await env.DB.prepare(
      `SELECT libro, chunk_index, contenido FROM cerebro_chunks WHERE materia = 'matematicas' AND (${cond}) LIMIT 20`
    ).bind(...globs).all();
    if (!results || results.length === 0) return [];
    // Quitar TOC, basura, cortos
    const limpios = results.filter(c => {
      const t = c.contenido;
      if (t.length < 400) return false;
      if (t.includes('Índice General')) return false;
      if (/\.{30,}/.test(t)) return false;
      return true;
    });
    // Score: preferir chunks que contengan MÁS palabras de la query
    const scored = limpios.map(c => {
      const lower = c.contenido.toLowerCase();
      const score = palabras.filter(p => lower.includes(p)).length;
      return { ...c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 4).map(c => ({ libro: c.libro, contenido: c.contenido.substring(0, 1200) }));
  } catch { return []; }
}

async function buscarWeb(query) {
  const resultados = [];
  const dominios = ['khanacademy.org','geogebra.org','desmos.com','educaplay.com','mathsisfun.com','vitutor.com','unam.mx','ipn.mx','gob.mx','edu.mx'];
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' matemáticas educativo')}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (res.ok) {
      const html = await res.text();
      const blocks = html.split('class="result__a"');
      for (let i = 1; i < Math.min(blocks.length, 6); i++) {
        const b = blocks[i];
        let url = (b.match(/href="([^"]+)"/) || [])[1] || '';
        if (url.includes('uddg=')) url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
        const title = (b.match(/>([^<]+)<\/a>/) || [])[1] || '';
        try {
          const domain = new URL(url).hostname.replace('www.', '');
          if (url && title && dominios.some(d => domain.includes(d))) resultados.push({ titulo: title, url, fuente: domain });
        } catch {}
      }
    }
  } catch {}
  return resultados;
}

async function tryGroq(key, messages, model, maxTokens, temp) {
  if (!key) return null;
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000);
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: temp }),
      signal: c.signal
    }); clearTimeout(t);
    if (!r.ok) return null;
    const d = await r.json(); return d.choices?.[0]?.message?.content || null;
  } catch { return null; }
}

async function tryGemini(key, systemPrompt, message, history) {
  if (!key) return null;
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000);
    const contents = [
      ...(history || []).slice(-6).map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: message }] }
    ];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig: { maxOutputTokens: 800, temperature: 0.7 } }),
      signal: c.signal
    }); clearTimeout(t);
    if (!r.ok) return null;
    const d = await r.json(); return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

async function tryWorkersAI(env, messages) {
  try {
    const r = await env.AI.run('@cf/meta/llama-3-8b-instruct', { messages, max_tokens: 800 });
    if (r?.response) return r.response;
    const r2 = await env.AI.run('@cf/mistral/mistral-7b-instruct-v0.1', { messages, max_tokens: 800 });
    return r2?.response || null;
  } catch { return null; }
}

async function analizarImagen(env, imagenBase64, pregunta) {
  if (env.geminiapi1) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.geminiapi1}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: pregunta }, { inline_data: { mime_type: 'image/jpeg', data: imagenBase64 } }] }], generationConfig: { maxOutputTokens: 500 } })
      });
      if (r.ok) { const d = await r.json(); return d.candidates?.[0]?.content?.parts?.[0]?.text || ''; }
    } catch {}
  }
  try {
    const r = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', { image: imagenBase64, prompt: pregunta, max_tokens: 500 });
    return r?.description || r?.response || '';
  } catch { return ''; }
}
