// KODAMI SENSEI — Tutor con RAG (libros) + Groq + Gemini + Workers AI fallback
export default {
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') {
      return new Response('Sensei API OK', { headers: cors });
    }
    try {
      const { message, history = [], imagen } = await request.json();
      if (!message && !imagen) {
        return jsonResponse({ choices: [{ message: { content: '¿En qué puedo ayudarte, guerrero?' } }] }, cors);
      }

      // Si hay imagen, procesar con Gemini primero
      let imageContext = '';
      if (imagen) {
        try {
          imageContext = await analizarImagen(env, imagen, message || 'Describe esta imagen');
        } catch {
          imageContext = '(No se pudo analizar la imagen)';
        }
      }

      // 1. RAG: Buscar en chunks de libros
      const chunks = await buscarEnLibros(env, message);
      
      // 2. Construir contexto de libros
      const contextoLibros = chunks.length > 0
        ? chunks.map(c => `[Libro: ${c.libro}] ${c.contenido}`).join('\n\n')
        : '';

      // 3. Buscar recursos locales en D1
      let recursosLocales = [];
      try {
        const { results } = await env.DB.prepare(
          'SELECT titulo, tipo, descripcion, archivo_url FROM recursos WHERE materia = ? AND activo = 1 ORDER BY visitas DESC LIMIT 5'
        ).bind('matematicas').all();
        recursosLocales = results;
      } catch {}

      const recursosContext = recursosLocales.length > 0
        ? '\n\n## RECURSOS DISPONIBLES EN KODAMI:\n' + recursosLocales.map(r => 
          `- ${r.titulo} (${r.tipo}): ${r.descripcion} — accesible en la plataforma`
        ).join('\n')
        : '';

      // 4. Construir system prompt
      const systemPrompt = `Eres Sensei 🦝⚔️, el Guardián del Conocimiento de KodamiAcademy.

## INSTRUCCIONES CRÍTICAS:
- Responde SOLO con la información de los fragmentos de libros proporcionados abajo.
- Si la pregunta no está en los fragmentos, di: "No encontré esa información en los libros proporcionados, guerrero."
- NUNCA inventes información, conceptos o URLs.
- Usa lenguaje claro, breve (máximo 4 oraciones) y con energía samurai.
- Incluye emojis apropiados (⚔️📐📚🎯).
- Si hay recursos locales relevantes, menciónalos.${imageContext ? '\n\n## ANÁLISIS DE IMAGEN:\n' + imageContext : ''}${contextoLibros ? '\n\n## FRAGMENTOS DE LIBROS DE TEXTO:\n' + contextoLibros : '\n\n## NOTA: Aún no hay libros cargados en mi cerebro. Mis respuestas se basarán en conocimiento general.'}${recursosContext}

PREGUNTA: ${message || 'Analiza esta imagen'}`;

      // 5. Intentar modelos en orden
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-8),
        { role: 'user', content: message || 'Analiza la imagen' }
      ];

      let respuesta = null;

      // Intentar Groq (principal)
      if (env.GROQ_KEY) {
        respuesta = await tryGroq(env.GROQ_KEY, messages, 'llama-3.1-8b-instant', 800, 0.7);
      }

      // Fallback: Groq backup
      if (!respuesta && env.GROQ_KEY_BACKUP) {
        respuesta = await tryGroq(env.GROQ_KEY_BACKUP, messages, 'llama3-8b-8192', 800, 0.7);
      }

      // Fallback: Gemini
      if (!respuesta && env.geminiapi1) {
        respuesta = await tryGemini(env.geminiapi1, systemPrompt, message || 'Analiza la imagen', history);
      }

      // Fallback: Workers AI
      if (!respuesta) {
        respuesta = await tryWorkersAI(env, messages);
      }

      if (!respuesta) {
        respuesta = 'Los modelos están sobrecargados, guerrero. Intenta de nuevo en unos momentos. ⚔️';
      }

      return jsonResponse({ choices: [{ message: { content: respuesta } }] }, cors);
    } catch (e) {
      return jsonResponse({ choices: [{ message: { content: `Error: ${e.message}. Intenta de nuevo.` } }] }, cors);
    }
  }
};

async function buscarEnLibros(env, query) {
  if (!query || !env.DB) return [];
  try {
    // Búsqueda simple por palabras clave en chunks (sin embeddings para velocidad)
    const palabras = query.toLowerCase().split(' ').filter(p => p.length > 3).slice(0, 8);
    if (palabras.length === 0) return [];
    const conditions = palabras.map(() => 'contenido LIKE ?').join(' AND ');
    const params = palabras.map(p => `%${p}%`);
    const { results } = await env.DB.prepare(
      `SELECT libro, contenido FROM cerebro_chunks WHERE materia = 'matematicas' AND ${conditions} LIMIT 5`
    ).bind(...params).all();
    return results || [];
  } catch {
    return [];
  }
}

async function tryGroq(key, messages, model, maxTokens, temp) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: temp }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch { return null; }
}

async function tryGemini(key, systemPrompt, message, history) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const contents = [
      ...history.slice(-6).map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: message }] }
    ];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig: { maxOutputTokens: 800, temperature: 0.7 } }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch { return null; }
}

async function tryWorkersAI(env, messages) {
  try {
    const res = await env.AI.run('@cf/meta/llama-3-8b-instruct', { messages, max_tokens: 800 });
    return res?.response || null;
  } catch {
    try {
      const res = await env.AI.run('@cf/mistral/mistral-7b-instruct-v0.1', { messages, max_tokens: 800 });
      return res?.response || null;
    } catch {
      return null;
    }
  }
}

async function analizarImagen(env, imagenBase64, pregunta) {
  // Usar Gemini Vision si está disponible
  if (env.geminiapi1) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.geminiapi1}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: pregunta || 'Describe esta imagen matemática' },
              { inline_data: { mime_type: 'image/jpeg', data: imagenBase64 } }
            ]
          }],
          generationConfig: { maxOutputTokens: 500 }
        })
      });
      if (!res.ok) throw new Error('Gemini vision failed');
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch {}
  }
  // Fallback: Workers AI LLaVA
  try {
    const res = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
      image: imagenBase64,
      prompt: pregunta || 'Describe esta imagen matemática',
      max_tokens: 500
    });
    return res?.description || res?.response || '';
  } catch { return ''; }
}

function jsonResponse(data, cors) {
  return new Response(JSON.stringify(data), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}
