// Costo de las horas de un dibujante, con un único criterio para toda la app:
//  · Horas liquidadas → a la tarifa con la que se liquidaron (gasto real, fijo en el
//    tiempo; importante con inflación). Si una liquidación vieja no guardó la tarifa,
//    se deduce de su total sin monotributo dividido las horas. Además, cada hora lleva
//    su parte del monotributo de esa liquidación (monotributo × horas / horas
//    liquidadas), así el total por proyecto suma exactamente lo liquidado.
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
// Parte del monotributo de la liquidación que le corresponde a esta carga de horas
function monotributoSQL(h = 'h', l = 'l') {
  return `COALESCE(${l}.monotributo_monto * ${h}.horas / NULLIF(${l}.horas_totales, 0), 0)`;
}
// Solo horas × tarifa (sin monotributo): para pantallas que muestran el monotributo aparte
function costoTarifaSQL(h = 'h', d = 'd', l = 'l') {
  return `(${h}.horas * ${tarifaSQL(d, l)})`;
}
// Costo real: horas × tarifa + parte del monotributo (las horas sin liquidar no llevan)
function costoSQL(h = 'h', d = 'd', l = 'l') {
  return `(${costoTarifaSQL(h, d, l)} + ${monotributoSQL(h, l)})`;
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
module.exports = { tarifaSQL, costoSQL, costoTarifaSQL, monotributoSQL, joinLiqSQL, liquidadaSQL };
