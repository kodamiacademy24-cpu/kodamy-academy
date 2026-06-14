// KODAMI WORKER UNIFICADO v1.0
// Maneja: recursos, auth, upload, chat sensei, chat nova, search, vision
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
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
        const payload = await verifyJWT(auth.replace('Bearer ', ''));
        if (!payload) return json({ success: false, error: 'No autorizado' }, cors, 401);
        const { results } = await env.DB.prepare('SELECT * FROM recursos ORDER BY created_at DESC LIMIT 200').all();
        return json({ success: true, data: results }, cors);
      }

      // PUT /api/recursos/:id — editar recurso (requiere auth)
      const putMatch = path.match(/^\/api\/recursos\/(\d+)$/);
      if (putMatch && request.method === 'PUT') {
        const auth = request.headers.get('Authorization') || '';
        const payload = await verifyJWT(auth.replace('Bearer ', ''));
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
        const payload = await verifyJWT(auth.replace('Bearer ', ''));
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
        if (!docente || docente.password_hash !== password) return json({ success: false, error: 'Credenciales inválidas' }, cors, 401);
        const token = await createJWT({ id: docente.id, nombre: docente.nombre, email: docente.email });
        return json({ success: true, data: { token, nombre: docente.nombre, email: docente.email } }, cors);
      }

      if (path === '/api/auth/verify' && request.method === 'POST') {
        const auth = request.headers.get('Authorization') || '';
        const payload = await verifyJWT(auth.replace('Bearer ', ''));
        if (!payload) return json({ success: false, error: 'Token inválido' }, cors, 401);
        return json({ success: true, data: payload }, cors);
      }

      // ============================================
      // UPLOAD
      // ============================================
      if (path === '/api/upload' && request.method === 'POST') {
        const auth = request.headers.get('Authorization') || '';
        const payload = await verifyJWT(auth.replace('Bearer ', ''));
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

        if (!titulo || !archivo) return json({ success: false, error: 'Título y archivo requeridos' }, cors, 400);

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
        const contextoLibros = chunks.map(c => `[${c.libro}] ${c.contenido}`).join('\n\n');

        // Recursos locales relevantes
        let recursosLocales = [];
        try {
          const { results } = await env.DB.prepare(
            'SELECT titulo, tipo, descripcion, archivo_url FROM recursos WHERE materia = ? AND activo = 1 ORDER BY visitas DESC LIMIT 5'
          ).bind('matematicas').all();
          recursosLocales = results;
        } catch {}
        const recursosCtx = recursosLocales.map(r => `- ${r.titulo} (${r.tipo})`).join('\n');

        const systemPrompt = `Eres Sensei 🦝⚔️, Guardián del Conocimiento de KodamiAcademy.
Responde SOLO con la información de los fragmentos de libros provistos.
Si la respuesta no está en los fragmentos, di que no lo encontraste en los libros.
No inventes información ni URLs. Sé breve (máx 4 oraciones). Usa emojis samurai.
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
NUNCA inventes enlaces. Prioriza fuentes .edu, .gob, .org.
Sé breve (3-4 oraciones). Usa emojis (💙🔍🎯).
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
        const conLinks = respuesta.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="chat-link">$1</a>');
        return json({ choices: [{ message: { content: conLinks } }] }, cors);
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

const JWT_SECRET = 'kodami-secret-2026';

async function createJWT(payload) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const body = btoa(JSON.stringify({ ...payload, exp: Math.floor(Date.now()/1000)+86400 })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${header}.${body}.sig`;
}
async function verifyJWT(token) {
  try {
    const p = JSON.parse(atob(token.split('.')[1]));
    return p.exp > Math.floor(Date.now()/1000) ? p : null;
  } catch { return null; }
}

async function buscarChunks(env, query) {
  if (!query || !env.DB) return [];
  try {
    const palabras = query.toLowerCase()
      .replace(/[¿?¡!,.;:()\-"'«»]/g, '')
      .replace(/[áä]/g, 'a').replace(/[éë]/g, 'e').replace(/[íï]/g, 'i')
      .replace(/[óö]/g, 'o').replace(/[úü]/g, 'u').replace(/ñ/g, 'n')
      .split(' ').filter(p => p.length > 3).slice(0, 5);
    if (palabras.length === 0) return [];
    const conditions = palabras.map(() => 'contenido LIKE ?').join(' OR ');
    const params = palabras.map(p => `%${p}%`);
    const { results } = await env.DB.prepare(
      `SELECT libro, contenido FROM cerebro_chunks WHERE materia = 'matematicas' AND (${conditions}) LIMIT 10`
    ).bind(...params).all();
    return results || [];
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
