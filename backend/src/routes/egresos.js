const express = require('express');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

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
     LEFT JOIN proyectos p ON p.id = e.proyecto_id
     LEFT JOIN socios    s ON s.id = e.socio_id
     LEFT JOIN egreso_socios esc ON esc.egreso_id = e.id
     LEFT JOIN socios        sc  ON sc.id = esc.socio_id
     WHERE e.id = $1
     GROUP BY e.id, d.nombre, p.nombre, s.nombre`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Egreso no encontrado' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const { destinatario_id, proyecto_id, categoria, monto, moneda,
          pagado_por_estudio, socio_id, fecha, comprobante, descripcion } = req.body;
  if (!destinatario_id)         return res.status(400).json({ error: 'destinatario_id es obligatorio' });
  if (!categoria)               return res.status(400).json({ error: 'La categoría es obligatoria' });
  if (!monto || monto <= 0)     return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  if (!moneda)                  return res.status(400).json({ error: 'La moneda es obligatoria' });
  if (!pagado_por_estudio && !socio_id) {
    return res.status(400).json({ error: 'Si no pagó el estudio, se debe indicar el socio_id' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO egresos
         (destinatario_id, proyecto_id, categoria, monto, moneda,
          pagado_por_estudio, socio_id, fecha, comprobante, descripcion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [destinatario_id, proyecto_id || null, categoria, monto, moneda,
       pagado_por_estudio ?? true, pagado_por_estudio ? null : socio_id,
       fecha || new Date().toISOString().split('T')[0],
       comprobante || null, descripcion || null]
    );
    await client.query(`SELECT distribuir_egreso($1)`, [rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creando egreso:', err);
    res.status(500).json({ error: 'Error al registrar el egreso' });
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res) => {
  const { destinatario_id, proyecto_id, categoria, monto, moneda,
          pagado_por_estudio, socio_id, fecha, comprobante, descripcion } = req.body;
  if (!monto || monto <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  if (!pagado_por_estudio && !socio_id) {
    return res.status(400).json({ error: 'Si no pagó el estudio, se debe indicar el socio_id' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE egresos SET destinatario_id=$1, proyecto_id=$2, categoria=$3, monto=$4, moneda=$5,
         pagado_por_estudio=$6, socio_id=$7, fecha=$8, comprobante=$9, descripcion=$10
       WHERE id=$11 RETURNING *`,
      [destinatario_id, proyecto_id || null, categoria, monto, moneda,
       pagado_por_estudio ?? true, pagado_por_estudio ? null : socio_id,
       fecha, comprobante || null, descripcion || null, req.params.id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Egreso no encontrado' }); }
    await client.query(`DELETE FROM egreso_socios WHERE egreso_id = $1`, [req.params.id]);
    await client.query(`SELECT distribuir_egreso($1)`, [req.params.id]);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al actualizar el egreso' });
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res) => {
  const { rows } = await query(`DELETE FROM egresos WHERE id=$1 RETURNING id`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Egreso no encontrado' });
  res.status(204).send();
});

module.exports = router;
