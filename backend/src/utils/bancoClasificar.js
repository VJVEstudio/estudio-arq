// Clasifica un movimiento del resumen bancario y sugiere qué hacer con él.
// Es solo una sugerencia: nada se guarda como ingreso/egreso sin confirmación.

// Valida un CUIT/CUIL argentino con su dígito verificador.
function cuitValido(cuit) {
  const d = String(cuit).replace(/\D/g, '');
  if (d.length !== 11 || !/^(20|23|24|27|30|33|34)/.test(d)) return false;
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === Number(d[10]);
}

// Busca un CUIT válido dentro de la descripción (el último que aparezca).
function extraerCuit(descripcion) {
  const candidatos = String(descripcion || '').match(/\d{11}/g) || [];
  for (let i = candidatos.length - 1; i >= 0; i--) {
    if (cuitValido(candidatos[i])) return candidatos[i];
  }
  // Números largos pegados (ej: TRANSF:26100900...-23418885319): mirar los últimos 11 dígitos
  const largos = String(descripcion || '').match(/\d{12,}/g) || [];
  for (const l of largos.reverse()) if (cuitValido(l.slice(-11))) return l.slice(-11);
  return null;
}

// Devuelve { clase, sugerencia, categoria, destinatario_sugerido, cuit }
//   clase: 'inversion' | 'ingreso' | 'egreso'
//   categoria: categoría de egreso sugerida (servicios | impuestos | generales | dibujantes)
function clasificarMovimiento({ descripcion, importe }) {
  const d = String(descripcion || '').toUpperCase();
  const cuit = extraerCuit(descripcion);
  const base = { cuit, categoria: null, destinatario_sugerido: null };

  // Fondos de inversión: suscripción (sale al fondo) o rescate (vuelve a la cuenta)
  if (/\b(LIQ|SOL)\.(SUSC|RESC)\b/.test(d)) {
    return { ...base, clase: 'inversion', detalle: /SUSC/.test(d) ? 'Suscripción a fondo' : 'Rescate de fondo' };
  }
  // Intereses de la cuenta
  if (/CAPITALIZACION/.test(d)) {
    return { ...base, clase: 'inversion', detalle: 'Intereses de la cuenta' };
  }

  if (importe > 0) return { ...base, clase: 'ingreso' };

  // Egresos con categoría reconocible
  if (/IMP\.?\s*AFIP|AFIP|ARCA/.test(d)) {
    return { ...base, clase: 'egreso', categoria: 'impuestos', destinatario_sugerido: 'AFIP' };
  }
  if (/COMISION|MANT(\.|ENIMIENTO)|IVA\b|PERCEP|SIRCREB|IMP\.?\s*(DEB|CRED)|LEY\s*25413|SELLOS|IIBB|INGRESOS BRUTOS/.test(d)) {
    return { ...base, clase: 'egreso', categoria: 'impuestos', destinatario_sugerido: 'Banco Macro' };
  }
  if (/EPEC|E\.P\.E\.C|ECOGAS|AGUAS|TELECOM|PERSONAL|CLARO|MOVISTAR|FIBERTEL/.test(d)) {
    return { ...base, clase: 'egreso', categoria: 'servicios' };
  }
  return { ...base, clase: 'egreso', categoria: 'generales' };
}

module.exports = { clasificarMovimiento, extraerCuit, cuitValido };
