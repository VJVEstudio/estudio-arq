const express = require('express');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');

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
            p.nombre AS pro
