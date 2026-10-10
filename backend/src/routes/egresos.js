const express = require('express');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');
const { obtenerCotizacionOficial } = require('../utils/cotizacion');
const { rutaOcr } = require('../utils/ocrUpload');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

// Categoría para retiros de un socio desde la cuenta del estudio: no es un gasto,
// es plata que se lleva ese socio (el balance lo trata como tal).
const EXTRACCION = 'extraccion_socio';

// Si la base limita las categorías (tipo enum o restricción CHECK), suma la nueva.
// Se hace una sola vez; si falla, se registra y la app sigue funcionando.
let categoriasListas = null;
function asegurarCategorias() {
  if (!categoriasListas) {
    categoriasListas = (async () => {
      const { rows: [col] } = await query(
        `SELECT data_type, udt_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'egresos' AND column_name = 'categoria'`);
      if (col?.data_type === 'USER-DEFINED') {
        await query(`ALTER TYPE "${col.udt_name}" ADD VALUE IF NOT EXISTS '${EXTRACCION}'`);
      }
      const { rows: checks } = await query(
        `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conrelid = 'public.egresos'::regclass AND contype = 'c'`);
      for (const c of checks) {
        const soloLista = /categoria/.test(c.def) && /= ANY|IN \(/i.test(c.def) && !/ AND | OR /i.test(c.def);
        if (soloLista && !c.def.includes(EXTRACCION)) {
          const valores = [...new Set([...(c.def.match(/'([^']+)'/g) || []).map(v => v.slice(1, -1)), EXTRACCION])];
          await query(
            `ALTER TABLE egresos DROP CONSTRAINT "${c.conname}",
               ADD CONSTRAINT "${c.conname}" CHECK (categoria IN (${valores.map(v => `'${v.replace(/'/g, "''")}'`).join(', ')}))`);
          console.log(`Categoría ${EXTRACCION} agregada a la restricción ${c.conname}`);
        }
      }
    })().catch(err => { console.error('No se pudo agregar la categoría de extracción:', err.message); });
  }
  return categoriasListas;
}
router.use(async (req, res, next) => { await asegurarCategorias(); next(); });

// Quién figura como socio del egreso: el que pagó de su bolsillo, o el que retira
function datosSocio({ categoria, pagado_por_estudio, socio_id }) {
  if (categoria === EXTRACCION) return { pagado: true, socio: socio_id || null };
  return { pagado: pagado_por_estudio ?? true, socio: pagado_por_estudio ? null : socio_id };
}

router.get('/', async (req, res) => {
  const { proyecto_id, categoria, moneda, socio_id, desde, hasta } = req.query;
  const condiciones = ['TRUE'];
  const params = [];
  if (proyecto_id) { params.push(proyecto_id); condiciones.push(`e.proyecto_id = $${params.length}`); }
  if (categoria)   { params.push(categoria);   condiciones.push(`e.categoria = $${params.length}`); }
  if (moneda)      { params.push(moneda);       condiciones.push(`e.moneda = $${params.length}`); }
  if (socio_id)    { params.push(socio_id);     condiciones.push(`(e.socio_id = $${params.length} OR e.pagado_por_estudio = TRUE)`); }
  if (desde)       { params.push(desde);        condiciones.push(`e.fecha >= $${params.length}`); }
  if (hasta)       { params.push(hasta);        condiciones.push(`e.fecha <= $${params.length}`); }
  const { rows } = await query(
    `SELECT e.*, d.nombre AS destinatario_nombre, d.tipo AS destinatario_tipo,
            p.nombre AS proyecto_nombre, s.nombre AS socio_nombre,
            COALESCE(json_agg(json_build_object(
              'socio_id', esc.socio_id, 'socio_nombre', sc.nombre,
              'monto_adeudado', esc.monto_adeudado, 'porcentaje', esc.porcentaje
            )) FILTER (WHERE esc.id IS NOT NULL), '[]') AS distribucion
     FROM egresos e
     JOIN destinatarios d ON d.id = e.destinatario_id
     LEFT JOIN proyectos p ON p.id = e.proyecto_id
     LEFT JOIN socios    s ON s.id = e.socio_id
     LEFT JOIN egreso_socios esc ON esc.egreso_id = e.id
     LEFT JOIN socios        sc  ON sc.id = esc.socio_id
     WHERE ${condiciones.join(' AND ')}
     GROUP BY e.id, d.nombre, d.tipo, p.nombre, s.nombre
     ORDER BY e.fecha DESC, e.created_at DESC`,
    params
  );
  res.json(rows);
});

// Lee una factura con OCR y la sube a Storage (no crea el egreso)
router.post('/ocr', ...rutaOcr('egresos'));

router.get('/resumen', async (req, res) => {
  const { desde, hasta } = req.query;
  const params = [];
  const condiciones = ['TRUE'];
  if (desde) { params.push(desde); condiciones.push(`fecha >= $${params.length}`); }
  if (hasta) { params.push(hasta); condiciones.push(`fecha <= $${params.length}`); }
  const { rows } = await query(
    `SELECT moneda, categoria, COUNT(*) AS cantidad, SUM(monto) AS total
     FROM egresos WHERE ${condiciones.join(' AND ')}
     GROUP BY moneda, categoria ORDER BY moneda, total DESC`,
    params
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT e.*, d.nombre AS destinatario_nombre, p.nombre AS proyecto_nombre, s.nombre AS socio_nombre,
            COALESCE(json_agg(json_build_object(
              'socio_id', esc.socio_id, 'socio_nombre', sc.nombre,
              'monto_adeudado', esc.monto_adeudado, 'porcentaje', esc.porcentaje
            )) FILTER (WHERE esc.id IS NOT NULL), '[]') AS distribucion
     FROM egresos e
     JOIN destinatarios d ON d.id = e.destinatario_id
     LEFT JOIN proyectos      p   ON p.id = e.proyecto_id
     LEFT JOIN socios         s   ON s.id = e.socio_id
     LEFT JOIN egreso_socios  esc ON esc.egreso_id = e.id
     LEFT JOIN socios         sc  ON sc.id = esc.socio_id
     WHERE e.id = $1
     GROUP BY e.id, d.nombre, p.nombre, s.nombre`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Egreso no encontrado' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const {
    destinatario_id, proyecto_id, categoria, monto, moneda,
    pagado_por_estudio, socio_id, fecha, comprobante, descripcion, archivo_url,
  } = req.body;

  if (!destinatario_id)         return res.status(400).json({ error: 'destinatario_id es obligatorio' });
  if (!categoria)               return res.status(400).json({ error: 'La categoría es obligatoria' });
  if (!monto || monto <= 0)     return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  if (!moneda)                  return res.status(400).json({ error: 'La moneda es obligatoria' });
  if (categoria === EXTRACCION && !socio_id) {
    return res.status(400).json({ error: 'Indicá qué socio hizo la extracción' });
  }
  if (categoria !== EXTRACCION && !pagado_por_estudio && !socio_id) {
    return res.status(400).json({ error: 'Si no pagó el estudio, se debe indicar el socio_id' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

const fechaEgreso = fecha || new Date().toISOString().split('T')[0];
    const cotizacion_dolar = moneda === 'USD' ? await obtenerCotizacionOficial(fechaEgreso) : null;
    const { rows } = await client.query(
      `INSERT INTO egresos
         (destinatario_id, proyecto_id, categoria, monto, moneda,
          pagado_por_estudio, socio_id, fecha, comprobante, descripcion, cotizacion_dolar, archivo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        destinatario_id,
        proyecto_id || null,
        categoria,
        monto,
        moneda,
        datosSocio(req.body).pagado,
        datosSocio(req.body).socio,
        fecha || new Date().toISOString().split('T')[0],
        comprobante || null,
        descripcion || null,
        cotizacion_dolar,
        archivo_url || null,
      ]
    );
    const egreso = rows[0];

    await client.query(`SELECT distribuir_egreso($1)`, [egreso.id]);

    await client.query('COMMIT');

    const { rows: completo } = await client.query(
      `SELECT e.*,
              d.nombre AS destinatario_nombre,
              COALESCE(
                json_agg(json_build_object(
                  'socio_id', esc.socio_id,
                  'socio_nombre', sc.nombre,
                  'monto_adeudado', esc.monto_adeudado,
                  'porcentaje', esc.porcentaje
                )) FILTER (WHERE esc.id IS NOT NULL), '[]'
              ) AS distribucion
       FROM egresos e
       JOIN destinatarios d ON d.id = e.destinatario_id
       LEFT JOIN egreso_socios esc ON esc.egreso_id = e.id
       LEFT JOIN socios sc ON sc.id = esc.socio_id
       WHERE e.id = $1
       GROUP BY e.id, d.nombre`,
      [egreso.id]
    );
    res.status(201).json(completo[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creando egreso:', err);
    res.status(500).json({ error: 'Error al registrar el egreso' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const {
    destinatario_id, proyecto_id, categoria, monto, moneda,
    pagado_por_estudio, socio_id, fecha, comprobante, descripcion, archivo_url,
  } = req.body;

  if (!monto || monto <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  if (categoria === EXTRACCION && !socio_id) {
    return res.status(400).json({ error: 'Indicá qué socio hizo la extracción' });
  }
  if (categoria !== EXTRACCION && !pagado_por_estudio && !socio_id) {
    return res.status(400).json({ error: 'Si no pagó el estudio, se debe indicar el socio_id' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE egresos SET destinatario_id=$1, proyecto_id=$2, categoria=$3, monto=$4, moneda=$5,
         pagado_por_estudio=$6, socio_id=$7, fecha=$8, comprobante=$9, descripcion=$10, archivo_url=$11
       WHERE id=$12 RETURNING *`,
      [
        destinatario_id, proyecto_id || null, categoria, monto, moneda,
        datosSocio(req.body).pagado,
        datosSocio(req.body).socio,
        fecha, comprobante || null, descripcion || null,
        archivo_url || null,
        req.params.id,
      ]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Egreso no encontrado' }); }

    await client.query(`DELETE FROM egreso_socios WHERE egreso_id = $1`, [req.params.id]);
    await client.query(`SELECT distribuir_egreso($1)`, [req.params.id]);

    await client.query('COMMIT');
    res.json(rows[0]);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error actualizando egreso:', err);
    res.status(500).json({ error: 'Error al actualizar el egreso' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const { rows } = await query(
    `DELETE FROM egresos WHERE id=$1 RETURNING id`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Egreso no encontrado' });
  res.status(204).send();
});

module.exports = router;
