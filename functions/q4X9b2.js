// ... (import line stays the same)

import {
  authorize,
  corsHeaders,
  dbAll,
  dbFirst,
  dbRun,
  getDateInTimeZone,
  parseTipoEnvioIdFromBody
} from './_shared.js';


export async function onRequestPost(context) {
  const { request, env } = context;
  // permitir desde frontend (igual que en el server antiguo)
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin');

  try {
    const body = await request.json().catch(()=>({}));

    const nombre_cliente = body.nombre_cliente ?? body.nombre ?? body.cliente ?? null;
    let codigo_seguimiento = body.codigo_seguimiento ?? body.codigo ?? body.codigoTracking ?? null;
    if (!codigo_seguimiento || String(codigo_seguimiento).trim() === '') {
      codigo_seguimiento = `AUTO-${Date.now()}`;
    } else {
      codigo_seguimiento = String(codigo_seguimiento).trim();
    }

    const telefono = body.telefono ?? body.phone ?? null;
    const tipo_envio_id = parseTipoEnvioIdFromBody(body);
    const peso_libras = (body.peso_libras ?? body.peso ?? body.peso_lb) ?? null;
    const tarifa_usd = body.tarifa_usd ?? body.tarifa ?? null;
    const fecha_ingreso = body.fecha_ingreso ?? getDateInTimeZone('America/New_York');

    await dbRun(env, `INSERT INTO paquetes (nombre_cliente, codigo_seguimiento, telefono, tipo_envio_id, peso_libras, tarifa_usd, fecha_ingreso, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [nombre_cliente, codigo_seguimiento, telefono, tipo_envio_id, peso_libras, tarifa_usd, fecha_ingreso]);

    const existing = await dbFirst(env, `SELECT * FROM historial WHERE codigo_seguimiento = ?`, [codigo_seguimiento]);
    if (!existing) {
      await dbRun(env, `INSERT INTO historial (codigo_seguimiento, fecha1) VALUES (?, ?)`, [codigo_seguimiento, fecha_ingreso]);
    }

    const created = await dbFirst(env, `SELECT * FROM paquetes WHERE codigo_seguimiento = ?`, [codigo_seguimiento]);
    return new Response(JSON.stringify(created), { status: 201, headers: corsHeaders(origin) });
  } catch (e) {
    console.error('POST /q4X9b2 error:', e);
    return new Response(JSON.stringify({ error: 'server error', message: e?.message ?? String(e) }), { status: 500, headers: corsHeaders(origin) });
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  // permitir desde frontend (igualmente que antes)
  const auth = await authorize({ env, request, requireServerKey: false });
  if (auth) return auth;
  const origin = request.headers.get('origin');

  try {
    const url = new URL(request.url);
    let codigo_seguimiento = url.searchParams.get('codigo') || url.searchParams.get('codigo_seguimiento') || url.searchParams.get('id') || null;

    const parts = url.pathname.split('/').filter(Boolean);
    if (!codigo_seguimiento && parts.length > 1) {
      codigo_seguimiento = parts[parts.length - 1];
    }

    const body = await request.json().catch(()=>({}));
    if (!codigo_seguimiento || String(codigo_seguimiento).trim() === '') {
      return new Response(JSON.stringify({ error: 'codigo_seguimiento required' }), { status: 400, headers: corsHeaders(origin) });
    }
    codigo_seguimiento = String(codigo_seguimiento).trim();

    const peso_libras = (body.peso_libras !== undefined) ? body.peso_libras : (body.peso !== undefined ? body.peso : undefined);
    const tarifa_usd = (body.tarifa_usd !== undefined) ? body.tarifa_usd : (body.tarifa !== undefined ? body.tarifa : undefined);
    const nombre_cliente = body.nombre_cliente ?? body.nombre ?? null;
    const telefono = body.telefono ?? null;
    const estado = body.estado ?? null;
    const fecha_para_estado = body.fecha_estado ?? body.fecha ?? null;

    const updates = [];
    const binds = [];
    if (nombre_cliente !== null) { updates.push('nombre_cliente = ?'); binds.push(nombre_cliente); }
    if (telefono !== null) { updates.push('telefono = ?'); binds.push(telefono); }
    if (peso_libras !== undefined) { updates.push('peso_libras = ?'); binds.push(peso_libras); }
    if (tarifa_usd !== undefined) { updates.push('tarifa_usd = ?'); binds.push(tarifa_usd); }

    if (updates.length > 0) {
      binds.push(codigo_seguimiento);
      await dbRun(env, `UPDATE paquetes SET ${updates.join(', ')} WHERE codigo_seguimiento = ?`, binds);
    } else {
      const exists = await dbFirst(env, `SELECT id FROM paquetes WHERE codigo_seguimiento = ? LIMIT 1`, [codigo_seguimiento]);
      if (!exists) {
        return new Response(JSON.stringify({ error: 'No se encontró paquete con ese código de seguimiento' }), { status: 404, headers: corsHeaders(origin) });
      }
    }

    if (estado) {
      let hist = await dbFirst(env, `SELECT * FROM historial WHERE codigo_seguimiento = ? LIMIT 1`, [codigo_seguimiento]);
      if (!hist) {
        const fecha = fecha_para_estado ?? new Date().toISOString().split('T')[0];
        await dbRun(env, `INSERT INTO historial (codigo_seguimiento, estado1, fecha1) VALUES (?, ?, ?)`, [codigo_seguimiento, estado, fecha]);
      } else {
        const cols = ['estado1','estado2','estado3','estado4'];
        const dateCols = ['fecha1','fecha2','fecha3','fecha4'];
        let targetIndex = -1;
        for (let i = 0; i < cols.length; i++) {
          if (!hist[cols[i]] || String(hist[cols[i]]).trim() === '') { targetIndex = i; break; }
        }
        if (targetIndex === -1) targetIndex = cols.length - 1;
        const estadoCol = cols[targetIndex];
        const fechaCol = dateCols[targetIndex];
        const fecha = fecha_para_estado ?? new Date().toISOString().split('T')[0];
        await dbRun(env, `UPDATE historial SET ${estadoCol} = ?, ${fechaCol} = ? WHERE codigo_seguimiento = ?`, [estado, fecha, codigo_seguimiento]);
      }
    }

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders(origin) });
  } catch (e) {
    console.error('PUT /q4X9b2 error:', e);
    return new Response(JSON.stringify({ error: 'server error', message: e?.message ?? String(e) }), { status: 500, headers: corsHeaders(origin) });
  }
}
