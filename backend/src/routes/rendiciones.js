const express = require('express');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');
const PDFDocument = require('pdfkit');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

// GET /api/rendiciones?proyecto_id=&tipo=
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

// GET /api/rendiciones/siguiente-numero/calcular?proyecto_id=&tipo=
router.get('/siguiente-numero/calcular', async (req, res) => {
  const { proyecto_id, tipo } = req.query;
  if (!proyecto_id || !tipo) return res.status(400).json({ error: 'proyecto_id y tipo son obligatorios' });
  const { rows } = await query(
    `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM rendiciones WHERE proyecto_id = $1 AND tipo = $2`,
    [proyecto_id, tipo]
  );
  res.json({ siguiente: rows[0].siguiente });
});

// GET /api/rendiciones/:id (con sus comprobantes)
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
  const { proyecto_id, tipo, fecha, notas } = req.body;
  if (!proyecto_id) return res.status(400).json({ error: 'proyecto_id es obligatorio' });
  if (!tipo?.trim()) return res.status(400).json({ error: 'El tipo es obligatorio' });
  if (!fecha) return res.status(400).json({ error: 'La fecha es obligatoria' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `SELECT id FROM rendiciones WHERE proyecto_id = $1 AND tipo = $2 FOR UPDATE`,
      [proyecto_id, tipo.trim().toUpperCase()]
    );
    const { rows: numRows } = await client.query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente FROM rendiciones WHERE proyecto_id = $1 AND tipo = $2`,
      [proyecto_id, tipo.trim().toUpperCase()]
    );
    const numero = numRows[0].siguiente;

    const { rows } = await client.query(
      `INSERT INTO rendiciones (proyecto_id, tipo, numero, fecha, notas)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [proyecto_id, tipo.trim().toUpperCase(), numero, fecha, notas || null]
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
    `UPDATE rendiciones SET fecha=COALESCE($1, fecha), estado=COALESCE($2, estado), notas=$3, updated_at=NOW()
     WHERE id=$4 RETURNING *`,
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

// POST /api/rendiciones/:id/comprobantes
router.post('/:id/comprobantes', async (req, res) => {
  const { descripcion, numero_comprobante, moneda, monto_neto, iva, iibb, proveedor } = req.body;
  if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es obligatoria' });
  const neto = Number(monto_neto || 0);
  const ivaNum = Number(iva || 0);
  const iibbNum = Number(iibb || 0);
  const total = neto + ivaNum + iibbNum;

  const { rows: ordenRows } = await query(
    `SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM rendicion_comprobantes WHERE rendicion_id = $1`,
    [req.params.id]
  );

  const { rows } = await query(
    `INSERT INTO rendicion_comprobantes
       (rendicion_id, orden, descripcion, numero_comprobante, moneda, monto_neto, iva, iibb, monto_total, proveedor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [req.params.id, ordenRows[0].siguiente, descripcion.trim(), numero_comprobante || null,
     moneda || 'ARS', neto, ivaNum, iibbNum, total, proveedor?.trim() || null]
  );
  res.status(201).json(rows[0]);
});

// PUT /api/rendiciones/comprobantes/:comprobanteId
router.put('/comprobantes/:comprobanteId', async (req, res) => {
  const { descripcion, numero_comprobante, moneda, monto_neto, iva, iibb, proveedor } = req.body;
  if (!descripcion?.trim()) return res.status(400).json({ error: 'La descripción es obligatoria' });
  const neto = Number(monto_neto || 0);
  const ivaNum = Number(iva || 0);
  const iibbNum = Number(iibb || 0);
  const total = neto + ivaNum + iibbNum;

  const { rows } = await query(
    `UPDATE rendicion_comprobantes
     SET descripcion=$1, numero_comprobante=$2, moneda=$3, monto_neto=$4, iva=$5, iibb=$6, monto_total=$7, proveedor=$8
     WHERE id=$9 RETURNING *`,
    [descripcion.trim(), numero_comprobante || null, moneda || 'ARS', neto, ivaNum, iibbNum, total, proveedor?.trim() || null, req.params.comprobanteId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Comprobante no encontrado' });
  res.json(rows[0]);
});

// DELETE /api/rendiciones/comprobantes/:comprobanteId
router.delete('/comprobantes/:comprobanteId', async (req, res) => {
  const { rows } = await query(`DELETE FROM rendicion_comprobantes WHERE id=$1 RETURNING id`, [req.params.comprobanteId]);
  if (!rows[0]) return res.status(404).json({ error: 'Comprobante no encontrado' });
  res.status(204).send();
});

// GET /api/rendiciones/:id/pdf
router.get('/:id/pdf', async (req, res) => {
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
      const anio = f.getUTCFullYear();
      const mes = String(f.getUTCMonth() + 1).padStart(2, '0');
      const dia = String(f.getUTCDate()).padStart(2, '0');
      fechaStr = `${anio}-${mes}-${dia}`;
    } else {
      fechaStr = String(f).slice(0, 10);
    }
    const d = new Date(fechaStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-AR');
  };

  const margenIzq = 30;
  const anchoTotal = doc.page.width - 60;
  const cols = [
    { x: margenIzq, w: 280 },
    { x: margenIzq + 280, w: 110 },
    { x: margenIzq + 390, w: 110 },
    { x: margenIzq + 500, w: 90 },
    { x: margenIzq + 590, w: anchoTotal - 590 },
  ];

  doc.fontSize(13).font('Helvetica-Bold').fillColor('#000')
    .text(rendicion.cliente_nombre.toUpperCase(), margenIzq, 30);
  doc.moveDown(1.2);
  doc.fontSize(11).font('Helvetica').text('OBRA', margenIzq);
  doc.fontSize(22).font('Helvetica-Bold')
    .text(`${rendicion.tipo}${rendicion.numero}`, cols[4].x, 30, { width: cols[4].w, align: 'right' });
  doc.moveDown(1.5);
  doc.fontSize(10).font('Helvetica').text(fmtFecha(rendicion.fecha), margenIzq, doc.y);
  doc.moveDown(0.8);

  const porMoneda = { ARS: [], USD: [] };
  comprobantes.forEach(c => { porMoneda[c.moneda]?.push(c); });

  // Paleta de colores para diferenciar proveedores
  const paletaColores = ['#dbe9f5', '#fce4d6', '#e2efda', '#fff2cc', '#d9d2e9', '#f4cccc', '#d0e0e3', '#fce5cd'];
  const coloresPorProveedor = {};
  let siguienteColor = 0;
  const obtenerColor = (proveedor) => {
    const clave = proveedor || '__sin_proveedor__';
    if (!coloresPorProveedor[clave]) {
      coloresPorProveedor[clave] = paletaColores[siguienteColor % paletaColores.length];
      siguienteColor++;
    }
    return coloresPorProveedor[clave];
  };

  let y = doc.y;
  const altoFila = 20;

  ['ARS', 'USD'].forEach(moneda => {
    const lista = porMoneda[moneda];
    if (!lista.length) return;

    if (y > 480) { doc.addPage(); y = 30; }

    if (moneda === 'USD') {
      doc.rect(margenIzq, y, anchoTotal, altoFila).fillAndStroke('#fff', '#ccc');
      doc.fillColor('#000').fontSize(10).font('Helvetica-Bold').text('USD', cols[0].x + 4, y + 5);
      y += altoFila;
    }

    lista.forEach((c) => {
      if (y > 520) { doc.addPage(); y = 30; }
      const fondo = obtenerColor(c.proveedor);

      doc.rect(margenIzq, y, anchoTotal, altoFila).fillAndStroke(fondo, '#bbb');
      cols.slice(1).forEach(c2 => {
        doc.moveTo(c2.x, y).lineTo(c2.x, y + altoFila).strokeColor('#bbb').stroke();
      });

      const esNegativo = Number(c.monto_total) < 0;
      doc.fillColor('#000').fontSize(8).font('Helvetica');
      doc.text(c.descripcion, cols[0].x + 4, y + 6, { width: cols[0].w - 8, ellipsis: true });
      doc.text(c.numero_comprobante || '', cols[1].x + 4, y + 6, { width: cols[1].w - 8 });

      doc.fillColor(esNegativo ? '#c00000' : '#000');
      doc.text(fmtMonto(c.monto_neto, moneda), cols[2].x, y + 6, { width: cols[2].w - 6, align: 'right' });

      const impuestos = Number(c.iva) + Number(c.iibb);
      doc.fillColor('#000');
      doc.text(impuestos !== 0 ? fmtMonto(impuestos, moneda) : '', cols[3].x, y + 6, { width: cols[3].w - 6, align: 'right' });

      doc.fillColor(esNegativo ? '#c00000' : '#000').font('Helvetica-Bold');
      doc.text(fmtMonto(c.monto_total, moneda), cols[4].x, y + 6, { width: cols[4].w - 6, align: 'right' });

      y += altoFila;
    });

    const total = lista.reduce((s, c) => s + Number(c.monto_total), 0);
    doc.rect(margenIzq, y, anchoTotal, altoFila).fillAndStroke('#fff', '#bbb');
    cols.slice(1).forEach(c2 => {
      doc.moveTo(c2.x, y).lineTo(c2.x, y + altoFila).strokeColor('#bbb').stroke();
    });
    doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
    doc.text('Total', cols[3].x, y + 6, { width: cols[3].w - 6, align: 'right' });
    doc.rect(cols[4].x, y, cols[4].w, altoFila).fillAndStroke('#d9d9d9', '#bbb');
    doc.fillColor('#000');
    doc.text(fmtMonto(total, moneda), cols[4].x, y + 6, { width: cols[4].w - 6, align: 'right' });

    y += altoFila + 14;
  });

  doc.end();
});

module.exports = router;
