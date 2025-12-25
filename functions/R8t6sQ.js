// functions/R8t6sQ.js
import { corsHeaders, authorize, dbAll } from './_shared.js';

export async function onRequestOptions(context) {
  const origin = context.request.headers.get('origin') || '*';
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin)
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const origin = request.headers.get('origin');

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
    // normalize
    if (typeof nombre === 'string') nombre = nombre.trim();
    if (typeof telefono === 'string') telefono = telefono.trim();
    if (typeof codigo === 'string') codigo = codigo.trim();

    // 1) búsqueda por código_seguimiento (más precisa) -> devolver array
    if (codigo) {
      const rows = await dbAll(
        env,
        `SELECT * FROM paquetes WHERE codigo_seguimiento = ? ORDER BY id DESC`,
        [codigo]
      );
      return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
    }

    // 2) nombre + telefono -> buscar por nombre_cliente (LIKE) y telefono exacto
    if (nombre && telefono) {
      const rows = await dbAll(
        env,
        `SELECT * FROM paquetes WHERE lower(nombre_cliente) LIKE ? AND telefono = ? ORDER BY id DESC`,
        [`%${String(nombre).toLowerCase()}%`, telefono]
      );
      return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
    }

    // 3) solo nombre -> LIKE en nombre_cliente
    if (nombre) {
      const rows = await dbAll(
        env,
        `SELECT * FROM paquetes WHERE lower(nombre_cliente) LIKE ? ORDER BY id DESC`,
        [`%${String(nombre).toLowerCase()}%`]
      );
      return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
    }

    // 4) solo telefono -> exact match
    if (telefono) {
      const rows = await dbAll(
        env,
        `SELECT * FROM paquetes WHERE telefono = ? ORDER BY id DESC`,
        [telefono]
      );
      return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
    }

    // sin parámetros -> devolver vacío
    return new Response(JSON.stringify([]), { headers: corsHeaders(origin) });

  } catch (err) {
    console.error('R8t6sQ error:', err);
    return new Response(
      JSON.stringify({ error: 'server error', message: err?.message ?? String(err) }),
      { status: 500, headers: corsHeaders(origin) }
    );
  }
}
