// functions/v8P2q4.js
import {
  authorize,
  corsHeaders,
  dbFirst
} from './_shared.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin') || '*';

  try {
    const body = await request.json().catch(() => ({}));
    const type = body.type;
    const pass = body.pass;

    if (!type || !pass || !['operador', 'estadisticas'].includes(type)) {
      return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: corsHeaders(origin) });
    }

    const row = await dbFirst(env, `SELECT operador, estadisticas FROM passwords LIMIT 1`);
    if (!row) {
      return new Response(JSON.stringify({ error: 'no_passwords_found' }), { status: 500, headers: corsHeaders(origin) });
    }

    const storedPass = row[type];
    const valid = (pass === storedPass);

    return new Response(JSON.stringify({ valid }), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('POST /v8P2q4 error:', e);
    return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: corsHeaders(origin) });
  }
}
