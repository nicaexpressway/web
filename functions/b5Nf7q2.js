// functions/b5Nf7q2.js
import { corsHeaders, authorize } from './_shared.js';

async function runQuery(env, sql, bindings = []) {
  if (!Array.isArray(bindings)) bindings = [];
  const stmt = env.DB.prepare(sql);
  try {
    if (bindings.length > 0) {
      const safe = bindings.map(b => (b === undefined ? null : b));
      const res = await stmt.bind(...safe).all();
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
    const safe = bindings.map(b => (b === undefined ? null : b));
    const res = await stmt.bind(...safe).run();
    return res || {};
  } catch (err) {
    err.__sql = sql;
    err.__bindings = bindings;
    throw err;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin') || '*';

  try {
    const body = await request.json().catch(()=>({}));

    const nombre = body.nombre ?? body.nombreSolicitar ?? body.nombre_cliente ?? null;
    const telefono = body.telefono ?? body.telefonoSolicitar ?? body.phone ?? null;
    const agencia = body.agencia ?? body.plataforma ?? body.plataformaSolicitar ?? null;
    const descripcion = body.descripcion ?? body.descripcionSolicitar ?? body.description ?? null;
    const tipo_envio_id = (function(){
      // soporte: numeric id or string values 'aereo'/'maritimo'
      const t = body.tipo_envio ?? body.tipo ?? body.tipo_envio_id ?? body.tipoEnvio;
      if (t === 1 || t === '1') return 1;
      if (t === 2 || t === '2') return 2;
      if (typeof t === 'string') {
        const s = t.toLowerCase();
        if (s.includes('aire') || s.includes('aereo')) return 1;
        if (s.includes('marit') || s.includes('maritimo')) return 2;
      }
      return null;
    })();
    const peso_aprox = body.peso_aprox ?? body.peso ?? body.pesoSolicitar ?? null;

    // Basic validation
    if (!nombre || !telefono) {
      return new Response(JSON.stringify({ error: 'nombre and telefono required' }), { status: 400, headers: corsHeaders(origin) });
    }

    await runExec(env, `
      INSERT INTO pedidos
      (nombre, telefono, agencia, descripcion, tipo_envio_id, peso_aprox, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, [nombre, telefono, agencia, descripcion, tipo_envio_id, peso_aprox]);

    const rows = await runQuery(env, `SELECT * FROM pedidos ORDER BY id DESC LIMIT 1`);
    const created = rows.length ? rows[0] : null;
    return new Response(JSON.stringify(created), { status: 201, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
  } catch (e) {
    console.error('POST /b5Nf7q2 error:', e?.message ?? e, { sql: e?.__sql, bindings: e?.__bindings });
    return new Response(JSON.stringify({ error: 'server error', message: e?.message ?? String(e) }), { status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin') || '*';

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') || null;
    const nombre = url.searchParams.get('nombre') || null;
    const telefono = url.searchParams.get('telefono') || null;

    if (id) {
      const rows = await runQuery(env, `SELECT * FROM pedidos WHERE id = ? LIMIT 1`, [id]);
      if (!rows.length) return new Response(JSON.stringify({ error: 'No encontrado' }), { status: 404, headers: corsHeaders(origin) });
      return new Response(JSON.stringify(rows[0]), { headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
    }

    if (nombre) {
      // escape percent signs to avoid injection-ish issues (we still use binding)
      const q = `%${String(nombre).toLowerCase()}%`;
      const rows = await runQuery(env, `
        SELECT * FROM pedidos
        WHERE lower(nombre) LIKE ?
        ORDER BY id DESC
      `, [q]);
      return new Response(JSON.stringify(rows || []), { headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
    }

    if (telefono) {
      const rows = await runQuery(env, `SELECT * FROM pedidos WHERE telefono = ? ORDER BY id DESC`, [telefono]);
      return new Response(JSON.stringify(rows || []), { headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
    }

    const rows = await runQuery(env, `SELECT * FROM pedidos ORDER BY id DESC`);
    return new Response(JSON.stringify(rows || []), { headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
  } catch (e) {
    console.error('GET /b5Nf7q2 error:', e?.message ?? e, { sql: e?.__sql, bindings: e?.__bindings });
    return new Response(JSON.stringify({ error: 'server error', message: e?.message ?? String(e) }), { status: 500, headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(origin)) });
  }
}
