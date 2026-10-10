// Lector del resumen de "Últimos movimientos" de Banco Macro (PDF de home banking).
//
// Lee la tabla de forma exacta usando la posición de cada texto en la página
// (no usa IA), y después controla que los saldos cierren fila por fila:
// saldo de la fila anterior (más vieja) + importe = saldo de la fila.
// Si algo no cierra, lo informa en `errores` para que nadie importe datos dudosos.

let pdfjsPromise = null;
function cargarPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

const RE_FECHA = /^\d{2}\/\d{2}\/\d{4}$/;
const RE_MONTO = /^(-)?\s*\$\s*([\d.]+,\d{2})$/;

// "-$ 1.107.756,52" → -110775652 (centavos, entero, sin errores de redondeo)
function montoACentavos(texto) {
  const m = String(texto).replace(/\s+/g, ' ').trim().match(RE_MONTO);
  if (!m) return null;
  const centavos = Number(m[2].replace(/\./g, '').replace(',', ''));
  return m[1] ? -centavos : centavos;
}

function fechaISO(ddmmaaaa) {
  const [d, m, a] = ddmmaaaa.split('/');
  return `${a}-${m}-${d}`;
}

// Columnas por posición horizontal (en puntos PDF). El importe y el saldo están
// alineados a la derecha: se distinguen por dónde termina el texto.
const X_NRO = 100, X_DESC = 185, X_FIN_IMPORTE_MAX = 500;
const ENCABEZADOS = new Set(['Fecha', 'Nro.', 'Transacción', 'Descripción', 'Importe', 'Saldo']);

async function leerItems(buffer) {
  const pdfjs = await cargarPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false, verbosity: 0,
    }).promise;
  } catch (err) {
    throw new Error(err?.name === 'PasswordException'
      ? 'El PDF está protegido con contraseña.'
      : 'No se pudo abrir el PDF: el archivo parece dañado o no es un PDF válido.');
  }
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    paginas.push(tc.items
      .filter(it => it.str && it.str.trim())
      .map(it => ({ texto: it.str.trim(), x: it.transform[4], y: it.transform[5], fin: it.transform[4] + (it.width || 0) })));
  }
  await doc.destroy();
  return paginas;
}

async function leerResumenMacro(buffer) {
  const paginas = await leerItems(buffer);
  const todoTexto = paginas.flat().map(i => i.texto).join(' ');
  if (!/Últimos movimientos/i.test(todoTexto) || !/Nro\.?/.test(todoTexto) || !/Saldo/.test(todoTexto)) {
    throw new Error('El PDF no parece un resumen de "Últimos movimientos" de Banco Macro.');
  }
  const cuenta = (todoTexto.match(/N[úu]mero de cuenta\s+(\d+)/i) || [])[1] || null;

  const filas = [];
  for (const items of paginas) {
    // Las filas se anclan en la fecha (columna izquierda); el resto de los textos
    // se asigna a la fecha más cercana en altura, porque el PDF desplaza montos
    // y descripciones largas unos puntos arriba o abajo.
    const anclas = items.filter(i => i.x < X_NRO && RE_FECHA.test(i.texto)).sort((a, b) => b.y - a.y);
    if (!anclas.length) continue;
    // Todo lo que esté claramente por encima de la primera fecha es encabezado.
    const yEncabezado = anclas[0].y + 12;
    const grupos = anclas.map(a => ({ ancla: a, nro: [], desc: [], montos: [] }));
    for (const it of items) {
      if (anclas.includes(it) || it.y > yEncabezado || ENCABEZADOS.has(it.texto)) continue;
      let mejor = null, dist = Infinity;
      for (const g of grupos) {
        const d = Math.abs(g.ancla.y - it.y);
        if (d < dist) { dist = d; mejor = g; }
      }
      if (!mejor || dist > 20) continue;
      if (it.x >= X_NRO && it.x < X_DESC) mejor.nro.push(it);
      else if (it.x >= X_DESC && montoACentavos(it.texto) === null) mejor.desc.push(it);
      else if (montoACentavos(it.texto) !== null) mejor.montos.push(it);
    }
    for (const g of grupos) {
      const importeItem = g.montos.find(m => m.fin < X_FIN_IMPORTE_MAX);
      const saldoItem = g.montos.find(m => m.fin >= X_FIN_IMPORTE_MAX);
      const desc = g.desc.sort((a, b) => b.y - a.y || a.x - b.x).map(d => d.texto).join(' ')
        .replace(/-\s+(\d)/g, '-$1').replace(/\s+/g, ' ').trim();
      filas.push({
        fecha: fechaISO(g.ancla.texto),
        nro_transaccion: g.nro.map(n => n.texto).join('') || null,
        descripcion: desc,
        importe_cent: importeItem ? montoACentavos(importeItem.texto) : null,
        saldo_cent: saldoItem ? montoACentavos(saldoItem.texto) : null,
      });
    }
  }

  // ── Controles ──────────────────────────────────────────────────────────────
  // El resumen viene del más nuevo al más viejo.
  const errores = [];
  filas.forEach((f, i) => {
    if (f.importe_cent === null || f.saldo_cent === null) {
      errores.push(`Fila ${i + 1} (${f.fecha} ${f.descripcion}): no se pudo leer el importe o el saldo.`);
    }
  });
  for (let i = 0; i < filas.length - 1; i++) {
    const nueva = filas[i], vieja = filas[i + 1];
    if ([nueva.importe_cent, nueva.saldo_cent, vieja.saldo_cent].includes(null)) continue;
    if (vieja.saldo_cent + nueva.importe_cent !== nueva.saldo_cent) {
      errores.push(`El saldo no cierra entre ${vieja.fecha} y ${nueva.fecha} (${nueva.descripcion}).`);
    }
  }

  const movimientos = filas.map(f => ({
    ...f,
    importe: f.importe_cent === null ? null : f.importe_cent / 100,
    saldo: f.saldo_cent === null ? null : f.saldo_cent / 100,
  }));
  const masViejo = filas[filas.length - 1], masNuevo = filas[0];
  return {
    banco: 'Macro',
    cuenta_final: cuenta ? cuenta.slice(-4) : null,
    desde: masViejo?.fecha || null,
    hasta: masNuevo?.fecha || null,
    saldo_inicial: masViejo && masViejo.saldo_cent !== null && masViejo.importe_cent !== null
      ? (masViejo.saldo_cent - masViejo.importe_cent) / 100 : null,
    saldo_final: masNuevo?.saldo_cent != null ? masNuevo.saldo_cent / 100 : null,
    movimientos,
    errores,
  };
}

module.exports = { leerResumenMacro, montoACentavos };
