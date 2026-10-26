import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, patch } from '../../lib/api';
import { ETAPAS, ORDEN_ROL, fmtFecha, hoyISO, primerNombre } from '../../lib/seguimiento';
import { Avatar, AZUL, ComentariosTarea, BotonComentarios, LinkDrive } from './comunes';
import { AlertaError } from '../../components/ui';

const CLAVE = 'revision_proyectos';
const CANT_TAREAS = 7;
const input = { padding: '4px 8px', font: 'inherit', fontSize: 13, border: '1px solid #c9c9c9', borderRadius: 6, background: '#fff', color: '#1a1a1a' };
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

const leerSeleccion = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '[]'); } catch { return []; }
};
const guardarSeleccion = (ids) => {
  try { localStorage.setItem(CLAVE, JSON.stringify(ids)); } catch { /* sin almacenamiento: se elige de nuevo */ }
};

// Un proyecto a lo ancho: sus últimas tareas pendientes, para tachar, comentar y agregar
function BloqueProyecto({ d, base, tachadas, onTachar, onRecargar, onError }) {
  const navigate = useNavigate();
  const [abierta, setAbierta] = useState(null);
  const [verTodas, setVerTodas] = useState(false);
  const personas = [
    ...[...d.equipo].sort((a, b) => ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol]),
    ...d.socios.filter(s => !d.equipo.some(e => String(e.usuario_id) === String(s.usuario_id))).map(s => ({ ...s, rol: 'Socio' })),
  ];
  const defResp = (personas.find(p => p.rol === 'Dibujante') || personas[0])?.usuario_id || '';
  const enUnaSemana = (() => { const f = new Date(); f.setDate(f.getDate() + 7); return f.toISOString().slice(0, 10); })();
  const [nt, setNt] = useState({ titulo: '', responsable_id: defResp, fecha_limite: enUnaSemana });
  const [guardando, setGuardando] = useState(false);

  const hoy = hoyISO();
  const pendientes = d.tareas.filter(t => !t.hecha).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const vencidas = pendientes.filter(t => t.fecha_limite && t.fecha_limite < hoy).length;
  const visibles = verTodas ? pendientes : pendientes.slice(0, CANT_TAREAS);
  // Las que se tacharon durante la reunión siguen a la vista (tachadas) para poder deshacer
  const tachadasAca = d.tareas.filter(t => t.hecha && tachadas.includes(t.id));
  const pms = d.equipo.filter(e => e.rol === 'Project manager').map(e => primerNombre(e.nombre));
  const comentariosDe = (tid) => d.mensajes.filter(m => m.tarea_id === tid && !m.borrado_at);

  const agregar = async (e) => {
    e.preventDefault();
    if (!nt.titulo.trim()) return;
    setGuardando(true);
    try {
      await post(`/seguimiento/proyectos/${d.proyecto.id}/tareas`, nt);
      setNt(n => ({ ...n, titulo: '' }));
      await onRecargar(d.proyecto.id);
    } catch (err) { onError(err.message); }
    finally { setGuardando(false); }
  };

  const fila = (t, hecha) => {
    const vencida = !hecha && t.fecha_limite && t.fecha_limite < hoy;
    const esAbierta = abierta === t.id;
    return (
      <div key={t.id} style={{ borderTop: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '3px 10px', padding: '3px 12px', fontSize: 13, color: hecha ? '#6b6b6b' : '#1a1a1a' }}>
          <label style={{ flex: '999 1 280px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
            <input type="checkbox" checked={hecha} onChange={() => onTachar(d.proyecto.id, t)} style={{ width: 16, height: 16, accentColor: AZUL }} />
            <span style={{ textDecoration: hecha ? 'line-through' : 'none' }}>{t.titulo}</span>
          </label>
          <BotonComentarios cantidad={t.comentarios} abierto={esAbierta} onClick={() => setAbierta(esAbierta ? null : t.id)} />
          <span style={{ flex: '0 1 170px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            {t.responsable_id && <Avatar id={t.responsable_id} nombre={t.responsable} tam={18} />}
            {t.responsable || 'Sin responsable'}
          </span>
          <span style={{ flex: '0 0 110px', fontSize: 12, color: vencida ? '#b91c1c' : '#595959', fontWeight: vencida ? 600 : 400 }}>
            {vencida ? `Vencida · ${fmtFecha(t.fecha_limite)}` : fmtFecha(t.fecha_limite)}
          </span>
        </div>
        {esAbierta && (
          <ComentariosTarea proyectoId={d.proyecto.id} tareaId={t.id} comentarios={comentariosDe(t.id)}
            onEnviado={() => onRecargar(d.proyecto.id)} onError={onError} autoFocus />
        )}
      </div>
    );
  };

  return (
    <section aria-label={d.proyecto.nombre} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', padding: '6px 12px', background: '#f6f7f9', borderBottom: '1px solid #e6e8ec' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{d.proyecto.nombre}</h2>
            <span style={{ fontSize: 12, color: '#595959' }}>{d.proyecto.cliente_nombre}</span>
          </div>
          <LinkDrive proyectoId={d.proyecto.id} url={d.proyecto.drive_url} onGuardado={() => onRecargar(d.proyecto.id)} onError={onError} />
        </div>
        <span style={{ fontSize: 12 }}>Etapa: <strong style={{ fontWeight: 600 }}>{ETAPAS[d.proyecto.etapa]}</strong></span>
        {pms.length > 0 && <span style={{ fontSize: 12 }}>PM: <strong style={{ fontWeight: 600 }}>{pms.join(', ')}</strong></span>}
        <span style={{ fontSize: 12, color: '#595959' }}>
          {plural(pendientes.length, 'tarea pendiente', 'tareas pendientes')}
          {vencidas > 0 && <span style={{ color: '#b91c1c', fontWeight: 600 }}> · {plural(vencidas, 'vencida', 'vencidas')}</span>}
        </span>
        <button type="button" onClick={() => navigate(`${base}/${d.proyecto.id}`)}
          style={{ marginLeft: 'auto', font: 'inherit', fontSize: 12, color: AZUL, background: 'none', border: '1px solid #d6d9df', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
          Abrir proyecto →
        </button>
      </div>

      {visibles.map(t => fila(t, false))}
      {tachadasAca.map(t => fila(t, true))}
      {!pendientes.length && !tachadasAca.length && (
        <p style={{ margin: 0, padding: '6px 12px', fontSize: 13, color: '#595959' }}>No hay tareas pendientes.</p>
      )}
      {pendientes.length > CANT_TAREAS && (
        <button type="button" onClick={() => setVerTodas(v => !v)}
          style={{ display: 'block', width: '100%', textAlign: 'left', font: 'inherit', fontSize: 12, color: AZUL, background: 'none', border: 'none', borderTop: '1px solid #f0f0f0', padding: '4px 12px', cursor: 'pointer' }}>
          {verTodas ? `Mostrar solo las últimas ${CANT_TAREAS}` : `Ver las ${pendientes.length} pendientes`}
        </button>
      )}

      <form onSubmit={agregar} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '6px 12px', borderTop: '1px solid #e6e8ec', background: '#fcfcfd' }}>
        <input value={nt.titulo} onChange={e => setNt({ ...nt, titulo: e.target.value })} aria-label={`Nueva tarea para ${d.proyecto.nombre}`}
          placeholder="+ Nueva tarea…" style={{ ...input, flex: '999 1 260px', minWidth: 0 }} />
        <select aria-label="Responsable" value={nt.responsable_id} onChange={e => setNt({ ...nt, responsable_id: e.target.value })} style={{ ...input, flex: '0 1 190px' }}>
          {personas.map(p => <option key={p.usuario_id} value={p.usuario_id}>{p.nombre}</option>)}
        </select>
        <input type="date" aria-label="Fecha límite" value={nt.fecha_limite} onChange={e => setNt({ ...nt, fecha_limite: e.target.value })} style={input} />
        <button type="submit" disabled={guardando || !nt.titulo.trim()}
          style={{ font: 'inherit', fontSize: 13, fontWeight: 500, padding: '4px 12px', border: 'none', borderRadius: 6, background: AZUL, color: '#fff', cursor: 'pointer', opacity: guardando || !nt.titulo.trim() ? 0.5 : 1 }}>
          Agregar
        </button>
      </form>
    </section>
  );
}

// Reunión de revisión: los proyectos elegidos, uno debajo del otro a lo ancho,
// cada uno con sus últimas tareas pendientes para tachar, comentar y agregar.
export default function Revision({ base }) {
  const navigate = useNavigate();
  const [todos, setTodos] = useState([]);
  const [seleccion, setSeleccion] = useState(leerSeleccion);
  const [elegir, setElegir] = useState(() => leerSeleccion().length === 0);
  const [detalles, setDetalles] = useState({});
  const [tachadas, setTachadas] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { get('/seguimiento/proyectos').then(setTodos).catch(err => setError(err.message)); }, []);

  const cargarUno = useCallback(async (pid) => {
    try {
      const d = await get(`/seguimiento/proyectos/${pid}`);
      setDetalles(prev => ({ ...prev, [pid]: d }));
    } catch (err) { setError(err.message); }
  }, []);

  const cargarTodos = useCallback(() => Promise.all(seleccion.map(cargarUno)), [seleccion, cargarUno]);
  useEffect(() => { cargarTodos(); }, [cargarTodos]);
  // Se actualiza solo cada 30 s, por si otro carga algo durante la reunión
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargarTodos(); }, 30000);
    return () => clearInterval(t);
  }, [cargarTodos]);

  const cambiarSeleccion = (ids) => { setSeleccion(ids); guardarSeleccion(ids); };
  const alternar = (id) => cambiarSeleccion(seleccion.includes(id) ? seleccion.filter(x => x !== id) : [...seleccion, id]);

  const tachar = async (pid, t) => {
    try {
      await patch(`/seguimiento/tareas/${t.id}`, { hecha: !t.hecha });
      setTachadas(arr => (t.hecha ? arr.filter(x => x !== t.id) : [...arr, t.id]));
      await cargarUno(pid);
    } catch (err) { setError(err.message); }
  };

  // Se respeta el orden del tablero (lo más movido primero)
  const elegidos = todos.filter(p => seleccion.includes(p.id));

  return (
    <div style={{ padding: '14px 20px 24px', maxWidth: 1400 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button type="button" onClick={() => navigate(base)}
          style={{ font: 'inherit', fontSize: 13, color: AZUL, background: '#fff', border: '1px solid #d6d9df', padding: '4px 9px', borderRadius: 6, cursor: 'pointer' }}>← Tablero</button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>Reunión de revisión</h1>
          <p style={{ margin: '1px 0 0', fontSize: 12, color: '#595959' }}>
            {plural(elegidos.length, 'proyecto elegido', 'proyectos elegidos')} · las últimas {CANT_TAREAS} tareas pendientes de cada uno
          </p>
        </div>
        <button type="button" onClick={() => setElegir(v => !v)} aria-expanded={elegir}
          style={{ font: 'inherit', fontSize: 13, fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${AZUL}`, background: elegir ? AZUL : '#fff', color: elegir ? '#fff' : AZUL }}>
          {elegir ? 'Listo' : 'Elegir proyectos'}
        </button>
      </div>

      {elegir && (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: '8px 12px', marginBottom: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>¿Qué proyectos revisan hoy?</p>
            <button type="button" onClick={() => cambiarSeleccion(todos.map(p => p.id))} style={{ font: 'inherit', fontSize: 12, color: AZUL, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Todos</button>
            <button type="button" onClick={() => cambiarSeleccion([])} style={{ font: 'inherit', fontSize: 12, color: AZUL, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Ninguno</button>
            <span style={{ fontSize: 11, color: '#6b6b6b' }}>La elección queda guardada en esta computadora para la próxima reunión.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '2px 12px' }}>
            {[...todos].sort((x, y) => x.nombre.localeCompare(y.nombre, 'es', { numeric: true, sensitivity: 'base' })).map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={seleccion.includes(p.id)} onChange={() => alternar(p.id)} style={{ accentColor: AZUL }} />
                <span style={{ minWidth: 0 }}>
                  {p.nombre} <span style={{ color: '#6b6b6b', fontSize: 11 }}>· {p.pendientes} pend.</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <AlertaError mensaje={error} onCerrar={() => setError('')} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {elegidos.map(p => detalles[p.id]
          ? <BloqueProyecto key={p.id} d={detalles[p.id]} base={base} tachadas={tachadas} onTachar={tachar} onRecargar={cargarUno} onError={setError} />
          : <p key={p.id} style={{ margin: 0, fontSize: 13, color: '#666' }}>Cargando {p.nombre}…</p>)}
        {!elegidos.length && !elegir && (
          <p style={{ color: '#595959', fontSize: 14 }}>No hay proyectos elegidos. Tocá "Elegir proyectos" para armar la revisión.</p>
        )}
      </div>
    </div>
  );
}
