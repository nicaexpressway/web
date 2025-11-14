require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// -------------------- CORS (RESTRINGIDO y consistente) --------------------
const allowedOrigins = new Set([
  'https://htmleditor.in',
  'https://nicaexpressway.github.io',
  'https://nicaexpressway.netlify.app'
]);

const SERVER_API_KEY = process.env.SERVER_API_KEY || null;

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin) {
    if (allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      // Si usas credenciales (cookies/auth) deja en true; si no, puedes quitarlo o poner false
      res.setHeader('Access-Control-Allow-Credentials', 'true');

      if (req.method === 'OPTIONS') return res.sendStatus(204);
      return next();
    } else {
      if (req.method === 'OPTIONS') return res.status(403).send('CORS denied');
      return res.status(403).json({ error: 'CORS denied' });
    }
  }
  if (SERVER_API_KEY) {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (key && key === SERVER_API_KEY) {
      // Allow server request (no CORS headers needed, es server->server)
      return next();
    }
    return res.status(401).json({ error: 'Missing or invalid API key for server-to-server access' });
  }

  return res.status(403).json({ error: 'Requests from unknown origins are not allowed' });
});


// -------------------- Supabase client --------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FALTAN ENV: NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// -------------------- HELPERS --------------------

function getDateInTimeZone(tz = 'America/New_York') {
  try {
    // 'en-CA' produce formato YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch (e) {
    // fallback a UTC date si Intl no está disponible por alguna razón
    return new Date().toISOString().split('T')[0];
  }
}

function normalizeTextSafe(val) {
  if (val === null || val === undefined) return '';
  try {
    return String(val).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (e) {
    return String(val).toLowerCase();
  }
}

function parseTipoEnvioIdFromReq(req) {
  // 1) si vienen id explícito
  const candidateId = req.body.tipo_envio_id ?? req.body.tipoEnvioId ?? req.body.tipo_envio;
  if (candidateId !== undefined && candidateId !== null) {
    const parsed = Number(candidateId);
    if (Number.isFinite(parsed)) return parsed;
  }

  const rawCandidates = [
    req.body.tipo,
    req.body.tipoEnvio,
    req.body.tipo_envio,
    req.body.tipoEnvioSolicitar,
    req.body.tipoSolicitar,
    req.body.tipo_envio_id
  ];

  for (const raw of rawCandidates) {
    if (!raw) continue;
    const norm = normalizeTextSafe(raw);
    if (norm.includes('aer') || norm.includes('aire') || norm === 'aereo') return 1;
    if (norm.includes('mar')) return 2;
  }

  const fallback = normalizeTextSafe(req.body.tipo || req.body.tipoEnvio || '');
  if (fallback.includes('aer')) return 1;
  if (fallback.includes('mar')) return 2;

  return null;
}

async function ensureHistorialRow(codigo) {
  try {
    const { data, error } = await supabase
      .from('historial')
      .select('*')
      .eq('codigo_seguimiento', codigo)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const insertObj = {
        codigo_seguimiento: codigo,
        estado1: null, fecha1: null,
        estado2: null, fecha2: null,
        estado3: null, fecha3: null,
        estado4: null, fecha4: null
      };
      const insertRes = await supabase.from('historial').insert([insertObj]).select().maybeSingle();
      if (insertRes.error) throw insertRes.error;
      return insertRes.data;
    }
    return data;
  } catch (err) {
    console.error('ensureHistorialRow error:', err);
    throw err;
  }
}

async function pushEstadoToHistorial(codigo, estado, fecha) {
  try {
    if (!codigo) throw new Error('codigo_seguimiento requerido para actualizar historial');

    const histRes = await supabase
      .from('historial')
      .select('*')
      .eq('codigo_seguimiento', codigo)
      .limit(1)
      .maybeSingle();
    if (histRes.error) throw histRes.error;

    let hist = histRes.data;
    if (!hist) {
      const createRes = await supabase
        .from('historial')
        .insert([{
          codigo_seguimiento: codigo,
          estado1: null, fecha1: null,
          estado2: null, fecha2: null,
          estado3: null, fecha3: null,
          estado4: null, fecha4: null
        }])
        .select()
        .maybeSingle();
      if (createRes.error) throw createRes.error;
      hist = createRes.data;
    }

    const slots = [
      ['estado1', 'fecha1'],
      ['estado2', 'fecha2'],
      ['estado3', 'fecha3'],
      ['estado4', 'fecha4']
    ];

    let target = null;
    for (const [estadoKey, fechaKey] of slots) {
      if (hist[estadoKey] === null || hist[estadoKey] === '') {
        target = { estadoKey, fechaKey };
        break;
      }
    }
    if (!target) target = { estadoKey: 'estado4', fechaKey: 'fecha4' };

    const updateObj = {};
    updateObj[target.estadoKey] = estado;
    updateObj[target.fechaKey] = fecha || new Date().toISOString().split('T')[0];

    const { data: updated, error: updateErr } = await supabase
      .from('historial')
      .update(updateObj)
      .eq('codigo_seguimiento', codigo)
      .select();
    if (updateErr) throw updateErr;
    return updated;
  } catch (err) {
    console.error('pushEstadoToHistorial error:', err);
    throw err;
  }
}

// -------------------- RECORDATORIOS --------------------
app.post('/recordatorios', async (req, res) => {
  try {
    const titulo = req.body.titulo ?? req.body.title ?? null;
    const descripcion = req.body.descripcion ?? req.body.description ?? null;
    const fecha_limite = req.body.fecha_limite ?? req.body.date ?? null;

    const { data, error } = await supabase
      .from('recordatorios')
      .insert([{ titulo, descripcion, fecha_limite }])
      .select()
      .maybeSingle();

    if (error) {
      console.error('Supabase insert recordatorios error:', error);
      return res.status(400).json({ error: error.message || error });
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('POST /recordatorios error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/recordatorios', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('recordatorios')
      .select('*')
      .order('fecha_limite', { ascending: true });
    if (error) {
      console.error('Supabase get recordatorios error:', error);
      return res.status(400).json({ error: error.message || error });
    }
    return res.json(data || []);
  } catch (err) {
    console.error('GET /recordatorios error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/recordatorios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('recordatorios')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('Supabase get recordatorio by id error:', error);
      return res.status(400).json({ error: error.message || error });
    }
    if (!data) return res.status(404).json({ error: 'No encontrado' });
    return res.json(data);
  } catch (err) {
    console.error('GET /recordatorios/:id error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.delete('/recordatorios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('recordatorios')
      .delete()
      .eq('id', id)
      .select();
    if (error) {
      console.error('Supabase delete recordatorios error:', error);
      return res.status(400).json({ error: error.message || error });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /recordatorios/:id error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// -------------------- PAQUETES --------------------
app.post('/paquetes', async (req, res) => {
  try {
    const nombre_cliente = req.body.nombre_cliente ?? req.body.nombre ?? req.body.cliente ?? null;
    const codigo_seguimiento = req.body.codigo_seguimiento ?? req.body.codigo ?? null;
    const telefono = req.body.telefono ?? req.body.phone ?? null;

    const tipo_envio_id = parseTipoEnvioIdFromReq(req);

    const peso_libras = req.body.peso_libras ?? req.body.peso ?? req.body.peso_lb ?? null;
    const tarifa_usd = req.body.tarifa_usd ?? req.body.tarifa ?? null;

    const fecha_ingreso = req.body.fecha_ingreso ?? getDateInTimeZone('America/New_York');

    const fecha_estado = req.body.fecha_ingreso ?? req.body.fecha ?? fecha_ingreso;

    const insertObj = {
      nombre_cliente,
      codigo_seguimiento,
      telefono,
      tipo_envio_id,
      peso_libras,
      tarifa_usd,
      fecha_ingreso
    };

    const { data, error } = await supabase
      .from('paquetes')
      .insert([insertObj])
      .select()
      .maybeSingle();

    if (error) {
      console.error('Supabase insert paquetes error:', error);
      return res.status(400).json({ error: error.message || error });
    }

    if (codigo_seguimiento) {
      try { await ensureHistorialRow(codigo_seguimiento); } catch (e) { console.error(e); }
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('POST /paquetes error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});
app.get('/paquetes', async (req, res) => {
  try {
    const { codigo } = req.query;
    let query = supabase.from('paquetes').select('*');
    if (codigo) query = query.eq('codigo_seguimiento', codigo);
    const { data, error } = await query;
    if (error) {
      console.error('Supabase get paquetes error:', error);
      return res.status(400).json({ error: error.message || error });
    }
    return res.json(data || []);
  } catch (err) {
    console.error('GET /paquetes error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/paquetes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('paquetes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('Supabase get paquete by id error:', error);
      return res.status(400).json({ error: error.message || error });
    }
    if (!data) return res.status(404).json({ error: 'No encontrado' });
    return res.json(data);
  } catch (err) {
    console.error('GET /paquetes/:id error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.put('/paquetes/:codigo_seguimiento', async (req, res) => {
  try {
    const { codigo_seguimiento } = req.params;

    const peso_libras = (req.body.peso_libras !== undefined) ? req.body.peso_libras
                        : (req.body.peso !== undefined ? req.body.peso : undefined);
    const tarifa_usd = (req.body.tarifa_usd !== undefined) ? req.body.tarifa_usd
                        : (req.body.tarifa !== undefined ? req.body.tarifa : undefined);

    const estado = req.body.estado ?? null;
    const fecha_para_estado = req.body.fecha_estado ?? req.body.fecha ?? null;

    const updateObj = {};
    if (peso_libras !== undefined) updateObj.peso_libras = peso_libras;
    if (tarifa_usd !== undefined) updateObj.tarifa_usd = tarifa_usd;

    if (Object.keys(updateObj).length === 0 && !estado) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    let data = null;
    if (Object.keys(updateObj).length > 0) {
      const dbRes = await supabase
        .from('paquetes')
        .update(updateObj)
        .eq('codigo_seguimiento', codigo_seguimiento)
        .select();
      if (dbRes.error) {
        console.error('Supabase put paquetes error:', dbRes.error);
        return res.status(400).json({ error: dbRes.error.message || dbRes.error });
      }
      data = dbRes.data;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'No se encontró paquete con ese código de seguimiento' });
      }
    } else {
      const check = await supabase.from('paquetes').select('id').eq('codigo_seguimiento', codigo_seguimiento).limit(1).maybeSingle();
      if (!check || !check.data) {
        return res.status(404).json({ error: 'No se encontró paquete con ese código de seguimiento' });
      }
    }

    // Si enviaron estado -> lo empujamos al historial (tabla 'historial')
    if (estado) {
      try {
        await pushEstadoToHistorial(codigo_seguimiento, estado, fecha_para_estado);
      } catch (e) {
        console.error('pushEstadoToHistorial error:', e);
        // no hacemos fallar la respuesta principal por un fallo en historial
      }
    }

    if (data) return res.json(data);
    return res.json({ success: true });
  } catch (err) {
    console.error('PUT /paquetes/:codigo_seguimiento error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});


app.patch('/paquetes/:identifier', async (req, res, next) => {
  // redirigimos a la misma lógica de PUT manejada arriba
  req.params.codigo_seguimiento = req.params.identifier;
  return app._router.handle(req, res, next);
});

// -------------------- HISTORIAL --------------------
app.get('/historial', async (req, res) => {
  try {
    const { codigo } = req.query;
    if (!codigo) return res.status(400).json({ error: 'codigo query required' });

    const { data, error } = await supabase
      .from('historial')
      .select('*')
      .eq('codigo_seguimiento', codigo)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Supabase get historial error:', error);
      return res.status(400).json({ error: error.message || error });
    }
    if (!data) return res.status(404).json({ error: 'Historial no encontrado' });

  try {
  const pRes = await supabase
    .from('paquetes')
    .select('fecha_ingreso')
    .eq('codigo_seguimiento', codigo)
    .limit(1)
    .maybeSingle();
      if (!pRes.error && pRes.data) {
    data.fecha_ingreso = pRes.data.fecha_ingreso || null;
    if (!data.fecha1 || String(data.fecha1).trim() === '') {
    data.fecha1 = pRes.data.fecha_ingreso || null;
    }
 }

} catch (e) {
  console.warn('No se pudo recuperar fecha_ingreso para historial:', e);
  // no fatal, devolvemos historial sin la fecha_ingreso adicional
}
    return res.json(data);
  } catch (err) {
    console.error('GET /historial error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// -------------------- SEARCH --------------------
app.post('/paquetes/search', async (req, res) => {
  try {
    const { nombre, telefono } = req.body ?? {};

    if (!nombre && !telefono) {
      return res.status(400).json({ error: 'Se requiere nombre o telefono para buscar' });
    }

    let query = supabase.from('paquetes').select('*');

    if (nombre && telefono) {
      const escapedName = nombre.replace(/%/g, '\\%').replace(/'/g, "''");
      query = query.or(`nombre_cliente.ilike.%${escapedName}%,telefono.eq.${telefono}`);
    } else if (nombre) {
      query = query.ilike('nombre_cliente', `%${nombre}%`);
    } else if (telefono) {
      query = query.eq('telefono', telefono);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Supabase paquetes search error:', error);
      return res.status(400).json({ error: error.message || error });
    }
    return res.json(data || []);
  } catch (err) {
    console.error('POST /paquetes/search error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// -------------------- STATS ----------------
app.get('/stats', async (req, res) => {
  try {
    const filter = (req.query.filter || 'general').toString().toLowerCase();
    const tipoMap = { 'aereo': 1, 'maritimo': 2 };
    const tipoId = tipoMap[filter] ?? null;

    // 1) traer paquetes (filtrando por tipo si aplica) -> necesitamos codigo_seguimiento, tarifa_usd, peso_libras
    let paquetesQuery = supabase.from('paquetes').select('codigo_seguimiento, tarifa_usd, peso_libras, tipo_envio_id');
    if (tipoId) paquetesQuery = paquetesQuery.eq('tipo_envio_id', tipoId);
    const paquetesFiltered = await paquetesQuery;
    if (paquetesFiltered.error) throw paquetesFiltered.error;
    const paquetesList = paquetesFiltered.data || [];

    const codes = paquetesList.map(p => p.codigo_seguimiento).filter(Boolean);

    let historialRes;
    if (codes.length > 0) {
      historialRes = await supabase
        .from('historial')
        .select('codigo_seguimiento, estado1, estado2, estado3, estado4')
        .in('codigo_seguimiento', codes);
    } else {
      historialRes = await supabase
        .from('historial')
        .select('codigo_seguimiento, estado1, estado2, estado3, estado4');
    }
    if (historialRes.error) throw historialRes.error;
    const historialRows = historialRes.data || [];

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

    let enviadosCount = 0;
    let bodegaCount = 0;
    let caminoCount = 0;
    let aduanaCount = 0;

    for (const row of historialRows) {
      const latest = latestEstadoFromRow(row);
      if (!latest) continue;
      if (latest.includes('listo')) {
        enviadosCount++;
      } else if (latest.includes('recib')) {
        bodegaCount++;
      } else if (latest.includes('transit') || latest.includes('en transito') || latest.includes('en_transito')) {
        caminoCount++;
      } else if (latest.includes('aduan')) {
        aduanaCount++;
      }
    }
    let ganancias = 0;
    let total_pounds = 0;
    for (const p of paquetesList) {
      const peso = Number(p.peso_libras ?? 0);
      const tarifa = Number(p.tarifa_usd ?? 0);
      if (!Number.isNaN(peso)) total_pounds += peso;
      if (!Number.isNaN(peso) && !Number.isNaN(tarifa)) ganancias += (peso * tarifa);
    }

    ganancias = Math.round((ganancias + Number.EPSILON) * 100) / 100;
    total_pounds = Math.round((total_pounds + Number.EPSILON) * 100) / 100;

    const counts = {
      enviados: enviadosCount,
      bodega: bodegaCount,
      camino: caminoCount,
      aduana: aduanaCount
    };

    return res.json({
      counts,
      ganancias,      
      total_pounds,    
      total: (enviadosCount + bodegaCount + caminoCount + aduanaCount)
    });
  } catch (err) {
    console.error('GET /stats error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});
/* -------------------- PEDIDOS -------------------- */

app.post('/pedidos', async (req, res) => {
  try {
    const nombre = req.body.nombre ?? req.body.nombreSolicitar ?? req.body.nombre_cliente ?? null;
    const telefono = req.body.telefono ?? req.body.telefonoSolicitar ?? req.body.phone ?? null;
    const agencia = req.body.agencia ?? req.body.plataforma ?? req.body.plataformaSolicitar ?? null;
    const descripcion = req.body.descripcion ?? req.body.descripcionSolicitar ?? req.body.description ?? null;

    let tipo_envio_id = null;
    if (req.body.tipo_envio_id !== undefined && req.body.tipo_envio_id !== null) {
      const parsed = Number(req.body.tipo_envio_id);
      tipo_envio_id = Number.isFinite(parsed) ? parsed : null;
    } else {
      const tipoRaw = (req.body.tipo ?? req.body.tipoEnvio ?? req.body.tipoEnvioSolicitar ?? '').toString().toLowerCase();
      if (tipoRaw.includes('aer')) tipo_envio_id = 1;
      else if (tipoRaw.includes('mar')) tipo_envio_id = 2;
      else tipo_envio_id = null; // dejar null si no se puede inferir
    }

    const peso_aprox = (req.body.peso_aprox ?? req.body.peso ?? req.body.pesoSolicitar ?? null);

    const insertObj = {
      nombre,
      telefono,
      agencia,
      descripcion,
      tipo_envio_id,
      peso_aprox
    };

    const { data, error } = await supabase
      .from('pedidos')
      .insert([insertObj])
      .select()
      .maybeSingle();

    if (error) {
      console.error('Supabase insert pedidos error:', error);
      return res.status(400).json({ error: error.message || error });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('POST /pedidos error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/pedidos', async (req, res) => {
  try {
    const { nombre, telefono } = req.query ?? {};

    let query = supabase.from('pedidos').select('*').order('id', { ascending: false });

    if (nombre) {
      
      const escaped = nombre.replace(/%/g, '\\%').replace(/'/g, "''");
      query = query.ilike('nombre', `%${escaped}%`);
    } else if (telefono) {
      query = query.eq('telefono', telefono);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Supabase get pedidos error:', error);
      return res.status(400).json({ error: error.message || error });
    }
    return res.json(data || []);
  } catch (err) {
    console.error('GET /pedidos error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/pedidos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Supabase get pedido by id error:', error);
      return res.status(400).json({ error: error.message || error });
    }
    if (!data) return res.status(404).json({ error: 'No encontrado' });
    return res.json(data);
  } catch (err) {
    console.error('GET /pedidos/:id error:', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.get('/wake', (req, res) => res.status(200).json({ ok: true, timestamp: Date.now() }));


// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend corriendo en puerto ${PORT}`));
