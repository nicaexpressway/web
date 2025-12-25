// functions/z4W1p.js
import { corsHeaders, authorize } from './_shared.js';

export async function onRequestGet(context) {
  const { request } = context;
  const auth = await authorize({ env: context.env, request, requireServerKey: false });
  if (auth) return auth;

  const origin = request.headers.get('origin');
  const headers = origin && corsHeaders(origin) ? corsHeaders(origin) : { 'Content-Type': 'application/json' };
  return new Response(JSON.stringify({ ok: true, timestamp: Date.now() }), { headers });
}
