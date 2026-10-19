const express = require('express');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');

const { tarifaSQL, costoSQL, costoTarifaSQL, monotributoSQL, joinLiqSQL, liquidadaSQL } = require('../utils/costoHoras');
const { repartirLiquidacion, descripcionLiquidacion } = require('../utils/repartoLiquidacion');
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
  const camposCosto = esAdmin
    ? ', h.tarifa_aplicada, h.costo_total, h.liquidada'
    : ', h.tarifa_aplicada, h.costo_total';
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
  const { proyecto_id, dibujante_id, desde, hasta } = req.query;
  const condiciones = ['TRUE'];
  const params = [];
  if (dibujante_id) { params.push(dibujante_id); condiciones.push(`h.dibujante_id = $${params.length}`); }
  if (proyecto_id)  { params.push(proyecto_id);  condiciones.push(`h.proyecto_id = $${params.length}`); }
  if (desde)        { params.push(desde);         condiciones.push(`h.fecha >= $${params.length}`); }
  if (hasta)        { params.push(hasta);         condiciones.push(`h.fecha <= $${params.length}`); }
  const { rows } = await query(
    `SELECT d.id AS dibujante_id, d.nombre AS dibujante_nombre,
            d.tarifa_hora_base AS tarifa_actual,
            p.id AS proyecto_id, p.nombre AS proyecto_nombre,
            COUNT(h.id) AS registros,
            SUM(h.horas) AS horas_totales,
            SUM(${costoTarifaSQL()}) AS costo_total,
            MAX(CASE WHEN d.monotributo_activo THEN d.monotributo_monto ELSE 0 END) AS monotributo
     FROM horas_dibujantes h
     JOIN dibujantes d ON d.id = h.dibujante_id
     JOIN proyectos  p ON p.id = h.proyecto_id
     ${joinLiqSQL()}
     WHERE ${condiciones.join(' AND ')}
     GROUP BY d.id, d.nombre, d.tarifa_hora_base, p.id, p.nombre
     ORDER BY d.nombre, p.nombre`,
    params
  );
  res.json(rows);
});

router.get('/pendientes', auth.soloAdmin, async (req, res) => {
  const { desde, hasta, dibujante_id } = req.query;
  console.log('PENDIENTES query params:', req.query);
  const condiciones = ['h.liquidada = FALSE'];
  const params = [];
  if (desde)        { params.push(desde);        condiciones.push(`h.fecha >= $${params.length}`); }
  if (hasta)        { params.push(hasta);        condiciones.push(`h.fecha <= $${params.length}`); }
  if (dibujante_id) { params.push(dibujante_id); condiciones.push(`h.dibujante_id = $${params.length}`); }

  const { rows } = await query(`
        SELECT
      d.id AS dibujante_id,
      d.nombre AS dibujante_nombre,
      DATE_TRUNC('month', h.fecha) AS mes,
      EXTRACT(MONTH FROM h.fecha) AS numero_mes,
      EXTRACT(YEAR FROM h.fecha) AS anio,
      SUM(h.horas) AS horas_totales,
      SUM(h.horas * d.tarifa_hora_base) AS monto_total,
      COUNT(h.id) AS registros,
      CASE WHEN d.monotributo_activo THEN d.monotributo_monto ELSE 0 END AS monotributo
    FROM horas_dibujantes h
    JOIN dibujantes d ON d.id = h.dibujante_id
    WHERE ${condiciones.join(' AND ')}
    GROUP BY d.id, d.nombre, DATE_TRUNC('month', h.fecha),
             EXTRACT(MONTH FROM h.fecha), EXTRACT(YEAR FROM h.fecha)
    ORDER BY mes DESC, d.nombre ASC
  `, params);
  res.json(rows);
});

router.get('/mis-liquidaciones', async (req, res) => {
  const { rows: dibujante } = await query(
    `SELECT id FROM dibujantes WHERE usuario_id = $1`, [req.usuario.id]
  );
  if (!dibujante[0]) return res.json([]);

  const { rows } = await query(
    `SELECT l.id, l.mes, l.anio, l.horas_totales, l.monto_total,
            l.fecha_desde, l.fecha_hasta, l.tarifa_aplicada, l.estado,
            l.created_at
     FROM liquidaciones_dibujantes l
     WHERE l.dibujante_id = $1
     ORDER BY l.fecha_hasta DESC`,
    [dibujante[0].id]
  );
  res.json(rows);
});

// ── Exportaciones ──────────────────────────────────────────────────────────────
// Usan el mismo criterio de costo que el resto de la app (utils/costoHoras.js):
// horas liquidadas a la tarifa de su liquidación + su parte del monotributo de esa
// liquidación; horas sin liquidar a la tarifa actual del dibujante, sin monotributo.
function filtrosExport(q) {
  const { proyecto_id, dibujante_id, desde, hasta } = q;
  const condiciones = ['TRUE'];
  const params = [];
  if (dibujante_id) { params.push(dibujante_id); condiciones.push(`h.dibujante_id = $${params.length}`); }
  if (proyecto_id)  { params.push(proyecto_id);  condiciones.push(`h.proyecto_id = $${params.length}`); }
  if (desde)        { params.push(desde);         condiciones.push(`h.fecha >= $${params.length}`); }
  if (hasta)        { params.push(hasta);         condiciones.push(`h.fecha <= $${params.length}`); }
  return { where: condiciones.join(' AND '), params };
}

// '2026-10-05' → '05/10/2026' (sin pasar por Date, para no correr el día por zona horaria)
const fechaAR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

function textoPeriodo(desde, hasta) {
  if (desde && hasta) return `Período: ${fechaAR(desde)} al ${fechaAR(hasta)}`;
  if (desde) return `Desde el ${fechaAR(desde)}`;
  if (hasta) return `Hasta el ${fechaAR(hasta)}`;
  return 'Todas las fechas';
}

router.get('/exportar/excel', auth.soloAdmin, async (req, res) => {
  const ExcelJS = require('exceljs');
  const { where, params } = filtrosExport(req.query);

  const { rows } = await query(
    `SELECT to_char(h.fecha, 'YYYY-MM-DD') AS fecha, d.nombre AS dibujante, p.nombre AS proyecto,
            h.horas, h.descripcion_tarea,
            ${tarifaSQL()} AS tarifa,
            ${costoTarifaSQL()} AS costo_horas,
            ${monotributoSQL()} AS monotributo,
            ${costoSQL()} AS costo_total,
            ${liquidadaSQL()} AS liquidada
     FROM horas_dibujantes h
     JOIN dibujantes d ON d.id = h.dibujante_id
     JOIN proyectos  p ON p.id = h.proyecto_id
     ${joinLiqSQL()}
     WHERE ${where}
     ORDER BY d.nombre, h.fecha`,
    params
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Horas');
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Dibujante', key: 'dibujante', width: 22 },
    { header: 'Proyecto', key: 'proyecto', width: 28 },
    { header: 'Horas', key: 'horas', width: 9 },
    { header: 'Tarifa', key: 'tarifa', width: 14 },
    { header: 'Costo horas', key: 'costo_horas', width: 15 },
    { header: 'Monotributo', key: 'monotributo', width: 14 },
    { header: 'Costo total', key: 'costo_total', width: 15 },
    { header: 'Estado', key: 'estado', width: 12 },
    { header: 'Descripción', key: 'descripcion', width: 40 },
  ];
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2744' } };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  rows.forEach(r => {
    ws.addRow({
      fecha: fechaAR(r.fecha),
      dibujante: r.dibujante,
      proyecto: r.proyecto,
      horas: Number(r.horas),
      tarifa: Number(r.tarifa),
      costo_horas: Number(r.costo_horas),
      monotributo: Number(r.monotributo),
      costo_total: Number(r.costo_total),
      estado: r.liquidada ? 'Liquidada' : 'Pendiente (estimado)',
      descripcion: r.descripcion_tarea || '',
    });
  });

  ['tarifa', 'costo_horas', 'monotributo', 'costo_total'].forEach(k => {
    ws.getColumn(k).numFmt = '$ #,##0.00';
  });

  const suma = (k) => rows.reduce((s, r) => s + Number(r[k]), 0);
  const filaTotal = ws.addRow({
    dibujante: 'TOTAL',
    horas: suma('horas'),
    costo_horas: suma('costo_horas'),
    monotributo: suma('monotributo'),
    costo_total: suma('costo_total'),
  });
  filaTotal.font = { bold: true };

  ws.addRow({});
  ws.addRow({ dibujante: textoPeriodo(req.query.desde, req.query.hasta) });
  ws.addRow({ dibujante: 'Horas liquidadas: tarifa y monotributo de su liquidación. Pendientes: tarifa actual, sin monotributo.' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="horas_dibujantes.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

router.get('/exportar/pdf', auth.soloAdmin, async (req, res) => {
  const PDFDocument = require('pdfkit');
  const { where, params } = filtrosExport(req.query);

  const { rows } = await query(
    `SELECT d.id AS dibujante_id, d.nombre AS dibujante_nombre, d.tarifa_hora_base AS tarifa_actual,
            p.id AS proyecto_id, p.nombre AS proyecto_nombre,
            SUM(h.horas) AS horas_totales,
            SUM(${costoTarifaSQL()}) AS costo_horas,
            SUM(${monotributoSQL()}) AS monotributo,
            SUM(${costoSQL()}) AS costo_total,
            SUM(CASE WHEN ${liquidadaSQL()} THEN 0 ELSE h.horas END) AS horas_pendientes
     FROM horas_dibujantes h
     JOIN dibujantes d ON d.id = h.dibujante_id
     JOIN proyectos  p ON p.id = h.proyecto_id
     ${joinLiqSQL()}
     WHERE ${where}
     GROUP BY d.id, d.nombre, d.tarifa_hora_base, p.id, p.nombre
     ORDER BY d.nombre, p.nombre`,
    params
  );

  const porDibujante = {};
  rows.forEach(r => {
    if (!porDibujante[r.dibujante_id]) {
      porDibujante[r.dibujante_id] = {
        nombre: r.dibujante_nombre, tarifaActual: Number(r.tarifa_actual),
        proyectos: [], horasTotal: 0, costoHoras: 0, monotributo: 0, costoTotal: 0, horasPendientes: 0,
      };
    }
    const g = porDibujante[r.dibujante_id];
    g.proyectos.push(r);
    g.horasTotal      += Number(r.horas_totales);
    g.costoHoras      += Number(r.costo_horas);
    g.monotributo     += Number(r.monotributo);
    g.costoTotal      += Number(r.costo_total);
    g.horasPendientes += Number(r.horas_pendientes);
  });

  const grupos = Object.values(porDibujante);
  const horasTotalesGlobal = grupos.reduce((s, g) => s + g.horasTotal, 0);
  const costoTotalGlobal   = grupos.reduce((s, g) => s + g.costoTotal, 0);
  const hayPendientes      = grupos.some(g => g.horasPendientes > 0);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="horas_por_dibujante.pdf"');

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  const moneyFmt = (n) => `$ ${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // Tarifa efectiva del renglón: si mezcla liquidaciones con distintas tarifas, es el promedio
  const tarifaEfectiva = (costo, horas) => (Number(horas) > 0 ? Number(costo) / Number(horas) : 0);

  doc.fontSize(16).fillColor('#1a2744').text('Horas trabajadas — VJV Arquitectos', { align: 'center' });
  doc.fontSize(9).fillColor('#666').text(
    `${textoPeriodo(req.query.desde, req.query.hasta)}  ·  Generado el ${new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Cordoba' })}`,
    { align: 'center' }
  );
  doc.moveDown(0.6);
  doc.fontSize(10).fillColor('#1a2744');
  doc.text(`Horas totales: ${horasTotalesGlobal.toFixed(1)} h     Costo total: ${moneyFmt(costoTotalGlobal)}     Dibujantes: ${grupos.length}`, { align: 'center' });
  doc.moveDown(1);

  const anchoPagina = doc.page.width - 80;

  grupos.forEach(g => {
    if (doc.y > 680) doc.addPage();

    const yInicio = doc.y;
    doc.rect(40, yInicio, anchoPagina, 24).fill('#f8f9fa');
    doc.fillColor('#1a1a1a').fontSize(11).font('Helvetica-Bold');
    doc.text(g.nombre, 48, yInicio + 6, { width: 220, continued: false });
    doc.font('Helvetica').fontSize(9).fillColor('#666');
    doc.text(`Tarifa actual: ${moneyFmt(g.tarifaActual)}/h`, 270, yInicio + 8);
    doc.fontSize(10).fillColor('#1a1a1a');
    doc.text(`${g.horasTotal.toFixed(1)} h totales`, 400, yInicio + 7, { width: 80, align: 'right' });
    doc.fillColor('#b71c1c').font('Helvetica-Bold');
    doc.text(moneyFmt(g.costoTotal), 480, yInicio + 7, { width: 95, align: 'right' });
    doc.font('Helvetica');

    let y = yInicio + 24;

    g.proyectos.forEach((p, idx) => {
      if (y > 750) { doc.addPage(); y = 40; }
      if (idx % 2 === 0) doc.rect(40, y, anchoPagina, 16).fill('#ffffff');
      doc.fillColor('#666').fontSize(9);
      const marca = Number(p.horas_pendientes) > 0 ? ' *' : '';
      doc.text(`${p.proyecto_nombre}${marca}`, 48, y + 3, { width: 220 });
      doc.text(`${Number(p.horas_totales).toFixed(1)} h`, 270, y + 3, { width: 60 });
      doc.fillColor('#999').font('Helvetica-Oblique');
      doc.text(`× ${moneyFmt(tarifaEfectiva(p.costo_horas, p.horas_totales))}/h`, 340, y + 3, { width: 130 });
      doc.font('Helvetica').fillColor('#1a1a1a');
      doc.text(moneyFmt(p.costo_horas), 480, y + 3, { width: 95, align: 'right' });
      y += 16;
    });

    // Monotributo: la parte que corresponde a las horas liquidadas del período filtrado
    if (g.monotributo > 0) {
      if (y > 750) { doc.addPage(); y = 40; }
      doc.rect(40, y, anchoPagina, 16).fill('#f0f4ff');
      doc.fillColor('#0d47a1').fontSize(9).font('Helvetica-Oblique');
      doc.text('Monotributo (parte de las liquidaciones)', 48, y + 3, { width: 300 });
      doc.font('Helvetica-Bold').fillColor('#0d47a1');
      doc.text(moneyFmt(g.monotributo), 480, y + 3, { width: 95, align: 'right' });
      doc.font('Helvetica');
      y += 16;
    }

    doc.y = y + 10;
  });

  if (hayPendientes) {
    if (doc.y > 760) doc.addPage();
    doc.fontSize(8).fillColor('#666').font('Helvetica-Oblique').text(
      '* Incluye horas sin liquidar, valuadas a la tarifa actual del dibujante y sin monotributo (estimado hasta que se liquiden).',
      40, doc.y, { width: anchoPagina }
    );
  }

  doc.end();
});

router.post('/liquidar', auth.soloAdmin, async (req, res) => {
  const { dibujante_id, mes, anio, destinatario_id, pagado_por_estudio, socio_id } = req.body;
  if (!dibujante_id || !mes || !anio) {
    return res.status(400).json({ error: 'dibujante_id, mes y anio son obligatorios' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: horas } = await client.query(`
      SELECT id, horas, costo_total, proyecto_id, fecha FROM horas_dibujantes
      WHERE dibujante_id = $1
        AND EXTRACT(MONTH FROM fecha) = $2
        AND EXTRACT(YEAR FROM fecha) = $3
        AND liquidada = FALSE
    `, [dibujante_id, mes, anio]);

    if (!horas.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No hay horas pendientes para ese período' });
    }

    const horas_totales = horas.reduce((s, h) => s + Number(h.horas), 0);

        // Obtener tarifa actual y monotributo del dibujante
    const { rows: dibRows } = await client.query(
      `SELECT tarifa_hora_base, monotributo_activo, monotributo_monto FROM dibujantes WHERE id = $1`, [dibujante_id]
    );
    const tarifaActual = Number(dibRows[0]?.tarifa_hora_base || 0);
    const monotributoMonto = dibRows[0]?.monotributo_activo ? Number(dibRows[0]?.monotributo_monto || 0) : 0;
    const monto_horas = Math.round(horas_totales * tarifaActual * 100) / 100;
    const monto_total = Math.round((monto_horas + monotributoMonto) * 100) / 100;

    const porProyecto = {};
    horas.forEach(h => {
      if (!porProyecto[h.proyecto_id]) porProyecto[h.proyecto_id] = 0;
      porProyecto[h.proyecto_id] += Number(h.horas);
    });

    // Un egreso por proyecto (horas × tarifa + su parte del monotributo); la suma es
    // exactamente el total liquidado. Ver utils/repartoLiquidacion.js
    const { montos: montosPorProyecto } = repartirLiquidacion(porProyecto, tarifaActual, monotributoMonto);
    const descripcionEgreso = descripcionLiquidacion(mes, anio, monotributoMonto);

    const egresosCreados = [];
    for (const [proyecto_id_actual, monto_proyecto] of montosPorProyecto) {
      const { rows: [egreso] } = await client.query(`
        INSERT INTO egresos
          (destinatario_id, proyecto_id, categoria, monto, moneda, pagado_por_estudio, socio_id, fecha, descripcion)
        VALUES ($1, $2, 'dibujantes', $3, 'ARS', $4, $5, CURRENT_DATE, $6)
        RETURNING *
      `, [
        destinatario_id,
        proyecto_id_actual,
        monto_proyecto,
        pagado_por_estudio ?? true,
        pagado_por_estudio ? null : socio_id,
        descripcionEgreso,
      ]);
      await client.query(`SELECT distribuir_egreso($1)`, [egreso.id]);
      egresosCreados.push(egreso);
    }

    const fechaDesde = horas.reduce((min, h) => h.fecha < min ? h.fecha : min, horas[0].fecha);
    const fechaHasta = horas.reduce((max, h) => h.fecha > max ? h.fecha : max, horas[0].fecha);

        const { rows: [liquidacion] } = await client.query(`
      INSERT INTO liquidaciones_dibujantes
        (dibujante_id, mes, anio, horas_totales, monto_total, egreso_id, fecha_desde, fecha_hasta, tarifa_aplicada, monotributo_monto)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [dibujante_id, mes, anio, horas_totales, monto_total, egresosCreados[0]?.id || null,
        fechaDesde, fechaHasta, tarifaActual, monotributoMonto]);

const ids = horas.map(h => h.id);
    await client.query(`
      UPDATE horas_dibujantes
      SET liquidada = TRUE, liquidacion_id = $1
      WHERE id = ANY($2)
    `, [liquidacion.id, ids]);

    await client.query('COMMIT');
    res.status(201).json({ liquidacion, egresos: egresosCreados, horas_totales, monto_total });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error liquidando horas:', err);
    res.status(500).json({ error: 'Error al liquidar las horas' });
  } finally {
    client.release();
  }
});

router.post('/', async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  const { proyecto_id, fecha, horas, descripcion_tarea } = req.body;
  let { dibujante_id } = req.body;
  if (!proyecto_id)         return res.status(400).json({ error: 'proyecto_id es obligatorio' });
  if (!horas || horas <= 0) return res.status(400).json({ error: 'Las horas deben ser mayor a 0' });
  if (!fecha)               return res.status(400).json({ error: 'La fecha es obligatoria' });
  if (!esAdmin) {
    const { rows } = await query(`SELECT id FROM dibujantes WHERE usuario_id = $1`, [req.usuario.id]);
    if (!rows[0]) return res.status(403).json({ error: 'No tenés perfil de dibujante asignado' });
    dibujante_id = rows[0].id;
  }
  const { rows: tarifaRows } = await query(`SELECT tarifa_hora_base FROM dibujantes WHERE id=$1`, [dibujante_id]);
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
      `SELECT h.id FROM horas_dibujantes h JOIN dibujantes d ON d.id=h.dibujante_id WHERE h.id=$1 AND d.usuario_id=$2`,
      [req.params.id, req.usuario.id]
    );
    if (!check.length) return res.status(403).json({ error: 'No podés editar este registro' });
  }
  const { rows } = await query(
    `UPDATE horas_dibujantes SET fecha=$1, horas=$2, descripcion_tarea=$3 WHERE id=$4 RETURNING *`,
    [fecha, horas, descripcion_tarea || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Registro no encontrado' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  if (!esAdmin) {
    const { rows } = await query(
      `SELECT h.id FROM horas_dibujantes h JOIN dibujantes d ON d.id=h.dibujante_id WHERE h.id=$1 AND d.usuario_id=$2`,
      [req.params.id, req.usuario.id]
    );
    if (!rows.length) return res.status(403).json({ error: 'No podés eliminar este registro' });
  }
  await query(`DELETE FROM horas_dibujantes WHERE id=$1`, [req.params.id]);
  res.status(204).send();
});

module.exports = router;
