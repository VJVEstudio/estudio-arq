// Agrupa los egresos que generó una misma liquidación de horas.
//
// Al liquidar, la app guarda un egreso por proyecto (así los reportes saben cuánto
// costó cada proyecto), pero para quien mira la lista es un solo pago al dibujante.
// Esta función los junta en una fila con el total; los egresos originales quedan en
// `items` para poder desplegarlos. Solo cambia la vista: no toca los datos.
//
// Se reconocen por: categoría 'dibujantes', descripción "Honorarios dibujante — …"
// (la que pone la liquidación), mismo destinatario, misma fecha y misma moneda.
const esDeLiquidacion = (e) =>
  e.categoria === 'dibujantes' && /^Honorarios dibujante — /.test(e.descripcion || '');

export function agruparLiquidaciones(lista, esEgreso = () => true) {
  const grupos = new Map();
  const resultado = [];
  for (const e of lista) {
    if (!esEgreso(e) || !esDeLiquidacion(e)) { resultado.push(e); continue; }
    const clave = [e.destinatario_id, String(e.fecha).slice(0, 10), e.descripcion, e.moneda].join('|');
    let g = grupos.get(clave);
    if (!g) {
      g = { ...e, id: `liq|${clave}`, _grupo: true, items: [] };
      grupos.set(clave, g);
      resultado.push(g);
    }
    g.items.push(e);
  }
  for (const g of grupos.values()) {
    const cent = g.items.reduce((a, x) => a + Math.round(Number(x.monto) * 100), 0);
    g.monto = cent / 100;
    const proyectos = [...new Set(g.items.map(x => x.proyecto_nombre).filter(Boolean))];
    g.proyectos = proyectos;
    g.proyecto_nombre = proyectos.length === 1 ? proyectos[0] : `${proyectos.length} proyectos`;
    g.periodo = (g.descripcion.match(/— (\d{1,2}\/\d{4})/) || [])[1] || '';
  }
  // Una liquidación de un solo proyecto se muestra como el egreso de siempre
  return resultado.map(r => (r._grupo && r.items.length === 1 ? r.items[0] : r));
}
