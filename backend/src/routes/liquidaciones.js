// Historial de liquidaciones de horas de los dibujantes: revisión y corrección.
const express = require('express');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');
const { repartirLiquidacion, descripcionLiquidacion } = require('../utils/repartoLiquidacion');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

const cent = (n) => Math.round(Number(n || 0) * 100);
const pesos = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const iso = (f) => (f ? (f instanceof Date ? f.toISOString() : String(f)).slice(0, 10) : null);

// Tarifa de una liquidación: la guardada o, en las viejas que no la tienen,
// (total − monotributo) / horas.
const TARIFA_LIQ = `COALESCE(l.tarifa_aplicada,
  (l.monto_total - COALESCE(l.monotributo_monto, 0)) / NULLIF(l.horas_totales, 0))`;

// Egresos que creó la liquidación: comparten destinatario, fecha y descripción con
// el egreso que guarda la liquidación (uno por proyecto).
const EGRESOS_DE = (base) => `e.destinatario_id = ${base}.destinatario_id AND e.fecha = ${base}.fecha
  AND e.categoria = 'dibujantes' AND COALESCE(e.descripcion, '') = COALESCE(${base}.descripcion, '')`;

// Tarifa vigente en una fecha, según el historial de tarifas del dibujante
function tarifaVigente(historial, fecha, actual) {
  if (!historial.length) return Number(actual);
  let vigente = null;
  for (const h of historial) if (h.fecha <= fecha) vigente = Number(h.tarifa_nueva);
  if (vigente !== null) return vigente;
  const primero = historial[0];
  return Number(primero.tarifa_anterior) > 0 ? Number(primero.tarifa_anterior) : Number(primero.tarifa_nueva);
}

async function tablasBancoExisten() {
  const { rows: [r] } = await query(`SELECT to_regclass('public.banco_movimiento_egresos') IS NOT NULL AS ok`);
  return r.ok;
}

// ── Listado ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { dibujante_id, desde, hasta } = req.query;
    const params = [];
    const cond = ['TRUE'];
    if (dibujante_id) { params.push(dibujante_id); cond.push(`l.dibujante_id = $${params.length}`); }
    // Período de la liquidación (mes/año) dentro del rango pedido
    if (desde) { params.push(desde); cond.push(`make_date(l.anio, l.mes, 1) >= date_trunc('month', $${params.length}::date)`); }
    if (hasta) { params.push(hasta); cond.push(`make_date(l.anio, l.mes, 1) <= $${params.length}::date`); }

    const { rows: liqs } = await query(
      `SELECT l.id, l.dibujante_id, d.nombre AS dibujante, d.tarifa_hora_base AS tarifa_actual,
              l.mes, l.anio, l.horas_totales, l.monto_total, COALESCE(l.monotributo_monto, 0) AS monotributo,
              ${TARIFA_LIQ} AS tarifa, (l.tarifa_aplicada IS NULL) AS tarifa_deducida,
              l.fecha_desde, l.fecha_hasta, l.created_at, base.fecha AS fecha_liquidacion,
              eg.ids AS egreso_ids, eg.suma AS suma_egresos
       FROM liquidaciones_dibujantes l
       JOIN dibujantes d ON d.id = l.dibujante_id
       LEFT JOIN egresos base ON base.id = l.egreso_id
       LEFT JOIN LATERAL (
         SELECT json_agg(e.id) AS ids, SUM(e.monto) AS suma FROM egresos e WHERE ${EGRESOS_DE('base')}
       ) eg ON base.id IS NOT NULL
       WHERE ${cond.join(' AND ')}
       ORDER BY l.anio DESC, l.mes DESC, d.nombre ASC`,
      params
    );
    if (!liqs.length) return res.json([]);

    const ids = liqs.map(l => l.id);
    const dibIds = [...new Set(liqs.map(l => l.dibujante_id))];
    const [{ rows: horas }, { rows: historial }] = await Promise.all([
      query(
        `SELECT h.liquidacion_id, h.fecha, h.horas, h.descripcion_tarea, h.proyecto_id, p.nombre AS proyecto
         FROM horas_dibujantes h LEFT JOIN proyectos p ON p.id = h.proyecto_id
         WHERE h.liquidacion_id::text = ANY($1) ORDER BY h.fecha ASC`, [ids.map(String)]),
      query(
        `SELECT dibujante_id, tarifa_anterior, tarifa_nueva, fecha_ajuste::date AS fecha
         FROM tarifa_historial WHERE dibujante_id::text = ANY($1) ORDER BY fecha_ajuste ASC`, [dibIds.map(String)])
        .catch(() => ({ rows: [] })),
    ]);

    // Pagos del banco vinculados (si se usa la pantalla Banco)
    let pagos = [];
    if (await tablasBancoExisten()) {
      ({ rows: pagos } = await query(
        `SELECT bm.id, bm.fecha, bm.importe, bm.liquidacion_id, COALESCE(json_agg(x.egreso_id) FILTER (WHERE x.egreso_id IS NOT NULL), '[]') AS egreso_ids
         FROM banco_movimientos bm LEFT JOIN banco_movimiento_egresos x ON x.banco_movimiento_id = bm.id
         WHERE bm.liquidacion_id IS NOT NULL OR x.egreso_id IS NOT NULL
         GROUP BY bm.id`));
    }

    const resultado = liqs.map(l => {
      const hs = horas.filter(h => String(h.liquidacion_id) === String(l.id))
        .map(h => ({ ...h, fecha: iso(h.fecha) }));
      const hist = historial.filter(h => String(h.dibujante_id) === String(l.dibujante_id))
        .map(h => ({ ...h, fecha: iso(h.fecha) }));
      const ultimoDia = iso(new Date(Date.UTC(l.anio, l.mes, 0)));
      const primerDia = `${l.anio}-${String(l.mes).padStart(2, '0')}-01`;
      const vigenteCierre = tarifaVigente(hist, ultimoDia, l.tarifa_actual);
      // Valor "día por día": cada carga a la tarifa vigente en su fecha
      const montoDiaPorDia = hs.length
        ? hs.reduce((s, h) => s + Number(h.horas) * tarifaVigente(hist, h.fecha, l.tarifa_actual), 0)
        : null;
      const cambiosEnPeriodo = hist.filter(h => h.fecha >= primerDia && h.fecha <= ultimoDia && Number(h.tarifa_anterior) > 0)
        .map(h => ({ fecha: h.fecha, de: Number(h.tarifa_anterior), a: Number(h.tarifa_nueva) }));
      // Liquidada después de un aumento posterior al período
      const cambiosDespues = hist.filter(h => h.fecha > ultimoDia && l.fecha_liquidacion && h.fecha <= iso(l.fecha_liquidacion))
        .map(h => ({ fecha: h.fecha, de: Number(h.tarifa_anterior), a: Number(h.tarifa_nueva) }));

      const porProyecto = {};
      hs.forEach(h => {
        const k = h.proyecto_id || 'sin';
        porProyecto[k] = porProyecto[k] || { proyecto: h.proyecto || 'Sin proyecto', horas: 0 };
        porProyecto[k].horas += Number(h.horas);
      });

      const egIds = (l.egreso_ids || []).map(String);
      const pago = pagos.find(p => String(p.liquidacion_id) === String(l.id)
        || (p.egreso_ids || []).some(id => egIds.includes(String(id))));

      const alertas = [];
      if (cent(l.tarifa) !== cent(vigenteCierre)) {
        alertas.push({ tipo: 'tarifa', texto: `Tarifa ${pesos(l.tarifa)}/h distinta a la vigente al cierre del período (${pesos(vigenteCierre)}/h)` });
      }
      if (l.egreso_ids && cent(l.suma_egresos) !== cent(l.monto_total)) {
        alertas.push({ tipo: 'egresos', texto: 'Los egresos no suman el total liquidado' });
      }
      if (pago && cent(-pago.importe) !== cent(l.monto_total)) {
        alertas.push({ tipo: 'banco', texto: `Diferencia con la transferencia: ${pesos((cent(l.monto_total) - cent(-pago.importe)) / 100)}` });
      }
      return {
        ...l,
        horas_totales: Number(l.horas_totales), monto_total: Number(l.monto_total), monotributo: Number(l.monotributo),
        tarifa: Number(l.tarifa), tarifa_actual: Number(l.tarifa_actual), suma_egresos: l.suma_egresos === null ? null : Number(l.suma_egresos),
        fecha_liquidacion: iso(l.fecha_liquidacion), created_at: l.created_at,
        tarifa_vigente_cierre: vigenteCierre,
        tarifa_dia_por_dia: montoDiaPorDia && Number(l.horas_totales) ? montoDiaPorDia / Number(l.horas_totales) : null,
        monto_dia_por_dia: montoDiaPorDia,
        cambios_en_periodo: cambiosEnPeriodo,
        cambios_antes_de_liquidar: cambiosDespues,
        por_proyecto: Object.values(porProyecto),
        horas: hs,
        pago: pago ? { fecha: iso(pago.fecha), importe: -Number(pago.importe) } : null,
        alertas,
      };
    });
    res.json(resultado);
  } catch (err) {
    console.error('Error listando liquidaciones:', err);
    res.status(500).json({ error: `Error al cargar las liquidaciones: ${err.message}` });
  }
});

// ── Corregir tarifa y/o monotributo ──────────────────────────────────────────
// Recalcula el total y los egresos por proyecto (mismo reparto que al liquidar),
// y vuelve a distribuir esos egresos entre los socios.
router.put('/:id', async (req, res) => {
  const tarifa = Number(req.body.tarifa);
  const monotributo = Number(req.body.monotributo ?? 0);
  if (!(tarifa > 0)) return res.status(400).json({ error: 'La tarifa debe ser mayor a 0' });
  if (!(monotributo >= 0)) return res.status(400).json({ error: 'El monotributo no puede ser negativo' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [l] } = await client.query(`SELECT * FROM liquidaciones_dibujantes WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!l) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Liquidación no encontrada' }); }

    const { rows: horas } = await client.query(
      `SELECT proyecto_id, SUM(horas) AS horas FROM horas_dibujantes WHERE liquidacion_id = $1 GROUP BY proyecto_id`, [l.id]);
    if (!horas.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No se encuentran las horas de esta liquidación; no se puede recalcular por proyecto.' });
    }
    const porProyecto = {};
    horas.forEach(h => { porProyecto[h.proyecto_id] = Number(h.horas); });
    const { horasTotales, montoTotal, montos } = repartirLiquidacion(porProyecto, tarifa, monotributo);
    const descripcion = descripcionLiquidacion(l.mes, l.anio, monotributo);

    // Egresos actuales de la liquidación
    let egresos = [];
    let base = null;
    if (l.egreso_id) {
      ({ rows: [base] } = await client.query(`SELECT * FROM egresos WHERE id = $1`, [l.egreso_id]));
      if (base) {
        ({ rows: egresos } = await client.query(
          `SELECT * FROM egresos e WHERE e.destinatario_id = $1 AND e.fecha = $2 AND e.categoria = 'dibujantes'
             AND COALESCE(e.descripcion, '') = COALESCE($3, '')`, [base.destinatario_id, base.fecha, base.descripcion]));
      }
    }

    const actualizados = [];
    const usados = new Set();
    for (const [pid, monto] of montos) {
      const e = egresos.find(x => String(x.proyecto_id) === String(pid) && !usados.has(x.id));
      if (e) {
        usados.add(e.id);
        await client.query(`UPDATE egresos SET monto = $1, descripcion = $2 WHERE id = $3`, [monto, descripcion, e.id]);
        actualizados.push(e.id);
      } else if (base) {
        const { rows: [nuevo] } = await client.query(
          `INSERT INTO egresos (destinatario_id, proyecto_id, categoria, monto, moneda, pagado_por_estudio, socio_id, fecha, descripcion)
           VALUES ($1, $2, 'dibujantes', $3, 'ARS', $4, $5, $6, $7) RETURNING id`,
          [base.destinatario_id, pid === 'null' ? null : pid, monto, base.pagado_por_estudio, base.socio_id, base.fecha, descripcion]);
        actualizados.push(nuevo.id);
      }
    }
    // Egresos de proyectos que ya no tienen horas en la liquidación
    for (const e of egresos.filter(x => !usados.has(x.id))) {
      await client.query(`DELETE FROM egresos WHERE id = $1`, [e.id]);
    }
    for (const id of actualizados) {
      await client.query(`DELETE FROM egreso_socios WHERE egreso_id = $1`, [id]);
      await client.query(`SELECT distribuir_egreso($1)`, [id]);
    }
    const egresoBase = actualizados[0] || null;
    const { rows: [actualizada] } = await client.query(
      `UPDATE liquidaciones_dibujantes SET tarifa_aplicada = $1, monotributo_monto = $2, monto_total = $3,
         horas_totales = $4, egreso_id = COALESCE($5, egreso_id)
       WHERE id = $6 RETURNING *`,
      [tarifa, monotributo, montoTotal, horasTotales, egresoBase, l.id]);
    await client.query('COMMIT');
    res.json({ ...actualizada, egresos_actualizados: actualizados.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error corrigiendo liquidación:', err);
    res.status(500).json({ error: `Error al corregir la liquidación: ${err.message}` });
  } finally {
    client.release();
  }
});

module.exports = router;
