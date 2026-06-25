const express = require('express');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

// GET /api/rendiciones?proyecto_id=&tipo=
router.get('/', async (req, res) => {
  const { proyecto_id, tipo } = req.query;
  const condiciones = ['TRUE'];
  const params = [];
  if (proyecto_id) { params.push(proyecto_id); condiciones.push(`r.proyecto_id = $${params.length}`); }
  if (tipo)        { params.push(tipo);        condiciones.push(`r.tipo = $${params.length}`); }

  const { rows } = await query(
    `SELECT r.*, p.nombre AS proyecto_nombre, c.nombre_razon_social AS cliente_nombre,
            COALESCE((SELECT SUM(rc.monto_total) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id AND rc.moneda = 'ARS'), 0) AS total_ars,
            COALESCE((SELECT SUM(rc.monto_total) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id AND rc.moneda = 'USD'), 0) AS total_usd,
            (SELECT COUNT(*) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id) AS cantidad_comprobantes
     FROM rendiciones r
     JOIN proyectos p ON p.id = r.proyecto_id
     JOIN clientes  c ON c.id = p.cliente_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY r.fecha DESC, r.created_at DESC`,
    params
  );
  res.json(rows);
});

// GET /api/rendiciones/:id (con sus comprobantes)
router.get('/:id', async (req, res) => {
  const { rows: [rendicion] } = await query(
    `SELECT r.*, p.nombre AS proyecto_nombre, c.nombre_razon_social AS cliente_nombre
     FROM rendiciones r
     JOIN proyectos p ON p.id = r.proyecto_id
     JOIN clientes  c ON c.id = p.cliente_id
     WHERE r.id = $1`,
    [req.params.id]
  );
  if (!rendicion) return res.status(404).json({ error: 'Rendición no encontrada' });

  const { rows: comprobantes } = await query(
    `SELECT * FROM rendicion_comprobantes WHERE rendicion_id = $1 ORDER BY orden ASC, created_at ASC`,
    [req.params.id]
  );

  res.json({ ...rendicion, comprobantes });
});

// GET /api/rendiciones/siguiente-numero?proyecto_id=&tipo=
router.get('/siguiente-numero/calcular', async (req, res) => {
  const { proyecto_id, tipo } = req.query;
  if (!proyecto_id || !tipo) return res.status(400).json({ error: 'proyecto_id y tipo son obligatorios' });
  // Bloqueamos las filas existentes para evitar números duplicados en creaciones simultáneas
    await client.query(
      `SELECT id FROM rendiciones WHERE proyecto_id = $1 AND tipo = $2 FOR UPDATE`,
      [proyecto_id, tipo.trim().toUpperCase()]
    );
    const { rows: numRows } = await client.query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM rendiciones WHERE proyecto_id = $1 AND tipo = $2`,
      [proyecto_id, tipo.trim().toUpperCase()]
    );
  res.json({ siguiente: rows[0].siguiente });
});

// POST /api/rendiciones
router.post('/', async (req, res) => {
  const { proyecto_id, tipo, fecha, notas } = req.body;
  if (!proyecto_id) return res.status(400).json({ error: 'proyecto_id es obligatorio' });
  if (!tipo?.trim()) return res.status(400).json({ error: 'El tipo es obligatorio' });
  if (!fecha) return res.status(400).json({ error: 'La fecha es obligatoria' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: numRows } = await client.query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM rendiciones WHERE proyecto_id = $1 AND tipo = $2 FOR UPDATE`,
      [proyecto_id, tipo.trim().toUpperCase()]
    );
    const numero = numRows[0].siguiente;

    const { rows } = await client.query(
      `INSERT INTO rendiciones (proyecto_id, tipo, numero, fecha, notas)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [proyecto_id, tipo.trim().toUpperCase(), numero, fecha, notas || null]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creando rendición:', err);
    res.status(500).json({ error: 'Error al crear la rendición' });
  } finally {
    client.release();
  }
});

// PUT /api/rendiciones/:id
router.put('/:id', async (req, res) => {
  const { fecha, estado, notas } = req.body;
  const { rows } = await query(
    `UPDATE rendiciones SET fecha=COALESCE($1, fecha), estado=COALESCE($2, estado), notas=$3, updated_at=NOW()
     WHERE id=$4 RETURNING *`,
    [fecha || null, estado || null, notas || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Rendición no encontrada' });
  res.json(rows[0]);
});

// DELETE /api/rendiciones/:id
router.delete('/:id', async (req, res) => {
  const { rows } = await query(`DELETE FROM rendiciones WHERE id=$1 RETURNING id`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Rendición no encontrada' });
  res.status(204).send();
});

// ── Comprobantes ──────────────────────────────────────────────────────────────

// POST /api/rendiciones/:id/comprobantes
router.post('/:id/comprobantes', async (req, res) => {
  const { descripcion, numero_comprobante, moneda, monto_neto, iva, iibb } = req.body;
  if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es obligatoria' });
  const neto = Number(monto_neto || 0);
  const ivaNum = Number(iva || 0);
  const iibbNum = Number(iibb || 0);
  const total = neto + ivaNum + iibbNum;

  const { rows: ordenRows } = await query(
    `SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM rendicion_comprobantes WHERE rendicion_id = $1`,
    [req.params.id]
  );

  const { rows } = await query(
    `INSERT INTO rendicion_comprobantes
       (rendicion_id, orden, descripcion, numero_comprobante, moneda, monto_neto, iva, iibb, monto_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [req.params.id, ordenRows[0].siguiente, descripcion.trim(), numero_comprobante || null,
     moneda || 'ARS', neto, ivaNum, iibbNum, total]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/rendiciones/comprobantes/:comprobanteId
router.put('/comprobantes/:comprobanteId', async (req, res) => {
  const { descripcion, numero_comprobante, moneda, monto_neto, iva, iibb } = req.body;
  if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es obligatoria' });
  const neto = Number(monto_neto || 0);
  const ivaNum = Number(iva || 0);
  const iibbNum = Number(iibb || 0);
  const total = neto + ivaNum + iibbNum;

  const { rows } = await query(
    `UPDATE rendicion_comprobantes
     SET descripcion=$1, numero_comprobante=$2, moneda=$3, monto_neto=$4, iva=$5, iibb=$6, monto_total=$7
     WHERE id=$8 RETURNING *`,
    [descripcion.trim(), numero_comprobante || null, moneda || 'ARS', neto, ivaNum, iibbNum, total, req.params.comprobanteId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Comprobante no encontrado' });
  res.json(rows[0]);
});

// DELETE /api/rendiciones/comprobantes/:comprobanteId
router.delete('/comprobantes/:comprobanteId', async (req, res) => {
  const { rows } = await query(`DELETE FROM rendicion_comprobantes WHERE id=$1 RETURNING id`, [req.params.comprobanteId]);
  if (!rows[0]) return res.status(404).json({ error: 'Comprobante no encontrado' });
  res.status(204).send();
});

module.exports = router;
