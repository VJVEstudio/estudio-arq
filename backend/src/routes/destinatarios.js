const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

router.get('/', async (req, res) => {
  const { buscar, tipo } = req.query;
  const params = [];
  const condiciones = ['activo = TRUE'];
  if (buscar) {
    params.push(`%${buscar}%`);
    condiciones.push(`(nombre ILIKE $${params.length} OR cuit ILIKE $${params.length})`);
  }
  if (tipo) {
    params.push(tipo);
    condiciones.push(`tipo = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT * FROM destinatarios WHERE ${condiciones.join(' AND ')} ORDER BY nombre ASC`,
    params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { nombre, tipo, cuit, cbu, notas } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const { rows } = await query(
    `INSERT INTO destinatarios (nombre, tipo, cuit, cbu, notas)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [nombre.trim(), tipo || 'otro', cuit || null, cbu || null, notas || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { nombre, tipo, cuit, cbu, notas } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const { rows } = await query(
    `UPDATE destinatarios SET nombre=$1, tipo=$2, cuit=$3, cbu=$4, notas=$5
     WHERE id=$6 RETURNING *`,
    [nombre.trim(), tipo || 'otro', cuit || null, cbu || null, notas || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Destinatario no encontrado' });
  res.json(rows[0]);
});

router.patch('/:id/desactivar', async (req, res) => {
  const { rows } = await query(
    `UPDATE destinatarios SET activo=FALSE WHERE id=$1 RETURNING id, nombre, activo`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Destinatario no encontrado' });
  res.json(rows[0]);
});

module.exports = router;
