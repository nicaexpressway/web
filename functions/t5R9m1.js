// functions/t5R9m1.js
import {
  authorize,
  corsHeaders,
  dbFirst,
  dbRun
} from './_shared.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const origin = request.headers.get('origin') || '*';
  try {
    const row = await dbFirst(env, `SELECT aero, tipoaereo, fechaaereo, maritimo, tipomaritimo, fechamaritimo FROM prices LIMIT 1`);
    const fallback = { aero: 7.5, tipoaereo: 1, fechaaereo: null, maritimo: 3, tipomaritimo: 1, fechamaritimo: null };
    return new Response(JSON.stringify(row || fallback), {
      headers: corsHeaders(origin),
    });
  } catch (e) {
    console.error('GET /t5R9m1 error:', e);
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: corsHeaders(origin) });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: true }); // Require server key for security
  if (auth) return auth;
  const origin = request.headers.get('origin') || '*';
  try {
    const body = await request.json().catch(() => ({}));
    const tipo_envio = Number(body.tipo_envio);
    const tarifa = Number(body.tarifa);
    const tipo = Number(body.tipo);
    const fecha = body.fecha || null;

    if (isNaN(tipo_envio) || ![1, 2].includes(tipo_envio) || isNaN(tarifa) || tarifa < 0 || isNaN(tipo) || ![1, 2].includes(tipo)) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: corsHeaders(origin) });
    }
    if (tipo === 2 && !fecha) {
      return new Response(JSON.stringify({ error: 'fecha_required_for_oferta' }), { status: 400, headers: corsHeaders(origin) });
    }

    const row = await dbFirst(env, `SELECT aero, tipoaereo, fechaaereo, maritimo, tipomaritimo, fechamaritimo FROM prices LIMIT 1`);
    let aero = row?.aero ?? null;
    let tipoaereo = row?.tipoaereo ?? null;
    let fechaaereo = row?.fechaaereo ?? null;
    let maritimo = row?.maritimo ?? null;
    let tipomaritimo = row?.tipomaritimo ?? null;
    let fechamaritimo = row?.fechamaritimo ?? null;

    if (tipo_envio === 1) {
      aero = String(tarifa);
      tipoaereo = String(tipo);
      fechaaereo = (tipo === 2 ? fecha : null);
    } else if (tipo_envio === 2) {
      maritimo = String(tarifa);
      tipomaritimo = String(tipo);
      fechamaritimo = (tipo === 2 ? fecha : null);
    }

    await dbRun(env, `INSERT OR REPLACE INTO prices (rowid, aero, tipoaereo, fechaaereo, maritimo, tipomaritimo, fechamaritimo) VALUES (1, ?, ?, ?, ?, ?, ?)`, [aero, tipoaereo, fechaaereo, maritimo, tipomaritimo, fechamaritimo]);

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('POST /t5R9m1 error:', e);
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: corsHeaders(origin) });
  }
}
