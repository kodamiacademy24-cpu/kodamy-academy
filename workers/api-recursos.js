// KODAMI API RECURSOS — Sirve recursos desde D1 + R2
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    try {
      // GET /api/recursos — lista filtrada
      if (url.pathname === '/api/recursos' && request.method === 'GET') {
        const materia = url.searchParams.get('materia') || 'matematicas';
        const tipo = url.searchParams.get('tipo') || '';
        const q = url.searchParams.get('q') || '';
        let sql = 'SELECT * FROM recursos WHERE materia = ? AND activo = 1';
        const params = [materia];
        if (tipo && tipo !== 'all') { sql += ' AND tipo = ?'; params.push(tipo); }
        if (q) { sql += ' AND (titulo LIKE ? OR descripcion LIKE ? OR tema LIKE ?)'; const s = `%${q}%`; params.push(s, s, s); }
        sql += ' ORDER BY created_at DESC LIMIT 100';
        const { results } = await env.DB.prepare(sql).bind(...params).all();
        return new Response(JSON.stringify({ success: true, data: results }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      // GET /api/recursos/:id — detalle
      const idMatch = url.pathname.match(/^\/api\/recursos\/(\d+)$/);
      if (idMatch && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM recursos WHERE id = ?').bind(idMatch[1]).all();
        if (!results.length) return new Response(JSON.stringify({ success: false, error: 'No encontrado' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
        await env.DB.prepare('UPDATE recursos SET visitas = visitas + 1 WHERE id = ?').bind(idMatch[1]).run();
        return new Response(JSON.stringify({ success: true, data: results[0] }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      // GET /api/stats — estadísticas
      if (url.pathname === '/api/stats' && request.method === 'GET') {
        const total = await env.DB.prepare('SELECT COUNT(*) as count FROM recursos WHERE activo = 1').first();
        const tipos = await env.DB.prepare('SELECT tipo, COUNT(*) as count FROM recursos WHERE activo = 1 GROUP BY tipo').all();
        return new Response(JSON.stringify({ success: true, data: { total: total.count, tipos: tipos.results } }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      // GET /api/temas — lista de temas por materia
      if (url.pathname === '/api/temas' && request.method === 'GET') {
        const materia = url.searchParams.get('materia') || 'matematicas';
        const { results } = await env.DB.prepare('SELECT * FROM temas WHERE materia = ? ORDER BY nombre').bind(materia).all();
        return new Response(JSON.stringify({ success: true, data: results }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: false, error: 'Not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }
};
