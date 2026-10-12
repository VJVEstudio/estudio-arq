import { useState, useEffect, useRef } from 'react';

const AZUL = '#1a2744';
export const SIN_PROYECTO = '__sin_proyecto__';

// Selector de varios proyectos con casillas, agrupados por cliente.
// `seleccion` es un Set de ids (incluye SIN_PROYECTO para movimientos sin proyecto).
// Un Set vacío significa "todos los proyectos".
export default function SelectorProyectos({ proyectos, seleccion, onCambiar }) {
  const [abierto, setAbierto] = useState(false);
  const [buscar, setBuscar] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  const b = buscar.trim().toLowerCase();
  const visibles = proyectos.filter(p => !b
    || p.nombre?.toLowerCase().includes(b) || p.cliente_nombre?.toLowerCase().includes(b));
  const porCliente = {};
  visibles.forEach(p => { (porCliente[p.cliente_nombre || 'Sin cliente'] ||= []).push(p); });
  const clientesOrdenados = Object.keys(porCliente).sort((x, y) => x.localeCompare(y, 'es'));
  clientesOrdenados.forEach(c => porCliente[c].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')));

  const alternar = (id) => {
    const n = new Set(seleccion);
    if (n.has(id)) n.delete(id); else n.add(id);
    onCambiar(n);
  };
  const alternarCliente = (cliente) => {
    const ids = porCliente[cliente].map(p => p.id);
    const todos = ids.every(id => seleccion.has(id));
    const n = new Set(seleccion);
    ids.forEach(id => (todos ? n.delete(id) : n.add(id)));
    onCambiar(n);
  };

  const cantidad = seleccion.size;
  const etiqueta = cantidad === 0
    ? 'Todos los proyectos'
    : cantidad === 1
      ? (seleccion.has(SIN_PROYECTO) ? 'Sin proyecto' : proyectos.find(p => seleccion.has(p.id))?.nombre || '1 proyecto')
      : `${cantidad} proyectos`;

  const fila = { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', borderRadius: '6px' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setAbierto(a => !a)} style={{
        padding: '8px 12px', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer',
        border: `1px solid ${cantidad ? AZUL : '#d0d0d0'}`, background: cantidad ? '#eef2ff' : '#fff',
        color: cantidad ? AZUL : '#1a1a1a', fontWeight: cantidad ? 600 : 400, whiteSpace: 'nowrap',
      }}>
        📐 {etiqueta} ▾
      </button>
      {abierto && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, width: '340px',
          background: '#fff', border: '1px solid #d0d0d0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          <div style={{ padding: '10px', borderBottom: '1px solid #eee', display: 'flex', gap: '8px' }}>
            <input autoFocus value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar proyecto o cliente…"
              style={{ flex: 1, padding: '7px 10px', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit' }} />
            {cantidad > 0 && (
              <button type="button" onClick={() => onCambiar(new Set())} style={{ background: 'none', border: 'none', color: AZUL, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                Limpiar
              </button>
            )}
          </div>
          <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '6px' }}>
            {!b && (
              <label style={fila}>
                <input type="checkbox" checked={seleccion.has(SIN_PROYECTO)} onChange={() => alternar(SIN_PROYECTO)} />
                <span style={{ color: '#666', fontStyle: 'italic' }}>Sin proyecto</span>
              </label>
            )}
            {clientesOrdenados.map(cliente => {
              const ids = porCliente[cliente].map(p => p.id);
              const marcados = ids.filter(id => seleccion.has(id)).length;
              return (
                <div key={cliente} style={{ marginTop: '4px' }}>
                  <label style={{ ...fila, fontWeight: 600, fontSize: '12px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    <input type="checkbox" checked={marcados === ids.length}
                      ref={el => { if (el) el.indeterminate = marcados > 0 && marcados < ids.length; }}
                      onChange={() => alternarCliente(cliente)} />
                    {cliente}
                  </label>
                  {porCliente[cliente].map(p => (
                    <label key={p.id} style={{ ...fila, paddingLeft: '30px', background: seleccion.has(p.id) ? '#f5f7ff' : 'transparent' }}>
                      <input type="checkbox" checked={seleccion.has(p.id)} onChange={() => alternar(p.id)} />
                      <span>{p.nombre}</span>
                      {p.estado === 'finalizado' && <span style={{ fontSize: '11px', color: '#999' }}>(finalizado)</span>}
                    </label>
                  ))}
                </div>
              );
            })}
            {!clientesOrdenados.length && <p style={{ margin: '10px', fontSize: '13px', color: '#999' }}>Sin resultados</p>}
          </div>
        </div>
      )}
    </div>
  );
}
