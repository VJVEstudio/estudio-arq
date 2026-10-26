import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { get, post, put, patch, del, enviarForm } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  ETAPAS, ROLES, ORDEN_ROL, RESP_ROL, TIPOS_HIST, primerNombre, diaDe, horaDe, cuando, fmtFecha, hoyISO, segmentar,
} from '../../lib/seguimiento';
import { Avatar, AZUL, ComentariosTarea, BotonComentarios, LinkDrive } from './comunes';
import { AlertaError } from '../../components/ui';

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const input = { padding: '5px 8px', font: 'inherit', fontSize: 13, border: '1px solid #c9c9c9', borderRadius: 6, background: '#fff', color: '#1a1a1a' };
const btnSec = { font: 'inherit', fontSize: 12, padding: '5px 10px', border: '1px solid #c9c9c9', borderRadius: 6, background: '#fff', color: '#1a1a1a', cursor: 'pointer' };
const btnPri = { font: 'inherit', fontSize: 13, fontWeight: 500, padding: '6px 14px', border: 'none', borderRadius: 6, background: AZUL, color: '#fff', cursor: 'pointer' };
const caja = { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10 };
const tituloCaja = { margin: 0, padding: '6px 12px', fontSize: 13, fontWeight: 600, background: '#fafafa', borderBottom: '1px solid #ececec' };

// Lo que se muestra de cada tarea
function vistaTarea(t) {
  const vencida = !t.hecha && t.fecha_limite && t.fecha_limite < hoyISO();
  return { ...t, vencida, fechaTxt: vencida ? `Vencida · ${fmtFecha(t.fecha_limite)}` : fmtFecha(t.fecha_limite) };
}

// ═══════════════════════════════ Grupo ═══════════════════════════════
function Grupo({ datos, yo, esAdmin, personas, rolDe, onRecargar, onError, irTareas, irATarea, alternarTarea }) {
  const [draft, setDraft] = useState('');
  const [decision, setDecision] = useState(false);
  const [archivos, setArchivos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState(null); // { id, texto }
  const chatRef = useRef(null);
  const fileRef = useRef(null);
  const textoRef = useRef(null);
  const cantMsg = datos.mensajes.length;

  // Baja al último mensaje al entrar y cuando llegan mensajes nuevos
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [cantMsg]);

  const miNombre = primerNombre(yo.nombre).toLowerCase();
  const validos = useMemo(() => ['todos', ...personas.map(p => primerNombre(p.nombre).toLowerCase())], [personas]);

  // Sugerencias de menciones mientras se escribe "@…"
  const enCurso = draft.match(/(^|\s)@([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*)$/);
  const sugerencias = enCurso ? [
    { id: 'todos', nombre: 'todos', detalle: 'todo el grupo del proyecto' },
    ...personas.filter(p => String(p.usuario_id) !== String(yo.id))
      .map(p => ({ id: p.usuario_id, nombre: primerNombre(p.nombre), completo: p.nombre, detalle: p.rol })),
  ].filter(c => c.nombre.toLowerCase().startsWith(enCurso[2].toLowerCase())) : [];
  const elegir = (c) => {
    setDraft(d => d.slice(0, d.length - enCurso[2].length - 1) + '@' + c.nombre + ' ');
    textoRef.current?.focus();
  };
  const mencionar = () => {
    setDraft(d => d + (d === '' || /\s$/.test(d) ? '' : ' ') + '@');
    textoRef.current?.focus();
  };

  const enviar = async (e) => {
    e?.preventDefault();
    if (enviando || (!draft.trim() && !archivos.length)) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('texto', draft.trim());
      fd.append('decision', decision ? 'true' : 'false');
      archivos.forEach(a => fd.append('archivos', a));
      await enviarForm(`/seguimiento/proyectos/${datos.proyecto.id}/mensajes`, fd);
      setDraft(''); setDecision(false); setArchivos([]);
      await onRecargar(true);
    } catch (err) { onError(err.message); }
    finally { setEnviando(false); }
  };

  const guardarEdicion = async () => {
    try {
      await put(`/seguimiento/mensajes/${editando.id}`, { texto: editando.texto });
      setEditando(null);
      await onRecargar();
    } catch (err) { onError(err.message); }
  };
  const borrar = async (m) => {
    const deQuien = String(m.usuario_id) === String(yo.id) ? 'tu mensaje' : `el mensaje de ${primerNombre(m.autor)}`;
    if (!window.confirm(`¿Borrar ${deQuien}? El original queda en el historial para los administradores.`)) return;
    try { await del(`/seguimiento/mensajes/${m.id}`); await onRecargar(); }
    catch (err) { onError(err.message); }
  };

  const galeria = datos.mensajes.filter(m => !m.borrado_at)
    .flatMap(m => (m.archivos || []).map(a => ({ ...a, autor: m.autor, created_at: m.created_at }))).reverse();
  const tareas = datos.tareas.filter(t => !t.hecha).map(vistaTarea).slice(0, 5);

  let diaAnt = null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
      <section aria-label="Conversación del grupo" style={{ ...caja, flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div ref={chatRef} style={{ height: 'calc(100vh - 290px)', minHeight: 380, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13 }}>
          {!datos.mensajes.length && (
            <p style={{ margin: 'auto', color: '#6b6b6b', textAlign: 'center' }}>Todavía no hay mensajes. Escribí el primero para el grupo.</p>
          )}
          {datos.mensajes.map(m => {
            const dia = diaDe(m.created_at);
            const mostrarDia = dia !== diaAnt; diaAnt = dia;
            const esMio = String(m.usuario_id) === String(yo.id);
            const separador = mostrarDia && <p style={{ margin: '2px 0 0', textAlign: 'center', fontSize: 11, color: '#6b6b6b' }}>{dia}</p>;
            if (m.borrado_at) {
              const otro = m.borrado_por_nombre && m.borrado_por_nombre !== m.autor;
              return (
                <div key={m.id}>
                  {separador}
                  <p style={{ margin: 0, padding: '2px 0 2px 34px', fontSize: 11, color: '#6b6b6b', fontStyle: 'italic' }}>
                    {primerNombre(m.borrado_por_nombre)} borró un mensaje{otro ? ` de ${primerNombre(m.autor)}` : ''} ({horaDe(m.borrado_at)}). El original quedó en el Historial.
                  </p>
                </div>
              );
            }
            const enEdicion = editando?.id === m.id;
            return (
              <div key={m.id}>
                {separador}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Avatar id={m.usuario_id} nombre={m.autor} tam={26} />
                  <div style={{
                    minWidth: 0, flex: 1, borderRadius: 8, padding: '5px 10px',
                    background: m.decision ? '#fffaf0' : esMio ? '#eef2f8' : '#f7f7f7',
                    border: m.decision ? '2px solid #e3b660' : '1px solid #d4d7dc',
                  }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 6px', fontSize: 12 }}>
                      <strong style={{ fontWeight: 600 }}>{m.autor}</strong>
                      <span style={{ color: '#595959' }}>{rolDe(m.usuario_id) ? `· ${rolDe(m.usuario_id)} ` : ''}· {horaDe(m.created_at)}</span>
                      {m.editado_at && (
                        <span style={{ color: '#6b6b6b', fontStyle: 'italic' }}>
                          {m.editado_por_otro ? `(editado por ${primerNombre(m.editado_por_nombre)})` : '(editado)'}
                        </span>
                      )}
                      {m.decision && (
                        <span style={{ background: '#fff1d6', color: '#7a4a00', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4 }}>Decisión</span>
                      )}
                      {(esMio || esAdmin) && !enEdicion && (
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
                          <button type="button" onClick={() => setEditando({ id: m.id, texto: m.texto || '' })}
                            aria-label={esMio ? 'Editar mi mensaje' : `Editar el mensaje de ${primerNombre(m.autor)}`}
                            style={{ font: 'inherit', fontSize: 11, padding: '1px 6px', border: 'none', borderRadius: 4, background: 'transparent', color: AZUL, cursor: 'pointer' }}>Editar</button>
                          <button type="button" onClick={() => borrar(m)}
                            aria-label={esMio ? 'Borrar mi mensaje' : `Borrar el mensaje de ${primerNombre(m.autor)}`}
                            style={{ font: 'inherit', fontSize: 11, padding: '1px 6px', border: 'none', borderRadius: 4, background: 'transparent', color: '#b91c1c', cursor: 'pointer' }}>Borrar</button>
                        </span>
                      )}
                    </div>
                    {enEdicion ? (
                      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <textarea aria-label="Editar mensaje" rows={2} value={editando.texto} autoFocus
                          onChange={e => setEditando({ ...editando, texto: e.target.value })}
                          style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
                        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button type="button" onClick={() => setEditando(null)} style={btnSec}>Cancelar</button>
                          <button type="button" onClick={guardarEdicion} style={{ ...btnPri, fontSize: 12, padding: '4px 10px' }}>Guardar</button>
                        </span>
                      </div>
                    ) : m.texto && (
                      <>
                      {m.tarea_id && (
                        <button type="button" onClick={() => irATarea(m.tarea_id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3, font: 'inherit', fontSize: 11, padding: '1px 7px', borderRadius: 10, border: '1px solid #c9d3e3', background: '#fff', color: AZUL, cursor: 'pointer', maxWidth: '100%' }}>
                          <span aria-hidden="true">↳</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sobre la tarea «{m.tarea_titulo || 'tarea borrada'}»</span>
                        </button>
                      )}
                      <p style={{ margin: '2px 0 0', lineHeight: 1.4, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                        {segmentar(m.texto, validos, miNombre).map((sg, i) => sg.mencion ? (
                          <span key={i} style={{ background: sg.fuerte ? '#fff1d6' : '#e6eef8', color: sg.fuerte ? '#7a4a00' : '#1d4f86', fontWeight: 600, padding: '0 3px', borderRadius: 4 }}>{sg.txt}</span>
                        ) : <span key={i}>{sg.txt}</span>)}
                      </p>
                      </>
                    )}
                    {m.archivos?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                        {m.archivos.map(a => a.tipo?.startsWith('image/') ? (
                          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" title={`Abrir ${a.nombre}`}>
                            <img src={a.url} alt={a.nombre} loading="lazy" style={{ display: 'block', width: 150, height: 98, objectFit: 'cover', borderRadius: 6, border: '1px solid #e0e0e0' }} />
                          </a>
                        ) : (
                          <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 9px', border: '1px solid #d6d9df', borderRadius: 6, background: '#fff', color: AZUL, textDecoration: 'none' }}>
                            PDF · {a.nombre}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={enviar} style={{ borderTop: '1px solid #e0e0e0', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {archivos.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {archivos.map((a, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, background: '#f6f7f9', borderRadius: 6, padding: '3px 8px' }}>
                  {a.name}
                  <button type="button" aria-label={`Quitar ${a.name}`} onClick={() => setArchivos(arr => arr.filter((_, j) => j !== i))}
                    style={{ border: 'none', background: 'none', font: 'inherit', fontSize: 15, cursor: 'pointer', color: '#595959', padding: '0 2px' }}>×</button>
                </span>
              ))}
            </div>
          )}
          {sugerencias.length > 0 && (
            <div role="listbox" aria-label="Mencionar a" style={{ border: '1px solid #d6d6d6', borderRadius: 8, background: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,0.08)', padding: 4, display: 'flex', flexDirection: 'column', maxWidth: 340 }}>
              {sugerencias.map(c => (
                <button key={c.id} type="button" role="option" aria-selected="false" onClick={() => elegir(c)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', font: 'inherit', fontSize: 13, padding: '5px 8px', border: 'none', borderRadius: 6, background: '#fff', color: '#1a1a1a', cursor: 'pointer' }}>
                  {c.id === 'todos'
                    ? <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', background: '#7a4a00', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>@</span>
                    : <Avatar id={c.id} nombre={c.completo} tam={22} />}
                  <span><strong style={{ fontWeight: 600 }}>@{c.nombre}</strong> <span style={{ color: '#595959', fontSize: 12 }}>{c.detalle}</span></span>
                </button>
              ))}
            </div>
          )}
          <textarea ref={textoRef} rows={2} value={draft} onChange={e => setDraft(e.target.value)} aria-label="Mensaje para el grupo"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !sugerencias.length) { e.preventDefault(); enviar(); } }}
            placeholder="Escribí un mensaje para el grupo… (Enter envía, Shift+Enter baja de línea)"
            style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 13 }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" hidden
              onChange={e => { setArchivos(arr => [...arr, ...Array.from(e.target.files || [])].slice(0, 6)); e.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()} style={btnSec}>Foto o archivo</button>
            <button type="button" onClick={mencionar} style={btnSec}><strong>@</strong> Mencionar</button>
            <button type="button" aria-pressed={decision} onClick={() => setDecision(d => !d)} style={{
              ...btnSec, background: decision ? '#fff1d6' : '#fff', borderColor: decision ? '#e0b45c' : '#c9c9c9',
              color: decision ? '#7a4a00' : '#1a1a1a', fontWeight: decision ? 600 : 400,
            }}>Marcar como decisión</button>
            <span style={{ flex: 1 }} />
            <button type="submit" disabled={enviando || (!draft.trim() && !archivos.length)}
              style={{ ...btnPri, opacity: enviando || (!draft.trim() && !archivos.length) ? 0.5 : 1 }}>
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </form>
      </section>

      <aside style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <section aria-label="Tareas pendientes" style={{ ...caja, padding: '8px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Pendientes</h2>
            <button type="button" onClick={irTareas} style={{ font: 'inherit', fontSize: 12, color: AZUL, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>Ver todas</button>
          </div>
          {tareas.map(t => (
            <label key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', borderTop: '1px solid #f0f0f0', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={t.hecha} onChange={() => alternarTarea(t)} style={{ marginTop: 2, width: 15, height: 15, accentColor: AZUL }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', lineHeight: 1.3 }}>{t.titulo}</span>
                <span style={{ display: 'block', fontSize: 11, color: t.vencida ? '#b91c1c' : '#595959' }}>
                  {t.responsable ? primerNombre(t.responsable) : 'Sin responsable'} · {t.fechaTxt}
                </span>
              </span>
            </label>
          ))}
          {!tareas.length && <p style={{ margin: 0, color: '#595959', fontSize: 12 }}>No hay tareas pendientes.</p>}
        </section>

        <section aria-label="Fotos y archivos" style={{ ...caja, padding: '8px 12px' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>Fotos y archivos <span style={{ color: '#595959', fontWeight: 400 }}>({galeria.length})</span></h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {galeria.slice(0, 9).map(g => (
              <a key={g.id} href={g.url} target="_blank" rel="noreferrer" style={{ minWidth: 0, color: 'inherit', textDecoration: 'none' }} title={g.nombre}>
                {g.tipo?.startsWith('image/')
                  ? <img src={g.url} alt={g.nombre} loading="lazy" style={{ display: 'block', width: '100%', height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid #e3e3e3' }} />
                  : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 6, border: '1px solid #e3e3e3', background: '#f6f7f9', fontSize: 11, fontWeight: 600, color: AZUL }}>PDF</span>}
                <span style={{ display: 'block', marginTop: 2, fontSize: 10, lineHeight: 1.25, color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.nombre}</span>
                <span style={{ display: 'block', fontSize: 10, lineHeight: 1.25, color: '#6b6b6b' }}>{primerNombre(g.autor)} · {diaDe(g.created_at)}</span>
              </a>
            ))}
          </div>
          {!galeria.length && <p style={{ margin: 0, color: '#595959', fontSize: 12 }}>Todavía no se subieron fotos ni archivos.</p>}
        </section>
      </aside>
    </div>
  );
}

// ═══════════════════════════════ Tareas ═══════════════════════════════
function Tareas({ datos, yo, personas, onRecargar, onError, alternarTarea, tareaAbierta, setTareaAbierta }) {
  const defResp = (personas.find(p => p.rol === 'Dibujante') || personas.find(p => String(p.usuario_id) === String(yo.id)) || personas[0])?.usuario_id || '';
  const enUnaSemana = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
  const [nt, setNt] = useState({ titulo: '', responsable_id: defResp, fecha_limite: enUnaSemana });
  const [guardando, setGuardando] = useState(false);

  const agregar = async (e) => {
    e.preventDefault();
    if (!nt.titulo.trim()) return;
    setGuardando(true);
    try {
      await post(`/seguimiento/proyectos/${datos.proyecto.id}/tareas`, nt);
      setNt(n => ({ ...n, titulo: '' }));
      await onRecargar();
    } catch (err) { onError(err.message); }
    finally { setGuardando(false); }
  };

  const todas = datos.tareas.map(vistaTarea);
  const pendientes = todas.filter(t => !t.hecha);
  const hechas = todas.filter(t => t.hecha);
  const fila = { display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center', padding: '4px 12px', fontSize: 13 };
  const comentariosDe = (tid) => datos.mensajes.filter(m => m.tarea_id === tid && !m.borrado_at);
  const filaTarea = (t, hecha) => {
    const abierta = tareaAbierta === t.id;
    return (
      <div key={t.id} id={`tarea-${t.id}`} style={{ borderBottom: '1px solid #f0f0f0', background: abierta ? '#fbfcfe' : undefined }}>
        <div style={{ ...fila, color: hecha ? '#595959' : undefined }}>
          <label style={{ flex: '999 1 260px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={hecha} onChange={() => alternarTarea(t)} style={{ width: 15, height: 15, accentColor: AZUL }} />
            <span style={{ textDecoration: hecha ? 'line-through' : 'none' }}>{t.titulo}</span>
          </label>
          <BotonComentarios cantidad={t.comentarios} abierto={abierta} onClick={() => setTareaAbierta(abierta ? null : t.id)} />
          <span style={{ flex: '1 1 160px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            {!hecha && t.responsable_id && <Avatar id={t.responsable_id} nombre={t.responsable} tam={20} />}
            {t.responsable || 'Sin responsable'}
          </span>
          <span style={{ flex: '0 0 120px', fontSize: 12, color: !hecha && t.vencida ? '#b91c1c' : '#595959', fontWeight: !hecha && t.vencida ? 600 : 400 }}>{t.fechaTxt}</span>
        </div>
        {abierta && (
          <ComentariosTarea proyectoId={datos.proyecto.id} tareaId={t.id} comentarios={comentariosDe(t.id)}
            onEnviado={onRecargar} onError={onError} autoFocus />
        )}
      </div>
    );
  };
  // Al llegar desde un comentario del grupo o de la reunión, se muestra la tarea
  useEffect(() => {
    if (tareaAbierta) document.getElementById(`tarea-${tareaAbierta}`)?.scrollIntoView({ block: 'center' });
  }, [tareaAbierta]);

  return (
    <div>
      <form onSubmit={agregar} style={{ ...caja, padding: '8px 12px', marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <label style={{ flex: '3 1 260px', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: '#595959' }}>
          Nueva tarea
          <input value={nt.titulo} onChange={e => setNt({ ...nt, titulo: e.target.value })} placeholder="Ej: Revisar planta de subsuelo" style={input} />
        </label>
        <label style={{ flex: '1 1 170px', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: '#595959' }}>
          Responsable
          <select value={nt.responsable_id} onChange={e => setNt({ ...nt, responsable_id: e.target.value })} style={input}>
            {personas.map(p => <option key={p.usuario_id} value={p.usuario_id}>{p.nombre} ({p.rol})</option>)}
          </select>
        </label>
        <label style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: '#595959' }}>
          Fecha límite
          <input type="date" value={nt.fecha_limite} onChange={e => setNt({ ...nt, fecha_limite: e.target.value })} style={input} />
        </label>
        <button type="submit" disabled={guardando || !nt.titulo.trim()} style={{ ...btnPri, opacity: guardando || !nt.titulo.trim() ? 0.5 : 1 }}>Agregar</button>
      </form>

      <section aria-label="Tareas pendientes" style={{ ...caja, overflow: 'hidden', marginBottom: 8 }}>
        <h2 style={tituloCaja}>Pendientes ({pendientes.length})</h2>
        {pendientes.map(t => filaTarea(t, false))}
        {!pendientes.length && <p style={{ margin: 0, padding: '8px 12px', fontSize: 13, color: '#595959' }}>No hay tareas pendientes.</p>}
      </section>

      {hechas.length > 0 && (
        <section aria-label="Tareas hechas" style={{ ...caja, overflow: 'hidden' }}>
          <h2 style={{ ...tituloCaja, color: '#595959' }}>Hechas ({hechas.length})</h2>
          {hechas.map(t => filaTarea(t, true))}
        </section>
      )}
    </div>
  );
}

// ═══════════════════════════════ Equipo ═══════════════════════════════
function Equipo({ datos, usuarios, onRecargar, onError }) {
  const [edicion, setEdicion] = useState(null); // { miembros: [{usuario_id, nombre, rol, encargo}], buscar }
  const [guardando, setGuardando] = useState(false);
  const pendientesDe = (uid) => datos.tareas.filter(t => !t.hecha && String(t.responsable_id) === String(uid)).length;
  const sociosIds = new Set(datos.socios.map(s => String(s.usuario_id)));
  const enEquipo = new Set(datos.equipo.map(e => String(e.usuario_id)));
  const ordenados = [...datos.equipo].sort((a, b) => ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol]);
  const grupos = [
    { titulo: 'Conducción', miembros: ordenados.filter(m => ['Project manager', 'Senior PM'].includes(m.rol)) },
    { titulo: 'Dibujantes', miembros: ordenados.filter(m => m.rol === 'Dibujante') },
    { titulo: 'Colaboradores', miembros: ordenados.filter(m => m.rol === 'Colaborador') },
    { titulo: 'Socios', miembros: datos.socios.filter(s => !enEquipo.has(String(s.usuario_id))).map(s => ({ ...s, rol: 'Socio' })) },
  ].filter(g => g.miembros.length);

  const empezar = () => setEdicion({ miembros: datos.equipo.map(e => ({ ...e, encargo: e.encargo || '' })), buscar: '' });
  const setMiembro = (uid, cambios) => setEdicion(ed => ({ ...ed, miembros: ed.miembros.map(m => String(m.usuario_id) === String(uid) ? { ...m, ...cambios } : m) }));
  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await put(`/seguimiento/proyectos/${datos.proyecto.id}/equipo`, {
        miembros: edicion.miembros.map(m => ({ usuario_id: m.usuario_id, rol: m.rol, encargo: m.encargo })),
      });
      setEdicion(null);
      await onRecargar();
    } catch (err) { onError(err.message); }
    finally { setGuardando(false); }
  };

  if (edicion) {
    const ids = new Set(edicion.miembros.map(m => String(m.usuario_id)));
    const q = edicion.buscar.trim().toLowerCase();
    const disponibles = usuarios.filter(u => !ids.has(String(u.id)) && !sociosIds.has(String(u.id)))
      .filter(u => !q || `${u.nombre} ${u.puesto}`.toLowerCase().includes(q));
    const sinPm = !edicion.miembros.some(m => m.rol === 'Project manager');
    const agregar = (u) => {
      const rol = u.rol === 'dibujante' ? 'Dibujante' : (sinPm ? 'Project manager' : 'Colaborador');
      setEdicion(ed => ({ ...ed, buscar: '', miembros: [...ed.miembros, { usuario_id: u.id, nombre: u.nombre, rol, encargo: '' }] }));
    };
    return (
      <form onSubmit={guardar} style={{ ...caja, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Editar equipo del proyecto</h2>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600 }}>Integrantes ({edicion.miembros.length})</p>
          <p style={{ margin: '0 0 4px', fontSize: 12, color: '#595959' }}>Elegí el rol de cada uno en este proyecto. El encargo es opcional: si lo dejás vacío, vale la responsabilidad estándar del rol (el texto en gris).</p>
          {edicion.miembros.map(m => (
            <div key={m.usuario_id} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', alignItems: 'center', padding: '4px 0', borderTop: '1px solid #f0f0f0', fontSize: 13 }}>
              <span style={{ flex: '1 1 170px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <Avatar id={m.usuario_id} nombre={m.nombre} tam={24} /><strong style={{ fontWeight: 600 }}>{m.nombre}</strong>
              </span>
              <select aria-label={`Rol de ${m.nombre} en el proyecto`} value={m.rol} onChange={e => setMiembro(m.usuario_id, { rol: e.target.value })} style={{ ...input, flex: '0 1 160px' }}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input aria-label={`Encargo de ${m.nombre} en este proyecto`} value={m.encargo} placeholder={RESP_ROL[m.rol]}
                onChange={e => setMiembro(m.usuario_id, { encargo: e.target.value })} style={{ ...input, flex: '999 1 280px', minWidth: 0 }} />
              <button type="button" aria-label={`Quitar a ${m.nombre} del equipo`} style={{ ...btnSec, color: '#b91c1c' }}
                onClick={() => setEdicion(ed => ({ ...ed, miembros: ed.miembros.filter(x => String(x.usuario_id) !== String(m.usuario_id)) }))}>Quitar</button>
            </div>
          ))}
          {sinPm && <p role="alert" style={{ margin: '4px 0 0', fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>El proyecto necesita al menos un project manager.</p>}
        </div>

        <div style={{ background: '#f7f8fa', border: '1px solid #e6e8ec', borderRadius: 8, padding: '8px 12px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, marginBottom: 6 }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Agregar desde la lista de usuarios</p>
              <p style={{ margin: 0, fontSize: 11, color: '#595959' }}>Los socios participan en todos los proyectos y no hace falta sumarlos.</p>
            </div>
            <input type="search" aria-label="Buscar usuario" value={edicion.buscar} onChange={e => setEdicion(ed => ({ ...ed, buscar: e.target.value }))}
              placeholder="Nombre o puesto…" style={{ ...input, minWidth: 220 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
            {disponibles.map(u => (
              <button key={u.id} type="button" onClick={() => agregar(u)} aria-label={`Agregar a ${u.nombre} al equipo`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', font: 'inherit', fontSize: 13, padding: '5px 8px', border: '1px solid #d6d9df', borderRadius: 8, background: '#fff', color: '#1a1a1a', cursor: 'pointer' }}>
                <Avatar id={u.id} nombre={u.nombre} tam={24} />
                <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}><strong style={{ fontWeight: 600 }}>{u.nombre}</strong><br /><span style={{ fontSize: 11, color: '#595959' }}>{u.puesto}</span></span>
                <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 600, color: AZUL }}>+ Agregar</span>
              </button>
            ))}
          </div>
          {!disponibles.length && <p style={{ margin: 0, fontSize: 12, color: '#595959' }}>{q ? 'Ningún usuario coincide con la búsqueda.' : 'Todos los usuarios ya están en el equipo.'}</p>}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => setEdicion(null)} style={{ ...btnSec, fontSize: 13, padding: '6px 14px' }}>Cancelar</button>
          <button type="submit" disabled={sinPm || guardando} style={{ ...btnPri, opacity: sinPm || guardando ? 0.5 : 1 }}>{guardando ? 'Guardando…' : 'Guardar equipo'}</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <p style={{ margin: 0, color: '#595959', maxWidth: 760, lineHeight: 1.4, fontSize: 12 }}>
          Cada rol tiene una responsabilidad estándar. Si en este proyecto alguien tiene un encargo puntual, se escribe acá y reemplaza al estándar.
        </p>
        <button type="button" onClick={empezar} style={btnPri}>Editar equipo</button>
      </div>
      {!datos.equipo.length && (
        <p style={{ ...caja, margin: '0 0 8px', padding: '8px 12px', fontSize: 13, color: '#595959' }}>Este proyecto todavía no tiene equipo. Tocá "Editar equipo" para armarlo.</p>
      )}
      {grupos.map(g => (
        <section key={g.titulo} aria-label={g.titulo} style={{ ...caja, overflow: 'hidden', marginBottom: 8 }}>
          <h2 style={{ ...tituloCaja, fontSize: 11, color: '#595959', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '5px 12px' }}>{g.titulo}</h2>
          {g.miembros.map(m => {
            const pend = pendientesDe(m.usuario_id);
            return (
              <div key={m.usuario_id} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center', padding: '5px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                <span style={{ flex: '1 1 210px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Avatar id={m.usuario_id} nombre={m.nombre} tam={24} />
                  <span><strong style={{ fontWeight: 600 }}>{m.nombre}</strong> <span style={{ fontSize: 12, color: '#595959' }}>· {m.rol}</span></span>
                </span>
                <span style={{ flex: '999 1 300px', minWidth: 0 }}>
                  <span style={{ lineHeight: 1.35 }}>{m.encargo || RESP_ROL[m.rol]}</span>
                  <span style={{ fontSize: 11, color: '#6b6b6b' }}> · {m.encargo ? 'Encargo en este proyecto' : 'Responsabilidad estándar del rol'}</span>
                </span>
                <span style={{ flex: '0 0 140px', fontSize: 12, color: '#595959' }}>{pend ? plural(pend, 'tarea pendiente', 'tareas pendientes') : 'Sin tareas pendientes'}</span>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

// ═══════════════════════════════ Historial ═══════════════════════════════
function Historial({ datos, esAdmin }) {
  const [filtro, setFiltro] = useState('todo');
  const filtros = [
    { k: 'todo', label: 'Todo' }, { k: 'decision', label: 'Decisiones' }, { k: 'foto', label: 'Archivos' },
    { k: 'tarea', label: 'Tareas' }, { k: 'equipo', label: 'Equipo' }, { k: 'etapa', label: 'Etapas' },
    ...(esAdmin ? [{ k: 'mensaje', label: 'Mensajes editados o borrados' }] : []),
  ];
  const lista = datos.historial.filter(h => filtro === 'todo' || h.tipo === filtro);
  return (
    <div>
      <div role="group" aria-label="Filtrar historial" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {filtros.map(f => (
          <button key={f.k} type="button" aria-pressed={filtro === f.k} onClick={() => setFiltro(f.k)} style={{
            font: 'inherit', fontSize: 12, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
            border: `1px solid ${filtro === f.k ? AZUL : '#c9c9c9'}`, background: filtro === f.k ? AZUL : '#fff', color: filtro === f.k ? '#fff' : '#1a1a1a',
          }}>{f.label}</button>
        ))}
      </div>
      <section aria-label="Historial del proyecto" style={{ ...caja, overflow: 'hidden' }}>
        {lista.map(h => {
          const tt = TIPOS_HIST[h.tipo] || TIPOS_HIST.equipo;
          return (
            <div key={h.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', alignItems: 'baseline', padding: '4px 12px', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
              <span style={{ flex: '0 0 92px', fontSize: 12, color: '#595959' }}>{cuando(h.created_at)}</span>
              <span style={{ flex: '0 0 64px', textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4, background: tt.bg, color: tt.fg }}>{tt.t}</span>
              <span style={{ flex: '999 1 280px', minWidth: 0, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{h.texto}</span>
            </div>
          );
        })}
        {!lista.length && <p style={{ margin: 0, padding: '8px 12px', fontSize: 13, color: '#595959' }}>No hay movimientos de este tipo.</p>}
      </section>
    </div>
  );
}

// ═══════════════════════════════ Pantalla ═══════════════════════════════
export default function ProyectoSeguimiento({ base }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario, esAdmin } = useAuth();
  const [datos, setDatos] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('grupo');
  const [tareaAbierta, setTareaAbierta] = useState(null);
  const [params, setParams] = useSearchParams();

  const cargar = useCallback(async (marcarLeido = false) => {
    try {
      const d = await get(`/seguimiento/proyectos/${id}`);
      setDatos(d);
      if (marcarLeido) {
        await post(`/seguimiento/proyectos/${id}/leido`, {});
        window.dispatchEvent(new Event('seguimiento:leido'));
      }
    } catch (err) { setError(err.message); }
  }, [id]);

  useEffect(() => { setDatos(null); setTab('grupo'); setTareaAbierta(null); cargar(true); }, [cargar]);
  // ?tarea=<id> (por ejemplo, desde la reunión de revisión) abre esa tarea con sus comentarios
  useEffect(() => {
    const t = params.get('tarea');
    if (t) { setTab('tareas'); setTareaAbierta(t); setParams({}, { replace: true }); }
  }, [params, setParams]);
  useEffect(() => { get('/seguimiento/usuarios').then(setUsuarios).catch(() => {}); }, []);
  // Se actualiza solo cada 15 s (si la pestaña del navegador está a la vista)
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') cargar(tab === 'grupo'); }, 15000);
    return () => clearInterval(t);
  }, [cargar, tab]);

  // Integrantes del proyecto (equipo + socios), con su rol en el proyecto
  const personas = useMemo(() => {
    if (!datos) return [];
    const enEquipo = new Set(datos.equipo.map(e => String(e.usuario_id)));
    return [
      ...[...datos.equipo].sort((a, b) => ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol]),
      ...datos.socios.filter(s => !enEquipo.has(String(s.usuario_id))).map(s => ({ ...s, rol: 'Socio' })),
    ];
  }, [datos]);
  const rolDe = (uid) => personas.find(p => String(p.usuario_id) === String(uid))?.rol || '';

  if (!datos) return (
    <div style={{ padding: '20px 24px' }}>
      {error ? <AlertaError mensaje={error} /> : <p style={{ color: '#666', fontSize: 14 }}>Cargando…</p>}
    </div>
  );

  const alternarTarea = async (t) => {
    try { await patch(`/seguimiento/tareas/${t.id}`, { hecha: !t.hecha }); await cargar(); }
    catch (err) { setError(err.message); }
  };
  const cambiarEtapa = async (e) => {
    try { await put(`/seguimiento/proyectos/${id}/etapa`, { etapa: Number(e.target.value) }); await cargar(); }
    catch (err) { setError(err.message); }
  };

  const pendientes = datos.tareas.filter(t => !t.hecha).length;
  const tabs = [
    { k: 'grupo', label: 'Grupo' },
    { k: 'tareas', label: `Tareas (${pendientes})` },
    { k: 'equipo', label: 'Equipo' },
    { k: 'historial', label: 'Historial' },
  ];
  const comunes = { datos, yo: usuario, esAdmin, personas, rolDe, onRecargar: cargar, onError: setError, alternarTarea };

  return (
    <div style={{ padding: '14px 20px 20px', maxWidth: 1280 }}>
      {/* Cabecera compacta: lo justo para ubicarse; el detalle del equipo está en la pestaña Equipo */}
      <div style={{ ...caja, padding: '7px 12px', marginBottom: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
        <button type="button" onClick={() => navigate(base)} aria-label="Volver a todos los proyectos"
          style={{ font: 'inherit', fontSize: 13, color: AZUL, background: 'transparent', border: '1px solid #d6d9df', padding: '4px 9px', borderRadius: 6, cursor: 'pointer' }}>← Proyectos</button>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{datos.proyecto.nombre}</h1>
            <span style={{ fontSize: 12, color: '#595959' }}>{datos.proyecto.cliente_nombre}</span>
          </div>
          <LinkDrive proyectoId={datos.proyecto.id} url={datos.proyecto.drive_url} onGuardado={cargar} onError={setError} />
        </div>
        <button type="button" onClick={() => setTab('equipo')}
          title={`Equipo: ${personas.map(p => `${p.nombre} (${p.rol})`).join(', ')}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: 'inherit', fontSize: 12, color: '#1a1a1a', background: 'transparent', border: 'none', padding: '3px 6px', borderRadius: 6, cursor: 'pointer' }}>
          <span style={{ display: 'inline-flex', paddingLeft: 5 }}>
            {personas.slice(0, 8).map(p => <span key={p.usuario_id} style={{ marginLeft: -5 }}><Avatar id={p.usuario_id} nombre={p.nombre} tam={20} borde /></span>)}
          </span>
          Equipo ({personas.length})
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#595959' }}>
          Etapa
          <select value={datos.proyecto.etapa} onChange={cambiarEtapa} style={{ ...input, padding: '4px 8px' }}>
            {ETAPAS.map((e, i) => <option key={e} value={i}>{e}</option>)}
          </select>
        </label>
      </div>

      <div role="tablist" aria-label="Secciones del proyecto" style={{ display: 'flex', gap: 2, borderBottom: '1px solid #e0e0e0', marginBottom: 10, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)} style={{
            font: 'inherit', fontSize: 13, background: 'none', border: 'none', borderBottom: `3px solid ${tab === t.k ? AZUL : 'transparent'}`,
            color: tab === t.k ? '#1a1a1a' : '#595959', fontWeight: tab === t.k ? 600 : 400, padding: '6px 12px 5px', cursor: 'pointer', marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      <AlertaError mensaje={error} onCerrar={() => setError('')} />

      {tab === 'grupo' && <Grupo {...comunes} irTareas={() => setTab('tareas')} irATarea={(tid) => { setTareaAbierta(tid); setTab('tareas'); }} />}
      {tab === 'tareas' && <Tareas {...comunes} tareaAbierta={tareaAbierta} setTareaAbierta={setTareaAbierta} />}
      {tab === 'equipo' && <Equipo datos={datos} usuarios={usuarios} onRecargar={cargar} onError={setError} />}
      {tab === 'historial' && <Historial datos={datos} esAdmin={esAdmin} />}
    </div>
  );
}
