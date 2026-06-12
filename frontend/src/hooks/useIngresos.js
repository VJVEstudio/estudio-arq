import { useState, useEffect, useCallback } from 'react';
import { get, post, put, del } from '../lib/api';

export function useIngresos(filtros = {}) {
  const [ingresos, setIngresos] = useState([]);
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
        get(`/ingresos?${params}`),
        get(`/ingresos/resumen?${params}`),
      ]);
      setIngresos(data);
      setResumen(res);
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async (datos) => {
    const nuevo = await post('/ingresos', datos);
    setIngresos(prev => [nuevo, ...prev]);
    await cargar();
    return nuevo;
  };
  const actualizar = async (id, datos) => {
    const u = await put(`/ingresos/${id}`, datos);
    setIngresos(prev => prev.map(i => i.id === id ? u : i));
    await cargar();
    return u;
  };
  const eliminar = async (id) => {
    await del(`/ingresos/${id}`);
    setIngresos(prev => prev.filter(i => i.id !== id));
    await cargar();
  };

  return { ingresos, resumen, cargando, error, cargar, crear, actualizar, eliminar };
}
