import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../../lib/api';
import { ETAPAS, SIGLA_ROL, ORDEN_ROL, cuando, primerNombre, participaEn, leerPref, guardarPref } from '../../lib/seguimiento';
import { useAuth } from '../../context/AuthContext';
import { useEsCelular } from '../../lib/useEsCelular';
import { Avatar, AZUL, InvitacionAvisos } from './comunes';
import { AlertaError } from '../../components/ui';

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

// Tablero: todos los proyectos con su etapa, equipo, tareas y lo último que pasó.
// Lo usan administradores (/admin/seguimiento) y dibujantes (/dibujante/proyectos).
export default function Seguimiento({ base }) {
  const navigate = useNavigate();
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [finalizados, setFinalizados] = useState(false);
  const { usuario } = useAuth();
  const movil = useEsCelular();
  // "Solo mis proyectos": los que tienen al usuario en el equipo. Se recuerda en esta computadora.
  const [soloMios, setSoloMios] = useState(() => leerPref('seguimiento_solo_mios', false));
  const cambiarSoloMios = (v) => { setSoloMios(v); guardarPref('seguimiento_solo_mios', v); };

  const cargar = useCallback(async () => {
    try {
      setProyectos(await get(`/seguimiento/proyectos${finalizados ? '?finalizados=1' : ''}`));
      setError('');
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, [finalizados]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000);
    return () => clearInterval(t);
  }, [cargar]);

  const q = buscar.trim().toLowerCase();
  const misProyectos = proyectos.filter(p => participaEn(p, usuario?.id));
  const visibles = (soloMios ? misProyectos : proyectos)
    .filter(p => !q || `${p.nombre} ${p.cliente_nombre}`.toLowerCase().includes(q));
  const base_ = soloMios ? misProyectos : proyectos;
  const totPend = base_.reduce((s, p) => s + p.pendientes, 0);
  const totVenc = base_.reduce((s, p) => s + p.vencidas, 0);

  return (
    <div style={{ padding: movil ? '10px 8px' : '20px 24px', maxWidth: 1280 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Seguimiento de proyectos</h1>
          <p style={{ margin: '3px 0 0', color: '#595959', fontSize: 13 }}>
            {plural(base_.length, soloMios ? 'proyecto tuyo' : 'proyecto', soloMios ? 'proyectos tuyos' : 'proyectos')} · {plural(totPend, 'tarea pendiente', 'tareas pendientes')} · {plural(totVenc, 'vencida', 'vencidas')}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <button type="button" onClick={() => navigate(`${base}/revision`)} style={{
            font: 'inherit', fontSize: 13, fontWeight: 500, padding: '6px 12px', border: 'none', borderRadius: 8, background: AZUL, color: '#fff', cursor: 'pointer',
          }}>Reunión de revisión</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: soloMios ? 600 : 400 }}
            title="Los proyectos donde estás en el equipo">
            <input type="checkbox" checked={soloMios} onChange={e => cambiarSoloMios(e.target.checked)} />
            Solo mis proyectos ({misProyectos.length})
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={finalizados} onChange={e => setFinalizados(e.target.checked)} />
            Ver finalizados
          </label>
          <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar proyecto o cliente…"
            aria-label="Buscar proyecto o cliente"
            style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #c9c9c9', borderRadius: 8, background: '#fff', minWidth: movil ? 0 : 230, width: movil ? '100%' : undefined, boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>
      </div>

      <InvitacionAvisos />
      <AlertaError mensaje={error} />
      {cargando ? <p style={{ color: '#666', fontSize: 14 }}>Cargando…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
          {visibles.map(p => {
            const equipo = [...p.equipo].sort((a, b) => ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol]);
            return (
              <button key={p.id} type="button" onClick={() => navigate(`${base}/${p.id}`)} style={{
                textAlign: 'left', font: 'inherit', color: 'inherit', background: '#fff', border: '1px solid #e0e0e0',
                borderRadius: 10, padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 9,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, width: '100%' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{p.nombre}</p>
                    <p style={{ margin: '1px 0 0', color: '#595959', fontSize: 12 }}>
                      {p.cliente_nombre}{p.estado !== 'activo' && ` · ${p.estado}`}
                    </p>
                  </div>
                  <span style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    {p.no_leidos > 0 && (
                      <span style={{ background: AZUL, color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>
                        {plural(p.no_leidos, 'nuevo', 'nuevos')}
                      </span>
                    )}
                    {p.menciones > 0 && (
                      <span style={{ background: '#fff1d6', color: '#7a4a00', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>
                        @ {plural(p.menciones, 'mención para vos', 'menciones para vos')}
                      </span>
                    )}
                  </span>
                </div>

                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', gap: 3 }} aria-hidden="true">
                    {ETAPAS.map((e, i) => (
                      <span key={e} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= p.etapa ? AZUL : '#e3e6ec' }} />
                    ))}
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#595959' }}>
                    Etapa: <strong style={{ color: '#1a1a1a', fontWeight: 600 }}>{ETAPAS[p.etapa]}</strong>
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px 10px', flexWrap: 'wrap', fontSize: 12 }}>
                  {equipo.length ? equipo.map(m => (
                    <span key={m.usuario_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Avatar id={m.usuario_id} nombre={m.nombre} tam={20} />
                      {primerNombre(m.nombre)}{SIGLA_ROL[m.rol]}
                    </span>
                  )) : <span style={{ color: '#6b6b6b' }}>Sin equipo asignado</span>}
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                  <span>{plural(p.pendientes, 'tarea pendiente', 'tareas pendientes')}</span>
                  {p.vencidas > 0 && <span style={{ color: '#b91c1c', fontWeight: 600 }}>{plural(p.vencidas, 'vencida', 'vencidas')}</span>}
                </div>

                <div style={{ borderTop: '1px solid #ececec', paddingTop: 7, width: '100%', boxSizing: 'border-box' }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#3d3d3d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.ultimo
                      ? `${primerNombre(p.ultimo.autor)}: ${p.ultimo.texto || (p.ultimo.archivos ? 'subió un archivo' : '')}`
                      : 'Sin mensajes todavía'}
                  </p>
                  {p.ultimo && <p style={{ margin: '1px 0 0', fontSize: 11, color: '#6b6b6b' }}>{cuando(p.ultimo.created_at)}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {!cargando && !visibles.length && (
        <p style={{ color: '#595959', padding: '24px 0' }}>{q ? 'No hay proyectos que coincidan con la búsqueda.'
            : soloMios ? 'No estás en el equipo de ningún proyecto. Destildá "Solo mis proyectos" para ver todos.'
            : 'No hay proyectos activos.'}</p>
      )}
    </div>
  );
}
