const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

router.get('/', async (req, res) => {
  const { buscar, inactivos } = req.query;
  const soloActivos = inactivos !== 'true';
  const params = [];
  let where = soloActivos ? 'WHERE c.activo = TRUE' : 'WHERE TRUE';
  if (buscar) {
    params.push(`%${buscar}%`);
    where += ` AND (c.nombre_razon_social ILIKE $${params.length} OR c.cuit ILIKE $${params.length})`;
  }
  const { rows } = await query(
    `SELECT c.*,
            COUNT(p.id) FILTER (WHERE p.estado = 'activo') AS proyectos_activos
     FROM clientes c
     LEFT JOIN proyectos p ON p.cliente_id = c.id
     ${where}
     GROUP BY c.id
     ORDER BY c.nombre_razon_social ASC`,
    params
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT c.*,
            COALESCE(json_agg(p ORDER BY p.created_at DESC) FILTER (WHERE p.id IS NOT NULL), '[]') AS proyectos
     FROM clientes c
     LEFT JOIN proyectos p ON p.cliente_id = c.id
     WHERE c.id = $1
     GROUP BY c.id`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const { nombre_razon_social, cuit, email, telefono, notas } = req.body;
  if (!nombre_razon_social?.trim()) {
    return res.status(400).json({ error: 'El nombre o razón social es obligatorio' });
  }
  const { rows } = await query(
    `INSERT INTO clientes (nombre_razon_social, cuit, email, telefono, notas)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [nombre_razon_social.trim(), cuit || null, email || null, telefono || null, notas || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { nombre_razon_social, cuit, email, telefono, notas } = req.body;
  if (!nombre_razon_social?.trim()) {
    return res.status(400).json({ error: 'El nombre o razón social es obligatorio' });
  }
  const { rows } = await query(
    `UPDATE clientes
     SET nombre_razon_social = $1, cuit = $2, email = $3, telefono = $4, notas = $5
     WHERE id = $6 RETURNING *`,
    [nombre_razon_social.trim(), cuit || null, email || null, telefono || null, notas || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(rows[0]);
});

router.patch('/:id/desactivar', async (req, res) => {
  const { rows } = await query(
    `UPDATE clientes SET activo = FALSE WHERE id = $1 RETURNING id, nombre_razon_social, activo`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(rows[0]);
});

router.patch('/:id/activar', async (req, res) => {
  const { rows } = await query(
    `UPDATE clientes SET activo = TRUE WHERE id = $1 RETURNING id, nombre_razon_social, activo`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(rows[0]);
});

module.exports = router;
