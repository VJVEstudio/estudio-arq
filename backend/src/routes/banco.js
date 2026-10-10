const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');
const { leerResumenMacro } = require('../utils/resumenMacro');
const { clasificarMovimiento } = require('../utils/bancoClasificar');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

// Días de diferencia aceptados entre la fecha del banco y la del registro en la app
const TOLERANCIA_DIAS = 5;
// Una liquidación se registra el día que se liquida, que puede no ser el día del pago
const TOLERANCIA_LIQUIDACION_DIAS = 10;
const ESTADOS = ['pendiente', 'vinculado', 'creado', 'inversion', 'ignorado'];

// ── Esquema (se crea solo, solo agrega tablas nuevas) ─────────────────────────
let esquemaListo = null;
function asegurarEsquema() {
  if (!esquemaListo) {
    esquemaListo = (async () => {
      const { rows } = await query(
        `SELECT table_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name IN ('ingresos','egresos','liquidaciones_dibujantes') AND column_name = 'id'`
      );
      const tipo = (t) => (rows.find(r => r.table_name === t)?.data_type === 'uuid' ? 'UUID' : 'INTEGER');
      await query(`
        CREATE TABLE IF NOT EXISTS banco_importaciones (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          banco         TEXT NOT NULL,
          archivo       TEXT,
          desde         DATE,
          hasta         DATE,
          saldo_inicial NUMERIC(16,2),
          saldo_final   NUMERIC(16,2),
          nuevos        INTEGER DEFAULT 0,
          repetidos     INTEGER DEFAULT 0,
          created_at    TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS banco_movimientos (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          importacion_id  UUID REFERENCES banco_importaciones(id) ON DELETE SET NULL,
          huella          TEXT NOT NULL UNIQUE,
          fecha           DATE NOT NULL,
          nro_transaccion TEXT,
          descripcion     TEXT NOT NULL,
          importe         NUMERIC(16,2) NOT NULL,
          saldo           NUMERIC(16,2),
          posicion        INTEGER NOT NULL DEFAULT 0,
          cuit            TEXT,
          clase           TEXT NOT NULL,
          categoria_sugerida TEXT,
          destinatario_sugerido TEXT,
          detalle         TEXT,
          estado          TEXT NOT NULL DEFAULT 'pendiente',
          ingreso_id      ${tipo('ingresos')} REFERENCES ingresos(id) ON DELETE SET NULL,
          liquidacion_id  ${tipo('liquidaciones_dibujantes')},
          nota            TEXT,
          created_at      TIMESTAMPTZ DEFAULT NOW(),
          updated_at      TIMESTAMPTZ DEFAULT NOW()
        );
        -- Un débito del banco puede cubrir varios egresos (por ejemplo, una liquidación
        -- de horas genera un egreso por proyecto y se paga con una sola transferencia).
        -- Cada egreso solo puede estar vinculado a un movimiento del banco.
        CREATE TABLE IF NOT EXISTS banco_movimiento_egresos (
          banco_movimiento_id UUID NOT NULL REFERENCES banco_movimientos(id) ON DELETE CASCADE,
          egreso_id           ${tipo('egresos')} NOT NULL UNIQUE REFERENCES egresos(id) ON DELETE CASCADE,
          PRIMARY KEY (banco_movimiento_id, egreso_id)
        );
        CREATE INDEX IF NOT EXISTS banco_movimientos_fecha_idx ON banco_movimientos (fecha);
        CREATE INDEX IF NOT EXISTS banco_movimientos_estado_idx ON banco_movimientos (estado);
      `);
    })().catch(err => { esquemaListo = null; throw err; });
  }
  return esquemaListo;
}
router.use(async (req, res, next) => {
  try { await asegurarEsquema(); next(); }
  catch (err) {
    console.error('Error creando tablas de banco:', err);
    res.status(500).json({ error: 'No se pudieron preparar las tablas del banco' });
  }
});

// Estado efectivo: si se borró el ingreso/egreso vinculado, vuelve a pendiente.
const ESTADO_EFECTIVO = `CASE WHEN bm.estado IN ('vinculado','creado') AND bm.ingreso_id IS NULL
                                   AND NOT EXISTS (SELECT 1 FROM banco_movimiento_egresos x WHERE x.banco_movimiento_id = bm.id)
                              THEN 'pendiente' ELSE bm.estado END`;
const EGRESO_LIBRE = `NOT EXISTS (SELECT 1 FROM banco_movimiento_egresos x WHERE x.egreso_id = e.id)`;

const huella = (m) => crypto.createHash('sha256')
  .update(['macro', m.fecha, m.nro_transaccion || '', m.importe_cent, m.saldo_cent].join('|'))
  .digest('hex');

// ── Importar un resumen ──────────────────────────────────────────────────────
router.post('/importar', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'El resumen tiene que ser un PDF' });

  let resumen;
  try {
    resumen = await leerResumenMacro(req.file.buffer);
  } catch (err) {
    console.error('Error leyendo resumen:', err);
    return res.status(422).json({ error: err.message || 'No se pudo leer el resumen' });
  }
  if (!resumen.movimientos.length) return res.status(422).json({ error: 'No se encontraron movimientos en el PDF' });
  if (resumen.errores.length) {
    // Si algún saldo no cierra, no se importa nada: mejor revisar que cargar datos dudosos
    return res.status(422).json({
      error: 'El resumen no pasó los controles de saldo, no se importó nada.',
      detalles: resumen.errores.slice(0, 10),
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [imp] } = await client.query(
      `INSERT INTO banco_importaciones (banco, archivo, desde, hasta, saldo_inicial, saldo_final)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [resumen.banco, req.file.originalname, resumen.desde, resumen.hasta, resumen.saldo_inicial, resumen.saldo_final]
    );
    let nuevos = 0;
    const n = resumen.movimientos.length;
    for (const [i, m] of resumen.movimientos.entries()) {
      const c = clasificarMovimiento(m);
      const r = await client.query(
        `INSERT INTO banco_movimientos
           (importacion_id, huella, fecha, nro_transaccion, descripcion, importe, saldo, cuit, clase,
            categoria_sugerida, destinatario_sugerido, detalle, posicion, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pendiente')
         ON CONFLICT (huella) DO NOTHING`,
        [imp.id, huella(m), m.fecha, m.nro_transaccion, m.descripcion, m.importe, m.saldo, c.cuit, c.clase,
         c.categoria, c.destinatario_sugerido, c.detalle || null, n - 1 - i]
      );
      nuevos += r.rowCount;
    }
    const repetidos = resumen.movimientos.length - nuevos;
    await client.query(`UPDATE banco_importaciones SET nuevos=$1, repetidos=$2 WHERE id=$3`, [nuevos, repetidos, imp.id]);
    await client.query('COMMIT');
    res.status(201).json({ ...imp, nuevos, repetidos, total: resumen.movimientos.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error importando resumen:', err);
    res.status(500).json({ error: 'Error al guardar los movimientos' });
  } finally {
    client.release();
  }
});

router.get('/importaciones', async (req, res) => {
  const { rows } = await query(`SELECT * FROM banco_importaciones ORDER BY created_at DESC LIMIT 50`);
  res.json(rows);
});

// ── Listado con sugerencias ──────────────────────────────────────────────────
router.get('/movimientos', async (req, res) => {
  const { estado, desde, hasta } = req.query;
  const params = [];
  const cond = ['TRUE'];
  if (desde)  { params.push(desde);  cond.push(`bm.fecha >= $${params.length}`); }
  if (hasta)  { params.push(hasta);  cond.push(`bm.fecha <= $${params.length}`); }
  if (estado && ESTADOS.includes(estado)) { params.push(estado); cond.push(`${ESTADO_EFECTIVO} = $${params.length}`); }

  const { rows } = await query(
    `SELECT bm.*, ${ESTADO_EFECTIVO} AS estado,
            i.fecha AS ingreso_fecha, i.monto AS ingreso_monto, ci.nombre_razon_social AS ingreso_cliente,
            pi.nombre AS ingreso_proyecto,
            ev.cantidad AS egresos_cantidad, ev.fecha AS egreso_fecha, ev.monto AS egresos_monto, ev.destinatario AS egreso_destinatario,
            ev.proyectos AS egreso_proyectos,
            psug.id AS proyecto_sugerido_id, psug.nombre AS proyecto_sugerido_nombre,
            liq.mes AS liquidacion_mes, liq.anio AS liquidacion_anio,
            cl.id AS cliente_sugerido_id, cl.nombre_razon_social AS cliente_sugerido_nombre,
            COALESCE(dc.id, dn.id) AS destinatario_sugerido_id,
            COALESCE(dc.nombre, dn.nombre) AS destinatario_sugerido_nombre,
            COALESCE(dc.es_dibujante, FALSE) AS destinatario_es_dibujante
     FROM banco_movimientos bm
     LEFT JOIN ingresos i       ON i.id = bm.ingreso_id
     LEFT JOIN clientes ci      ON ci.id = i.cliente_id
     LEFT JOIN proyectos pi     ON pi.id = i.proyecto_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cantidad, MIN(e.fecha) AS fecha, SUM(e.monto) AS monto, MIN(d.nombre) AS destinatario,
              string_agg(DISTINCT p.nombre, ', ') AS proyectos
       FROM banco_movimiento_egresos x JOIN egresos e ON e.id = x.egreso_id JOIN destinatarios d ON d.id = e.destinatario_id
       LEFT JOIN proyectos p ON p.id = e.proyecto_id
       WHERE x.banco_movimiento_id = bm.id
     ) ev ON TRUE
     LEFT JOIN liquidaciones_dibujantes liq ON liq.id = bm.liquidacion_id
     LEFT JOIN LATERAL (
       SELECT id, nombre_razon_social FROM clientes
       WHERE bm.cuit IS NOT NULL AND regexp_replace(COALESCE(cuit,''), '\\D', '', 'g') = bm.cuit LIMIT 1
     ) cl ON bm.importe > 0
     LEFT JOIN LATERAL (
       SELECT id, nombre,
              (COALESCE(notas,'') ILIKE 'Dibujante%' OR EXISTS (SELECT 1 FROM dibujantes dd WHERE lower(dd.nombre) = lower(destinatarios.nombre))) AS es_dibujante
       FROM destinatarios
       WHERE bm.cuit IS NOT NULL AND regexp_replace(COALESCE(cuit,''), '\\D', '', 'g') = bm.cuit LIMIT 1
     ) dc ON bm.importe < 0
     LEFT JOIN LATERAL (
       SELECT id, nombre FROM destinatarios
       WHERE bm.destinatario_sugerido IS NOT NULL AND lower(nombre) = lower(bm.destinatario_sugerido) LIMIT 1
     ) dn ON bm.importe < 0
     -- Proyecto sugerido: si el cliente tiene un solo proyecto activo, ese; si no,
     -- el del último ingreso de ese cliente (o del último egreso a ese destinatario).
     LEFT JOIN LATERAL (
       SELECT p.id, p.nombre FROM proyectos p
       WHERE (bm.importe > 0 AND cl.id IS NOT NULL AND p.cliente_id = cl.id AND COALESCE(p.estado,'activo') <> 'finalizado'
              AND (SELECT COUNT(*) FROM proyectos p2 WHERE p2.cliente_id = cl.id AND COALESCE(p2.estado,'activo') <> 'finalizado') = 1)
       UNION ALL
       SELECT p.id, p.nombre FROM (
         SELECT proyecto_id, fecha, created_at FROM ingresos
           WHERE bm.importe > 0 AND cl.id IS NOT NULL AND cliente_id = cl.id AND proyecto_id IS NOT NULL
         UNION ALL
         SELECT proyecto_id, fecha, created_at FROM egresos
           WHERE bm.importe < 0 AND COALESCE(dc.id, dn.id) IS NOT NULL AND destinatario_id = COALESCE(dc.id, dn.id) AND proyecto_id IS NOT NULL
         ORDER BY fecha DESC, created_at DESC LIMIT 1
       ) ult JOIN proyectos p ON p.id = ult.proyecto_id AND COALESCE(p.estado,'activo') <> 'finalizado'
       LIMIT 1
     ) psug ON TRUE
     WHERE ${cond.join(' AND ')}
     ORDER BY bm.fecha DESC, bm.posicion DESC`,
    params
  );

  // Candidatos a "ya registrado": mismo importe (al centavo), mismo sentido, fecha
  // cercana, en pesos, y que no estén vinculados a otro movimiento del banco.
  //  · Ingreso o egreso suelto con el mismo importe.
  //  · Liquidación de horas de un dibujante: el banco muestra UNA transferencia por el
  //    total (horas + monotributo), mientras la app guarda un egreso por proyecto.
  const pendientes = rows.filter(r => r.estado === 'pendiente' && r.clase !== 'inversion');
  if (pendientes.length) {
    const minF = pendientes.reduce((m, r) => (r.fecha < m ? r.fecha : m), pendientes[0].fecha);
    const maxF = pendientes.reduce((m, r) => (r.fecha > m ? r.fecha : m), pendientes[0].fecha);
    const rango = [minF, maxF, TOLERANCIA_LIQUIDACION_DIAS];
    const [{ rows: ingresos }, { rows: egresos }, { rows: liquidaciones }] = await Promise.all([
      query(
        `SELECT i.id, i.fecha, i.monto, i.descripcion, i.comprobante, i.es_del_estudio, c.nombre_razon_social AS nombre,
                p.nombre AS proyecto
         FROM ingresos i JOIN clientes c ON c.id = i.cliente_id LEFT JOIN proyectos p ON p.id = i.proyecto_id
         WHERE i.moneda = 'ARS' AND i.fecha BETWEEN $1::date - $3::int AND $2::date + $3::int
           AND NOT EXISTS (SELECT 1 FROM banco_movimientos b WHERE b.ingreso_id = i.id)`, rango),
      query(
        `SELECT e.id, e.fecha, e.monto, e.descripcion, e.comprobante, e.pagado_por_estudio, e.categoria, d.nombre,
                p.nombre AS proyecto
         FROM egresos e JOIN destinatarios d ON d.id = e.destinatario_id LEFT JOIN proyectos p ON p.id = e.proyecto_id
         WHERE e.moneda = 'ARS' AND e.fecha BETWEEN $1::date - $3::int AND $2::date + $3::int AND ${EGRESO_LIBRE}`, rango),
      // Cada liquidación con todos sus egresos: los que creó la liquidación comparten
      // destinatario, fecha y descripción con el egreso que guarda la liquidación.
      query(
        `SELECT l.id, l.mes, l.anio, l.monto_total, COALESCE(l.monotributo_monto, 0) AS monotributo,
                dib.nombre AS dibujante, base.fecha,
                json_agg(e.id) AS egreso_ids, SUM(e.monto) AS monto_egresos, COUNT(*)::int AS cantidad
         FROM liquidaciones_dibujantes l
         JOIN dibujantes dib ON dib.id = l.dibujante_id
         JOIN egresos base   ON base.id = l.egreso_id
         JOIN egresos e      ON e.destinatario_id = base.destinatario_id AND e.fecha = base.fecha
                            AND e.categoria = 'dibujantes' AND COALESCE(e.descripcion,'') = COALESCE(base.descripcion,'')
         WHERE base.moneda = 'ARS' AND base.fecha BETWEEN $1::date - $3::int AND $2::date + $3::int
         GROUP BY l.id, l.mes, l.anio, l.monto_total, l.monotributo_monto, dib.nombre, base.fecha
         HAVING bool_and(NOT EXISTS (SELECT 1 FROM banco_movimiento_egresos x WHERE x.egreso_id = e.id))`, rango),
    ]);
    const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
    const cent = (n) => Math.round(Number(n) * 100);
    for (const r of pendientes) {
      const credito = Number(r.importe) > 0;
      const importe = Math.abs(cent(r.importe));
      const sueltos = (credito ? ingresos : egresos)
        .filter(x => cent(x.monto) === importe && dias(x.fecha, r.fecha) <= TOLERANCIA_DIAS)
        .map(x => ({ ...x, tipo: credito ? 'ingreso' : 'egreso', dias: dias(x.fecha, r.fecha) }));
      const liqs = credito ? [] : liquidaciones
        .filter(l => (cent(l.monto_total) === importe || cent(l.monto_egresos) === importe) && dias(l.fecha, r.fecha) <= TOLERANCIA_LIQUIDACION_DIAS)
        .map(l => ({
          id: `liq-${l.id}`, tipo: 'liquidacion', liquidacion_id: l.id, egreso_ids: l.egreso_ids,
          nombre: l.dibujante, fecha: l.fecha, monto: Number(l.monto_total), mes: l.mes, anio: l.anio,
          cantidad: l.cantidad, monotributo: Number(l.monotributo), dias: dias(l.fecha, r.fecha),
        }));
      // Un egreso de una liquidación no se ofrece suelto: se vincula la liquidación entera
      const idsLiq = new Set(liquidaciones.flatMap(l => l.egreso_ids.map(String)));
      r.coincidencias = [...liqs, ...sueltos.filter(x => !(x.tipo === 'egreso' && idsLiq.has(String(x.id))))]
        .sort((a, b) => a.dias - b.dias);
    }
  }
  res.json(rows);
});

// ── Opciones para asociar a mano ─────────────────────────────────────────────
// Para un débito: liquidaciones de horas y egresos sueltos de un destinatario que
// todavía no están vinculados a ningún movimiento del banco, sin exigir que el
// monto ni la fecha coincidan. Para un crédito: ingresos de un cliente.
router.get('/movimientos/:id/opciones', async (req, res) => {
  const { rows: [mov] } = await query(`SELECT * FROM banco_movimientos WHERE id = $1`, [req.params.id]);
  if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado' });
  const cent = (n) => Math.round(Number(n) * 100);
  const importe = Math.abs(cent(mov.importe));
  const dias = (f) => Math.round(Math.abs((new Date(f) - new Date(mov.fecha)) / 86400000));
  const conDiferencia = (x, monto) => ({ ...x, monto: Number(monto), diferencia: (importe - cent(monto)) / 100, dias: dias(x.fecha) });
  const ordenar = (a, b) => Math.abs(a.diferencia) - Math.abs(b.diferencia) || a.dias - b.dias;

  if (Number(mov.importe) > 0) {
    const { cliente_id } = req.query;
    if (!cliente_id) return res.json({ ingresos: [] });
    const { rows } = await query(
      `SELECT i.id, i.fecha, i.monto, i.descripcion, i.comprobante, p.nombre AS proyecto
       FROM ingresos i LEFT JOIN proyectos p ON p.id = i.proyecto_id
       WHERE i.cliente_id = $1 AND i.moneda = 'ARS'
         AND NOT EXISTS (SELECT 1 FROM banco_movimientos b WHERE b.ingreso_id = i.id)
       ORDER BY i.fecha DESC LIMIT 100`, [cliente_id]);
    return res.json({ ingresos: rows.map(r => conDiferencia(r, r.monto)).sort(ordenar) });
  }

  const { destinatario_id } = req.query;
  if (!destinatario_id) return res.json({ liquidaciones: [], egresos: [] });
  const [{ rows: liqs }, { rows: egs }] = await Promise.all([
    query(
      `SELECT l.id, l.mes, l.anio, l.monto_total, COALESCE(l.monotributo_monto, 0) AS monotributo,
              base.fecha, json_agg(e.id) AS egreso_ids, SUM(e.monto) AS monto_egresos, COUNT(*)::int AS cantidad,
              string_agg(DISTINCT p.nombre, ', ') AS proyectos
       FROM liquidaciones_dibujantes l
       JOIN egresos base ON base.id = l.egreso_id
       JOIN egresos e    ON e.destinatario_id = base.destinatario_id AND e.fecha = base.fecha
                        AND e.categoria = 'dibujantes' AND COALESCE(e.descripcion,'') = COALESCE(base.descripcion,'')
       LEFT JOIN proyectos p ON p.id = e.proyecto_id
       WHERE base.destinatario_id = $1 AND base.moneda = 'ARS'
       GROUP BY l.id, l.mes, l.anio, l.monto_total, l.monotributo_monto, base.fecha
       HAVING bool_and(NOT EXISTS (SELECT 1 FROM banco_movimiento_egresos x WHERE x.egreso_id = e.id))
       ORDER BY base.fecha DESC LIMIT 60`, [destinatario_id]),
    query(
      `SELECT e.id, e.fecha, e.monto, e.descripcion, e.categoria, p.nombre AS proyecto
       FROM egresos e LEFT JOIN proyectos p ON p.id = e.proyecto_id
       WHERE e.destinatario_id = $1 AND e.moneda = 'ARS' AND ${EGRESO_LIBRE}
         AND NOT EXISTS (SELECT 1 FROM liquidaciones_dibujantes l JOIN egresos b ON b.id = l.egreso_id
                         WHERE b.destinatario_id = e.destinatario_id AND b.fecha = e.fecha AND e.categoria = 'dibujantes'
                           AND COALESCE(b.descripcion,'') = COALESCE(e.descripcion,''))
       ORDER BY e.fecha DESC LIMIT 100`, [destinatario_id]),
  ]);
  res.json({
    // La diferencia se mide contra el total liquidado (horas + monotributo)
    liquidaciones: liqs.map(l => conDiferencia({ ...l, monto_egresos: Number(l.monto_egresos) }, l.monto_total)).sort(ordenar),
    egresos: egs.map(e => conDiferencia(e, e.monto)).sort(ordenar),
  });
});

// ── Acciones sobre un movimiento ─────────────────────────────────────────────
router.post('/movimientos/:id/vincular', async (req, res) => {
  const { ingreso_id, creado, liquidacion_id } = req.body;
  const egresoIds = [...new Set([...(req.body.egreso_ids || []), ...(req.body.egreso_id ? [req.body.egreso_id] : [])].map(String))];
  if (!ingreso_id === !egresoIds.length) return res.status(400).json({ error: 'Indicá un ingreso o uno o más egresos' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [mov] } = await client.query(`SELECT * FROM banco_movimientos WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!mov) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Movimiento no encontrado' }); }
    const credito = Number(mov.importe) > 0;
    if (ingreso_id && !credito) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Un débito no puede vincularse a un ingreso' }); }
    if (egresoIds.length && credito) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Un crédito no puede vincularse a un egreso' }); }

    // Limpia un vínculo anterior de este mismo movimiento (re-vincular)
    await client.query(`DELETE FROM banco_movimiento_egresos WHERE banco_movimiento_id = $1`, [mov.id]);

    let destinatarios = [];
    if (ingreso_id) {
      const { rows: [ing] } = await client.query(`SELECT id, cliente_id FROM ingresos WHERE id = $1`, [ingreso_id]);
      if (!ing) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'El ingreso a vincular no existe' }); }
      const { rows: [otro] } = await client.query(`SELECT id FROM banco_movimientos WHERE ingreso_id = $1 AND id <> $2`, [ingreso_id, mov.id]);
      if (otro) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Ese ingreso ya está vinculado a otro movimiento del banco' }); }
      // Aprende el CUIT del cliente si no lo tenía (y nadie más lo usa)
      if (mov.cuit) {
        await client.query(
          `UPDATE clientes SET cuit = $1 WHERE id = $2 AND COALESCE(cuit,'') = ''
             AND NOT EXISTS (SELECT 1 FROM clientes c2 WHERE regexp_replace(COALESCE(c2.cuit,''), '\\D', '', 'g') = $1)`,
          [mov.cuit, ing.cliente_id]);
      }
    } else {
      const { rows: egs } = await client.query(`SELECT id, destinatario_id FROM egresos WHERE id::text = ANY($1)`, [egresoIds]);
      if (egs.length !== egresoIds.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Algún egreso a vincular no existe' }); }
      const { rows: tomados } = await client.query(`SELECT egreso_id FROM banco_movimiento_egresos WHERE egreso_id::text = ANY($1)`, [egresoIds]);
      if (tomados.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Algún egreso ya está vinculado a otro movimiento del banco' }); }
      for (const e of egs) {
        await client.query(`INSERT INTO banco_movimiento_egresos (banco_movimiento_id, egreso_id) VALUES ($1, $2)`, [mov.id, e.id]);
      }
      destinatarios = [...new Set(egs.map(e => String(e.destinatario_id)))];
      // Aprende el CUIT del destinatario (ej. el dibujante) si no lo tenía y nadie más lo usa
      if (mov.cuit && destinatarios.length === 1) {
        await client.query(
          `UPDATE destinatarios SET cuit = $1 WHERE id::text = $2 AND COALESCE(cuit,'') = ''
             AND NOT EXISTS (SELECT 1 FROM destinatarios d2 WHERE regexp_replace(COALESCE(d2.cuit,''), '\\D', '', 'g') = $1)`,
          [mov.cuit, destinatarios[0]]);
      }
    }
    const { rows } = await client.query(
      `UPDATE banco_movimientos SET ingreso_id=$1, liquidacion_id=$2, estado=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
      [ingreso_id || null, liquidacion_id || null, creado ? 'creado' : 'vinculado', mov.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error vinculando movimiento:', err);
    res.status(500).json({ error: 'Error al vincular el movimiento' });
  } finally {
    client.release();
  }
});

router.post('/movimientos/:id/estado', async (req, res) => {
  const { estado, nota } = req.body;
  if (!['pendiente', 'inversion', 'ignorado'].includes(estado)) return res.status(400).json({ error: 'Estado no válido' });
  // Volver a pendiente deshace el vínculo, pero NO borra el ingreso/egreso que se haya creado
  const { rows } = await query(
    `UPDATE banco_movimientos SET estado=$1, nota=COALESCE($2, nota),
       ingreso_id = NULL, liquidacion_id = NULL, updated_at = NOW()
     WHERE id=$3 RETURNING *`,
    [estado, nota || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Movimiento no encontrado' });
  await query(`DELETE FROM banco_movimiento_egresos WHERE banco_movimiento_id = $1`, [req.params.id]);
  res.json(rows[0]);
});

// ── Arqueo ───────────────────────────────────────────────────────────────────
router.get('/arqueo', async (req, res) => {
  let { desde, hasta } = req.query;
  const { rows: [lim] } = await query(`SELECT MIN(fecha) AS desde, MAX(fecha) AS hasta FROM banco_movimientos`);
  if (!lim.desde) return res.json({ vacio: true });
  desde = desde || lim.desde;
  hasta = hasta || lim.hasta;

  const { rows: movs } = await query(
    `SELECT bm.fecha, bm.importe, bm.saldo, bm.clase, ${ESTADO_EFECTIVO} AS estado
     FROM banco_movimientos bm WHERE bm.fecha BETWEEN $1 AND $2
     ORDER BY bm.fecha ASC, bm.posicion ASC`, [desde, hasta]
  );
  if (!movs.length) return res.json({ vacio: true, desde, hasta });
  const cent = (n) => Math.round(Number(n) * 100);
  const sumar = (f) => movs.filter(f).reduce((a, m) => a + cent(m.importe), 0) / 100;
  const porEstado = {};
  for (const e of ESTADOS) {
    porEstado[e] = {
      cantidad: movs.filter(m => m.estado === e).length,
      creditos: sumar(m => m.estado === e && Number(m.importe) > 0),
      debitos: sumar(m => m.estado === e && Number(m.importe) < 0),
    };
  }

  // Encadenamiento de saldos: cada movimiento debe partir del saldo del anterior.
  // Si no, falta información entre esas fechas (por ejemplo, un resumen sin subir).
  const huecos = [];
  for (let i = 1; i < movs.length; i++) {
    const a = movs[i - 1], b = movs[i];
    if (a.saldo === null || b.saldo === null) continue;
    if (cent(a.saldo) + cent(b.importe) !== cent(b.saldo)) {
      huecos.push({ desde: a.fecha, hasta: b.fecha, diferencia: (cent(b.saldo) - cent(b.importe) - cent(a.saldo)) / 100 });
    }
  }

  // Registros de la app (pagados/cobrados por el estudio, en pesos) que no aparecen en el banco
  const [{ rows: ingresosSinBanco }, { rows: egresosSinBanco }] = await Promise.all([
    query(
      `SELECT i.id, i.fecha, i.monto, i.descripcion, c.nombre_razon_social AS nombre
       FROM ingresos i JOIN clientes c ON c.id = i.cliente_id
       WHERE i.moneda = 'ARS' AND i.es_del_estudio = TRUE AND i.fecha BETWEEN $1 AND $2
         AND NOT EXISTS (SELECT 1 FROM banco_movimientos b WHERE b.ingreso_id = i.id)
       ORDER BY i.fecha DESC`, [desde, hasta]),
    query(
      `SELECT e.id, e.fecha, e.monto, e.descripcion, d.nombre
       FROM egresos e JOIN destinatarios d ON d.id = e.destinatario_id
       WHERE e.moneda = 'ARS' AND e.pagado_por_estudio = TRUE AND e.fecha BETWEEN $1 AND $2
         AND ${EGRESO_LIBRE}
       ORDER BY e.fecha DESC`, [desde, hasta]),
  ]);

  const primero = movs[0], ultimo = movs[movs.length - 1];
  res.json({
    desde, hasta,
    saldo_inicial: (cent(primero.saldo) - cent(primero.importe)) / 100,
    saldo_final: Number(ultimo.saldo),
    huecos,
    creditos: sumar(m => Number(m.importe) > 0),
    debitos: sumar(m => Number(m.importe) < 0),
    variacion: sumar(() => true),
    por_estado: porEstado,
    fondos: {
      suscripciones: sumar(m => m.clase === 'inversion' && Number(m.importe) < 0),
      rescates_e_intereses: sumar(m => m.clase === 'inversion' && Number(m.importe) > 0),
    },
    ingresos_sin_banco: ingresosSinBanco,
    egresos_sin_banco: egresosSinBanco,
  });
});

module.exports = router;
