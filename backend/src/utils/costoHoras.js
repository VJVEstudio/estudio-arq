// Costo de las horas de un dibujante, con un único criterio para toda la app:
//  · Horas liquidadas → a la tarifa con la que se liquidaron (gasto real, fijo en el
//    tiempo; importante con inflación). Si una liquidación vieja no guardó la tarifa,
//    se deduce de su total sin monotributo dividido las horas.
//  · Horas sin liquidar → a la tarifa actual del dibujante (lo que costarían si se
//    liquidaran hoy; es un estimado hasta que se liquiden).
//
// Uso: JOIN dibujantes d + LEFT JOIN de JOIN_LIQ, y COSTO / TARIFA en el SELECT.
// Los alias por defecto son h (horas_dibujantes), d (dibujantes), l (liquidación).
function tarifaSQL(d = 'd', l = 'l') {
  return `COALESCE(${l}.tarifa_aplicada,
    (${l}.monto_total - COALESCE(${l}.monotributo_monto, 0)) / NULLIF(${l}.horas_totales, 0),
    ${d}.tarifa_hora_base)`;
}
function costoSQL(h = 'h', d = 'd', l = 'l') {
  return `(${h}.horas * ${tarifaSQL(d, l)})`;
}
// Se une solo con las columnas necesarias, para no generar ambigüedades con filtros
// existentes que usan nombres de columna sin tabla (por ejemplo, "fecha").
function joinLiqSQL(h = 'h', l = 'l') {
  return `LEFT JOIN (SELECT id, tarifa_aplicada, monto_total, monotributo_monto, horas_totales
                     FROM liquidaciones_dibujantes) ${l} ON ${l}.id = ${h}.liquidacion_id`;
}
// Liquidada de verdad: tiene liquidación asociada
function liquidadaSQL(l = 'l') {
  return `(${l}.id IS NOT NULL)`;
}
module.exports = { tarifaSQL, costoSQL, joinLiqSQL, liquidadaSQL };
