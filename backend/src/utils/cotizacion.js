// Cache simple en memoria para no pedir la cotización repetidamente
const cache = {};

async function obtenerCotizacionOficial(fecha) {
  const fechaConsulta = fecha || new Date().toISOString().split('T')[0];

  if (cache[fechaConsulta]) {
    return cache[fechaConsulta];
  }

  try {
    // ArgentinaDatos API: formato YYYY/MM/DD
    const fechaFormato = fechaConsulta.replace(/-/g, '/');

    const resp = await fetch(`https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial/${fechaFormato}`);

    if (resp.ok) {
      const data = await resp.json();
      if (data && data.venta) {
        cache[fechaConsulta] = data.venta;
        return data.venta;
      }
    }

    // Si no hay dato para esa fecha exacta (fin de semana/feriado),
    // usamos la cotización actual como respaldo
    const respHoy = await fetch('https://dolarapi.com/v1/dolares/oficial');
    const dataHoy = await respHoy.json();
    cache[fechaConsulta] = dataHoy.venta;
    return dataHoy.venta;

  } catch (err) {
    console.error('Error obteniendo cotización:', err);
    return 1000; // fallback de emergencia
  }
}

module.exports = { obtenerCotizacionOficial };
