// Cache simple en memoria para no pedir la cotización repetidamente
const cache = {};

async function obtenerCotizacionOficial(fecha) {
  // Si no se pasa fecha, usamos hoy
  const fechaConsulta = fecha || new Date().toISOString().split('T')[0];

  if (cache[fechaConsulta]) {
    return cache[fechaConsulta];
  }

  try {
    // DolarAPI histórico: /v1/cotizaciones/historicas/{tipo}/{fecha}
    // Formato de fecha: DD-MM-YYYY
    const [anio, mes, dia] = fechaConsulta.split('-');
    const fechaFormato = `${dia}-${mes}-${anio}`;

    const resp = await fetch(`https://dolarapi.com/v1/cotizaciones/historicas/oficial/${fechaFormato}`);

    if (resp.ok) {
      const data = await resp.json();
      cache[fechaConsulta] = data.venta;
      return data.venta;
    }

    // Si falla (fecha muy vieja o feriado), buscamos la cotización del día
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
