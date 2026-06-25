import { useState, useEffect, useCallback } from 'react';
import { get, post, put, del } from '../lib/api';

export function useRendiciones(filtros = {}) {
  const [rendiciones, setRendiciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v); });
      setRendiciones(await get(`/rendiciones?${params}`));
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async (datos) => {
    const nueva = await post('/rendiciones', datos);
    await cargar();
    return nueva;
  };

  const actualizar = async (id, datos) => {
    const u = await put(`/rendiciones/${id}`, datos);
    await cargar();
    return u;
  };

  const eliminar = async (id) => {
    await del(`/rendiciones/${id}`);
    await cargar();
  };

  const obtenerSiguienteNumero = async (proyecto_id, tipo) => {
    const r = await get(`/rendiciones/siguiente-numero/calcular?proyecto_id=${proyecto_id}&tipo=${tipo}`);
    return r.siguiente;
  };

  return { rendiciones, cargando, error, cargar, crear, actualizar, eliminar, obtenerSiguienteNumero };
}

export function useRendicion(id) {
  const [rendicion, setRendicion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    setError(null);
    try { setRendicion(await get(`/rendiciones/${id}`)); }
    catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const agregarComprobante = async (datos) => {
    await post(`/rendiciones/${id}/comprobantes`, datos);
    await cargar();
  };

  const actualizarComprobante = async (comprobanteId, datos) => {
    await put(`/rendiciones/comprobantes/${comprobanteId}`, datos);
    await cargar();
  };

  const eliminarComprobante = async (comprobanteId) => {
    await del(`/rendiciones/comprobantes/${comprobanteId}`);
    await cargar();
  };

  return { rendicion, cargando, error, cargar, agregarComprobante, actualizarComprobante, eliminarComprobante };
}
