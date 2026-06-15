const express = require('express');
const bcrypt  = require('bcryptjs');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth.verificar);

router.get('/', async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  if (esAdmin) {
    const { rows } = await query(
      `SELECT d.*, u.email, u.activo AS usuario_activo,
              COALESCE(SUM(h.horas), 0)       AS horas_totales,
              COALESCE(SUM(h.costo_total), 0) AS costo_total_historico,
              COUNT(DISTINCT h.proyecto_id)   AS proyectos_trabajados
       FROM dibujantes d
       JOIN usuarios u ON u.id = d.usuario_id
       LEFT JOIN horas_dibujantes h ON h.dibujante_id = d.id
       GROUP BY d.id, u.email, u.activo
       ORDER BY d.nombre ASC`
    );
    return res.json(rows);
  }
  const { rows } = await query(
    `SELECT d.id, d.nombre, d.fecha_inicio,
            COUNT(DISTINCT h.proyecto_id) AS proyectos_trabajados,
            COALESCE(SUM(h.horas), 0)    AS mis_horas_totales
     FROM dibujantes d
     LEFT JOIN horas_dibujantes h ON h.dibujante_id = d.id
     WHERE d.usuario_id = $1
     GROUP BY d.id`,
    [req.usuario.id]
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  const { rows } = await query(
    `SELECT d.*, u.email, u.activo AS usuario_activo,
            COALESCE(
              json_agg(json_build_object(
                'fecha_ajuste',    th.fecha_ajuste,
                'tarifa_anterior', th.tarifa_anterior,
                'tarifa_nueva',    th.tarifa_nueva,
                'indice_cac',      th.indice_cac,
                'motivo',          th.motivo
              ) ORDER BY th.fecha_ajuste DESC)
              FILTER (WHERE th.id IS NOT NULL), '[]'
            ) AS historial_tarifas
     FROM dibujantes d
     JOIN usuarios u ON u.id = d.usuario_id
     LEFT JOIN tarifa_historial th ON th.dibujante_id = d.id
     WHERE d.id = $1
     GROUP BY d.id, u.email, u.activo`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Dibujante no encontrado' });
  if (!esAdmin && rows[0].usuario_id !== req.usuario.id) {
    return res.status(403).json({ error: 'Sin acceso' });
  }
  if (!esAdmin) {
    delete rows[0].tarifa_hora_base;
    delete rows[0].historial_tarifas;
  }
  res.json(rows[0]);
});

router.post('/', auth.soloAdmin, async (req, res) => {
  const { nombre, email, password, tarifa_hora_base, fecha_inicio } = req.body;
  if (!nombre?.trim())     return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (!email?.trim())      return res.status(400).json({ error: 'El email es obligatorio' });
  if (!password?.trim())   return res.status(400).json({ error: 'La contraseña es obligatoria' });
  if (!tarifa_hora_base || tarifa_hora_base <= 0) return res.status(400).json({ error: 'La tarifa debe ser mayor a 0' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: existe } = await client.query(
      `SELECT id FROM usuarios WHERE email = $1`, [email.toLowerCase().trim()]
    );
    if (existe.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }
    const hash = await bcrypt.hash(password, 12);
    const { rows: [usuario] } = await client.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, 'dibujante') RETURNING id`,
      [nombre.trim(), email.toLowerCase().trim(), hash]
    );
    const { rows: [dibujante] } = await client.query(
      `INSERT INTO dibujantes (usuario_id, nombre, tarifa_hora_base, fecha_inicio)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [usuario.id, nombre.trim(), tarifa_hora_base,
       fecha_inicio || new Date().toISOString().split('T')[0]]
    );
    await client.query(
      `INSERT INTO tarifa_historial (dibujante_id, tarifa_anterior, tarifa_nueva, motivo, admin_id)
       VALUES ($1, 0, $2, 'Tarifa inicial', $3)`,
      [dibujante.id, tarifa_hora_base, req.usuario.id]
    );
    await client.query(
      `INSERT INTO destinatarios (nombre, tipo, notas)
       VALUES ($1, 'profesional', $2)
       ON CONFLICT DO NOTHING`,
      [nombre.trim(), `Dibujante — ${nombre.trim()}`]
    );
    await client.query('COMMIT');
    res.status(201).json({ ...dibujante, email });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creando dibujante:', err);
    res.status(500).json({ error: 'Error al crear el dibujante' });
  } finally {
    client.release();
  }
});

router.put('/:id', auth.soloAdmin, async (req, res) => {
  const { nombre, fecha_inicio, activo } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE dibujantes SET nombre=$1, fecha_inicio=$2, updated_at=NOW()
       WHERE id=$3 RETURNING *`,
      [nombre.trim(), fecha_inicio, req.params.id]
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Dibujante no encontrado' }); }
    if (activo !== undefined) {
      await client.query(`UPDATE usuarios SET activo=$1 WHERE id=$2`, [activo, rows[0].usuario_id]);
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al actualizar el dibujante' });
  } finally {
    client.release();
  }
});

router.post('/:id/ajuste-cac', auth.soloAdmin, async (req, res) => {
  const { indice_cac, motivo } = req.body;
  if (!indice_cac || indice_cac <= 0) {
    return res.status(400).json({ error: 'El índice CAC debe ser mayor a 0' });
  }
  try {
    await query(`SELECT ajustar_tarifa_cac($1, $2, $3, $4)`,
      [req.params.id, indice_cac, req.usuario.id, motivo || null]);
    const { rows } = await query(
      `SELECT d.*, th.tarifa_anterior, th.tarifa_nueva, th.indice_cac, th.fecha_ajuste
       FROM dibujantes d
       JOIN tarifa_historial th ON th.dibujante_id = d.id
       WHERE d.id = $1 ORDER BY th.fecha_ajuste DESC LIMIT 1`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Error aplicando ajuste CAC:', err);
    res.status(500).json({ error: 'Error al aplicar el ajuste' });
  }
});

router.post('/ajuste-cac-masivo', auth.soloAdmin, async (req, res) => {
  const { indice_cac, motivo } = req.body;
  if (!indice_cac || indice_cac <= 0) {
    return res.status(400).json({ error: 'El índice CAC debe ser mayor a 0' });
  }
  const { rows: todos } = await query(
    `SELECT d.id FROM dibujantes d JOIN usuarios u ON u.id=d.usuario_id WHERE u.activo=TRUE`
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const d of todos) {
      await client.query(`SELECT ajustar_tarifa_cac($1, $2, $3, $4)`,
        [d.id, indice_cac, req.usuario.id, motivo || 'Ajuste masivo CAC']);
    }
    await client.query('COMMIT');
    res.json({ ajustados: todos.length, indice_cac });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en ajuste masivo:', err);
    res.status(500).json({ error: 'Error en el ajuste masivo' });
  } finally {
    client.release();
  }
});

module.exports = router;
