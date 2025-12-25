// functions/R8t6sQ.js
import { corsHeaders, authorize } from './_shared.js';

export async function onRequestOptions(context) {
  const origin = context.request.headers.get('origin') || '*';
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin)
  });
}

/**
 * Helper local: ejecutar consulta D1 de forma explícita y segura.
 * Evita ambigüedades del wrapper externo pasando exactamente
 * los bindings con .bind(...).
 */
async function runQuery(env, sql, bindings = []) {
  // bindings debe ser array; si no lo es, lo convertimos a array vacío
  if (!Array.isArray(bindings)) bindings = [];

  const stmt = env.DB.prepare(sql);
  let res;
  try {
    if (bindings.length > 0) {
      // Aseguramos que ningún binding sea undefined (usar null explícito si hace falta)
      const safeBindings = bindings.map(b => (b === undefined ? null : b));
      res = await stmt.bind(...safeBindings).all();
    } else {
      res = await stmt.all();
    }
    // en D1 la respuesta tiene .results
    return (res && Array.isArray(res.results)) ? res.results : [];
  } catch (err) {
    // relanzamos para manejar arriba y loggear con contexto
    err.__sql = sql;
    err.__bindings = bindings;
    throw err;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('origin') || '*';

  // autorización (igual que en otros endpoints)
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;

  if (!env.DB) {
    console.error('R8t6sQ: DB binding missing');
    return new Response(
      JSON.stringify({ error: 'DB binding missing' }),
      { status: 500, headers: corsHeaders(origin) }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    let nombre = body.nombre ?? null;
    let telefono = body.telefono ?? null;
    let codigo = body.codigo ?? null;

    // normalize: trim strings; si quedan vacíos -> null
    if (typeof nombre === 'string') {
      nombre = nombre.trim();
      if (nombre === '') nombre = null;
    } else {
      nombre = null;
    }
    if (typeof telefono === 'string') {
      telefono = telefono.trim();
      if (telefono === '') telefono = null;
    } else {
      telefono = null;
    }
    if (typeof codigo === 'string') {
      codigo = codigo.trim();
      if (codigo === '') codigo = null;
    } else {
      codigo = null;
    }

    // 1) búsqueda por codigo_seguimiento (más precisa) -> devolver array
    if (codigo) {
      const sql = `SELECT * FROM paquetes WHERE codigo_seguimiento = ? ORDER BY id DESC`;
      const rows = await runQuery(env, sql, [codigo]);
      return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
    }

    // 2) nombre + telefono -> buscar por nombre_cliente (LIKE) y telefono exacto
    if (nombre && telefono) {
      const sql = `SELECT * FROM paquetes WHERE lower(nombre_cliente) LIKE ? AND telefono = ? ORDER BY id DESC`;
      const likeNombre = `%${String(nombre).toLowerCase()}%`;
      const rows = await runQuery(env, sql, [likeNombre, telefono]);
      return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
    }

    // 3) solo nombre -> LIKE en nombre_cliente
    if (nombre) {
      const sql = `SELECT * FROM paquetes WHERE lower(nombre_cliente) LIKE ? ORDER BY id DESC`;
      const likeNombre = `%${String(nombre).toLowerCase()}%`;
      const rows = await runQuery(env, sql, [likeNombre]);
      return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
    }

    // 4) solo telefono -> exact match
    if (telefono) {
      const sql = `SELECT * FROM paquetes WHERE telefono = ? ORDER BY id DESC`;
      const rows = await runQuery(env, sql, [telefono]);
      return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
    }

    // sin parámetros -> devolver vacío
    return new Response(JSON.stringify([]), { headers: corsHeaders(origin) });

  } catch (err) {
    console.error('R8t6sQ error:', err && err.message ? err.message : err, {
      sql: err && err.__sql ? err.__sql : undefined,
      bindings: err && err.__bindings ? err.__bindings : undefined
    });
    return new Response(
      JSON.stringify({ error: 'server error', message: err?.message ?? String(err) }),
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
