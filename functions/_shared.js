/* =========================
   SHARED HELPERS – CLOUDFLARE
   ========================= */

/* ---------- DOMINIOS PERMITIDOS ---------- */
export const allowedOrigins = new Set([
  'https://htmleditor.in',
  'https://nicaexpressway.github.io',
  'https://nicaexpressway.pages.dev'
]);

export const allowedHosts = new Set([
  'nicaexpressway-iiw8.onrender.com',
  'nicaexpressway.github.io',
  'nicaexpressway.pages.dev'
]);

export const SERVER_API_KEY_NAME = 'SERVER_API_KEY';

/* ---------- CORS ---------- */
export function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-KEY',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
}

/* ---------- AUTH ---------- */
/*
  FIX CRÍTICO:
  - authorize() NO debe consumir el body
  - cualquier lectura usa request.clone()
*/
export async function authorize({ env, request, requireServerKey = false }) {
  try {
    const origin = request.headers.get('origin');
    const method = request.method;
    const hostRaw = (request.headers.get('host') || '').toLowerCase();
    const host = hostRaw.replace(/:\d+$/, '');
    const serverKey = env[SERVER_API_KEY_NAME] || null;

    /* ---- 1) Requests desde navegador (CORS) ---- */
    if (origin) {
      if (allowedOrigins.has(origin)) {
        if (method === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers: corsHeaders(origin)
          });
        }
        return null;
      } else {
        return new Response(
          JSON.stringify({ error: 'CORS denied' }),
          { status: 403, headers: corsHeaders(origin) }
        );
      }
    }

    /* ---- 2) Server-to-server ---- */
    if (!allowedHosts.has(host)) {
      return new Response(
        JSON.stringify({ error: 'Host no permitido' }),
        { status: 403, headers: corsHeaders() }
      );
    }

    if (serverKey && requireServerKey) {
      const headerKey =
        request.headers.get('x-api-key') ||
        request.headers.get('authorization');

      let bodyKey = null;
      try {
        const body = await request.clone().json();
        bodyKey = body?.api_key || body?.key || null;
      } catch (_) {
        bodyKey = null;
      }

      const queryKey = new URL(request.url).searchParams.get('api_key');
      const providedKey = headerKey || bodyKey || queryKey;

      if (providedKey && providedKey === serverKey) return null;

      return new Response(
        JSON.stringify({ error: 'Missing or invalid API key' }),
        { status: 401, headers: corsHeaders() }
      );
    }

    return null;
  } catch (e) {
    console.error('❌ authorize error:', e);
    return new Response(
      JSON.stringify({ error: 'auth_error', message: e.message }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

/* ---------- DB HELPERS (D1) ---------- */
function assertDB(env) {
  if (!env?.DB) {
    throw new Error('D1 binding "DB" no existe');
  }
}

export async function dbAll(env, sql, params = []) {
  assertDB(env);
  const p = env.DB.prepare(sql);
  if (params.length) p.bind(...params);
  const res = await p.all();
  return res.results || [];
}

export async function dbFirst(env, sql, params = []) {
  assertDB(env);
  const p = env.DB.prepare(sql);
  if (params.length) p.bind(...params);
  const r = await p.all();
  return r.results?.[0] || null;
}

export async function dbRun(env, sql, params = []) {
  assertDB(env);
  const p = env.DB.prepare(sql);
  if (params.length) p.bind(...params);
  await p.run();
  return true;
}

/* ---------- UTILS ---------- */
export function getDateInTimeZone(tz = 'America/New_York') {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

export function normalizeTextSafe(val) {
  if (val === null || val === undefined) return '';
  try {
    return String(val)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  } catch {
    return String(val).toLowerCase();
  }
}

export function parseTipoEnvioIdFromBody(body = {}) {
  const candidateId =
    body.tipo_envio_id ??
    body.tipoEnvioId ??
    body.tipo_envio;

  if (candidateId !== undefined && candidateId !== null) {
    const parsed = Number(candidateId);
    if (Number.isFinite(parsed)) return parsed;
  }

  const rawCandidates = [
    body.tipo,
    body.tipoEnvio,
    body.tipo_envio,
    body.tipoEnvioSolicitar,
    body.tipoSolicitar
  ];

  for (const raw of rawCandidates) {
    if (!raw) continue;
    const norm = normalizeTextSafe(raw);
    if (norm.includes('aer')) return 1;
    if (norm.includes('mar')) return 2;
  }

  return null;
}
