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
const ESTADOS = ['pendiente', 'vinculado', 'creado', 'inversion', 'ignorado'];

// ── Esquema (se crea solo, solo agrega tablas nuevas) ─────────────────────────
let esquemaListo = null;
function asegurarEsquema() {
  if (!esquemaListo) {
    esquemaListo = (async () => {
      const { rows } = await query(
        `SELECT table_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name IN ('ingresos','egresos') AND column_name = 'id'`
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
          egreso_id       ${tipo('egresos')} REFERENCES egresos(id) ON DELETE SET NULL,
          nota            TEXT,
          created_at      TIMESTAMPTZ DEFAULT NOW(),
          updated_at      TIMESTAMPTZ DEFAULT NOW()
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
const ESTADO_EFECTIVO = `CASE WHEN bm.estado IN ('vinculado','creado') AND bm.ingreso_id IS NULL AND bm.egreso_id IS NULL
                              THEN 'pendiente' ELSE bm.estado END`;

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
            e.fecha AS egreso_fecha,  e.monto AS egreso_monto,  de.nombre AS egreso_destinatario,
            cl.id AS cliente_sugerido_id, cl.nombre_razon_social AS cliente_sugerido_nombre,
            COALESCE(dc.id, dn.id) AS destinatario_sugerido_id,
            COALESCE(dc.nombre, dn.nombre) AS destinatario_sugerido_nombre
     FROM banco_movimientos bm
     LEFT JOIN ingresos i       ON i.id = bm.ingreso_id
     LEFT JOIN clientes ci      ON ci.id = i.cliente_id
     LEFT JOIN egresos e        ON e.id = bm.egreso_id
     LEFT JOIN destinatarios de ON de.id = e.destinatario_id
     LEFT JOIN LATERAL (
       SELECT id, nombre_razon_social FROM clientes
       WHERE bm.cuit IS NOT NULL AND regexp_replace(COALESCE(cuit,''), '\\D', '', 'g') = bm.cuit LIMIT 1
     ) cl ON bm.importe > 0
     LEFT JOIN LATERAL (
       SELECT id, nombre FROM destinatarios
       WHERE bm.cuit IS NOT NULL AND regexp_replace(COALESCE(cuit,''), '\\D', '', 'g') = bm.cuit LIMIT 1
     ) dc ON bm.importe < 0
     LEFT JOIN LATERAL (
       SELECT id, nombre FROM destinatarios
       WHERE bm.destinatario_sugerido IS NOT NULL AND lower(nombre) = lower(bm.destinatario_sugerido) LIMIT 1
     ) dn ON bm.importe < 0
     WHERE ${cond.join(' AND ')}
     ORDER BY bm.fecha DESC, bm.posicion DESC`,
    params
  );

  // Candidatos a "ya registrado": mismo importe, mismo sentido, fecha cercana,
  // en pesos, y que no estén vinculados a otro movimiento del banco.
  const pendientes = rows.filter(r => r.estado === 'pendiente' && r.clase !== 'inversion');
  if (pendientes.length) {
    const minF = pendientes.reduce((m, r) => (r.fecha < m ? r.fecha : m), pendientes[0].fecha);
    const maxF = pendientes.reduce((m, r) => (r.fecha > m ? r.fecha : m), pendientes[0].fecha);
    const rango = [minF, maxF, TOLERANCIA_DIAS];
    const [{ rows: ingresos }, { rows: egresos }] = await Promise.all([
      query(
        `SELECT i.id, i.fecha, i.monto, i.descripcion, i.comprobante, i.es_del_estudio, c.nombre_razon_social AS nombre
         FROM ingresos i JOIN clientes c ON c.id = i.cliente_id
         WHERE i.moneda = 'ARS' AND i.fecha BETWEEN $1::date - $3::int AND $2::date + $3::int
           AND NOT EXISTS (SELECT 1 FROM banco_movimientos b WHERE b.ingreso_id = i.id)`, rango),
      query(
        `SELECT e.id, e.fecha, e.monto, e.descripcion, e.comprobante, e.pagado_por_estudio, d.nombre
         FROM egresos e JOIN destinatarios d ON d.id = e.destinatario_id
         WHERE e.moneda = 'ARS' AND e.fecha BETWEEN $1::date - $3::int AND $2::date + $3::int
           AND NOT EXISTS (SELECT 1 FROM banco_movimientos b WHERE b.egreso_id = e.id)`, rango),
    ]);
    const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
    const cent = (n) => Math.round(Number(n) * 100);
    for (const r of pendientes) {
      const lista = Number(r.importe) > 0 ? ingresos : egresos;
      r.coincidencias = lista
        .filter(x => cent(x.monto) === Math.abs(cent(r.importe)) && dias(x.fecha, r.fecha) <= TOLERANCIA_DIAS)
        .map(x => ({ ...x, tipo: Number(r.importe) > 0 ? 'ingreso' : 'egreso', dias: dias(x.fecha, r.fecha) }))
        .sort((a, b) => a.dias - b.dias);
    }
  }
  res.json(rows);
});

// ── Acciones sobre un movimiento ─────────────────────────────────────────────
router.post('/movimientos/:id/vincular', async (req, res) => {
  const { ingreso_id, egreso_id, creado } = req.body;
  if (!ingreso_id === !egreso_id) return res.status(400).json({ error: 'Indicá un ingreso o un egreso' });
  const { rows: [mov] } = await query(`SELECT * FROM banco_movimientos WHERE id = $1`, [req.params.id]);
  if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado' });
  if (ingreso_id && Number(mov.importe) <= 0) return res.status(400).json({ error: 'Un débito no puede vincularse a un ingreso' });
  if (egreso_id && Number(mov.importe) >= 0) return res.status(400).json({ error: 'Un crédito no puede vincularse a un egreso' });
  const tabla = ingreso_id ? 'ingresos' : 'egresos';
  const col = ingreso_id ? 'ingreso_id' : 'egreso_id';
  const idDestino = ingreso_id || egreso_id;
  const { rows: [reg] } = await query(`SELECT id FROM ${tabla} WHERE id = $1`, [idDestino]);
  if (!reg) return res.status(404).json({ error: 'El registro a vincular no existe' });
  const { rows: [otro] } = await query(`SELECT id FROM banco_movimientos WHERE ${col} = $1 AND id <> $2`, [idDestino, req.params.id]);
  if (otro) return res.status(409).json({ error: 'Ese registro ya está vinculado a otro movimiento del banco' });
  const { rows } = await query(
    `UPDATE banco_movimientos SET ingreso_id=$1, egreso_id=$2, estado=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
    [ingreso_id || null, egreso_id || null, creado ? 'creado' : 'vinculado', req.params.id]
  );
  res.json(rows[0]);
});

router.post('/movimientos/:id/estado', async (req, res) => {
  const { estado, nota } = req.body;
  if (!['pendiente', 'inversion', 'ignorado'].includes(estado)) return res.status(400).json({ error: 'Estado no válido' });
  // Volver a pendiente deshace el vínculo, pero NO borra el ingreso/egreso que se haya creado
  const { rows } = await query(
    `UPDATE banco_movimientos SET estado=$1, nota=COALESCE($2, nota),
       ingreso_id = NULL, egreso_id = NULL, updated_at = NOW()
     WHERE id=$3 RETURNING *`,
    [estado, nota || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Movimiento no encontrado' });
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
         AND NOT EXISTS (SELECT 1 FROM banco_movimientos b WHERE b.egreso_id = e.id)
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
