// functions/R8t6sQ.js
import { corsHeaders, authorize, dbAll } from './_shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin');

  try {
    const body = await request.json();
    let { nombre, telefono, codigo } = body ?? {};
    nombre = (typeof nombre === 'string') ? nombre.trim() : null;
    telefono = (typeof telefono === 'string') ? telefono.trim() : null;
    codigo = (typeof codigo === 'string') ? codigo.trim() : null;

    if (!nombre && !telefono && !codigo) return new Response(JSON.stringify({ error: 'Se requiere nombre, telefono o codigo para buscar' }), { status: 400, headers: corsHeaders(origin) });

    if (codigo) {
      const rows = await dbAll(env, `SELECT * FROM paquetes WHERE codigo_seguimiento = ?`, [codigo]);
      return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
    }

    const escapedName = nombre ? nombre.replace(/%/g, '\\%').replace(/'/g, "''") : null;

    if (nombre && telefono) {
      try {
        const rows = await dbAll(env, `SELECT * FROM paquetes WHERE lower(nombre_cliente) LIKE ? AND telefono = ?`, [`%${nombre.toLowerCase()}%`, telefono]);
        if (rows && rows.length) return new Response(JSON.stringify(rows), { headers: corsHeaders(origin) });
        const rows2 = await dbAll(env, `SELECT * FROM paquetes WHERE telefono = ?`, [telefono]);
        return new Response(JSON.stringify(rows2 || []), { headers: corsHeaders(origin) });
      } catch (e) {
        console.warn('Search nombre+telefono failed:', e);
        const rows2 = await dbAll(env, `SELECT * FROM paquetes WHERE telefono = ?`, [telefono]);
        return new Response(JSON.stringify(rows2 || []), { headers: corsHeaders(origin) });
      }
    }

    if (nombre) {
      const rows = await dbAll(env, `SELECT * FROM paquetes WHERE lower(nombre_cliente) LIKE ?`, [`%${nombre.toLowerCase()}%`]);
      return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
    }

    if (telefono) {
      const rows = await dbAll(env, `SELECT * FROM paquetes WHERE telefono = ?`, [telefono]);
      return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
    }

    return new Response(JSON.stringify([]), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('POST /R8t6sQ error:', e);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
