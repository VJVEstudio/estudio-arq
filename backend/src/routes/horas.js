const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth.verificar);

router.get('/', async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  const { proyecto_id, dibujante_id, desde, hasta } = req.query;
  const condiciones = ['TRUE'];
  const params = [];
  if (!esAdmin) {
    params.push(req.usuario.id);
    condiciones.push(`d.usuario_id = $${params.length}`);
  } else if (dibujante_id) {
    params.push(dibujante_id);
    condiciones.push(`h.dibujante_id = $${params.length}`);
  }
  if (proyecto_id) { params.push(proyecto_id); condiciones.push(`h.proyecto_id = $${params.length}`); }
  if (desde)       { params.push(desde);        condiciones.push(`h.fecha >= $${params.length}`); }
  if (hasta)       { params.push(hasta);        condiciones.push(`h.fecha <= $${params.length}`); }
  const camposCosto = esAdmin ? ', h.tarifa_aplicada, h.costo_total' : '';
  const { rows } = await query(
    `SELECT h.id, h.fecha, h.horas, h.descripcion_tarea, h.created_at,
            h.dibujante_id, d.nombre AS dibujante_nombre,
            h.proyecto_id,  p.nombre AS proyecto_nombre
            ${camposCosto}
     FROM horas_dibujantes h
     JOIN dibujantes d ON d.id = h.dibujante_id
     JOIN proyectos  p ON p.id = h.proyecto_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY h.fecha DESC, h.created_at DESC`,
    params
  );
  res.json(rows);
});

router.get('/resumen', auth.soloAdmin, async (req, res) => {
  const { proyecto_id, desde, hasta } = req.query;
  const condiciones = ['TRUE'];
  const params = [];
  if (proyecto_id) { params.push(proyecto_id); condiciones.push(`h.proyecto_id = $${params.length}`); }
  if (desde)       { params.push(desde);        condiciones.push(`h.fecha >= $${params.length}`); }
  if (hasta)       { params.push(hasta);        condiciones.push(`h.fecha <= $${params.length}`); }
  const { rows } = await query(
    `SELECT d.id AS dibujante_id, d.nombre AS dibujante_nombre,
            d.tarifa_hora_base AS tarifa_actual,
            p.id AS proyecto_id, p.nombre AS proyecto_nombre,
            COUNT(h.id) AS registros,
            SUM(h.horas) AS horas_totales,
            SUM(h.costo_total) AS costo_total
     FROM horas_dibujantes h
     JOIN dibujantes d ON d.id = h.dibujante_id
     JOIN proyectos  p ON p.id = h.proyecto_id
     WHERE ${condiciones.join(' AND ')}
     GROUP BY d.id, d.nombre, d.tarifa_hora_base, p.id, p.nombre
     ORDER BY d.nombre, p.nombre`,
    params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  const { proyecto_id, fecha, horas, descripcion_tarea } = req.body;
  let { dibujante_id } = req.body;
  if (!proyecto_id)             return res.status(400).json({ error: 'proyecto_id es obligatorio' });
  if (!horas || horas <= 0)    return res.status(400).json({ error: 'Las horas deben ser mayor a 0' });
  if (!fecha)                   return res.status(400).json({ error: 'La fecha es obligatoria' });
  if (!esAdmin) {
    const { rows } = await query(
      `SELECT id FROM dibujantes WHERE usuario_id = $1`, [req.usuario.id]
    );
    if (!rows[0]) return res.status(403).json({ error: 'No tenés perfil de dibujante asignado' });
    dibujante_id = rows[0].id;
    const { rows: asig } = await query(
      `SELECT 1 FROM proyecto_dibujantes
       WHERE proyecto_id=$1 AND dibujante_id=$2 AND activo=TRUE`,
      [proyecto_id, dibujante_id]
    );
    if (!asig.length) return res.status(403).json({ error: 'No estás asignado a este proyecto' });
  }
  const { rows: tarifaRows } = await query(
    `SELECT tarifa_hora_base FROM dibujantes WHERE id=$1`, [dibujante_id]
  );
  if (!tarifaRows[0]) return res.status(404).json({ error: 'Dibujante no encontrado' });
  const tarifa_aplicada = tarifaRows[0].tarifa_hora_base;
  const { rows } = await query(
    `INSERT INTO horas_dibujantes
       (dibujante_id, proyecto_id, fecha, horas, tarifa_aplicada, descripcion_tarea)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [dibujante_id, proyecto_id, fecha, horas, tarifa_aplicada, descripcion_tarea || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  const { fecha, horas, descripcion_tarea } = req.body;
  if (!horas || horas <= 0) return res.status(400).json({ error: 'Las horas deben ser mayor a 0' });
  if (!esAdmin) {
    const { rows: check } = await query(
      `SELECT h.id FROM horas_dibujantes h
       JOIN dibujantes d ON d.id = h.dibujante_id
       WHERE h.id=$1 AND d.usuario_id=$2`,
      [req.params.id, req.usuario.id]
    );
    if (!check.length) return res.status(403).json({ error: 'No podés editar este registro' });
  }
  const { rows } = await query(
    `UPDATE horas_dibujantes SET fecha=$1, horas=$2, descripcion_tarea=$3
     WHERE id=$4 RETURNING *`,
    [fecha, horas, descripcion_tarea || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Registro no encontrado' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  if (!esAdmin) {
    const { rows } = await query(
      `SELECT h.id FROM horas_dibujantes h
       JOIN dibujantes d ON d.id=h.dibujante_id
       WHERE h.id=$1 AND d.usuario_id=$2`,
      [req.params.id, req.usuario.id]
    );
    if (!rows.length) return res.status(403).json({ error: 'No podés eliminar este registro' });
  }
  await query(`DELETE FROM horas_dibujantes WHERE id=$1`, [req.params.id]);
  res.status(204).send();
});

module.exports = router;
