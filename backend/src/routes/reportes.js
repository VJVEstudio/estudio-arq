const express = require('express');
const { query } = require('../db');
const auth = require('../middleware/auth');
const { obtenerCotizacionOficial } = require('../utils/cotizacion');

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
            i.es_del_estudio, i.cotizacion_dolar, s.nombre AS socio_nombre,
            COALESCE(json_agg(json_build_object('socio', sc.nombre, 'monto', isc.monto_asignado))
              FILTER (WHERE isc.id IS NOT NULL), '[]') AS distribucion
     FROM ingresos i
     LEFT JOIN socios s ON s.id = i.socio_id
     LEFT JOIN ingreso_socios isc ON isc.ingreso_id = i.id
     LEFT JOIN socios sc ON sc.id = isc.socio_id
     WHERE i.proyecto_id = $1 GROUP BY i.id, s.nombre ORDER BY i.fecha ASC`, [id]
  );

  // Egresos directos: excluye categoría 'dibujantes' para evitar doble conteo con horas
  const { rows: egresos } = await query(
    `SELECT e.fecha, e.monto, e.moneda, e.categoria, e.comprobante, e.descripcion,
            e.pagado_por_estudio, e.cotizacion_dolar, d.nombre AS destinatario_nombre, s.nombre AS socio_nombre
     FROM egresos e
     JOIN destinatarios d ON d.id = e.destinatario_id
     LEFT JOIN socios s ON s.id = e.socio_id
     WHERE e.proyecto_id = $1 AND e.categoria != 'dibujantes' ORDER BY e.fecha ASC`, [id]
  );

  // Horas con tarifa actual del dibujante (no histórica)
  const { rows: horas } = await query(
    `SELECT h.fecha, h.horas, h.tarifa_aplicada, h.costo_total, h.descripcion_tarea,
            d.nombre AS dibujante_nombre, d.tarifa_hora_base AS tarifa_actual,
            (h.horas * d.tarifa_hora_base) AS costo_actual
     FROM horas_dibujantes h JOIN dibujantes d ON d.id = h.dibujante_id
     WHERE h.proyecto_id = $1 ORDER BY h.fecha ASC`, [id]
  );

  const totales = { ARS: { ingresos: 0, egresos: 0 }, USD: { ingresos: 0, egresos: 0 } };
  ingresos.forEach(i => { totales[i.moneda].ingresos += Number(i.monto); });
  egresos.forEach(e => { totales[e.moneda].egresos += Number(e.monto); });

  // Costo de horas usando tarifa actual
  const costoHoras = horas.reduce((s, h) => s + Number(h.costo_actual), 0);
  const horasTotales = horas.reduce((s, h) => s + Number(h.horas), 0);

  const porDibujante = {};
  horas.forEach(h => {
    if (!porDibujante[h.dibujante_nombre]) porDibujante[h.dibujante_nombre] = { horas: 0, costo: 0 };
    porDibujante[h.dibujante_nombre].horas += Number(h.horas);
    porDibujante[h.dibujante_nombre].costo += Number(h.costo_actual);
  });

  const timeline = [
    ...ingresos.map(i => ({ ...i, fecha: i.fecha, tipo: 'ingreso' })),
    ...egresos.map(e => ({ ...e, fecha: e.fecha, tipo: 'egreso' })),
    ...horas.map(h => ({ ...h, fecha: h.fecha, tipo: 'horas' })),
  ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  const cotizacionActual = await obtenerCotizacionOficial();
  let resultadoTotalConvertido = totales.ARS.ingresos - totales.ARS.egresos - costoHoras;
  ingresos.filter(i => i.moneda === 'USD').forEach(i => {
    resultadoTotalConvertido += Number(i.monto) * Number(i.cotizacion_dolar || cotizacionActual);
  });
  egresos.filter(e => e.moneda === 'USD').forEach(e => {
    resultadoTotalConvertido -= Number(e.monto) * Number(e.cotizacion_dolar || cotizacionActual);
  });

  res.json({
    proyecto, ingresos, egresos, horas,
    totales: {
      ARS: { ingresos: totales.ARS.ingresos, egresos: totales.ARS.egresos, resultado: totales.ARS.ingresos - totales.ARS.egresos },
      USD: { ingresos: totales.USD.ingresos, egresos: totales.USD.egresos, resultado: totales.USD.ingresos - totales.USD.egresos },
    },
    resultado_total_convertido: resultadoTotalConvertido,
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
     FROM egresos e JOIN destinatarios d ON d.id=e.destinatario_id
     WHERE e.proyecto_id=$1 AND e.categoria != 'dibujantes'`, [id]
  );
  const { rows: horas } = await query(
    `SELECT h.fecha, 'Horas' AS tipo, d.nombre AS contraparte,
            'ARS' AS moneda, (h.horas * d.tarifa_hora_base) AS monto,
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
  const cotizacionActual = await obtenerCotizacionOficial();
  const whereI = [];
  const whereE = [];
  const whereH = [];
  if (desde) {
    whereI.push(`fecha >= '${desde}'`);
    whereE.push(`fecha >= '${desde}'`);
    whereH.push(`fecha >= '${desde}'`);
  }
  if (hasta) {
    whereI.push(`fecha <= '${hasta}'`);
    whereE.push(`fecha <= '${hasta}'`);
    whereH.push(`fecha <= '${hasta}'`);
  }
  const condI = whereI.length ? 'AND ' + whereI.join(' AND ') : '';
  const condE = whereE.length ? 'AND ' + whereE.join(' AND ') : '';
  const condH = whereH.length ? 'AND ' + whereH.join(' AND ') : '';

  const { rows: ingresosResumen } = await query(
    `SELECT moneda, tipo, COUNT(*) AS cantidad, SUM(monto) AS total
     FROM ingresos WHERE TRUE ${condI}
     GROUP BY moneda, tipo ORDER BY moneda, tipo`
  );

  const { rows: egresosResumen } = await query(
    `SELECT moneda, categoria, COUNT(*) AS cantidad, SUM(monto) AS total
     FROM egresos WHERE TRUE AND categoria != 'dibujantes' ${condE}
     GROUP BY moneda, categoria ORDER BY moneda, total DESC`
  );

  const { rows: porProyecto } = await query(
    `SELECT p.id, p.nombre AS proyecto, c.nombre_razon_social AS cliente, p.estado,
            COALESCE((SELECT SUM(i2.monto) FROM ingresos i2 WHERE i2.proyecto_id = p.id AND i2.moneda = 'ARS' ${condI}), 0) AS ingresos_ars,
            COALESCE((SELECT SUM(i2.monto) FROM ingresos i2 WHERE i2.proyecto_id = p.id AND i2.moneda = 'USD' ${condI}), 0) AS ingresos_usd,
            COALESCE((SELECT SUM(e2.monto) FROM egresos e2 WHERE e2.proyecto_id = p.id AND e2.moneda = 'ARS' AND e2.categoria != 'dibujantes' ${condE}), 0) AS egresos_ars,
            COALESCE((SELECT SUM(e2.monto) FROM egresos e2 WHERE e2.proyecto_id = p.id AND e2.moneda = 'USD' AND e2.categoria != 'dibujantes' ${condE}), 0) AS egresos_usd,
            COALESCE((SELECT SUM(h2.horas * d2.tarifa_hora_base) FROM horas_dibujantes h2 JOIN dibujantes d2 ON d2.id = h2.dibujante_id WHERE h2.proyecto_id = p.id ${condH}), 0) AS costo_horas,
            COALESCE((SELECT SUM(h2.horas) FROM horas_dibujantes h2 WHERE h2.proyecto_id = p.id ${condH}), 0) AS horas_totales,
            COALESCE((
              SELECT SUM(i3.monto * COALESCE(i3.cotizacion_dolar, ${cotizacionActual}))
              FROM ingresos i3 WHERE i3.proyecto_id = p.id AND i3.moneda = 'USD' ${condI}
            ), 0) AS ingresos_usd_convertido,
            COALESCE((
              SELECT SUM(e3.monto * COALESCE(e3.cotizacion_dolar, ${cotizacionActual}))
              FROM egresos e3 WHERE e3.proyecto_id = p.id AND e3.moneda = 'USD' AND e3.categoria != 'dibujantes' ${condE}
            ), 0) AS egresos_usd_convertido
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
     WHERE TRUE ${condI}
     GROUP BY c.id, c.nombre_razon_social ORDER BY total_ars DESC NULLS LAST`
  );

  const { rows: porDibujante } = await query(
    `SELECT d.nombre AS dibujante,
            SUM(h.horas) AS horas_totales,
            SUM(h.horas * d.tarifa_hora_base) AS costo_total,
            SUM(CASE WHEN h.liquidada THEN h.horas * d.tarifa_hora_base ELSE 0 END) AS costo_liquidado,
            SUM(CASE WHEN NOT h.liquidada THEN h.horas * d.tarifa_hora_base ELSE 0 END) AS costo_pendiente,
            COUNT(DISTINCT h.proyecto_id) AS proyectos
     FROM horas_dibujantes h JOIN dibujantes d ON d.id = h.dibujante_id
     WHERE TRUE ${condH}
     GROUP BY d.id, d.nombre ORDER BY horas_totales DESC`
  );

  const { rows: balanceSocios } = await query(`SELECT * FROM v_balance_socios`);

  res.json({
    periodo: { desde: desde || null, hasta: hasta || null },
    cotizacion_oficial: cotizacionActual,
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
  const condI = [];
  const condE = [];
  if (desde) { condI.push(`i.fecha >= '${desde}'`); condE.push(`e.fecha >= '${desde}'`); }
  if (hasta) { condI.push(`i.fecha <= '${hasta}'`); condE.push(`e.fecha <= '${hasta}'`); }
  const whereI = condI.length ? 'AND ' + condI.join(' AND ') : '';
  const whereE = condE.length ? 'AND ' + condE.join(' AND ') : '';
  const { rows: ingresos } = await query(
    `SELECT i.fecha, 'Ingreso' AS tipo, c.nombre_razon_social AS cliente,
            p.nombre AS proyecto, i.moneda, i.monto, i.tipo AS subtipo,
            i.comprobante, i.descripcion
     FROM ingresos i JOIN clientes c ON c.id=i.cliente_id
     LEFT JOIN proyectos p ON p.id=i.proyecto_id
     WHERE TRUE ${whereI}`
  );
  const { rows: egresos } = await query(
    `SELECT e.fecha, 'Egreso' AS tipo, d.nombre AS cliente,
            p.nombre AS proyecto, e.moneda, e.monto, e.categoria AS subtipo,
            e.comprobante, e.descripcion
     FROM egresos e JOIN destinatarios d ON d.id=e.destinatario_id
     LEFT JOIN proyectos p ON p.id=e.proyecto_id
     WHERE TRUE AND e.categoria != 'dibujantes' ${whereE}`
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
// GET /api/reportes/proyecto/:id/pdf
router.get('/proyecto/:id/pdf', async (req, res) => {
  const PDFDocument = require('pdfkit');
  const { id } = req.params;

  const { rows: [proyecto] } = await query(
    `SELECT p.*, c.nombre_razon_social AS cliente_nombre
     FROM proyectos p JOIN clientes c ON c.id = p.cliente_id WHERE p.id = $1`, [id]
  );
  if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });

  const { rows: ingresos } = await query(
    `SELECT i.fecha, i.monto, i.moneda, i.tipo, i.descripcion, i.comprobante,
            i.cotizacion_dolar, s.nombre AS socio_nombre, i.es_del_estudio
     FROM ingresos i LEFT JOIN socios s ON s.id = i.socio_id
     WHERE i.proyecto_id = $1 ORDER BY i.fecha ASC`, [id]
  );

  const { rows: egresos } = await query(
    `SELECT e.fecha, e.monto, e.moneda, e.categoria, e.descripcion, e.comprobante,
            e.cotizacion_dolar, d.nombre AS destinatario_nombre
     FROM egresos e JOIN destinatarios d ON d.id = e.destinatario_id
     WHERE e.proyecto_id = $1 AND e.categoria != 'dibujantes' ORDER BY e.fecha ASC`, [id]
  );

  const { rows: horas } = await query(
    `SELECT h.fecha, h.horas, h.descripcion_tarea, d.nombre AS dibujante_nombre,
            d.tarifa_hora_base, (h.horas * d.tarifa_hora_base) AS costo_actual
     FROM horas_dibujantes h JOIN dibujantes d ON d.id = h.dibujante_id
     WHERE h.proyecto_id = $1 ORDER BY h.fecha ASC`, [id]
  );

  const cotizacionActual = await obtenerCotizacionOficial();

  const totalIngresosARS = ingresos.filter(i => i.moneda === 'ARS').reduce((s, i) => s + Number(i.monto), 0);
  const totalEgresosARS = egresos.filter(e => e.moneda === 'ARS').reduce((s, e) => s + Number(e.monto), 0);
  const costoHoras = horas.reduce((s, h) => s + Number(h.costo_actual), 0);
  const resultadoARS = totalIngresosARS - totalEgresosARS - costoHoras;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="reporte_${proyecto.nombre.replace(/\s+/g,'_')}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  const fmtM = (n, moneda = 'ARS') => moneda === 'USD'
    ? `U$S ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtF = (f) => {
    if (!f) return '—';
    const d = new Date(String(f).slice(0, 10) + 'T00:00:00');
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR');
  };

  const margen = 40;
  const ancho = doc.page.width - 80;

  // Encabezado
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a2744')
    .text(proyecto.nombre, margen, margen);
  doc.fontSize(11).font('Helvetica').fillColor('#666')
    .text(`${proyecto.cliente_nombre} · ${proyecto.estado}`, margen, margen + 22);
  doc.fontSize(9).fillColor('#999')
    .text(`Generado el ${new Date().toLocaleDateString('es-AR')}`, margen, margen + 38);
  doc.moveDown(3);

  // Resumen financiero
  const yRes = doc.y;
  doc.rect(margen, yRes, ancho, 80).fillAndStroke('#f8f9fa', '#e0e0e0');
  const colW = ancho / 3;
  [
    { label: 'Ingresos ARS', valor: fmtM(totalIngresosARS), color: '#1b5e20' },
    { label: 'Egresos directos', valor: fmtM(totalEgresosARS), color: '#b71c1c' },
    { label: 'Costo dibujantes', valor: fmtM(costoHoras), color: '#e65100' },
  ].forEach((item, i) => {
    const x = margen + i * colW + 16;
    doc.fillColor('#999').fontSize(9).font('Helvetica').text(item.label.toUpperCase(), x, yRes + 12, { width: colW - 32 });
    doc.fillColor(item.color).fontSize(13).font('Helvetica-Bold').text(item.valor, x, yRes + 26, { width: colW - 32 });
  });
  // Resultado neto
  doc.fillColor(resultadoARS >= 0 ? '#1b5e20' : '#b71c1c').fontSize(11).font('Helvetica-Bold')
    .text(`Resultado neto: ${resultadoARS >= 0 ? '+' : ''}${fmtM(resultadoARS)}`, margen + 16, yRes + 54, { width: ancho - 32 });
  doc.y = yRes + 90;
  doc.moveDown(0.5);

  // Sección helper
  const dibujarSeccion = (titulo, filas, columnas) => {
    if (!filas.length) return;
    if (doc.y > 680) doc.addPage();
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a2744').text(titulo, margen, doc.y);
    doc.moveDown(0.4);
    const y = doc.y;
    const altoEnc = 16;
    doc.rect(margen, y, ancho, altoEnc).fillAndStroke('#1a2744', '#1a2744');
    let xCol = margen;
    columnas.forEach(c => {
      doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
        .text(c.label, xCol + 4, y + 4, { width: c.w - 8, align: c.align || 'left' });
      xCol += c.w;
    });
    let yFila = y + altoEnc;
    filas.forEach((f, idx) => {
      const altoFila = 16;
      if (yFila + altoFila > 760) { doc.addPage(); yFila = 40; }
      doc.rect(margen, yFila, ancho, altoFila).fillAndStroke(idx % 2 === 0 ? '#f8f9fa' : '#fff', '#e0e0e0');
      xCol = margen;
      columnas.forEach(c => {
        const val = typeof c.valor === 'function' ? c.valor(f) : f[c.key] || '—';
        doc.fillColor('#333').fontSize(8).font('Helvetica')
          .text(String(val), xCol + 4, yFila + 4, { width: c.w - 8, align: c.align || 'left', ellipsis: true });
        xCol += c.w;
      });
      yFila += altoFila;
    });
    doc.y = yFila + 12;
  };

  dibujarSeccion('Ingresos', ingresos, [
    { label: 'Fecha', w: 70, valor: f => fmtF(f.fecha) },
    { label: 'Origen', w: 100, valor: f => f.es_del_estudio ? 'Estudio' : (f.socio_nombre || '—') },
    { label: 'Tipo', w: 80, key: 'tipo' },
    { label: 'Comprobante', w: 90, key: 'comprobante' },
    { label: 'Moneda', w: 45, key: 'moneda' },
    { label: 'Monto', w: ancho - 385, align: 'right', valor: f => fmtM(f.monto, f.moneda) },
  ]);

  dibujarSeccion('Egresos directos', egresos, [
    { label: 'Fecha', w: 70, valor: f => fmtF(f.fecha) },
    { label: 'Destinatario', w: 120, key: 'destinatario_nombre' },
    { label: 'Categoría', w: 80, key: 'categoria' },
    { label: 'Comprobante', w: 90, key: 'comprobante' },
    { label: 'Moneda', w: 45, key: 'moneda' },
    { label: 'Monto', w: ancho - 405, align: 'right', valor: f => fmtM(f.monto, f.moneda) },
  ]);

  dibujarSeccion('Horas trabajadas', horas, [
    { label: 'Fecha', w: 70, valor: f => fmtF(f.fecha) },
    { label: 'Dibujante', w: 120, key: 'dibujante_nombre' },
    { label: 'Horas', w: 50, align: 'right', valor: f => Number(f.horas).toFixed(1) },
    { label: 'Tarifa', w: 100, align: 'right', valor: f => fmtM(f.tarifa_hora_base) },
    { label: 'Costo', w: ancho - 340, align: 'right', valor: f => fmtM(f.costo_actual) },
  ]);

  doc.end();
});
module.exports = router;
