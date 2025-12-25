// functions/S3t7X.js
import { corsHeaders, authorize, dbAll } from './_shared.js';

function normalizeState(v){
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s.toLowerCase();
}
function latestEstadoFromRow(row){
  const e4 = normalizeState(row.estado4); if (e4) return e4;
  const e3 = normalizeState(row.estado3); if (e3) return e3;
  const e2 = normalizeState(row.estado2); if (e2) return e2;
  const e1 = normalizeState(row.estado1); if (e1) return e1;
  return null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin');

  try {
    const url = new URL(request.url);
    const filter = (url.searchParams.get('filter') || 'general').toString().toLowerCase();
    const tipoMap = { 'aereo': 1, 'maritimo': 2 };
    const tipoId = tipoMap[filter] ?? null;

    let paquetesQuerySql = 'SELECT codigo_seguimiento, tarifa_usd, peso_libras, tipo_envio_id FROM paquetes';
    const params = [];
    if (tipoId) {
      paquetesQuerySql += ' WHERE tipo_envio_id = ?';
      params.push(tipoId);
    }
    const paquetesRes = await dbAll(env, paquetesQuerySql, params);
    const paquetesList = paquetesRes || [];

    const codes = paquetesList.map(p => p.codigo_seguimiento).filter(Boolean);
    let historialRows = [];
    if (codes.length > 0) {
      // SQLite doesn't support IN with array binding easily, build placeholders
      const placeholders = codes.map(()=>'?').join(',');
      historialRows = await dbAll(env, `SELECT codigo_seguimiento, estado1, estado2, estado3, estado4 FROM historial WHERE codigo_seguimiento IN (${placeholders})`, codes);
    } else {
      historialRows = await dbAll(env, `SELECT codigo_seguimiento, estado1, estado2, estado3, estado4 FROM historial`, []);
    }

    let enviadosCount = 0, bodegaCount = 0, caminoCount = 0, aduanaCount = 0;
    for (const row of historialRows) {
      const latest = latestEstadoFromRow(row);
      if (!latest) continue;
      if (latest.includes('listo')) enviadosCount++;
      else if (latest.includes('recib')) bodegaCount++;
      else if (latest.includes('transit') || latest.includes('en transito') || latest.includes('en_transito')) caminoCount++;
      else if (latest.includes('aduan')) aduanaCount++;
    }

    let ganancias = 0, total_pounds = 0;
    for (const p of paquetesList) {
      const peso = Number(p.peso_libras ?? 0);
      const tarifa = Number(p.tarifa_usd ?? 0);
      if (!Number.isNaN(peso)) total_pounds += peso;
      if (!Number.isNaN(peso) && !Number.isNaN(tarifa)) ganancias += (peso * tarifa);
    }

    ganancias = Math.round((ganancias + Number.EPSILON) * 100) / 100;
    total_pounds = Math.round((total_pounds + Number.EPSILON) * 100) / 100;

    return new Response(JSON.stringify({
      counts: { enviados: enviadosCount, bodega: bodegaCount, camino: caminoCount, aduana: aduanaCount },
      ganancias, total_pounds,
      total: (enviadosCount + bodegaCount + caminoCount + aduanaCount)
    }), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('GET /S3t7X error:', e);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
