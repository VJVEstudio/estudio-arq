const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth.verificar);

router.get('/', async (req, res) => {
  const { estado, cliente_id } = req.query;
  const { id: usuario_id, rol } = req.usuario;
  const params = [];
  const condiciones = ['TRUE'];
  if (estado) { params.push(estado); condiciones.push(`p.estado = $${params.length}`); }
  if (cliente_id) { params.push(cliente_id); condiciones.push(`p.cliente_id = $${params.length}`); }
  if (rol === 'dibujante') {
    params.push(usuario_id);
    condiciones.push(`EXISTS (
      SELECT 1 FROM proyecto_dibujantes pd
      JOIN dibujantes d ON d.id = pd.dibujante_id
      WHERE pd.proyecto_id = p.id AND d.usuario_id = $${params.length} AND pd.activo = TRUE
    )`);
  }
  const { rows } = await query(
    `SELECT p.*,
            c.nombre_razon_social AS cliente_nombre,
            COUNT(DISTINCT pd.dibujante_id) AS dibujantes_asignados,
            COALESCE(SUM(hd.horas), 0) AS horas_totales
     FROM proyectos p
     JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN proyecto_dibujantes pd ON pd.proyecto_id = p.id AND pd.activo = TRUE
     LEFT JOIN horas_dibujantes hd ON hd.proyecto_id = p.id
     WHERE ${condiciones.join(' AND ')}
     GROUP BY p.id, c.nombre_razon_social
     ORDER BY p.created_at DESC`,
    params
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { id: usuario_id, rol } = req.usuario;
  const { rows } = await query(
    `SELECT p.*,
            c.nombre_razon_social AS cliente_nombre,
            c.cuit AS cliente_cuit,
            c.email AS cliente_email,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', d.id,
                  'nombre', d.nombre,
                  'fecha_asignacion', pd.fecha_asignacion
                )
              ) FILTER (WHERE d.id IS NOT NULL AND pd.activo = TRUE),
              '[]'
            ) AS dibujantes
     FROM proyectos p
     JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN proyecto_dibujantes pd ON pd.proyecto_id = p.id
     LEFT JOIN dibujantes d ON d.id = pd.dibujante_id
     WHERE p.id = $1
     GROUP BY p.id, c.nombre_razon_social, c.cuit, c.email`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Proyecto no encontrado' });
  if (rol === 'dibujante') {
    const { rows: asig } = await query(
      `SELECT 1 FROM proyecto_dibujantes pd
       JOIN dibujantes d ON d.id = pd.dibujante_id
       WHERE pd.proyecto_id = $1 AND d.usuario_id = $2 AND pd.activo = TRUE`,
      [req.params.id, usuario_id]
    );
    if (!asig.length) return res.status(403).json({ error: 'Sin acceso a este proyecto' });
  }
  res.json(rows[0]);
});

router.post('/', auth.soloAdmin, async (req, res) => {
  const { cliente_id, nombre, descripcion, fecha_inicio, fecha_cierre_estimada, notas_internas } = req.body;
  if (!cliente_id || !nombre?.trim()) {
    return res.status(400).json({ error: 'cliente_id y nombre son obligatorios' });
  }
  const { rows } = await query(
    `INSERT INTO proyectos (cliente_id, nombre, descripcion, fecha_inicio, fecha_cierre_estimada, notas_internas)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [cliente_id, nombre.trim(), descripcion || null,
     fecha_inicio || new Date().toISOString().split('T')[0],
     fecha_cierre_estimada || null, notas_internas || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', auth.soloAdmin, async (req, res) => {
  const { cliente_id, nombre, descripcion, estado, fecha_inicio, fecha_cierre_estimada, notas_internas } = req.body;
  if (!nombre?.trim()) return res.status(400).json({
