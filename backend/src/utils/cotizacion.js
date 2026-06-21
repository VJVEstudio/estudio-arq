// Cache simple en memoria para no pedir la cotización en cada request
let cache = { valor: null, fecha: null };

async function obtenerCotizacionOficial() {
  const hoy = new Date().toISOString().split('T')[0];
  if (cache.fecha === hoy && cache.valor) {
    return cache.valor;
  }
  try {
    const resp = await fetch('https://dolarapi.com/v1/dolares/oficial');
    const data = await resp.json();
    cache = { valor: data.venta, fecha: hoy };
    return data.venta;
  } catch (err) {
    console.error('Error obteniendo cotización:', err);
    return cache.valor || 1000;
  }
}

module.exports = { obtenerCotizacionOficial };
