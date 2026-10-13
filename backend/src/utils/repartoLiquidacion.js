// Reparto del total de una liquidación de horas entre los proyectos.
// Cada proyecto: horas × tarifa + su parte del monotributo (proporcional a sus horas).
// Se calcula en centavos y la diferencia de redondeo va al último proyecto, así la
// suma de los egresos es exactamente el total liquidado.
function repartirLiquidacion(porProyecto, tarifa, monotributo) {
  const entradas = Object.entries(porProyecto); // [[proyecto_id, horas], ...]
  const horasTotales = entradas.reduce((s, [, h]) => s + Number(h), 0);
  const montoHoras = Math.round(horasTotales * tarifa * 100) / 100;
  const montoTotal = Math.round((montoHoras + Number(monotributo || 0)) * 100) / 100;
  const totalCent = Math.round(montoTotal * 100);
  let asignadoCent = 0;
  const montos = entradas.map(([pid, hs], i) => {
    let cent;
    if (i === entradas.length - 1) {
      cent = totalCent - asignadoCent;
    } else {
      const horasCent = Math.round(Number(hs) * tarifa * 100);
      const monoCent = horasTotales > 0 ? Math.round(Number(monotributo || 0) * 100 * (Number(hs) / horasTotales)) : 0;
      cent = horasCent + monoCent;
    }
    asignadoCent += cent;
    return [pid, cent / 100];
  });
  return { horasTotales, montoHoras, montoTotal, montos };
}

const descripcionLiquidacion = (mes, anio, monotributo) =>
  `Honorarios dibujante — ${mes}/${anio}${Number(monotributo) > 0 ? ' (incluye monotributo)' : ''}`;

module.exports = { repartirLiquidacion, descripcionLiquidacion };
