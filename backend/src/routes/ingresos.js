const express = require('express');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');
const { obtenerCotizacionOficial } = require('../utils/cotizacion');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

router.get('/', async (req, res) => {
  const { proyecto_id, cliente_id, moneda, tipo, socio_id, desde, hasta } = req.query;
  const condiciones = ['TRUE'];
  const params = [];
  if (proyecto_id) { params.push(proyecto_id); condiciones.push(`i.proyecto_id = $${params.length}`); }
  if (cliente_id)  { params.push(cliente_id);  condiciones.push(`i.cliente_id = $${params.length}`); }
  if (moneda)      { params.push(moneda);       condiciones.push(`i.moneda = $${params.length}`); }
  if (tipo)        { params.push(tipo);         condiciones.push(`i.tipo = $${params.length}`); }
  if (socio_id)    { params.push(socio_id);     condiciones.push(`(i.socio_id = $${params.length} OR i.es_del_estudio = TRUE)`); }
  if (desde)       { params.push(desde);        condiciones.push(`i.fecha >= $${params.length}`); }
  if (hasta)       { params.push(hasta);        condiciones.push(`i.fecha <= $${params.length}`); }
  const { rows } = await query(
    `SELECT i.*, c.nombre_razon_social AS cliente_nombre,
            p.nombre AS proyecto_nombre, s.nombre AS socio_nombre,
            COALESCE(json_agg(json_build_object(
              'socio_id', isc.socio_id, 'socio_nombre', sc.nombre,
              'monto_asignado', isc.monto_asignado, 'porcentaje', isc.porcentaje
            )) FILTER (WHERE isc.id IS NOT NULL), '[]') AS distribucion
     FROM ingresos i
     JOIN clientes c ON c.id = i.cliente_id
     LEFT JOIN proyectos p ON p.id = i.proyecto_id
     LEFT JOIN socios    s ON s.id = i.socio_id
     LEFT JOIN ingreso_socios isc ON isc.ingreso_id = i.id
     LEFT JOIN socios        sc  ON sc.id = isc.socio_id
     WHERE ${condiciones.join(' AND ')}
     GROUP BY i.id, c.nombre_razon_social, p.nombre, s.nombre
     ORDER BY i.fecha DESC, i.created_at DESC`,
    params
  );
  res.json(rows);
});

router.get('/resumen', async (req, res) => {
  const { desde, hasta } = req.query;
  const params = [];
  const condiciones = ['TRUE'];
  if (desde) { params.push(desde); condiciones.push(`fecha >= $${params.length}`); }
  if (hasta) { params.push(hasta); condiciones.push(`fecha <= $${params.length}`); }
  const { rows } = await query(
    `SELECT moneda, tipo, COUNT(*) AS cantidad, SUM(monto) AS total,
            SUM(CASE WHEN es_del_estudio THEN monto ELSE 0 END) AS total_estudio,
            SUM(CASE WHEN NOT es_del_estudio THEN monto ELSE 0 END) AS total_socios
     FROM ingresos WHERE ${condiciones.join(' AND ')}
     GROUP BY moneda, tipo ORDER BY moneda, tipo`,
    params
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT i.*, c.nombre_razon_social AS cliente_nombre,
            p.nombre AS proyecto_nombre, s.nombre AS socio_nombre,
            COALESCE(json_agg(json_build_object(
              'socio_id', isc.socio_id, 'socio_nombre', sc.nombre,
              'monto_asignado', isc.monto_asignado, 'porcentaje', isc.porcentaje
            )) FILTER (WHERE isc.id IS NOT NULL), '[]') AS distribucion
     FROM ingresos i
     JOIN clientes c ON c.id = i.cliente_id
     LEFT JOIN proyectos p ON p.id = i.proyecto_id
     LEFT JOIN socios    s ON s.id = i.socio_id
     LEFT JOIN ingreso_socios isc ON isc.ingreso_id = i.id
     LEFT JOIN socios        sc  ON sc.id = isc.socio_id
     WHERE i.id = $1
     GROUP BY i.id, c.nombre_razon_social, p.nombre, s.nombre`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Ingreso no encontrado' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const { cliente_id, proyecto_id, monto, moneda, tipo,
          es_del_estudio, socio_id, fecha, comprobante, descripcion } = req.body;
  if (!cliente_id)          return res.status(400).json({ error: 'cliente_id es obligatorio' });
  if (!monto || monto <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  if (!moneda)              return res.status(400).json({ error: 'La moneda es obligatoria' });
  if (!tipo)                return res.status(400).json({ error: 'El tipo es obligatorio' });
  if (!es_del_estudio && !socio_id) {
    return res.status(400).json({ error: 'Si no es del estudio, se debe indicar el socio_id' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
const fechaIngreso = fecha || new Date().toISOString().split('T')[0];
    const cotizacion_dolar = moneda === 'USD' ? await obtenerCotizacionOficial(fechaIngreso) : null;    const { rows } = await client.query(
      `INSERT INTO ingresos
         (cliente_id, proyecto_id, monto, moneda, tipo, es_del_estudio, socio_id, fecha, comprobante, descripcion, cotizacion_dolar)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [cliente_id, proyecto_id || null, monto, moneda, tipo,
       es_del_estudio ?? true, es_del_estudio ? null : socio_id,
       fecha || new Date().toISOString().split('T')[0],
       comprobante || null, descripcion || null, cotizacion_dolar]
    );
    await client.query(`SELECT distribuir_ingreso($1)`, [rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creando ingreso:', err);
    res.status(500).json({ error: 'Error al registrar el ingreso' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const { cliente_id, proyecto_id, monto, moneda, tipo,
          es_del_estudio, socio_id, fecha, comprobante, descripcion } = req.body;
  if (!monto || monto <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  if (!es_del_estudio && !socio_id) {
    return res.status(400).json({ error: 'Si no es del estudio, se debe indicar el socio_id' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE ingresos SET cliente_id=$1, proyecto_id=$2, monto=$3, moneda=$4, tipo=$5,
         es_del_estudio=$6, socio_id=$7, fecha=$8, comprobante=$9, descripcion=$10
       WHERE id=$11 RETURNING *`,
      [cliente_id, proyecto_id || null, monto, moneda, tipo,
       es_del_estudio ?? true, es_del_estudio ? null : socio_id,
       fecha, comprobante || null, descripcion || null, req.params.id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ingreso no encontrado' }); }
    await client.query(`DELETE FROM ingreso_socios WHERE ingreso_id = $1`, [req.params.id]);
    await client.query(`SELECT distribuir_ingreso($1)`, [req.params.id]);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al actualizar el ingreso' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const { rows } = await query(`DELETE FROM ingresos WHERE id=$1 RETURNING id`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Ingreso no encontrado' });
  res.status(204).send();
});

module.exports = router;
