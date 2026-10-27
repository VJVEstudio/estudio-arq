import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, put, enviarForm } from '../../lib/api';
import { iniciales, colorDe, cuando, leerPref, guardarPref } from '../../lib/seguimiento';
import { useEsCelular } from '../../lib/useEsCelular';
import { estadoPush, activarPush, desactivarPush, probarPush } from '../../lib/push';

export const AZUL = '#1a2744';

// Círculo con las iniciales de nombre y apellido
export function Avatar({ id, nombre, tam = 24, borde = false }) {
  const fuente = tam <= 22 ? 9 : tam <= 26 ? 10 : 11;
  return (
    <span aria-hidden="true" title={nombre} style={{
      flexShrink: 0, width: tam, height: tam, borderRadius: '50%', background: colorDe(id), color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: fuente, fontWeight: 600, letterSpacing: '-0.02em',
      border: borde ? '2px solid #fff' : 'none', boxSizing: 'content-box',
    }}>{iniciales(nombre)}</span>
  );
}

// Campana con las menciones del usuario (@Nombre o @todos) en todos los proyectos
export function CampanaNotificaciones({ base }) {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState({ notificaciones: [], sin_leer: 0 });
  const ref = useRef(null);
  const movil = useEsCelular();

  const cargar = useCallback(async () => {
    try { setDatos(await get('/seguimiento/notificaciones')); } catch { /* sin conexión: se reintenta */ }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000);
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('seguimiento:leido', cargar);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); window.removeEventListener('seguimiento:leido', cargar); };
  }, [cargar]);

  useEffect(() => {
    if (!abierto) return;
    cargar();
    const cerrar = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [abierto, cargar]);

  const marcarTodas = async () => { await post('/seguimiento/notificaciones/leidas', {}); cargar(); };
  const n = datos.sin_leer;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
        aria-label={`Notificaciones${n ? `: ${n} sin leer` : ''}`}
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff', color: AZUL, cursor: 'pointer',
        }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {n > 0 && (
          <span aria-hidden="true" style={{
            position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box',
            borderRadius: 9, background: '#b91c1c', color: '#fff', fontSize: 11, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>{n > 9 ? '9+' : n}</span>
        )}
      </button>
      {abierto && (
        <section aria-label="Notificaciones" style={{
          ...(movil ? { position: 'fixed', top: 54, left: 8, right: 8 } : { position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 380, maxWidth: '86vw' }), zIndex: 300,
          background: '#fff', border: '1px solid #d6d6d6', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.14)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #ececec', background: '#fafafa' }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Notificaciones <span style={{ fontWeight: 400, color: '#595959' }}>· menciones</span></h2>
            {n > 0 && (
              <button type="button" onClick={marcarTodas} style={{ font: 'inherit', fontSize: 12, color: AZUL, background: 'none', border: 'none', padding: '2px 6px', cursor: 'pointer' }}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          <div style={{ maxHeight: movil ? 'calc(100dvh - 230px)' : 420, overflowY: 'auto' }}>
            {datos.notificaciones.map(nf => (
              <button key={nf.id} type="button" onClick={() => { setAbierto(false); navigate(`${base}/${nf.proyecto_id}`); }}
                style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start', width: '100%', textAlign: 'left', font: 'inherit', fontSize: 13,
                  padding: '7px 12px', border: 'none', borderBottom: '1px solid #f0f0f0',
                  background: nf.sin_leer ? '#f3f6fb' : '#fff', color: '#1a1a1a', cursor: 'pointer',
                }}>
                <Avatar id={nf.autor_id} nombre={nf.autor} tam={24} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12 }}>
                    <strong style={{ fontWeight: 600 }}>{nf.autor}</strong>{' '}
                    <span style={{ color: '#595959' }}>{nf.a_mi ? 'te mencionó' : 'mencionó a todos'} en</span>{' '}
                    <strong style={{ fontWeight: 600 }}>{nf.proyecto}</strong>
                  </span>
                  <span style={{ display: 'block', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nf.texto}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#6b6b6b' }}>{cuando(nf.created_at)}</span>
                </span>
                {nf.sin_leer && <span role="img" aria-label="Sin leer" style={{ flexShrink: 0, width: 8, height: 8, marginTop: 6, borderRadius: '50%', background: AZUL }} />}
              </button>
            ))}
            {!datos.notificaciones.length && (
              <p style={{ margin: 0, padding: '14px 12px', fontSize: 13, color: '#595959' }}>
                No tenés menciones todavía. Cuando alguien te nombre con @ en un grupo, aparece acá.
              </p>
            )}
          </div>
          <div style={{ borderTop: '1px solid #ececec', background: '#fafafa', padding: '8px 12px' }}>
            <AvisosDispositivo />
          </div>
        </section>
      )}
    </div>
  );
}

// ── Avisos en el celular ─────────────────────────────────────────────────────────
// Hook con el estado de los avisos push en este dispositivo y las acciones.
function useAvisos() {
  const [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState('');
  const refrescar = useCallback(() => { estadoPush().then(setEstado).catch(() => setEstado('no-soportado')); }, []);
  useEffect(() => { refrescar(); }, [refrescar]);
  const hacer = (fn, ok) => async () => {
    setOcupado(true); setMsg('');
    try { await fn(); if (ok) setMsg(ok); }
    catch (err) { setMsg(err.message || 'No se pudo completar'); }
    finally { setOcupado(false); refrescar(); }
  };
  return {
    estado, ocupado, msg,
    activar: hacer(async () => { await activarPush(); await probarPush().catch(() => {}); }, 'Listo: te mandamos un aviso de prueba.'),
    desactivar: hacer(desactivarPush, 'Avisos desactivados en este dispositivo.'),
    probar: hacer(probarPush, 'Aviso de prueba enviado.'),
  };
}

const botonChico = { font: 'inherit', fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid #d6d9df', background: '#fff', color: AZUL };
const botonAzul = { ...botonChico, border: 'none', background: AZUL, color: '#fff', fontWeight: 500 };

export const INSTRUCCION_IPHONE = 'En iPhone: abrí la app en Safari, tocá Compartir (el cuadrado con la flecha) → "Agregar a inicio". Después abrí VJV desde ese ícono y activá los avisos.';

// Bloque "Avisos en este dispositivo" (va al pie de la campana)
export function AvisosDispositivo() {
  const { estado, ocupado, msg, activar, desactivar, probar } = useAvisos();
  if (!estado) return null;
  const texto = { fontSize: 12, color: '#595959', margin: 0, lineHeight: 1.4 };
  return (
    <div>
      <p style={{ ...texto, fontWeight: 600, color: '#1a1a1a', marginBottom: 3 }}>📱 Avisos en este dispositivo</p>
      {estado === 'activo' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ ...texto, color: '#1f5e37' }}>Activados: te llega cada mensaje de tus proyectos.</span>
          <button type="button" disabled={ocupado} onClick={probar} style={botonChico}>Probar</button>
          <button type="button" disabled={ocupado} onClick={desactivar} style={botonChico}>Desactivar</button>
        </div>
      )}
      {estado === 'inactivo' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={texto}>Recibí cada mensaje de tus proyectos como notificación, aunque la app esté cerrada.</span>
          <button type="button" disabled={ocupado} onClick={activar} style={botonAzul}>{ocupado ? 'Activando…' : 'Activar avisos'}</button>
        </div>
      )}
      {estado === 'ios-instalar' && <p style={texto}>{INSTRUCCION_IPHONE}</p>}
      {estado === 'bloqueado' && <p style={texto}>Los avisos están bloqueados para esta app. Habilitalos en la configuración del navegador (o del celular) y volvé acá.</p>}
      {estado === 'no-soportado' && <p style={texto}>Este navegador no admite avisos. En el celular usá Chrome (Android) o la app instalada (iPhone).</p>}
      {msg && <p style={{ ...texto, marginTop: 4, color: AZUL }}>{msg}</p>}
    </div>
  );
}

// Franja que invita a activar los avisos (en el tablero), hasta que se activen o se cierre
export function InvitacionAvisos() {
  const { estado, ocupado, msg, activar } = useAvisos();
  const [oculta, setOculta] = useState(() => leerPref('avisos_invitacion_oculta', false));
  if (oculta || !(estado === 'inactivo' || estado === 'ios-instalar') && !msg) return null;
  const cerrar = () => { setOculta(true); guardarPref('avisos_invitacion_oculta', true); };
  return (
    <div role="note" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#eef2fa', border: '1px solid #cdd7ea', borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>
      <span style={{ flex: '1 1 260px' }}>
        {msg ? msg : estado === 'ios-instalar' ? <>📱 <strong>Recibí los mensajes en el celu.</strong> {INSTRUCCION_IPHONE}</>
          : <>📱 <strong>Recibí los mensajes de tus proyectos en este dispositivo</strong>, como en WhatsApp.</>}
      </span>
      {estado === 'inactivo' && !msg && <button type="button" disabled={ocupado} onClick={activar} style={botonAzul}>{ocupado ? 'Activando…' : 'Activar avisos'}</button>}
      <button type="button" onClick={cerrar} aria-label="Cerrar" style={{ ...botonChico, border: 'none', background: 'transparent', fontSize: 16, padding: '0 6px' }}>×</button>
    </div>
  );
}

// Comentarios de una tarea: son mensajes del grupo pegados a esa tarea.
// Se ven acá y también en el chat del grupo como "Sobre la tarea …".
export function ComentariosTarea({ proyectoId, tareaId, comentarios, onEnviado, onError, autoFocus = false }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e) => {
    e?.preventDefault();
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('texto', texto.trim());
      fd.append('tarea_id', tareaId);
      await enviarForm(`/seguimiento/proyectos/${proyectoId}/mensajes`, fd);
      setTexto('');
      await onEnviado?.();
    } catch (err) { onError?.(err.message); }
    finally { setEnviando(false); }
  };
  return (
    <div style={{ background: '#f8f9fb', borderTop: '1px solid #eceef2', padding: '6px 12px 8px 36px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {comentarios.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12 }}>
          <Avatar id={c.usuario_id} nombre={c.autor} tam={18} />
          <span style={{ minWidth: 0, lineHeight: 1.35 }}>
            <strong style={{ fontWeight: 600 }}>{c.autor.split(' ')[0]}</strong>{' '}
            <span style={{ color: '#6b6b6b' }}>{cuando(c.created_at)}</span>{' '}
            <span style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{c.texto}</span>
          </span>
        </div>
      ))}
      {!comentarios.length && <p style={{ margin: 0, fontSize: 12, color: '#6b6b6b' }}>Sin comentarios todavía.</p>}
      <form onSubmit={enviar} style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <input value={texto} onChange={e => setTexto(e.target.value)} autoFocus={autoFocus}
          aria-label="Comentario sobre la tarea" placeholder="Comentario sobre esta tarea (también va al grupo)…"
          style={{ flex: 1, minWidth: 0, padding: '4px 8px', font: 'inherit', fontSize: 12, border: '1px solid #c9c9c9', borderRadius: 6, background: '#fff' }} />
        <button type="submit" disabled={!texto.trim() || enviando}
          style={{ font: 'inherit', fontSize: 12, fontWeight: 500, padding: '4px 10px', border: 'none', borderRadius: 6, background: AZUL, color: '#fff', cursor: 'pointer', opacity: !texto.trim() || enviando ? 0.5 : 1 }}>
          {enviando ? '…' : 'Comentar'}
        </button>
      </form>
    </div>
  );
}

// Botón chico con la cantidad de comentarios de una tarea
export function BotonComentarios({ cantidad, abierto, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={abierto}
      aria-label={`${cantidad ? cantidad + ' comentario' + (cantidad === 1 ? '' : 's') : 'Comentar'} sobre la tarea`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, font: 'inherit', fontSize: 12, padding: '2px 8px', borderRadius: 12,
        border: `1px solid ${abierto ? AZUL : '#d6d9df'}`, background: abierto ? '#eef2f8' : '#fff', color: AZUL, cursor: 'pointer', whiteSpace: 'nowrap',
      }}>
      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {cantidad || 'Comentar'}
    </button>
  );
}

// Link a la carpeta del proyecto en Google Drive (se agrega, cambia o quita acá mismo)
export function LinkDrive({ proyectoId, url, onGuardado, onError }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(url || '');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setValor(url || ''); }, [url]);
  const guardar = async (e) => {
    e?.preventDefault();
    setGuardando(true);
    try {
      await put(`/seguimiento/proyectos/${proyectoId}/drive`, { url: valor.trim() });
      setEditando(false);
      await onGuardado?.();
    } catch (err) { onError?.(err.message); }
    finally { setGuardando(false); }
  };
  const chico = { font: 'inherit', fontSize: 12, background: 'none', border: 'none', color: AZUL, cursor: 'pointer', padding: '1px 4px' };
  const icono = (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
  if (editando) {
    return (
      <form onSubmit={guardar} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 12 }}>
        <input type="url" value={valor} onChange={e => setValor(e.target.value)} autoFocus aria-label="Link a la carpeta de Google Drive"
          placeholder="https://drive.google.com/drive/folders/…"
          style={{ flex: '1 1 320px', minWidth: 0, padding: '3px 8px', font: 'inherit', fontSize: 12, border: '1px solid #c9c9c9', borderRadius: 6 }} />
        <button type="submit" disabled={guardando} style={{ ...chico, fontWeight: 600 }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        {url && <button type="button" onClick={() => setValor('')} style={{ ...chico, color: '#b91c1c' }}>Quitar</button>}
        <button type="button" onClick={() => { setEditando(false); setValor(url || ''); }} style={{ ...chico, color: '#595959' }}>Cancelar</button>
      </form>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      {url ? (
        <>
          <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: AZUL, fontWeight: 500 }}>
            {icono} Carpeta en Drive
          </a>
          <button type="button" onClick={() => setEditando(true)} aria-label="Cambiar el link de Drive" style={{ ...chico, color: '#6b6b6b' }}>cambiar</button>
        </>
      ) : (
        <button type="button" onClick={() => setEditando(true)} style={{ ...chico, display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0 }}>
          {icono} Agregar link a la carpeta de Drive
        </button>
      )}
    </span>
  );
}
