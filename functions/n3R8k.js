// functions/n3R8k.js
import { corsHeaders, authorize } from './_shared.js';

async function runQuery(env, sql, bindings = []) {
  if (!Array.isArray(bindings)) bindings = [];
  const stmt = env.DB.prepare(sql);
  try {
    if (bindings.length > 0) {
      const safeBindings = bindings.map(b => (b === undefined ? null : b));
      const res = await stmt.bind(...safeBindings).all();
      return res && Array.isArray(res.results) ? res.results : [];
    } else {
      const res = await stmt.all();
      return res && Array.isArray(res.results) ? res.results : [];
    }
  } catch (err) {
    err.__sql = sql;
    err.__bindings = bindings;
    throw err;
  }
}

async function runExec(env, sql, bindings = []) {
  if (!Array.isArray(bindings)) bindings = [];
  const stmt = env.DB.prepare(sql);
  try {
    const safeBindings = bindings.map(b => (b === undefined ? null : b));
    const res = await stmt.bind(...safeBindings).run();
    return res || {};
  } catch (err) {
    err.__sql = sql;
    err.__bindings = bindings;
    throw err;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: true });
  if (auth) return auth;
  const origin = request.headers.get('origin') || '*';

  try {
    const body = await request.json().catch(()=>({}));
    const titulo = body.titulo ?? body.title ?? null;
    const descripcion = body.descripcion ?? body.description ?? null;
    const fecha_limite = body.fecha_limite ?? body.date ?? null;

    if (!titulo || !descripcion || !fecha_limite) {
      return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400, headers: corsHeaders(origin) });
    }

    await runExec(env, `INSERT INTO recordatorios (titulo, descripcion, fecha_limite) VALUES (?, ?, ?)`, [titulo, descripcion, fecha_limite]);

    const rows = await runQuery(env, `SELECT * FROM recordatorios ORDER BY id DESC LIMIT 1`);
    const row = rows.length ? rows[0] : null;
    return new Response(JSON.stringify(row), { headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
  } catch (e) {
    console.error('POST /n3R8k error:', e?.message ?? e, { sql: e?.__sql, bindings: e?.__bindings });
    return new Response(JSON.stringify({ error: 'server error', message: e?.message ?? String(e) }), { status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin') || '*';

  try {
    const rows = await runQuery(env, `SELECT * FROM recordatorios ORDER BY fecha_limite ASC`);
    return new Response(JSON.stringify(rows || []), { headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
  } catch (e) {
    console.error('GET /n3R8k error:', e?.message ?? e, { sql: e?.__sql, bindings: e?.__bindings });
    return new Response(JSON.stringify({ error: 'server error', message: e?.message ?? String(e) }), { status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: true });
  if (auth) return auth;
  const origin = request.headers.get('origin') || '*';

  try {
    const url = new URL(request.url);
    // extrae id tanto de path como de query param para ser tolerante
    let id = url.pathname.split('/').pop() || url.searchParams.get('id') || null;
    if (id === '' || id === 'n3R8k') id = null;
    if (!id) {
      // si el body trae id, aceptarlo (por compatibilidad)
      const body = await request.json().catch(()=>({}));
      id = body.id ?? null;
    }
    if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: corsHeaders(origin) });

    // ejecutar delete
    await runExec(env, `DELETE FROM recordatorios WHERE id = ?`, [id]);
    return new Response(JSON.stringify({ success: true }), { headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
  } catch (e) {
    console.error('DELETE /n3R8k error:', e?.message ?? e, { sql: e?.__sql, bindings: e?.__bindings });
    return new Response(JSON.stringify({ error: 'server error', message: e?.message ?? String(e) }), { status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
  }
}
