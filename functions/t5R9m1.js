// functions/t5R9m1.js
import {
  authorize,
  corsHeaders,
  dbFirst,
  dbRun
} from './_shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin') || '*';

  try {
    const body = await request.json().catch(() => ({}));
    const tipo_envio = Number(body.tipo_envio);
    const tarifa = Number(body.tarifa);
    const tipo = Number(body.tipo);

    if (isNaN(tipo_envio) || ![1, 2].includes(tipo_envio) || isNaN(tarifa) || tarifa < 0 || isNaN(tipo) || ![1, 2].includes(tipo)) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: corsHeaders(origin) });
    }

    const row = await dbFirst(env, `SELECT aereo, maritimo, tipo FROM precios LIMIT 1`);

    let aereo = row?.aereo ?? null;
    let maritimo = row?.maritimo ?? null;
    let newTipo = String(tipo);

    if (tipo_envio === 1) {
      aereo = String(tarifa);
    } else if (tipo_envio === 2) {
      maritimo = String(tarifa);
    }

    await dbRun(env, `INSERT OR REPLACE INTO precios (rowid, aereo, maritimo, tipo) VALUES (1, ?, ?, ?)`, [aereo, maritimo, newTipo]);

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('POST /t5R9m1 error:', e);
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: corsHeaders(origin) });
  }
}
