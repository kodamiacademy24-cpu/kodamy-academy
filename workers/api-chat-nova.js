// KODAMI NOVA — Exploradora digital con búsqueda web
export default {
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') {
      return new Response('Nova API OK', { headers: cors });
    }
    try {
      const { message, history = [] } = await request.json();
      if (!message) {
        return jsonResponse({ choices: [{ message: { content: '¡Dime qué buscas, explorador! 💙' } }] }, cors);
      }

      // 1. Buscar en web (DuckDuckGo + Google)
      let resultadosWeb = [];
      try {
        resultadosWeb = await buscarWeb(message);
      } catch {}

      // 2. Buscar recursos locales en D1
      let recursosLocales = [];
      try {
        const { results } = await env.DB.prepare(
          'SELECT titulo, tipo, descripcion, archivo_url FROM recursos WHERE materia = ? AND activo = 1 AND (titulo LIKE ? OR descripcion LIKE ?) LIMIT 3'
        ).bind('matematicas', `%${message}%`, `%${message}%`).all();
        recursosLocales = results;
      } catch {}

      // 3. Construir contexto
      const webContext = resultadosWeb.length > 0
        ? '\n\n## RESULTADOS WEB VERIFICADOS:\n' + resultadosWeb.map(r => 
          `- ${r.titulo}: ${r.url} (${r.fuente})`
        ).join('\n')
        : '\n\n## NOTA: No se encontraron resultados web confiables.';

      const recursosContext = recursosLocales.length > 0
        ? '\n\n## RECURSOS EN KODAMI:\n' + recursosLocales.map(r => 
          `- ${r.titulo} (${r.tipo}): ${r.descripcion}`
        ).join('\n')
        : '';

      const systemPrompt = `Eres Nova 💙🚀, la Exploradora Digital de KodamiAcademy.

## INSTRUCCIONES:
- Buscas información en la web y en los recursos de Kodami.
- SIEMPRE proporciona URLs funcionales y verificables de los resultados.
- NUNCA inventes enlaces ni información.
- Prioriza fuentes educativas (.edu, .gob, .org, khanacademy, geogebra, etc.).
- Responde en máximo 3-4 oraciones con energía gamer.
- Usa emojis (💙🚀🔍🎯).
- Si el usuario pide imágenes, describe que puedes buscarlas.
- Firma tus respuestas como Nova.${webContext}${recursosContext}

PREGUNTA: ${message}`;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-8),
        { role: 'user', content: message }
      ];

      // 4. Intentar modelos (Gemini primero por ser mejor para web, luego Groq, luego Workers AI)
      let respuesta = null;

      // Gemini (principal para Nova)
      if (env.geminiapi1) {
        respuesta = await tryGemini(env.geminiapi1, systemPrompt, message, history);
      }

      // Fallback: Groq
      if (!respuesta && env.GROQ_KEY) {
        respuesta = await tryGroq(env.GROQ_KEY, messages, 'llama-3.1-8b-instant', 600, 0.7);
      }

      // Fallback: Workers AI
      if (!respuesta) {
        respuesta = await tryWorkersAI(env, messages);
      }

      if (!respuesta) {
        respuesta = 'Los buscadores están recargando, explorador. Intenta de nuevo en un momento. 💙';
      }

      // Renderizar links como HTML
      const respuestaConLinks = renderLinks(respuesta, resultadosWeb);

      return jsonResponse({ choices: [{ message: { content: respuestaConLinks } }] }, cors);
    } catch (e) {
      return jsonResponse({ choices: [{ message: { content: `Error: ${e.message}. Intenta de nuevo. 💙` } }] }, cors);
    }
  }
};

async function buscarWeb(query) {
  const resultados = [];
  const dominiosConfianza = ['khanacademy.org','geogebra.org','desmos.com','educaplay.com','mathsisfun.com','vitutor.com','youtube.com','unam.mx','ipn.mx','gob.mx','edu.mx'];

  // DuckDuckGo (principal)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' matemáticas educativo')}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (res.ok) {
      const html = await res.text();
      const blocks = html.split('class="result__a"');
      for (let i = 1; i < Math.min(blocks.length, 6); i++) {
        const block = blocks[i];
        const urlMatch = block.match(/href="([^"]+)"/);
        let rawUrl = urlMatch ? urlMatch[1] : '';
        if (rawUrl.includes('uddg=')) {
          rawUrl = decodeURIComponent(rawUrl.split('uddg=')[1].split('&')[0]);
        }
        const titleMatch = block.match(/>([^<]+)<\/a>/);
        const title = titleMatch ? titleMatch[1].trim() : '';
        try {
          const domain = new URL(rawUrl).hostname.replace('www.', '');
          if (rawUrl && title && dominiosConfianza.some(d => domain.includes(d))) {
            resultados.push({ titulo: title, url: rawUrl, fuente: domain });
          }
        } catch {}
      }
    }
  } catch {}

  return resultados;
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
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig: { maxOutputTokens: 600, temperature: 0.7 } }),
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
    const res = await env.AI.run('@cf/meta/llama-3-8b-instruct', { messages, max_tokens: 600 });
    return res?.response || null;
  } catch {
    try {
      const res = await env.AI.run('@cf/google/gemma-2b-it', { messages, max_tokens: 600 });
      return res?.response || null;
    } catch { return null; }
  }
}

function renderLinks(texto, resultados) {
  // Convertir URLs en texto a links clicables
  let renderizado = texto.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener" class="chat-link">$1</a>'
  );
  return renderizado;
}

function jsonResponse(data, cors) {
  return new Response(JSON.stringify(data), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}
