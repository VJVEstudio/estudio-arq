import { useState, useEffect, useCallback } from 'react';
import { get, post, put, patch, del } from '../lib/api';

export function useProyectos({ estado = '', cliente_id = '' } = {}) {
  const [proyectos, setProyectos] = useState([]);
  const [cargando,  setCargando]  = useState(true);
  const [error,     setError]     = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (estado)     params.set('estado', estado);
      if (cliente_id) params.set('cliente_id', cliente_id);
      setProyectos(await get(`/proyectos?${params}`));
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, [estado, cliente_id]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async (datos) => {
    const nuevo = await post('/proyectos', datos);
    setProyectos(prev => [nuevo, ...prev]);
    return nuevo;
  };
  const actualizar = async (id, datos) => {
    const u = await put(`/proyectos/${id}`, datos);
    setProyectos(prev => prev.map(p => p.id === id ? u : p));
    return u;
  };
  const cambiarEstado = async (id, nuevoEstado) => {
    await patch(`/proyectos/${id}/estado`, { estado: nuevoEstado });
    setProyectos(prev => prev.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p));
  };
  const asignarDibujante = async (proyecto_id, dibujante_id) => {
    return await post(`/proyectos/${proyecto_id}/dibujantes`, { dibujante_id });
  };
  const desasignarDibujante = async (proyecto_id, dibujante_id) => {
    return await del(`/proyectos/${proyecto_id}/dibujantes/${dibujante_id}`);
  };

  return { proyectos, cargando, error, cargar, crear, actualizar, cambiarEstado, asignarDibujante, desasignarDibujante };
}
