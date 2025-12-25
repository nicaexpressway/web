// functions/n3R8k.js
import { corsHeaders, authorize, dbAll, dbFirst, dbRun } from './_shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: true }); // before: requireOperatorAuth (NO-OP) — keep server key
  if (auth) return auth;

  const origin = request.headers.get('origin');
  const body = await request.json();
  const titulo = body.titulo ?? body.title ?? null;
  const descripcion = body.descripcion ?? body.description ?? null;
  const fecha_limite = body.fecha_limite ?? body.date ?? null;

  try {
    await dbRun(env, `INSERT INTO recordatorios (titulo, descripcion, fecha_limite) VALUES (?, ?, ?)`, [titulo, descripcion, fecha_limite]);
    // return last inserted row
    const row = await dbFirst(env, `SELECT * FROM recordatorios ORDER BY id DESC LIMIT 1`);
    return new Response(JSON.stringify(row), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('POST /n3R8k error:', e);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin');

  try {
    const rows = await dbAll(env, `SELECT * FROM recordatorios ORDER BY fecha_limite ASC`);
    return new Response(JSON.stringify(rows || []), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('GET /n3R8k error:', e);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const auth = await authorize({ env, request, requireServerKey: true });
  if (auth) return auth;
  const origin = request.headers.get('origin');

  // Cloudflare Pages functions pass path params using file-based routing only (to support param you'd create file [id].js),
  // but since original route is /n3R8k/:id we need a separate file. Simpler: accept id via query param or body.
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop() || url.searchParams.get('id');

  if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: corsHeaders(origin) });

  try {
    await dbRun(env, `DELETE FROM recordatorios WHERE id = ?`, [id]);
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('DELETE /n3R8k error:', e);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
