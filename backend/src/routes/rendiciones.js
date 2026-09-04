const express = require('express');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const { subirArchivo } = require('../utils/supabaseStorage');
const { leerComprobante } = require('../utils/ocrComprobante');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

// GET /api/rendiciones
router.get('/', async (req, res) => {
  const { proyecto_id, tipo } = req.query;
  const condiciones = ['TRUE'];
  const params = [];
  if (proyecto_id) { params.push(proyecto_id); condiciones.push(`r.proyecto_id = $${params.length}`); }
  if (tipo)        { params.push(tipo);        condiciones.push(`r.tipo = $${params.length}`); }
  const { rows } = await query(
    `SELECT r.*, p.nombre AS proyecto_nombre, c.nombre_razon_social AS cliente_nombre,
            COALESCE((SELECT SUM(rc.monto_total) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id AND rc.moneda = 'ARS'), 0) AS total_ars,
            COALESCE((SELECT SUM(rc.monto_total) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id AND rc.moneda = 'USD'), 0) AS total_usd,
            (SELECT COUNT(*) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id) AS cantidad_comprobantes
     FROM rendiciones r
     JOIN proyectos p ON p.id = r.proyecto_id
     JOIN clientes  c ON c.id = p.cliente_id
     WHERE ${condiciones.join(' AND ')}
     ORDER BY r.fecha DESC, r.created_at DESC`,
    params
  );
  res.json(rows);
});

// GET /api/rendiciones/siguiente-numero/calcular
router.get('/siguiente-numero/calcular', async (req, res) => {
  const { proyecto_id, tipo } = req.query;
  if (!proyecto_id || !tipo) return res.status(400).json({ error: 'proyecto_id y tipo son obligatorios' });
  const { rows } = await query(
    `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM rendiciones WHERE proyecto_id = $1 AND tipo = $2`,
    [proyecto_id, tipo]
  );
  res.json({ siguiente: rows[0].siguiente });
});

// GET /api/rendiciones/totales
router.get('/totales', async (req, res) => {
  const { ids } = req.query;
  if (!ids) return res.json([]);
  const idArray = ids.split(',').map(s => s.trim()).filter(Boolean);
  if (!idArray.length) return res.json([]);
  const { rows } = await query(
    `SELECT rc.moneda,
            COALESCE(SUM(rc.monto_neto), 0)  AS total_neto,
            COALESCE(SUM(rc.iva), 0)         AS total_iva,
            COALESCE(SUM(rc.iibb), 0)        AS total_iibb,
            COALESCE(SUM(rc.monto_total), 0) AS total
     FROM rendicion_comprobantes rc
     WHERE rc.rendicion_id = ANY($1::uuid[])
     GROUP BY rc.moneda`,
    [idArray]
  );
  res.json(rows);
});

// GET /api/rendiciones/exportar/pdf
router.get('/exportar/pdf', async (req, res) => {
  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'ids es obligatorio' });
  const idArray = ids.split(',').map(s => s.trim()).filter(Boolean);

  const { rows: rendiciones } = await query(
    `SELECT r.*, p.nombre AS proyecto_nombre, c.nombre_razon_social AS cliente_nombre,
            COALESCE((SELECT SUM(rc.monto_total) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id AND rc.moneda = 'ARS'), 0) AS total_ars,
            COALESCE((SELECT SUM(rc.monto_total) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id AND rc.moneda = 'USD'), 0) AS total_usd,
            (SELECT COUNT(*) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id) AS cantidad_comprobantes
     FROM rendiciones r
     JOIN proyectos p ON p.id = r.proyecto_id
     JOIN clientes  c ON c.id = p.cliente_id
     WHERE r.id = ANY($1::uuid[])
     ORDER BY r.fecha DESC`,
    [idArray]
  );

  const { rows: totales } = await query(
    `SELECT rc.moneda,
            COALESCE(SUM(rc.monto_neto), 0)  AS total_neto,
            COALESCE(SUM(rc.iva), 0)         AS total_iva,
            COALESCE(SUM(rc.iibb), 0)        AS total_iibb,
            COALESCE(SUM(rc.monto_total), 0) AS total
     FROM rendicion_comprobantes rc
     WHERE rc.rendicion_id = ANY($1::uuid[])
     GROUP BY rc.moneda`,
    [idArray]
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="resumen-rendiciones.pdf"');

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  doc.pipe(res);

  const fmtM = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtMUSD = (n) => `U$S ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtF = (f) => {
    if (!f) return '—';
    const d = new Date(String(f).slice(0, 10) + 'T00:00:00');
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR');
  };

  const margen = 40;
  const ancho = doc.page.width - 80;

  doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a2744')
    .text('Resumen de Rendiciones — VJV Arquitectos', margen, margen, { align: 'center', width: ancho });
  doc.fontSize(9).font('Helvetica').fillColor('#666')
    .text(`Generado el ${new Date().toLocaleDateString('es-AR')}`, margen, margen + 18, { align: 'center', width: ancho });
  doc.moveDown(1.5);

  const cols = [
    { x: margen,       w: 70,  label: 'Rendición' },
    { x: margen + 70,  w: 100, label: 'Cliente' },
    { x: margen + 170, w: 140, label: 'Proyecto' },
    { x: margen + 310, w: 60,  label: 'Fecha' },
    { x: margen + 370, w: 40,  label: 'Comp.' },
    { x: margen + 410, w: 120, label: 'Total ARS' },
    { x: margen + 530, w: ancho - 490, label: 'Total USD' },
  ];

  const altoEnc = 18;
  let y = doc.y;
  doc.rect(margen, y, ancho, altoEnc).fillAndStroke('#1a2744', '#1a2744');
  cols.forEach(c => {
    doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
      .text(c.label, c.x + 4, y + 5, { width: c.w - 8 });
  });
  y += altoEnc;

  rendiciones.forEach((r, idx) => {
    if (y > 520) { doc.addPage(); y = 40; }
    const fondo = idx % 2 === 0 ? '#f8f9fa' : '#ffffff';
    doc.rect(margen, y, ancho, 18).fillAndStroke(fondo, '#e0e0e0');
    doc.fillColor('#000').fontSize(8).font('Helvetica-Bold');
    doc.text(`${r.tipo}${r.numero}`, cols[0].x + 4, y + 5, { width: cols[0].w - 8 });
    doc.font('Helvetica');
    doc.text(r.cliente_nombre, cols[1].x + 4, y + 5, { width: cols[1].w - 8, ellipsis: true });
    doc.text(r.proyecto_nombre, cols[2].x + 4, y + 5, { width: cols[2].w - 8, ellipsis: true });
    doc.text(fmtF(r.fecha), cols[3].x + 4, y + 5, { width: cols[3].w - 8 });
    doc.text(String(r.cantidad_comprobantes || 0), cols[4].x + 4, y + 5, { width: cols[4].w - 8, align: 'center' });
    doc.text(Number(r.total_ars) !== 0 ? fmtM(r.total_ars) : '—', cols[5].x + 4, y + 5, { width: cols[5].w - 8, align: 'right' });
    doc.text(Number(r.total_usd) !== 0 ? fmtMUSD(r.total_usd) : '—', cols[6].x + 4, y + 5, { width: cols[6].w - 8, align: 'right' });
    y += 18;
  });

  doc.moveDown(1);
  y = doc.y + 10;
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a2744').text('Totales discriminados', margen, y);
  y += 20;

  totales.forEach(t => {
    const monedaLabel = t.moneda === 'USD' ? 'U$S Dólares' : '$ Pesos argentinos';
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#666').text(monedaLabel, margen, y);
    y += 14;
    const items = [
      { label: 'Neto', valor: t.moneda === 'USD' ? fmtMUSD(t.total_neto) : fmtM(t.total_neto) },
      { label: 'IVA', valor: t.moneda === 'USD' ? fmtMUSD(t.total_iva) : fmtM(t.total_iva) },
      { label: 'IIBB y otros', valor: t.moneda === 'USD' ? fmtMUSD(t.total_iibb) : fmtM(t.total_iibb) },
      { label: 'Total', valor: t.moneda === 'USD' ? fmtMUSD(t.total) : fmtM(t.total) },
    ];
    const colW = ancho / 4;
    items.forEach((item, i) => {
      const x = margen + i * colW;
      doc.rect(x, y, colW, 32).fillAndStroke(item.label === 'Total' ? '#1a2744' : '#f8f9fa', '#e0e0e0');
      doc.fillColor(item.label === 'Total' ? '#fff' : '#999').fontSize(8).font('Helvetica')
        .text(item.label.toUpperCase(), x + 8, y + 6, { width: colW - 16 });
      doc.fillColor(item.label === 'Total' ? '#fff' : '#1a2744').fontSize(10).font('Helvetica-Bold')
        .text(item.valor, x + 8, y + 18, { width: colW - 16 });
    });
    y += 48;
  });

  doc.end();
});

// GET /api/rendiciones/exportar/excel
router.get('/exportar/excel', async (req, res) => {
  const ExcelJS = require('exceljs');
  const { ids } = req.query;
  if (!ids) return res.status(400).json({ error: 'ids es obligatorio' });
  const idArray = ids.split(',').map(s => s.trim()).filter(Boolean);

  const { rows: rendiciones } = await query(
    `SELECT r.*, p.nombre AS proyecto_nombre, c.nombre_razon_social AS cliente_nombre,
            COALESCE((SELECT SUM(rc.monto_total) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id AND rc.moneda = 'ARS'), 0) AS total_ars,
            COALESCE((SELECT SUM(rc.monto_total) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id AND rc.moneda = 'USD'), 0) AS total_usd,
            (SELECT COUNT(*) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id) AS cantidad_comprobantes
     FROM rendiciones r
     JOIN proyectos p ON p.id = r.proyecto_id
     JOIN clientes  c ON c.id = p.cliente_id
     WHERE r.id = ANY($1::uuid[])
     ORDER BY r.fecha DESC`,
    [idArray]
  );

  const { rows: totales } = await query(
    `SELECT rc.moneda,
            COALESCE(SUM(rc.monto_neto), 0)  AS total_neto,
            COALESCE(SUM(rc.iva), 0)         AS total_iva,
            COALESCE(SUM(rc.iibb), 0)        AS total_iibb,
            COALESCE(SUM(rc.monto_total), 0) AS total
     FROM rendicion_comprobantes rc
     WHERE rc.rendicion_id = ANY($1::uuid[])
     GROUP BY rc.moneda`,
    [idArray]
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rendiciones');
  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = 'Resumen de Rendiciones — VJV Arquitectos';
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1A2744' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.addRow([]);
  ws.columns = [
    { key: 'rendicion', width: 12 },
    { key: 'cliente', width: 22 },
    { key: 'proyecto', width: 28 },
    { key: 'fecha', width: 14 },
    { key: 'comprobantes', width: 14 },
    { key: 'total_ars', width: 20 },
    { key: 'total_usd', width: 16 },
  ];
  const headerRow = ws.addRow(['Rendición', 'Cliente', 'Proyecto', 'Fecha', 'Comprobantes', 'Total ARS', 'Total USD']);
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2744' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  rendiciones.forEach(r => {
    const fila = ws.addRow([
      `${r.tipo}${r.numero}`,
      r.cliente_nombre,
      r.proyecto_nombre,
      new Date(String(r.fecha).slice(0, 10) + 'T00:00:00').toLocaleDateString('es-AR'),
      Number(r.cantidad_comprobantes || 0),
      Number(r.total_ars),
      Number(r.total_usd),
    ]);
    fila.getCell(6).numFmt = '$ #,##0.00';
    fila.getCell(7).numFmt = 'U$S #,##0.00';
  });
  ws.addRow([]);
  ws.addRow(['TOTALES DISCRIMINADOS']);
  ws.lastRow.getCell(1).font = { bold: true, color: { argb: 'FF1A2744' } };
  totales.forEach(t => {
    ws.addRow([t.moneda === 'USD' ? 'U$S Dólares' : '$ Pesos argentinos']);
    ws.lastRow.getCell(1).font = { bold: true };
    const filaT = ws.addRow(['Neto', 'IVA', 'IIBB y otros', 'Total']);
    filaT.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FF666666' } }; });
    const filaV = ws.addRow([Number(t.total_neto), Number(t.total_iva), Number(t.total_iibb), Number(t.total)]);
    filaV.eachCell(cell => {
      cell.numFmt = t.moneda === 'USD' ? 'U$S #,##0.00' : '$ #,##0.00';
      cell.font = { bold: true, color: { argb: 'FF1A2744' } };
    });
    ws.addRow([]);
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="resumen-rendiciones.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// GET /api/rendiciones/:id
router.get('/:id', async (req, res) => {
  const { rows: [rendicion] } = await query(
    `SELECT r.*, p.nombre AS proyecto_nombre, c.nombre_razon_social AS cliente_nombre
     FROM rendiciones r
     JOIN proyectos p ON p.id = r.proyecto_id
     JOIN clientes  c ON c.id = p.cliente_id
     WHERE r.id = $1`,
    [req.params.id]
  );
  if (!rendicion) return res.status(404).json({ error: 'Rendición no encontrada' });
  const { rows: comprobantes } = await query(
    `SELECT * FROM rendicion_comprobantes WHERE rendicion_id = $1 ORDER BY orden ASC, created_at ASC`,
    [req.params.id]
  );
  res.json({ ...rendicion, comprobantes });
});

// POST /api/rendiciones
router.post('/', async (req, res) => {
  const { proyecto_id, tipo, fecha, notas, es_honorarios } = req.body;
  if (!proyecto_id) return res.status(400).json({ error: 'proyecto_id es obligatorio' });
  if (!tipo?.trim()) return res.status(400).json({ error: 'El tipo es obligatorio' });
  if (!fecha) return res.status(400).json({ error: 'La fecha es obligatoria' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT id FROM rendiciones WHERE proyecto_id = $1 AND tipo = $2 FOR UPDATE`, [proyecto_id, tipo.trim().toUpperCase()]);
    const { rows: numRows } = await client.query(`SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM rendiciones WHERE proyecto_id = $1 AND tipo = $2`, [proyecto_id, tipo.trim().toUpperCase()]);
    const numero = numRows[0].siguiente;
    const { rows } = await client.query(
      `INSERT INTO rendiciones (proyecto_id, tipo, numero, fecha, notas, es_honorarios) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [proyecto_id, tipo.trim().toUpperCase(), numero, fecha, notas || null, es_honorarios ?? false]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creando rendición:', err);
    res.status(500).json({ error: 'Error al crear la rendición' });
  } finally {
    client.release();
  }
});

// PUT /api/rendiciones/:id
router.put('/:id', async (req, res) => {
  const { fecha, estado, notas } = req.body;
  const { rows } = await query(
    `UPDATE rendiciones SET fecha=COALESCE($1, fecha), estado=COALESCE($2, estado), notas=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
    [fecha || null, estado || null, notas || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Rendición no encontrada' });
  res.json(rows[0]);
});

// DELETE /api/rendiciones/:id
router.delete('/:id', async (req, res) => {
  const { rows } = await query(`DELETE FROM rendiciones WHERE id=$1 RETURNING id`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Rendición no encontrada' });
  res.status(204).send();
});

// ── Comprobantes ──────────────────────────────────────────────────────────────

router.post('/:id/comprobantes', async (req, res) => {
  const { descripcion, numero_comprobante, moneda, monto_neto, iva, iibb, proveedor, fecha, archivo_url } = req.body;
  if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es obligatoria' });
  const neto = Number(monto_neto || 0);
  const ivaNum = Number(iva || 0);
  const iibbNum = Number(iibb || 0);
  const total = neto + ivaNum + iibbNum;
  const { rows: ordenRows } = await query(`SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM rendicion_comprobantes WHERE rendicion_id = $1`, [req.params.id]);
  const { rows } = await query(
    `INSERT INTO rendicion_comprobantes (rendicion_id, orden, descripcion, numero_comprobante, moneda, monto_neto, iva, iibb, monto_total, proveedor, fecha, archivo_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [req.params.id, ordenRows[0].siguiente, descripcion.trim(), numero_comprobante || null, moneda || 'ARS', neto, ivaNum, iibbNum, total, proveedor?.trim() || null, fecha || null, archivo_url || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/comprobantes/:comprobanteId', async (req, res) => {
  const { descripcion, numero_comprobante, moneda, monto_neto, iva, iibb, proveedor, fecha } = req.body;
  if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es obligatoria' });
  const neto = Number(monto_neto || 0);
  const ivaNum = Number(iva || 0);
  const iibbNum = Number(iibb || 0);
  const total = neto + ivaNum + iibbNum;
  const { rows } = await query(
    `UPDATE rendicion_comprobantes SET descripcion=$1, numero_comprobante=$2, moneda=$3, monto_neto=$4, iva=$5, iibb=$6, monto_total=$7, proveedor=$8, fecha=$9 WHERE id=$10 RETURNING *`,
    [descripcion.trim(), numero_comprobante || null, moneda || 'ARS', neto, ivaNum, iibbNum, total, proveedor?.trim() || null, fecha || null, req.params.comprobanteId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Comprobante no encontrado' });
  res.json(rows[0]);
});

router.delete('/comprobantes/:comprobanteId', async (req, res) => {
  const { rows } = await query(`DELETE FROM rendicion_comprobantes WHERE id=$1 RETURNING id`, [req.params.comprobanteId]);
  if (!rows[0]) return res.status(404).json({ error: 'Comprobante no encontrado' });
  res.status(204).send();
});

router.post('/:id/comprobantes/ocr', upload.single('archivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  try {
    const { buffer, mimetype, originalname } = req.file;
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!tiposPermitidos.includes(mimetype)) return res.status(400).json({ error: 'Formato no soportado.' });
    const [archivoUrl, datosExtraidos] = await Promise.all([
      subirArchivo(buffer, originalname, mimetype),
      leerComprobante(buffer, mimetype),
    ]);
    res.json({ ...datosExtraidos, archivo_url: archivoUrl });
  } catch (err) {
    console.error('Error procesando OCR:', err);
    res.status(500).json({ error: err.message || 'Error al procesar el comprobante' });
  }
});

// ── PDF de rendición individual ───────────────────────────────────────────────

router.get('/:id/pdf', async (req, res) => {
  const { rows: [rendicion] } = await query(
    `SELECT r.*, p.nombre AS proyecto_nombre, c.nombre_razon_social AS cliente_nombre
     FROM rendiciones r JOIN proyectos p ON p.id = r.proyecto_id JOIN clientes c ON c.id = p.cliente_id
     WHERE r.id = $1`, [req.params.id]
  );
  if (!rendicion) return res.status(404).json({ error: 'Rendición no encontrada' });
  const { rows: comprobantes } = await query(`SELECT * FROM rendicion_comprobantes WHERE rendicion_id = $1 ORDER BY orden ASC, created_at ASC`, [req.params.id]);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${rendicion.tipo}${rendicion.numero}.pdf"`);
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
  doc.pipe(res);

  const fmtMonto = (n, moneda) => {
    const num = Number(n);
    const signo = num < 0 ? '-' : '';
    const abs = Math.abs(num).toLocaleString('es-AR', { minimumFractionDigits: 2 });
    return moneda === 'USD' ? `${signo}USD ${abs}` : `${signo}$ ${abs}`;
  };
  const fmtFecha = (f) => {
    if (!f) return '—';
    let fechaStr;
    if (f instanceof Date) {
      fechaStr = `${f.getUTCFullYear()}-${String(f.getUTCMonth()+1).padStart(2,'0')}-${String(f.getUTCDate()).padStart(2,'0')}`;
    } else { fechaStr = String(f).slice(0, 10); }
    const d = new Date(fechaStr + 'T00:00:00');
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR');
  };

  const margenIzq = 30;
  const anchoTotal = doc.page.width - 60;
  const cols = [
    { x: margenIzq,       w: 130, label: 'Proveedor',    align: 'left'  },
    { x: margenIzq + 130, w: 180, label: 'Concepto',     align: 'left'  },
    { x: margenIzq + 310, w: 60,  label: 'Fecha',        align: 'right' },
    { x: margenIzq + 370, w: 90,  label: 'Comprobante',  align: 'right' },
    { x: margenIzq + 460, w: 85,  label: 'Neto',         align: 'right' },
    { x: margenIzq + 545, w: 65,  label: 'IVA',          align: 'right' },
    { x: margenIzq + 610, w: 75,  label: 'IIBB y otros', align: 'right' },
    { x: margenIzq + 685, w: anchoTotal - 685, label: 'Subtotal', align: 'right' },
  ];

  doc.fontSize(13).font('Helvetica-Bold').fillColor('#000').text(rendicion.cliente_nombre.toUpperCase(), margenIzq, 35);
  doc.moveDown(1);
  doc.fontSize(11).font('Helvetica').text('OBRA', margenIzq);
  const numTexto = `${rendicion.tipo}${rendicion.numero}`;
  doc.fontSize(24).font('Helvetica-Bold');
  const anchoNum = doc.widthOfString(numTexto) + 24;
  const xNum = margenIzq + anchoTotal - anchoNum;
  doc.rect(xNum, 30, anchoNum, 34).fillOpacity(0.8).fill('#d9d9d9').fillOpacity(1);
  doc.fillColor('#000').text(numTexto, xNum, 36, { width: anchoNum, align: 'center' });
  doc.moveDown(1.5);
  doc.fontSize(10).font('Helvetica').fillColor('#000').text(fmtFecha(rendicion.fecha), margenIzq, doc.y);
  doc.moveDown(0.8);

  const porMoneda = { ARS: [], USD: [] };
  comprobantes.forEach(c => { porMoneda[c.moneda]?.push(c); });
  const paletaColores = ['#dbe9f5', '#fce4d6', '#e2efda', '#fff2cc', '#d9d2e9', '#f4cccc', '#d0e0e3', '#fce5cd'];
  const coloresPorProveedor = {};
  let siguienteColor = 0;
  const obtenerColor = (proveedor) => {
    const clave = proveedor || '__sin_proveedor__';
    if (!coloresPorProveedor[clave]) { coloresPorProveedor[clave] = paletaColores[siguienteColor % paletaColores.length]; siguienteColor++; }
    return coloresPorProveedor[clave];
  };

  const altoFila = 22;
  const altoEncabezado = 18;
  const dibujarEncabezadoColumnas = (y) => {
    doc.rect(margenIzq, y, anchoTotal, altoEncabezado).fillAndStroke('#404040', '#404040');
    cols.forEach(c => { doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold').text(c.label, c.x + 4, y + 5, { width: c.w - 8, align: c.align }); });
    return y + altoEncabezado;
  };

  let y = doc.y;
  y = dibujarEncabezadoColumnas(y);

  ['ARS', 'USD'].forEach(moneda => {
    const lista = porMoneda[moneda];
    if (!lista.length) return;
    if (y > 700) { doc.addPage(); y = 35; y = dibujarEncabezadoColumnas(y); }
    if (moneda === 'USD') {
      doc.rect(margenIzq, y, anchoTotal, altoFila).fillAndStroke('#fff', '#ccc');
      doc.fillColor('#000').fontSize(10).font('Helvetica-Bold').text('USD', cols[0].x + 4, y + 6);
      y += altoFila;
    }
    lista.forEach((c) => {
      if (y > 740) { doc.addPage(); y = 35; y = dibujarEncabezadoColumnas(y); }
      const fondo = obtenerColor(c.proveedor);
      doc.rect(margenIzq, y, anchoTotal, altoFila).fillAndStroke(fondo, '#bbb');
      cols.slice(1).forEach(c2 => { doc.moveTo(c2.x, y).lineTo(c2.x, y + altoFila).strokeColor('#bbb').stroke(); });
      const esNegativo = Number(c.monto_total) < 0;
      doc.fillColor('#000').fontSize(8).font('Helvetica');
      doc.text(c.proveedor || '—', cols[0].x + 4, y + 6, { width: cols[0].w - 8, ellipsis: true });
      doc.text(c.descripcion, cols[1].x + 4, y + 6, { width: cols[1].w - 8, ellipsis: true });
      doc.text(fmtFecha(c.fecha), cols[2].x + 2, y + 6, { width: cols[2].w - 4, align: 'right' });
      doc.text(c.numero_comprobante || '', cols[3].x + 2, y + 6, { width: cols[3].w - 4, align: 'right' });
      doc.fillColor(esNegativo ? '#c00000' : '#000');
      doc.text(fmtMonto(c.monto_neto, moneda), cols[4].x, y + 6, { width: cols[4].w - 6, align: 'right' });
      doc.fillColor('#000');
      doc.text(Number(c.iva) !== 0 ? fmtMonto(c.iva, moneda) : '', cols[5].x, y + 6, { width: cols[5].w - 6, align: 'right' });
      doc.text(Number(c.iibb) !== 0 ? fmtMonto(c.iibb, moneda) : '', cols[6].x, y + 6, { width: cols[6].w - 6, align: 'right' });
      doc.fillColor(esNegativo ? '#c00000' : '#000').font('Helvetica-Bold');
      doc.text(fmtMonto(c.monto_total, moneda), cols[7].x, y + 6, { width: cols[7].w - 6, align: 'right' });
      y += altoFila;
    });
    const total = lista.reduce((s, c) => s + Number(c.monto_total), 0);
    doc.rect(margenIzq, y, anchoTotal, altoFila).fillAndStroke('#fff', '#bbb');
    cols.slice(1).forEach(c2 => { doc.moveTo(c2.x, y).lineTo(c2.x, y + altoFila).strokeColor('#bbb').stroke(); });
    doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
    doc.text('Total', cols[6].x, y + 6, { width: cols[6].w - 6, align: 'right' });
    doc.rect(cols[7].x, y, cols[7].w, altoFila).fillAndStroke('#d9d9d9', '#bbb');
    doc.fillColor('#000');
    doc.text(fmtMonto(total, moneda), cols[7].x, y + 6, { width: cols[7].w - 6, align: 'right' });
    y += altoFila + 16;
  });

  doc.end();
});

// ── Honorarios DT/HP ──────────────────────────────────────────────────────────

router.get('/:id/honorarios', async (req, res) => {
  const { rows: bases } = await query(
    `SELECT rhb.id, rhb.rendicion_base_id, r.tipo, r.numero, r.fecha,
            COALESCE((SELECT SUM(rc.monto_total) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = r.id AND rc.moneda = 'ARS'), 0) AS total_ars
     FROM rendicion_honorarios_base rhb JOIN rendiciones r ON r.id = rhb.rendicion_base_id
     WHERE rhb.rendicion_id = $1 ORDER BY rhb.created_at ASC`, [req.params.id]
  );
  const { rows: socios } = await query(`SELECT * FROM rendicion_honorarios_socios WHERE rendicion_id = $1 ORDER BY orden ASC`, [req.params.id]);
  res.json({ bases, socios });
});

router.post('/:id/honorarios/base', async (req, res) => {
  const { rendicion_base_id } = req.body;
  if (!rendicion_base_id) return res.status(400).json({ error: 'rendicion_base_id es obligatorio' });
  const { rows } = await query(`INSERT INTO rendicion_honorarios_base (rendicion_id, rendicion_base_id) VALUES ($1, $2) RETURNING *`, [req.params.id, rendicion_base_id]);
  res.status(201).json(rows[0]);
});

router.delete('/honorarios/base/:id', async (req, res) => {
  await query(`DELETE FROM rendicion_honorarios_base WHERE id=$1`, [req.params.id]);
  res.status(204).send();
});

router.post('/:id/honorarios/socios', async (req, res) => {
  const { nombre, porcentaje, aplica_iva, honorario_total } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const honorarioTotal = Number(honorario_total || 0);
  const monto_neto = Math.round(honorarioTotal * Number(porcentaje) / 100 * 100) / 100;
  const monto_iva = aplica_iva ? Math.round(monto_neto * 0.21 * 100) / 100 : 0;
  const monto_total = monto_neto + monto_iva;
  const { rows: ordenRows } = await query(`SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM rendicion_honorarios_socios WHERE rendicion_id = $1`, [req.params.id]);
  const { rows } = await query(
    `INSERT INTO rendicion_honorarios_socios (rendicion_id, nombre, porcentaje, aplica_iva, monto_neto, monto_iva, monto_total, orden) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [req.params.id, nombre.trim(), Number(porcentaje), aplica_iva ?? false, monto_neto, monto_iva, monto_total, ordenRows[0].siguiente]
  );
  res.status(201).json(rows[0]);
});

router.delete('/honorarios/socios/:id', async (req, res) => {
  await query(`DELETE FROM rendicion_honorarios_socios WHERE id=$1`, [req.params.id]);
  res.status(204).send();
});

router.put('/:id/honorarios/calcular', async (req, res) => {
  const { porcentaje_honorarios } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: bases } = await client.query(
      `SELECT COALESCE(SUM((SELECT COALESCE(SUM(rc.monto_total), 0) FROM rendicion_comprobantes rc WHERE rc.rendicion_id = rhb.rendicion_base_id AND rc.moneda = 'ARS')), 0) AS total FROM rendicion_honorarios_base rhb WHERE rhb.rendicion_id = $1`,
      [req.params.id]
    );
    const totalBase = Number(bases[0].total);
    const pct = Number(porcentaje_honorarios);
    const honorarioTotal = totalBase * pct / 100;
    await client.query(`UPDATE rendiciones SET porcentaje_honorarios=$1, total_base=$2 WHERE id=$3`, [pct, totalBase, req.params.id]);
    const { rows: socios } = await client.query(`SELECT * FROM rendicion_honorarios_socios WHERE rendicion_id=$1 ORDER BY orden ASC`, [req.params.id]);
    for (const s of socios) {
      const monto_neto = Math.round(honorarioTotal * Number(s.porcentaje) / 100 * 100) / 100;
      const monto_iva = s.aplica_iva ? Math.round(monto_neto * 0.21 * 100) / 100 : 0;
      const monto_total = monto_neto + monto_iva;
      await client.query(`UPDATE rendicion_honorarios_socios SET monto_neto=$1, monto_iva=$2, monto_total=$3 WHERE id=$4`, [monto_neto, monto_iva, monto_total, s.id]);
    }
    await client.query('COMMIT');
    res.json({ total_base: totalBase, honorario_total: honorarioTotal });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error calculando honorarios:', err);
    res.status(500).json({ error: 'Error al calcular honorarios' });
  } finally {
    client.release();
  }
});

module.exports = router;
