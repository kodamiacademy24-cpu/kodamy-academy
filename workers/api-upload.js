// KODAMI API UPLOAD — Subida de archivos a R2 + registro en D1
export default {
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST' || !request.url.includes('/api/upload')) {
      return new Response(JSON.stringify({ success: false, error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    try {
      // Verificar JWT
      const auth = request.headers.get('Authorization') || '';
      const token = auth.replace('Bearer ', '');
      if (!token) {
        return new Response(JSON.stringify({ success: false, error: 'No autorizado' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      // Validación simple de token (reusa lógica de auth)
      const payload = await verifySimpleJWT(token);
      if (!payload) {
        return new Response(JSON.stringify({ success: false, error: 'Token inválido' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      const formData = await request.formData();
      const titulo = formData.get('titulo')?.trim();
      const materia = formData.get('materia') || 'matematicas';
      const tema = formData.get('tema') || '';
      const tipo = formData.get('tipo') || '';
      const nivel = parseInt(formData.get('nivel') || '1');
      const descripcion = formData.get('descripcion')?.trim() || '';
      const archivo = formData.get('archivo');
      const portada = formData.get('portada');

      if (!titulo || !archivo) {
        return new Response(JSON.stringify({ success: false, error: 'Título y archivo requeridos' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      // Validar tipo de archivo
      const ext = archivo.name.split('.').pop().toLowerCase();
      const tiposPermitidos = ['pdf','epub','html','zip','apk','mp4','webm','mp3','wav','png','jpg','jpeg','gif','webp','doc','docx','ppt','pptx','txt'];
      if (!tiposPermitidos.includes(ext)) {
        return new Response(JSON.stringify({ success: false, error: `Extensión .${ext} no permitida` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      // Mapear tipo por extensión
      const tipoMap = {
        pdf:'libro', epub:'libro', html:'juego', zip:'juego', apk:'juego',
        mp4:'video', webm:'video', mp3:'audio', wav:'audio',
        png:'imagen', jpg:'imagen', jpeg:'imagen', gif:'imagen', webp:'imagen',
        doc:'documento', docx:'documento', ppt:'documento', pptx:'documento', txt:'documento'
      };
      const tipoReal = tipo || tipoMap[ext] || 'documento';

      // Generar UUID y ruta en R2
      const uuid = crypto.randomUUID();
      const rutaArchivo = `${materia}/${tema}/${tipoReal}/${uuid}.${ext}`;

      // Subir archivo a R2
      await env.RECURSOS.put(rutaArchivo, archivo.stream(), {
        httpMetadata: { contentType: archivo.type }
      });

      // Subir portada si existe
      let portadaUrl = '';
      if (portada && portada.size > 0) {
        const portadaExt = portada.name.split('.').pop().toLowerCase() || 'webp';
        const rutaPortada = `portadas/${uuid}.${portadaExt}`;
        await env.RECURSOS.put(rutaPortada, portada.stream(), {
          httpMetadata: { contentType: portada.type }
        });
        portadaUrl = rutaPortada;
      }

      // Generar descripción con IA si está vacía
      let descripcionFinal = descripcion;
      if (!descripcionFinal) {
        try {
          descripcionFinal = await generarDescripcion(env, titulo, tema, tipoReal);
        } catch {
          descripcionFinal = `Recurso educativo de ${tema || 'matemáticas'}`;
        }
      }

      // Guardar en D1
      const urlPublica = `${materia}/${tema}/${tipoReal}/${uuid}.${ext}`;
      const { success } = await env.DB.prepare(
        'INSERT INTO recursos (titulo, materia, tema, tipo, extension, descripcion, descripcion_ia, portada_url, archivo_url, nivel, docente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(titulo, materia, tema, tipoReal, ext, descripcionFinal, descripcion ? 0 : 1, portadaUrl, urlPublica, nivel, payload.id).run();

      if (!success) throw new Error('Error al guardar en BD');

      return new Response(JSON.stringify({ success: true, data: { id: success, titulo, tipo: tipoReal, url: urlPublica } }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }
};

async function generateDescription(env, titulo, tema, tipo) {
  const prompt = `Genera una descripción breve (máximo 2 oraciones) para un recurso educativo de matemáticas con estos datos:\nTítulo: ${titulo}\nTema: ${tema}\nTipo: ${tipo}\n\nDescripción:`;
  try {
    const res = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100
    });
    return res?.response?.trim() || `Recurso educativo: ${titulo}`;
  } catch {
    return `Recurso educativo de ${tema || 'matemáticas'}: ${titulo}`;
  }
}

// JWT simple (replicado del auth worker para independencia)
const JWT_SECRET = 'kodami-secret-2026-change-in-production';
async function verifySimpleJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
