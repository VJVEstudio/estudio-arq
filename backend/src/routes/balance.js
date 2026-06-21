const express = require('express');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

function calcularTransferenciasMinimas(saldos, socios, monedas) {
  const resultado = [];
  monedas.forEach(moneda => {
    const acreedores = socios
      .filter(s => saldos[s.id][moneda] > 0.01)
      .map(s => ({ id: s.id, nombre: s.nombre, monto: saldos[s.id][moneda] }));
    const deudores = socios
      .filter(s => saldos[s.id][moneda] < -0.01)
      .map(s => ({ id: s.id, nombre: s.nombre, monto: Math.abs(saldos[s.id][moneda]) }));
    let i = 0, j = 0;
    const acr = acreedores.map(a => ({ ...a }));
    const deu = deudores.map(d => ({ ...d }));
    while (i < deu.length && j < acr.length) {
      const monto = Math.min(deu[i].monto, acr[j].monto);
      if (monto > 0.01) {
        resultado.push({
          de:    { id: deu[i].id, nombre: deu[i].nombre },
          para:  { id: acr[j].id, nombre: acr[j].nombre },
          monto: Math.round(monto * 100) / 100,
          moneda,
        });
      }
      deu[i].monto -= monto;
      acr[j].monto -= monto;
      if (deu[i].monto < 0.01) i++;
      if (acr[j].monto < 0.01) j++;
    }
  });
  return resultado;
}

router.get('/', async (req, res) => {
  try {
    const { rows: socios } = await query(
      `SELECT * FROM socios WHERE activo = TRUE ORDER BY nombre`
    );

    const monedas = ['ARS', 'USD'];
    const saldos = {};
    socios.forEach(s => { saldos[s.id] = { ARS: 0, USD: 0, nombre: s.nombre }; });

    // ===== EGRESOS =====
    // Si un socio pagó de su bolsillo: él tiene saldo A FAVOR (le deben)
    // Los demás tienen saldo EN CONTRA por su parte proporcional
    const { rows: egresosSocio } = await query(
      `SELECT id, monto, moneda, socio_id
       FROM egresos
       WHERE pagado_por_estudio = FALSE`
    );

    for (const egreso of egresosSocio) {
      const { rows: distribucion } = await query(
        `SELECT socio_id, monto_adeudado
         FROM egreso_socios
         WHERE egreso_id = $1`,
        [egreso.id]
      );
      // El que pagó recibe el monto completo a favor
      if (saldos[egreso.socio_id]) {
        saldos[egreso.socio_id][egreso.moneda] += Number(egreso.monto);
      }
      // Cada socio (incluyendo el que pagó) debe su parte proporcional
      distribucion.forEach(d => {
        if (saldos[d.socio_id]) {
          saldos[d.socio_id][egreso.moneda] -= Number(d.monto_adeudado);
        }
      });
    }

    // ===== INGRESOS =====
    // Si un socio cobró personalmente: él tiene saldo EN CONTRA (debe)
    // porque tiene plata que no es 100% suya.
    // Los demás tienen saldo A FAVOR por su parte proporcional.
    const { rows: ingresosSocio } = await query(
      `SELECT id, monto, moneda, socio_id
       FROM ingresos
       WHERE es_del_estudio = FALSE`
    );

    for (const ingreso of ingresosSocio) {
      const { rows: distribucion } = await query(
        `SELECT socio_id, monto_asignado
         FROM ingreso_socios
         WHERE ingreso_id = $1`,
        [ingreso.id]
      );
      // El que cobró debe el monto completo (tiene la plata física)
      if (saldos[ingreso.socio_id]) {
        saldos[ingreso.socio_id][ingreso.moneda] -= Number(ingreso.monto);
      }
      // Cada socio (incluyendo el que cobró) recibe su parte proporcional a favor
      distribucion.forEach(d => {
        if (saldos[d.socio_id]) {
          saldos[d.socio_id][ingreso.moneda] += Number(d.monto_asignado);
        }
      });
    }

    // ===== LIQUIDACIONES =====
    // Transferencias ya realizadas entre socios para saldar cuentas
    const { rows: liquidaciones } = await query(
      `SELECT socio_pagador_id, socio_receptor_id, moneda, SUM(monto) AS total
       FROM liquidaciones GROUP BY socio_pagador_id, socio_receptor_id, moneda`
    );
    liquidaciones.forEach(l => {
      if (saldos[l.socio_pagador_id])  saldos[l.socio_pagador_id][l.moneda]  += Number(l.total);
      if (saldos[l.socio_receptor_id]) saldos[l.socio_receptor_id][l.moneda] -= Number(l.total);
    });

    const transferencias = calcularTransferenciasMinimas(saldos, socios, monedas);

    res.json({
      socios: socios.map(s => ({
        ...s,
        saldo_ARS: Math.round(saldos[s.id].ARS * 100) / 100,
        saldo_USD: Math.round(saldos[s.id].USD * 100) / 100,
      })),
      transferencias,
    });
  } catch (err) {
    console.error('Error calculando balance:', err);
    res.status(500).json({ error: 'Error al calcular el balance' });
  }
});

router.get('/liquidaciones', async (req, res) => {
  const { rows } = await query(
    `SELECT l.*, sp.nombre AS socio_pagador_nombre, sr.nombre AS socio_receptor_nombre
     FROM liquidaciones l
     JOIN socios sp ON sp.id = l.socio_pagador_id
     JOIN socios sr ON sr.id = l.socio_receptor_id
     ORDER BY l.fecha DESC, l.created_at DESC`
  );
  res.json(rows);
});

router.post('/liquidaciones', async (req, res) => {
  const { socio_pagador_id, socio_receptor_id, monto, moneda, fecha, descripcion } = req.body;
  if (!socio_pagador_id)  return res.status(400).json({ error: 'socio_pagador_id es obligatorio' });
  if (!socio_receptor_id) return res.status(400).json({ error: 'socio_receptor_id es obligatorio' });
  if (socio_pagador_id === socio_receptor_id) return res.status(400).json({ error: 'Los socios deben ser distintos' });
  if (!monto || monto <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
  if (!moneda) return res.status(400).json({ error: 'La moneda es obligatoria' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO liquidaciones (socio_pagador_id, socio_receptor_id, monto, moneda, fecha, descripcion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [socio_pagador_id, socio_receptor_id, monto, moneda,
       fecha || new Date().toISOString().split('T')[0], descripcion || null]
    );
    await client.query(
      `INSERT INTO audit_log (usuario_id, tabla, operacion, registro_id, datos_nuevos)
       VALUES ($1, 'liquidaciones', 'INSERT', $2, $3)`,
      [req.usuario.id, rows[0].id, JSON.stringify(rows[0])]
    );
    await client.query('COMMIT');
    const { rows: completo } = await client.query(
      `SELECT l.*, sp.nombre AS socio_pagador_nombre, sr.nombre AS socio_receptor_nombre
       FROM liquidaciones l
       JOIN socios sp ON sp.id = l.socio_pagador_id
       JOIN socios sr ON sr.id = l.socio_receptor_id
       WHERE l.id = $1`,
      [rows[0].id]
    );
    res.status(201).json(completo[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error registrando liquidación:', err);
    res.status(500).json({ error: 'Error al registrar la liquidación' });
  } finally {
    client.release();
  }
});

router.delete('/liquidaciones/:id', async (req, res) => {
  const { rows } = await query(
    `DELETE FROM liquidaciones WHERE id=$1 RETURNING id`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Liquidación no encontrada' });
  res.status(204).send();
});

module.exports = router;
