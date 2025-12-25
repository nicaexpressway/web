import { corsHeaders, authorize, dbAll, dbFirst, dbRun } from './_shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  // permitir desde frontend (igual que en tu server antiguo)
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin');

  try {
    const body = await request.json().catch(()=>({}));
    const titulo = body.titulo ?? body.title ?? null;
    const descripcion = body.descripcion ?? body.description ?? null;
    const fecha_limite = body.fecha_limite ?? body.date ?? null;

    if (!titulo || !descripcion || !fecha_limite) {
      return new Response(JSON.stringify({ error: 'missing_fields', message: 'titulo, descripcion y fecha_limite son requeridos' }), { status: 400, headers: corsHeaders(origin) });
    }

    await dbRun(env, `INSERT INTO recordatorios (titulo, descripcion, fecha_limite) VALUES (?, ?, ?)`, [titulo, descripcion, fecha_limite]);

    const row = await dbFirst(env, `SELECT * FROM recordatorios ORDER BY id DESC LIMIT 1`);
    return new Response(JSON.stringify(row), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('POST /n3R8k error:', e);
    return new Response(JSON.stringify({ error: 'server error', message: e?.message ?? String(e) }), { status: 500, headers: corsHeaders(origin) });
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin');

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') || null;

    if (id) {
      const row = await dbFirst(env, `SELECT * FROM recordatorios WHERE id = ?`, [id]);
      if (!row) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: corsHeaders(origin) });
      return new Response(JSON.stringify(row), { headers: corsHeaders(origin) });
    }

    const rows = await dbAll(env, `SELECT * FROM recordatorios ORDER BY fecha_limite ASC`);
    return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('GET /n3R8k error:', e);
    return new Response(JSON.stringify({ error: 'server error', message: e?.message ?? String(e) }), { status: 500, headers: corsHeaders(origin) });
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  // hacemos pública la eliminación (como en tu antiguo servidor). 
  // Si prefieres exigir API key, cambia `requireServerKey` a true y envía el header desde backend.
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin');

  try {
    const url = new URL(request.url);
    let id = url.searchParams.get('id') || null;

    // also accept body { id: ... } just in case
    if (!id) {
      try {
        const body = await request.json().catch(()=>null);
        if (body && body.id) id = String(body.id);
      } catch(_) {}
    }

    if (!id) {
      return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: corsHeaders(origin) });
    }

    const idNum = Number(id);
    if (!Number.isFinite(idNum)) {
      return new Response(JSON.stringify({ error: 'invalid id' }), { status: 400, headers: corsHeaders(origin) });
    }

    await dbRun(env, `DELETE FROM recordatorios WHERE id = ?`, [idNum]);
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('DELETE /n3R8k error:', e);
    return new Response(JSON.stringify({ error: 'server error', message: e?.message ?? String(e) }), { status: 500, headers: corsHeaders(origin) });
  }
}
