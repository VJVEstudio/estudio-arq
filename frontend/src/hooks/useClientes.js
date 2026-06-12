import { useState, useEffect, useCallback } from 'react';
import { get, post, put, patch } from '../lib/api';

export function useClientes({ buscar = '', inactivos = false } = {}) {
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (buscar)    params.set('buscar', buscar);
      if (inactivos) params.set('inactivos', 'true');
      setClientes(await get(`/clientes?${params}`));
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, [buscar, inactivos]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async (datos) => {
    const nuevo = await post('/clientes', datos);
    setClientes(prev => [nuevo, ...prev]);
    return nuevo;
  };
  const actualizar = async (id, datos) => {
    const u = await put(`/clientes/${id}`, datos);
    setClientes(prev => prev.map(c => c.id === id ? u : c));
    return u;
  };
  const desactivar = async (id) => {
    await patch(`/clientes/${id}/desactivar`);
    setClientes(prev => prev.map(c => c.id === id ? { ...c, activo: false } : c));
  };
  const activar = async (id) => {
    await patch(`/clientes/${id}/activar`);
    setClientes(prev => prev.map(c => c.id === id ? { ...c, activo: true } : c));
  };

  return { clientes, cargando, error, cargar, crear, actualizar, desactivar, activar };
}
