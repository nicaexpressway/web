// functions/m7k2Z.js (Historial por codigo)
import { corsHeaders, authorize } from './_shared.js';

async function runQuery(env, sql, bindings = []) {
  if (!Array.isArray(bindings)) bindings = [];
  const stmt = env.DB.prepare(sql);
  try {
    const safe = bindings.map(b => (b === undefined ? null : b));
    const res = await stmt.bind(...safe).all();
    return res && Array.isArray(res.results) ? res.results : [];
  } catch (err) {
    err.__sql = sql;
    err.__bindings = bindings;
    throw err;
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin') || '*';

  try {
    const url = new URL(request.url);
    const codigo = url.searchParams.get('codigo') || null;

    if (!codigo) {
      return new Response(JSON.stringify({ error: 'codigo required' }), { status: 400, headers: corsHeaders(origin) });
    }

    const rows = await runQuery(env, `SELECT * FROM historial WHERE codigo_seguimiento = ? LIMIT 1`, [codigo]);
    return new Response(JSON.stringify(rows?.[0] || null), { headers: corsHeaders(origin) });
  } catch (err) {
    console.error('GET /m7k2Z error:', err?.message ?? err, { sql: err?.__sql, bindings: err?.__bindings });
    return new Response(
      JSON.stringify({ error: 'server error', message: err?.message ?? String(err) }),
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
