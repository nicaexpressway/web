// functions/b5Nf7q2.js
import {
  corsHeaders,
  authorize,
  dbRun,
  dbAll,
  dbFirst,
  parseTipoEnvioIdFromBody
} from './_shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;

  const origin = request.headers.get('origin');

  try {
    const body = await request.json();

    const nombre =
      body.nombre ??
      body.nombreSolicitar ??
      body.nombre_cliente ??
      null;

    const telefono =
      body.telefono ??
      body.telefonoSolicitar ??
      body.phone ??
      null;

    const agencia =
      body.agencia ??
      body.plataforma ??
      body.plataformaSolicitar ??
      null;

    const descripcion =
      body.descripcion ??
      body.descripcionSolicitar ??
      body.description ??
      null;

    const tipo_envio_id = parseTipoEnvioIdFromBody(body);

    const peso_aprox =
      body.peso_aprox ??
      body.peso ??
      body.pesoSolicitar ??
      null;

    await dbRun(
      env,
      `
      INSERT INTO pedidos
      (nombre, telefono, agencia, descripcion, tipo_envio_id, peso_aprox, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `,
      [nombre, telefono, agencia, descripcion, tipo_envio_id, peso_aprox]
    );

    const created = await dbFirst(
      env,
      `SELECT * FROM pedidos ORDER BY id DESC LIMIT 1`
    );

    return new Response(JSON.stringify(created), {
      status: 201,
      headers: corsHeaders(origin)
    });
  } catch (e) {
    console.error('POST /b5Nf7q2 error:', e);
    return new Response(
      JSON.stringify({ error: 'server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;

  const origin = request.headers.get('origin');

  try {
    const url = new URL(request.url);

    const id = url.searchParams.get('id');
    const nombre = url.searchParams.get('nombre');
    const telefono = url.searchParams.get('telefono');

    // Buscar por ID
    if (id) {
      const row = await dbFirst(
        env,
        `SELECT * FROM pedidos WHERE id = ?`,
        [id]
      );

      if (!row) {
        return new Response(
          JSON.stringify({ error: 'No encontrado' }),
          {
            status: 404,
            headers: corsHeaders(origin)
          }
        );
      }

      return new Response(JSON.stringify(row), {
        headers: corsHeaders(origin)
      });
    }

    // Buscar por nombre
    if (nombre) {
      const escaped = nombre
        .replace(/%/g, '\\%')
        .replace(/'/g, "''");

      const rows = await dbAll(
        env,
        `
        SELECT *
        FROM pedidos
        WHERE lower(nombre) LIKE ?
        ORDER BY id DESC
        `,
        [`%${escaped.toLowerCase()}%`]
      );

      return new Response(JSON.stringify(rows || []), {
        headers: corsHeaders(origin)
      });
    }

    // Buscar por telefono
    if (telefono) {
      const rows = await dbAll(
        env,
        `
        SELECT *
        FROM pedidos
        WHERE telefono = ?
        ORDER BY id DESC
        `,
        [telefono]
      );

      return new Response(JSON.stringify(rows || []), {
        headers: corsHeaders(origin)
      });
    }

    // Todos los pedidos
    const rows = await dbAll(
      env,
      `SELECT * FROM pedidos ORDER BY id DESC`
    );

    return new Response(JSON.stringify(rows || []), {
      headers: corsHeaders(origin)
    });
  } catch (e) {
    console.error('GET /b5Nf7q2 error:', e);
    return new Response(
      JSON.stringify({ error: 'server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
