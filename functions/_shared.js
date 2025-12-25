// functions/_shared.js
export const allowedOrigins = new Set([
  'https://htmleditor.in',
  'https://nicaexpressway.github.io',
  'https://nicaexpressway.pages.dev'
]);

export const allowedHosts = new Set([
  'nicaexpressway-iiw8.onrender.com', // opcional si aún usas render
  'nicaexpressway.github.io',
  'nicaexpressway.pages.dev'
]);

export const SERVER_API_KEY_NAME = 'SERVER_API_KEY';

// helper: attach CORS headers when origin allowed
export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-KEY',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
}

// authorize request: returns a Response if unauthorized (already built) or null if ok
export async function authorize({ env, request, requireServerKey = false }) {
  const origin = request.headers.get('origin');
  const method = request.method;
  const hostRaw = (request.headers.get('host') || '').toLowerCase();
  const host = hostRaw.replace(/:\d+$/, '');
  const serverKey = env[SERVER_API_KEY_NAME] || null;

  // 1) If browser origin present -> validate origin first
  if (origin) {
    if (allowedOrigins.has(origin)) {
      // respond to preflight
      if (method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      }
      return null; // allowed
    } else {
      if (method === 'OPTIONS') {
        return new Response(JSON.stringify({ error: 'CORS denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'CORS denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // 2) No Origin -> server-to-server: validate host + optional API key
  if (!allowedHosts.has(host)) {
    return new Response(JSON.stringify({ error: 'Host no permitido' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  if (serverKey && requireServerKey) {
    const key = request.headers.get('x-api-key') || new URL(request.url).searchParams.get('api_key');
    if (key && key === serverKey) return null;
    return new Response(JSON.stringify({ error: 'Missing or invalid API key for server-to-server access' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // if serverKey not required, allow server-to-server with allowed host
  return null;
}

// DB helpers (D1)
export async function dbAll(env, sql, params = []) {
  const p = env.DB.prepare(sql);
  if (params.length) p.bind(...params);
  const res = await p.all();
  return res.results || [];
}
export async function dbFirst(env, sql, params = []) {
  const p = env.DB.prepare(sql);
  if (params.length) p.bind(...params);
  const r = await p.all();
  return (r.results && r.results[0]) ? r.results[0] : null;
}
export async function dbRun(env, sql, params = []) {
  const p = env.DB.prepare(sql);
  if (params.length) p.bind(...params);
  return await p.run();
}

// small util replacements
export function getDateInTimeZone(tz = 'America/New_York') {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch (e) {
    return new Date().toISOString().split('T')[0];
  }
}

export function normalizeTextSafe(val) {
  if (val === null || val === undefined) return '';
  try {
    return String(val).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    return String(val).toLowerCase();
  }
}

export function parseTipoEnvioIdFromBody(body = {}) {
  const candidateId = body.tipo_envio_id ?? body.tipoEnvioId ?? body.tipo_envio;
  if (candidateId !== undefined && candidateId !== null) {
    const parsed = Number(candidateId);
    if (Number.isFinite(parsed)) return parsed;
  }
  const rawCandidates = [
    body.tipo,
    body.tipoEnvio,
    body.tipo_envio,
    body.tipoEnvioSolicitar,
    body.tipoSolicitar,
    body.tipo_envio_id
  ];
  for (const raw of rawCandidates) {
    if (!raw) continue;
    const norm = normalizeTextSafe(raw);
    if (norm.includes('aer') || norm.includes('aire') || norm === 'aereo') return 1;
    if (norm.includes('mar')) return 2;
  }
  const fallback = normalizeTextSafe(body.tipo || body.tipoEnvio || '');
  if (fallback.includes('aer')) return 1;
  if (fallback.includes('mar')) return 2;
  return null;
}
