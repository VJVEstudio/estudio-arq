import { useState, useEffect, useCallback } from 'react';
import { get, post, put, del } from '../lib/api';

export function useEgresos(filtros = {}) {
  const [egresos,  setEgresos]  = useState([]);
  const [resumen,  setResumen]  = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v); });
      const [data, res] = await Promise.all([
        get(`/egresos?${params}`),
        get(`/egresos/resumen?${params}`),
      ]);
      setEgresos(data);
      setResumen(res);
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async (datos) => {
    const n = await post('/egresos', datos);
    setEgresos(prev => [n, ...prev]);
    await cargar();
    return n;
  };
  const actualizar = async (id, datos) => {
    const u = await put(`/egresos/${id}`, datos);
    setEgresos(prev => prev.map(e => e.id === id ? u : e));
    await cargar();
    return u;
  };
  const eliminar = async (id) => {
    await del(`/egresos/${id}`);
    setEgresos(prev => prev.filter(e => e.id !== id));
    await cargar();
  };

  return { egresos, resumen, cargando, error, cargar, crear, actualizar, eliminar };
}

export function useDestinatarios() {
  const [destinatarios, setDestinatarios] = useState([]);
  const [cargando,      setCargando]      = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setDestinatarios(await get('/destinatarios')); }
    catch { }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async (datos) => {
    const nuevo = await post('/destinatarios', datos);
    setDestinatarios(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    return nuevo;
  };

  return { destinatarios, cargando, cargar, crear };
}
