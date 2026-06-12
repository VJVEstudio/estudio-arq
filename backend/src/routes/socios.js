const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.nombre, s.porcentaje_participacion, u.email
     FROM socios s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.activo = TRUE
     ORDER BY s.nombre ASC`
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT s.*, u.email, u.nombre AS usuario_nombre
     FROM socios s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Socio no encontrado' });
  res.json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { porcentaje_participacion } = req.body;
  if (!porcentaje_participacion || porcentaje_participacion <= 0 || porcentaje_participacion > 100) {
    return res.status(400).json({ error: 'El porcentaje debe estar entre 0.01 y 100' });
  }
  const { rows } = await query(
    `UPDATE socios SET porcentaje_participacion=$1 WHERE id=$2 RETURNING *`,
    [porcentaje_participacion, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Socio no encontrado' });
  res.json(rows[0]);
});

module.exports = router;
