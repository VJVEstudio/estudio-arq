// Costo de las horas de un dibujante, con un único criterio para toda la app:
//  · Horas liquidadas → a la tarifa con la que se liquidaron (gasto real, fijo en el
//    tiempo; importante con inflación). Si una liquidación vieja no guardó la tarifa,
//    se deduce de su total sin monotributo dividido las horas. Además, cada hora lleva
//    su parte del monotributo de esa liquidación (monotributo × horas / horas
//    liquidadas), así el total por proyecto suma exactamente lo liquidado.
//  · Horas sin liquidar → a la tarifa actual del dibujante (lo que costarían si se
//    liquidaran hoy) más el monotributo mensual actual del dibujante repartido entre
//    las horas sin liquidar de ese mes (igual que haría la liquidación). Es un estimado
//    hasta que se liquiden; así el total muestra lo que hay que pagar.
//
// Uso: JOIN dibujantes d + LEFT JOIN de JOIN_LIQ, y COSTO / TARIFA en el SELECT.
// Los alias por defecto son h (horas_dibujantes), d (dibujantes), l (liquidación).
function tarifaSQL(d = 'd', l = 'l') {
  return `COALESCE(${l}.tarifa_aplicada,
    (${l}.monto_total - COALESCE(${l}.monotributo_monto, 0)) / NULLIF(${l}.horas_totales, 0),
    ${d}.tarifa_hora_base)`;
}
// Parte del monotributo que le corresponde a esta carga de horas:
//  · liquidada: su parte del monotributo de esa liquidación;
//  · sin liquidar: su parte del monotributo mensual actual del dibujante, repartido entre
//    las horas sin liquidar de ese mes (estimado).
function monotributoSQL(h = 'h', l = 'l', d = 'd') {
  return `COALESCE(CASE
    WHEN ${l}.id IS NOT NULL THEN ${l}.monotributo_monto * ${h}.horas / NULLIF(${l}.horas_totales, 0)
    WHEN ${d}.monotributo_activo THEN ${d}.monotributo_monto * ${h}.horas / NULLIF(${l}pm.pm_horas, 0)
  END, 0)`;
}
// Solo horas × tarifa (sin monotributo): para pantallas que muestran el monotributo aparte
function costoTarifaSQL(h = 'h', d = 'd', l = 'l') {
  return `(${h}.horas * ${tarifaSQL(d, l)})`;
}
// Costo: horas × tarifa + parte del monotributo (estimados en las horas sin liquidar)
function costoSQL(h = 'h', d = 'd', l = 'l') {
  return `(${costoTarifaSQL(h, d, l)} + ${monotributoSQL(h, l, d)})`;
}
// Se une solo con las columnas necesarias, para no generar ambigüedades con filtros
// existentes que usan nombres de columna sin tabla (por ejemplo, "fecha").
// También suma las horas sin liquidar de cada dibujante por mes (alias <l>pm), para
// repartir el monotributo estimado. Nombres de columna únicos (pm_*) por la misma razón.
function joinLiqSQL(h = 'h', l = 'l') {
  return `LEFT JOIN (SELECT id, tarifa_aplicada, monto_total, monotributo_monto, horas_totales
                     FROM liquidaciones_dibujantes) ${l} ON ${l}.id = ${h}.liquidacion_id
          LEFT JOIN (SELECT dibujante_id AS pm_dibujante, date_trunc('month', fecha) AS pm_mes, SUM(horas) AS pm_horas
                     FROM horas_dibujantes WHERE liquidacion_id IS NULL
                     GROUP BY dibujante_id, date_trunc('month', fecha)) ${l}pm
            ON ${h}.liquidacion_id IS NULL AND ${l}pm.pm_dibujante = ${h}.dibujante_id
           AND ${l}pm.pm_mes = date_trunc('month', ${h}.fecha)`;
}
// Liquidada de verdad: tiene liquidación asociada
function liquidadaSQL(l = 'l') {
  return `(${l}.id IS NOT NULL)`;
}
module.exports = { tarifaSQL, costoSQL, costoTarifaSQL, monotributoSQL, joinLiqSQL, liquidadaSQL };
