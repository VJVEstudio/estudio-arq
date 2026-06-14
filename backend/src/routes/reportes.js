const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

router.get('/proyecto/:id', async (req, res) => {
  const { id } = req.params;
  const { rows: [proyecto] } = await query(
    `SELECT p.*, c.nombre_razon_social AS cliente_nombre, c.cuit, c.email AS cliente_email
     FROM proyectos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = $1`, [id]
  );
  if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
  const { rows: ingresos } = await query(
    `SELECT i.fecha, i.monto, i.moneda, i.tipo, i.comprobante, i.descripcion,
            i.es_del_estudio, s.nombre AS socio_nombre,
            COALESCE(json_agg(json_build_object('socio', sc.nombre, 'monto', isc.monto_asignado))
              FILTER (WHERE isc.id IS NOT NULL), '[]') AS distribucion
     FROM ingresos i
     LEFT JOIN socios s ON s.id = i.socio_id
     LEFT JOIN ingreso_socios isc ON isc.ingreso_id = i.id
     LEFT JOIN socios sc ON sc.id = isc.socio_id
     WHERE i.proyecto_id = $1 GROUP BY i.id, s.nombre ORDER BY i.fecha ASC`, [id]
  );
  const { rows: egresos } = await query(
    `SELECT e.fecha, e.monto, e.moneda, e.categoria, e.comprobante, e.descripcion,
            e.pagado_por_estudio, d.nombre AS destinatario_nombre, s.nombre AS socio_nombre
     FROM egresos e
     JOIN destinatarios d ON d.id = e.destinatario_id
     LEFT JOIN socios s ON s.id = e.socio_id
     WHERE e.proyecto_id = $1 ORDER BY e.fecha ASC`, [id]
  );
  const { rows: horas } = await query(
    `SELECT h.fecha, h.horas, h.tarifa_aplicada, h.costo_total, h.descripcion_tarea,
            d.nombre AS dibujante_nombre
     FROM horas_dibujantes h JOIN dibujantes d ON d.id = h.dibujante_id
     WHERE h.proyecto_id = $1 ORDER BY h.fecha ASC`, [id]
  );
  const totales = { ARS: { ingresos: 0, egresos: 0 }, USD: { ingresos: 0, egresos: 0 } };
  ingresos.forEach(i => { totales[i.moneda].ingresos += Number(i.monto); });
  egresos.forEach(e => { totales[e.moneda].egresos  += Number(e.monto); });
  const costoHoras   = horas.reduce((s, h) => s + Number(h.costo_total), 0);
  const horasTotales = horas.reduce((s, h) => s + Number(h.horas), 0);
  const porDibujante = {};
  horas.forEach(h => {
    if (!porDibujante[h.dibujante_nombre]) porDibujante[h.dibujante_nombre] = { horas: 0, costo: 0 };
    porDibujante[h.dibujante_nombre].horas += Number(h.horas);
    porDibujante[h.dibujante_nombre].costo += Number(h.costo_total);
  });
  const timeline = [
    ...ingresos.map(i => ({ fecha: i.fecha, tipo: 'ingreso', ...i })),
    ...egresos.map(e => ({ fecha: e.fecha, tipo: 'egreso', ...e })),
    ...horas.map(h => ({ fecha: h.fecha, tipo: 'horas', ...h })),
  ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  res.json({
    proyecto, ingresos, egresos, horas,
    totales: {
      ARS: { ingresos: totales.ARS.ingresos, egresos: totales.ARS.egresos, resultado: totales.ARS.ingresos - totales.ARS.egresos },
      USD: { ingresos: totales.USD.ingresos, egresos: totales.USD.egresos, resultado: totales.USD.ingresos - totales.USD.egresos },
    },
    horas_resumen: { total_horas: horasTotales, costo_total: costoHoras, por_dibujante: porDibujante },
    timeline,
  });
});

router.get('/proyecto/:id/csv', async (req, res) => {
  const { id } = req.params;
  const { rows: [proyecto] } = await query(
    `SELECT p.nombre, c.nombre_razon_social AS cliente FROM proyectos p JOIN clientes c ON c.id=p.cliente_id WHERE p.id=$1`, [id]
  );
  if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
  const { rows: ingresos } = await query(
    `SELECT i.fecha, 'Ingreso' AS tipo, d.nombre_razon_social AS contraparte,
            i.moneda, i.monto, i.tipo AS subtipo, i.comprobante, i.descripcion
     FROM ingresos i JOIN clientes d ON d.id=i.cliente_id WHERE i.proyecto_id=$1`, [id]
  );
  const { rows: egresos } = await query(
    `SELECT e.fecha, 'Egreso' AS tipo, d.nombre AS contraparte,
            e.moneda, e.monto, e.categoria AS subtipo, e.comprobante, e.descripcion
     FROM egresos e JOIN destinatarios d ON d.id=e.destinatario_id WHERE e.proyecto_id=$1`, [id]
  );
  const { rows: horas } = await query(
    `SELECT h.fecha, 'Horas' AS tipo, d.nombre AS contraparte,
            'ARS' AS moneda, h.costo_total AS monto,
            CONCAT(h.horas, ' hs') AS subtipo, '' AS comprobante, h.descripcion_tarea AS descripcion
     FROM horas_dibujantes h JOIN dibujantes d ON d.id=h.dibujante_id WHERE h.proyecto_id=$1`, [id]
  );
  const filas = [...ingresos, ...egresos, ...horas].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const enc = ['Fecha', 'Tipo', 'Contraparte', 'Moneda', 'Monto', 'Subtipo', 'Comprobante', 'Descripción'];
  const csv = [
    enc.join(','),
    ...filas.map(f =>
      [f.fecha, f.tipo, `"${f.contraparte||''}"`, f.moneda,
       Number(f.monto).toFixed(2), `"${f.subtipo||''}"`,
       `"${f.comprobante||''}"`, `"${(f.descripcion||'').replace(/"/g,'""')}"`].join(',')
    ),
  ];
  const nombreArchivo = `reporte_${proyecto.nombre.replace(/\s+/g,'_')}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send('\uFEFF' + csv.join('\n'));
});

router.get('/general', async (req, res) => {
  const { desde, hasta } = req.query;

  const condFechaI = desde || hasta ? `AND ${desde ? `i.fecha >= '${desde}'` : 'TRUE'} ${hasta ? `AND i.fecha <= '${hasta}'` : ''}` : '';
  const condFechaE = desde || hasta ? `AND ${desde ? `e.fecha >= '${desde}'` : 'TRUE'} ${hasta ? `AND e.fecha <= '${hasta}'` : ''}` : '';
  const condFechaH = desde || hasta ? `AND ${desde ? `h.fecha >= '${desde}'` : 'TRUE'} ${hasta ? `AND h.fecha <= '${hasta}'` : ''}` : '';

  const { rows: ingresosResumen } = await query(
    `SELECT moneda, tipo, COUNT(*) AS cantidad, SUM(monto) AS total
     FROM ingresos WHERE TRUE ${condFechaI.replace(/^AND /, 'AND ')}
     GROUP BY moneda, tipo ORDER BY moneda, tipo`
  );

  const { rows: egresosResumen } = await query(
    `SELECT moneda, categoria, COUNT(*) AS cantidad, SUM(monto) AS total
     FROM egresos WHERE TRUE ${condFechaE.replace(/^AND /, 'AND ')}
     GROUP BY moneda, categoria ORDER BY moneda, total DESC`
  );

  const { rows: porProyecto } = await query(
    `SELECT p.id, p.nombre AS proyecto, c.nombre_razon_social AS cliente, p.estado,
            COALESCE((SELECT SUM(i2.monto) FROM ingresos i2 WHERE i2.proyecto_id = p.id AND i2.moneda = 'ARS' ${desde ? `AND i2.fecha >= '${desde}'` : ''} ${hasta ? `AND i2.fecha <= '${hasta}'` : ''}), 0) AS ingresos_ars,
            COALESCE((SELECT SUM(i2.monto) FROM ingresos i2 WHERE i2.proyecto_id = p.id AND i2.moneda = 'USD' ${desde ? `AND i2.fecha >= '${desde}'` : ''} ${hasta ? `AND i2.fecha <= '${hasta}'` : ''}), 0) AS ingresos_usd,
            COALESCE((SELECT SUM(e2.monto) FROM egresos e2 WHERE e2.proyecto_id = p.id AND e2.moneda = 'ARS' ${desde ? `AND e2.fecha >= '${desde}'` : ''} ${hasta ? `AND e2.fecha <= '${hasta}'` : ''}), 0) AS egresos_ars,
            COALESCE((SELECT SUM(e2.monto) FROM egresos e2 WHERE e2.proyecto_id = p.id AND e2.moneda = 'USD' ${desde ? `AND e2.fecha >= '${desde}'` : ''} ${hasta ? `AND e2.fecha <= '${hasta}'` : ''}), 0) AS egresos_usd,
            COALESCE((SELECT SUM(h2.costo_total) FROM horas_dibujantes h2 WHERE h2.proyecto_id = p.id ${desde ? `AND h2.fecha >= '${desde}'` : ''} ${hasta ? `AND h2.fecha <= '${hasta}'` : ''}), 0) AS costo_horas,
            COALESCE((SELECT SUM(h2.horas) FROM horas_dibujantes h2 WHERE h2.proyecto_id = p.id ${desde ? `AND h2.fecha >= '${desde}'` : ''} ${hasta ? `AND h2.fecha <= '${hasta}'` : ''}), 0) AS horas_totales
     FROM proyectos p
     JOIN clientes c ON c.id = p.cliente_id
     GROUP BY p.id, p.nombre, c.nombre_razon_social, p.estado
     ORDER BY ingresos_ars DESC`
  );

  const { rows: porCliente } = await query(
    `SELECT c.nombre_razon_social AS cliente,
            SUM(i.monto) FILTER (WHERE i.moneda='ARS') AS total_ars,
            SUM(i.monto) FILTER (WHERE i.moneda='USD') AS total_usd,
            COUNT(DISTINCT i.proyecto_id) AS proyectos
     FROM ingresos i JOIN clientes c ON c.id = i.cliente_id
     WHERE TRUE ${condFechaI.replace(/^AND /, 'AND ')}
     GROUP BY c.id, c.nombre_razon_social ORDER BY total_ars DESC NULLS LAST`
  );

  const { rows: porDibujante } = await query(
    `SELECT d.nombre AS dibujante,
            SUM(h.horas) AS horas_totales, SUM(h.costo_total) AS costo_total,
            COUNT(DISTINCT h.proyecto_id) AS proyectos
     FROM horas_dibujantes h JOIN dibujantes d ON d.id = h.dibujante_id
     WHERE TRUE ${condFechaH.replace(/^AND /, 'AND ')}
     GROUP BY d.id, d.nombre ORDER BY horas_totales DESC`
  );

  const { rows: balanceSocios } = await query(`SELECT * FROM v_balance_socios`);

  res.json({
    periodo: { desde: desde || null, hasta: hasta || null },
    ingresos: ingresosResumen,
    egresos: egresosResumen,
    por_proyecto: porProyecto,
    por_cliente: porCliente,
    por_dibujante: porDibujante,
    balance_socios: balanceSocios,
  });
});

router.get('/general/csv', async (req, res) => {
  const { desde, hasta } = req.query;
  const condI = desde || hasta ? `WHERE ${desde ? `i.fecha >= '${desde}'` : 'TRUE'} ${hasta ? `AND i.fecha <= '${hasta}'` : ''}` : '';
  const condE = desde || hasta ? `WHERE ${desde ? `e.fecha >= '${desde}'` : 'TRUE'} ${hasta ? `AND e.fecha <= '${hasta}'` : ''}` : '';
  const { rows: ingresos } = await query(
    `SELECT i.fecha, 'Ingreso' AS tipo, c.nombre_razon_social AS cliente,
            p.nombre AS proyecto, i.moneda, i.monto, i.tipo AS subtipo,
            i.comprobante, i.descripcion
     FROM ingresos i JOIN clientes c ON c.id=i.cliente_id
     LEFT JOIN proyectos p ON p.id=i.proyecto_id ${condI}`
  );
  const { rows: egresos } = await query(
    `SELECT e.fecha, 'Egreso' AS tipo, d.nombre AS cliente,
            p.nombre AS proyecto, e.moneda, e.monto, e.categoria AS subtipo,
            e.comprobante, e.descripcion
     FROM egresos e JOIN destinatarios d ON d.id=e.destinatario_id
     LEFT JOIN proyectos p ON p.id=e.proyecto_id ${condE}`
  );
  const filas = [...ingresos, ...egresos].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const enc = ['Fecha','Tipo','Cliente/Destinatario','Proyecto','Moneda','Monto','Subtipo','Comprobante','Descripción'];
  const csv = [
    enc.join(','),
    ...filas.map(f =>
      [f.fecha, f.tipo, `"${f.cliente||''}"`, `"${f.proyecto||''}"`,
       f.moneda, Number(f.monto).toFixed(2), `"${f.subtipo||''}"`,
       `"${f.comprobante||''}"`, `"${(f.descripcion||'').replace(/"/g,'""')}"`].join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="reporte_general.csv"`);
  res.send('\uFEFF' + csv.join('\n'));
});

module.exports = router;
