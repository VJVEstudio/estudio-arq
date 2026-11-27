// Importación de egresos desde una planilla Excel.
// Columnas (en cualquier orden, la fila de títulos puede no ser la primera):
//   Fecha · Proyecto · Categoría · Destinatario · Monto · Moneda · Descripción · Pagó
// "Pagó" es "Estudio" o el nombre de un socio. Proyecto vacío = sin proyecto.
const multer = require('multer');
const { query } = require('../db');

const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('archivo');

const normalizar = (t) => String(t ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const CATEGORIAS = {
  servicios: 'servicios',
  impuestos: 'impuestos',
  generales: 'generales', 'gastos generales': 'generales',
  dibujantes: 'dibujantes',
  viaticos: 'viaticos',
};

const COLUMNAS = {
  fecha: ['fecha'],
  proyecto: ['proyecto', 'obra'],
  categoria: ['categoria'],
  destinatario: ['destinatario', 'proveedor'],
  monto: ['monto', 'importe'],
  moneda: ['moneda'],
  descripcion: ['descripcion', 'detalle'],
  pago: ['pago', 'pagado por', 'pago quien'],
};

// Valor de una celda de exceljs como texto/número/fecha simple
function valorCelda(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return valorCelda(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('');
    if ('text' in v) return v.text;
    return null;
  }
  return v;
}

function aFecha(v) {
  if (v instanceof Date) return v.toISOString().split('T')[0];
  if (typeof v === 'number') { // número de serie de Excel
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().split('T')[0];
  }
  const t = String(v ?? '').trim();
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function aMonto(v) {
  if (typeof v === 'number') return v;
  let t = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (!t) return null;
  // 1.234,56 (formato argentino) o 1234.56
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

async function leerPlanilla(buffer) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw new Error('El archivo no es un Excel (.xlsx) válido'); }

  for (const hoja of wb.worksheets) {
    // Busca la fila de títulos (la que tiene Fecha y Monto)
    let filaTitulos = null;
    let mapa = null;
    hoja.eachRow((row, n) => {
      if (filaTitulos) return;
      const m = {};
      row.eachCell((cell, col) => {
        const t = normalizar(valorCelda(cell.value));
        for (const [campo, nombres] of Object.entries(COLUMNAS)) {
          if (!m[campo] && nombres.includes(t)) m[campo] = col;
        }
      });
      if (m.fecha && m.monto) { filaTitulos = n; mapa = m; }
    });
    if (!filaTitulos) continue;

    const filas = [];
    hoja.eachRow((row, n) => {
      if (n <= filaTitulos) return;
      const leer = (campo) => (mapa[campo] ? valorCelda(row.getCell(mapa[campo]).value) : null);
      const cruda = {
        fila: n,
        fecha: leer('fecha'),
        proyecto: leer('proyecto'),
        categoria: leer('categoria'),
        destinatario: leer('destinatario'),
        monto: leer('monto'),
        moneda: leer('moneda'),
        descripcion: leer('descripcion'),
        pago: leer('pago'),
      };
      const vacia = ['fecha', 'monto', 'destinatario', 'descripcion'].every(k => cruda[k] == null || String(cruda[k]).trim() === '');
      if (vacia) return;
      if (cruda.fecha instanceof Date) cruda.fecha = cruda.fecha.toISOString().split('T')[0];
      filas.push(cruda);
    });
    return filas;
  }
  throw new Error('No encontré la fila de títulos (tiene que tener al menos "Fecha" y "Monto")');
}

// Resuelve nombres contra la base y valida. Devuelve cada fila lista para crear.
async function resolverFilas(crudas) {
  const [{ rows: proyectos }, { rows: socios }, { rows: destinatarios }] = await Promise.all([
    query('SELECT id, nombre FROM proyectos'),
    query('SELECT id, nombre FROM socios WHERE activo = TRUE'),
    query('SELECT id, nombre FROM destinatarios'),
  ]);

  const buscarProyecto = (nombre) => {
    const n = normalizar(nombre);
    const exacto = proyectos.filter(p => normalizar(p.nombre) === n);
    if (exacto.length === 1) return exacto[0];
    const parcial = proyectos.filter(p => normalizar(p.nombre).includes(n));
    return parcial.length === 1 ? parcial[0] : null;
  };
  const buscarSocio = (nombre) => {
    const n = normalizar(nombre);
    const exacto = socios.find(s => normalizar(s.nombre) === n);
    if (exacto) return exacto;
    const parcial = socios.filter(s => normalizar(s.nombre).split(' ').includes(n) || normalizar(s.nombre).startsWith(n));
    return parcial.length === 1 ? parcial[0] : null;
  };

  const filas = [];
  for (const c of crudas) {
    const errores = [];
    const fecha = aFecha(c.fecha);
    if (!fecha) errores.push('Fecha inválida');

    const monto = aMonto(c.monto);
    if (!monto || monto <= 0) errores.push('Monto inválido');

    const monedaTxt = normalizar(c.moneda || 'ARS');
    const moneda = ['usd', 'u$s', 'us$', 'dolar', 'dolares'].includes(monedaTxt) ? 'USD'
      : ['ars', '$', 'pesos', 'peso'].includes(monedaTxt) ? 'ARS' : null;
    if (!moneda) errores.push(`Moneda "${c.moneda}" no reconocida (ARS o USD)`);

    const categoria = CATEGORIAS[normalizar(c.categoria)] || null;
    if (!categoria) errores.push(c.categoria ? `Categoría "${c.categoria}" no reconocida` : 'Falta la categoría');

    let proyecto = null;
    if (c.proyecto && String(c.proyecto).trim()) {
      proyecto = buscarProyecto(c.proyecto);
      if (!proyecto) errores.push(`Proyecto "${c.proyecto}" no encontrado`);
    }

    const destNombre = String(c.destinatario ?? '').trim();
    if (!destNombre) errores.push('Falta el destinatario');
    const dest = destinatarios.find(d => normalizar(d.nombre) === normalizar(destNombre));

    let pagado_por_estudio = true;
    let socio = null;
    const pago = normalizar(c.pago);
    if (pago && pago !== 'estudio') {
      socio = buscarSocio(c.pago);
      if (socio) pagado_por_estudio = false;
      else errores.push(`Socio "${c.pago}" no encontrado`);
    }

    filas.push({
      fila: c.fila,
      cruda: c,
      fecha, monto, moneda, categoria,
      proyecto_id: proyecto?.id || null,
      proyecto_nombre: proyecto?.nombre || null,
      destinatario_id: dest?.id || null,
      destinatario_nombre: dest?.nombre || destNombre,
      destinatario_nuevo: !dest && !!destNombre,
      descripcion: c.descripcion ? String(c.descripcion).trim() : null,
      pagado_por_estudio,
      socio_id: socio?.id || null,
      socio_nombre: socio?.nombre || null,
      errores,
      posibles_duplicados: [],
    });
  }

  // Posibles duplicados: mismo monto y moneda, ±15 días, ya cargados en la app
  const validas = filas.filter(f => f.fecha && f.monto && f.moneda);
  if (validas.length) {
    const { rows } = await query(
      `SELECT e.id, e.fecha, e.monto, e.moneda, e.descripcion, d.nombre AS destinatario_nombre
       FROM egresos e JOIN destinatarios d ON d.id = e.destinatario_id
       WHERE e.fecha BETWEEN ($1::date - 15) AND ($2::date + 15)`,
      [validas.reduce((a, f) => (f.fecha < a ? f.fecha : a), validas[0].fecha),
       validas.reduce((a, f) => (f.fecha > a ? f.fecha : a), validas[0].fecha)]);
    for (const f of validas) {
      const t = new Date(f.fecha).getTime();
      f.posibles_duplicados = rows
        .filter(e => e.moneda === f.moneda && Math.abs(Number(e.monto) - f.monto) < 0.01
          && Math.abs(new Date(e.fecha).getTime() - t) <= 15 * 86400000)
        .map(e => ({ id: e.id, fecha: e.fecha, destinatario: e.destinatario_nombre, descripcion: e.descripcion }));
    }
  }

  const totales = { ARS: 0, USD: 0 };
  filas.forEach(f => { if (f.moneda && f.monto) totales[f.moneda] += f.monto; });
  return { filas, totales };
}

module.exports = { subida, leerPlanilla, resolverFilas, normalizar };
