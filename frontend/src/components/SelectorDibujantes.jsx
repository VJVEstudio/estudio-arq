import { useState, useEffect, useRef } from 'react';

const AZUL = '#1a2744';

// Selector de varios dibujantes con casillas, con el mismo aspecto que SelectorProyectos.
// `seleccion` es un Set de ids. Un Set vacío significa "todos los dibujantes".
// Los dibujantes inactivos van al final, marcados.
export default function SelectorDibujantes({ dibujantes, seleccion, onCambiar }) {
  const [abierto, setAbierto] = useState(false);
  const [buscar, setBuscar] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto]);

  const inactivo = (d) => d.usuario_activo === false || d.activo === false;
  const b = buscar.trim().toLowerCase();
  const visibles = dibujantes
    .filter(d => !b || d.nombre?.toLowerCase().includes(b))
    .sort((x, y) => (inactivo(x) - inactivo(y)) || x.nombre.localeCompare(y.nombre, 'es'));

  const alternar = (id) => {
    const n = new Set(seleccion);
    if (n.has(id)) n.delete(id); else n.add(id);
    onCambiar(n);
  };
  const todosVisibles = visibles.length > 0 && visibles.every(d => seleccion.has(d.id));
  const alternarVisibles = () => {
    const n = new Set(seleccion);
    visibles.forEach(d => (todosVisibles ? n.delete(d.id) : n.add(d.id)));
    onCambiar(n);
  };

  const cantidad = seleccion.size;
  const etiqueta = cantidad === 0
    ? 'Todos los dibujantes'
    : cantidad === 1
      ? (dibujantes.find(d => seleccion.has(d.id))?.nombre || '1 dibujante')
      : `${cantidad} dibujantes`;

  const fila = { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '13px', borderRadius: '6px' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setAbierto(a => !a)} style={{
        padding: '8px 12px', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer',
        border: `1px solid ${cantidad ? AZUL : '#d0d0d0'}`, background: cantidad ? '#eef2ff' : '#fff',
        color: cantidad ? AZUL : '#1a1a1a', fontWeight: cantidad ? 600 : 400, whiteSpace: 'nowrap',
      }}>
        ✏ {etiqueta} ▾
      </button>
      {abierto && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, width: '300px',
          background: '#fff', border: '1px solid #d0d0d0', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          <div style={{ padding: '10px', borderBottom: '1px solid #eee', display: 'flex', gap: '8px' }}>
            <input autoFocus value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar dibujante…"
              style={{ flex: 1, padding: '7px 10px', border: '1px solid #d0d0d0', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit' }} />
            {cantidad > 0 && (
              <button type="button" onClick={() => onCambiar(new Set())} style={{ background: 'none', border: 'none', color: AZUL, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                Limpiar
              </button>
            )}
          </div>
          <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '6px' }}>
            {visibles.length > 1 && (
              <label style={{ ...fila, fontWeight: 600, fontSize: '12px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                <input type="checkbox" checked={todosVisibles}
                  ref={el => { if (el) el.indeterminate = !todosVisibles && visibles.some(d => seleccion.has(d.id)); }}
                  onChange={alternarVisibles} />
                {b ? 'Todos los encontrados' : 'Marcar todos'}
              </label>
            )}
            {visibles.map(d => (
              <label key={d.id} style={{ ...fila, background: seleccion.has(d.id) ? '#f5f7ff' : 'transparent' }}>
                <input type="checkbox" checked={seleccion.has(d.id)} onChange={() => alternar(d.id)} />
                <span style={{ color: inactivo(d) ? '#888' : 'inherit' }}>{d.nombre}</span>
                {inactivo(d) && <span style={{ fontSize: '11px', color: '#999' }}>(inactivo)</span>}
              </label>
            ))}
            {!visibles.length && <p style={{ margin: '10px', fontSize: '13px', color: '#999' }}>Sin resultados</p>}
          </div>
        </div>
      )}
    </div>
  );
}
