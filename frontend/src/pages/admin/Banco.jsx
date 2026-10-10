import { useState, useEffect, useRef, useCallback } from 'react';
import { get, post, getAccessToken } from '../../lib/api';
import { useDestinatarios } from '../../hooks/useEgresos';
import { FormIngreso } from './Ingresos';
import { FormEgreso } from './Egresos';
import {
  EncabezadoSeccion, Boton, Tabla, Fila, Celda, Modal, AlertaError, Buscador, AZUL,
} from '../../components/ui';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const fmt = (n) => `${Number(n) < 0 ? '−' : ''}$ ${Math.abs(Number(n || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtM = (n) => {
  const v = Math.abs(Number(n || 0));
  const signo = Number(n) < 0 ? '−' : '';
  return v >= 1e6 ? `${signo}$ ${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M` : `${signo}${fmt(v)}`;
};
const iso = (f) => (f ? String(f).slice(0, 10) : '');
const fmtF = (f) => {
  if (!f) return '—';
  const [a, m, d] = iso(f).split('-');
  return `${d}/${m}/${a}`;
};
const fmtCuit = (c) => (c && c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);

// Texto de una coincidencia y datos para vincularla
const diasTxt = (d) => (d ? ` (${d} día${d > 1 ? 's' : ''} de diferencia)` : ' (mismo día)');
const textoCoincidencia = (x) => x.tipo === 'liquidacion'
  ? `Liquidación de horas de ${x.nombre} — ${x.mes}/${x.anio} (${x.cantidad} egreso${x.cantidad > 1 ? 's' : ''} por proyecto${x.monotributo ? ' + monotributo' : ''})${diasTxt(x.dias)}`
  : `${x.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} del ${fmtF(x.fecha)} · ${x.nombre}${x.proyecto ? ` · ${x.proyecto}` : ''}${diasTxt(x.dias)}`;
const datosVinculo = (x) => x.tipo === 'ingreso' ? { ingreso_id: x.id }
  : x.tipo === 'liquidacion' ? { egreso_ids: x.egreso_ids, liquidacion_id: x.liquidacion_id }
  : { egreso_ids: [x.id] };

const PESTANAS = [
  { id: 'pendiente', label: 'Por revisar', filtro: m => m.estado === 'pendiente' },
  { id: 'sistema',   label: 'Ya en el sistema', filtro: m => m.estado === 'vinculado' || m.estado === 'creado' },
  { id: 'inversion', label: 'Fondos e intereses', filtro: m => m.estado === 'inversion' },
  { id: 'ignorado',  label: 'Ignorados', filtro: m => m.estado === 'ignorado' },
  { id: 'todos',     label: 'Todos', filtro: () => true },
];

const ESTADO_INFO = {
  pendiente: { texto: 'Por revisar', bg: '#fff8e1', color: '#8a5a00' },
  vinculado: { texto: 'Vinculado', bg: '#e8f5e9', color: '#1b5e20' },
  creado:    { texto: 'Creado desde el banco', bg: '#e3f2fd', color: '#0d47a1' },
  inversion: { texto: 'Fondo / interés', bg: '#f3e5f5', color: '#4a148c' },
  ignorado:  { texto: 'Ignorado', bg: '#f5f5f5', color: '#666' },
};

function BadgeEstado({ estado }) {
  const e = ESTADO_INFO[estado] || ESTADO_INFO.pendiente;
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: e.bg, color: e.color, whiteSpace: 'nowrap' }}>{e.texto}</span>;
}

function Tarjeta({ label, valor, sub, color = '#1a1a1a' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '14px 18px' }}>
      <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '19px', fontWeight: 600, color }}>{valor}</p>
      {sub && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>{sub}</p>}
    </div>
  );
}

// ── Arqueo ───────────────────────────────────────────────────────────────────
function PanelArqueo({ arqueo }) {
  const [verSinBanco, setVerSinBanco] = useState(false);
  if (!arqueo || arqueo.vacio) return null;
  const pe = arqueo.por_estado;
  const total = Object.values(pe).reduce((a, e) => a + e.cantidad, 0);
  const resueltos = total - pe.pendiente.cantidad;
  const netoFondos = -(arqueo.fondos.suscripciones + arqueo.fondos.rescates_e_intereses);
  const sinBanco = [
    ...arqueo.ingresos_sin_banco.map(x => ({ ...x, tipo: 'Ingreso' })),
    ...arqueo.egresos_sin_banco.map(x => ({ ...x, tipo: 'Egreso' })),
  ].sort((a, b) => iso(b.fecha).localeCompare(iso(a.fecha)));

  return (
    <div style={{ marginBottom: '24px' }}>
      <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#666' }}>
        Arqueo de la cuenta del <strong>{fmtF(arqueo.desde)}</strong> al <strong>{fmtF(arqueo.hasta)}</strong>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '12px' }}>
        <Tarjeta label="Saldo inicial" valor={fmt(arqueo.saldo_inicial)} sub={`al ${fmtF(arqueo.desde)}`} />
        <Tarjeta label="Entró" valor={fmtM(arqueo.creditos)} color="#1b5e20" />
        <Tarjeta label="Salió" valor={fmtM(arqueo.debitos)} color="#b71c1c" />
        <Tarjeta label="Saldo según banco" valor={fmt(arqueo.saldo_final)} sub={`al ${fmtF(arqueo.hasta)}`} color={AZUL} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '14px 18px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revisión</p>
          <div style={{ height: '8px', background: '#f0f0f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{ height: '100%', width: `${total ? (resueltos / total) * 100 : 0}%`, background: '#2e7d32' }} />
          </div>
          <p style={{ margin: 0, fontSize: '13px' }}>
            <strong>{resueltos}</strong> de {total} movimientos resueltos
            {pe.pendiente.cantidad > 0 && <span style={{ color: '#8a5a00' }}> · {pe.pendiente.cantidad} por revisar</span>}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>
            {pe.vinculado.cantidad} vinculados · {pe.creado.cantidad} creados · {pe.inversion.cantidad} fondos · {pe.ignorado.cantidad} ignorados
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '14px 18px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fondos de inversión</p>
          <p style={{ margin: 0, fontSize: '13px' }}>Enviado a fondos: <strong>{fmtM(-arqueo.fondos.suscripciones)}</strong></p>
          <p style={{ margin: '2px 0 0', fontSize: '13px' }}>Volvió (rescates e intereses): <strong>{fmtM(arqueo.fondos.rescates_e_intereses)}</strong></p>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#888' }}>
            {netoFondos >= 0
              ? <>Neto que salió hacia fondos en el período: {fmtM(netoFondos)}</>
              : <>Volvió más de lo que salió en el período: {fmtM(-netoFondos)} (incluye rendimientos)</>}
          </p>
        </div>
      </div>

      {arqueo.huecos.length > 0 && (
        <div style={{ marginTop: '12px', background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#7a4b00' }}>
          <strong>⚠ Faltan movimientos.</strong> El saldo no encadena en {arqueo.huecos.length === 1 ? 'este período' : 'estos períodos'}; probablemente falta subir un resumen:
          <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
            {arqueo.huecos.map((h, i) => <li key={i}>Entre el {fmtF(h.desde)} y el {fmtF(h.hasta)} — diferencia de {fmt(h.diferencia)}</li>)}
          </ul>
        </div>
      )}

      {sinBanco.length > 0 && (
        <div style={{ marginTop: '12px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '12px 16px', fontSize: '13px' }}>
          <button onClick={() => setVerSinBanco(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '13px', color: AZUL, fontFamily: 'inherit' }}>
            {verSinBanco ? '▾' : '▸'} <strong>{sinBanco.length}</strong> registro{sinBanco.length !== 1 ? 's' : ''} de la app (del estudio, en pesos) no {sinBanco.length !== 1 ? 'aparecen' : 'aparece'} en el banco en este período
          </button>
          {verSinBanco && (
            <div style={{ marginTop: '8px' }}>
              <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#888' }}>Pueden ser pagos en efectivo, de otra cuenta, o movimientos que todavía no vinculaste.</p>
              {sinBanco.map(x => (
                <div key={x.tipo + x.id} style={{ display: 'flex', gap: '12px', padding: '4px 0', borderTop: '1px solid #f0f0f0' }}>
                  <span style={{ width: '80px', color: '#666' }}>{fmtF(x.fecha)}</span>
                  <span style={{ width: '60px', color: x.tipo === 'Ingreso' ? '#1b5e20' : '#b71c1c' }}>{x.tipo}</span>
                  <span style={{ flex: 1 }}>{x.nombre}{x.descripcion ? ` — ${x.descripcion}` : ''}</span>
                  <span style={{ fontWeight: 500 }}>{fmt(x.monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sugerencia y acciones de cada movimiento ─────────────────────────────────
function Sugerencia({ m, eleccion, onElegir }) {
  if (m.estado !== 'pendiente') {
    if (m.ingreso_id) return <span style={{ fontSize: '12px', color: '#555' }}>Ingreso del {fmtF(m.ingreso_fecha)} · {m.ingreso_cliente}{m.ingreso_proyecto ? ` · ${m.ingreso_proyecto}` : ' · sin proyecto'}</span>;
    if (m.liquidacion_mes) return <span style={{ fontSize: '12px', color: '#555' }}>Liquidación de horas de {m.egreso_destinatario} — {m.liquidacion_mes}/{m.liquidacion_anio} ({m.egresos_cantidad} egreso{m.egresos_cantidad > 1 ? 's' : ''}{m.egreso_proyectos ? `: ${m.egreso_proyectos}` : ''})</span>;
    if (m.egresos_cantidad > 0) return <span style={{ fontSize: '12px', color: '#555' }}>Egreso del {fmtF(m.egreso_fecha)} · {m.egreso_destinatario}{m.egresos_cantidad > 1 ? ` y ${m.egresos_cantidad - 1} más` : ''}{m.egreso_proyectos ? ` · ${m.egreso_proyectos}` : ''}</span>;
    if (m.estado === 'inversion') return <span style={{ fontSize: '12px', color: '#555' }}>{m.detalle || 'Fondo de inversión'}</span>;
    return null;
  }
  if (m.clase === 'inversion') {
    return <span style={{ fontSize: '12px', color: '#4a148c' }}>Parece {m.detalle?.toLowerCase() || 'un movimiento de fondos'}: no es ingreso ni egreso</span>;
  }
  if (m.coincidencias?.length) {
    const c = m.coincidencias;
    const texto = textoCoincidencia;
    return (
      <div style={{ fontSize: '12px' }}>
        <span style={{ color: '#1b5e20', fontWeight: 500 }}>✓ Ya registrado{c.length > 1 ? ` (${c.length} posibles)` : ''}:</span>
        {c.length === 1
          ? <div style={{ color: '#555' }}>{texto(c[0])}</div>
          : (
            <select value={eleccion || c[0].id} onChange={e => onElegir(e.target.value)} style={{ display: 'block', marginTop: '2px', fontSize: '12px', maxWidth: '320px' }}>
              {c.map(x => <option key={x.id} value={x.id}>{texto(x)}</option>)}
            </select>
          )}
      </div>
    );
  }
  const quien = Number(m.importe) > 0 ? m.cliente_sugerido_nombre : m.destinatario_sugerido_nombre;
  if (m.destinatario_es_dibujante) {
    return (
      <span style={{ fontSize: '12px', color: '#8a5a00' }}>
        Pago a <strong>{quien}</strong> (dibujante) sin liquidación con el mismo monto. Con <strong>Asociar…</strong> elegís
        la liquidación que corresponde; si todavía no la hiciste, liquidá primero en <strong>Horas</strong>.
      </span>
    );
  }
  return (
    <span style={{ fontSize: '12px', color: '#666' }}>
      {quien
        ? <>Nuevo {Number(m.importe) > 0 ? 'ingreso de' : 'egreso a'} <strong>{quien}</strong>{m.proyecto_sugerido_nombre && <> · {m.proyecto_sugerido_nombre}</>}</>
        : m.cuit ? <>CUIT {fmtCuit(m.cuit)} sin cargar en la app</> : 'Sin coincidencias'}
    </span>
  );
}

// ── Asociar a mano con un registro existente ─────────────────────────────────
function ModalAsociar({ mov, clientes, destinatarios, onCerrar, onVincular }) {
  const credito = Number(mov.importe) > 0;
  const [quien, setQuien] = useState(credito ? (mov.cliente_sugerido_id || '') : (mov.destinatario_sugerido_id || ''));
  const [opciones, setOpciones] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [elegido, setElegido] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setElegido(null); setOpciones(null); setError('');
    if (!quien) return;
    setCargando(true);
    get(`/banco/movimientos/${mov.id}/opciones?${credito ? 'cliente_id' : 'destinatario_id'}=${quien}`)
      .then(setOpciones).catch(err => setError(err.message)).finally(() => setCargando(false));
  }, [quien, mov.id, credito]);

  const confirmar = async () => {
    setGuardando(true); setError('');
    try {
      await onVincular(elegido.tipo === 'ingreso' ? { ingreso_id: elegido.id }
        : elegido.tipo === 'liquidacion' ? { egreso_ids: elegido.egreso_ids, liquidacion_id: elegido.id }
        : { egreso_ids: [elegido.id] });
    } catch (err) { setError(err.message); setGuardando(false); }
  };

  const Opcion = ({ x, tipo, titulo, detalle }) => {
    const sel = elegido && elegido.tipo === tipo && String(elegido.id) === String(x.id);
    return (
      <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', background: sel ? '#eef2ff' : 'transparent' }}>
        <input type="radio" name="asociar" checked={Boolean(sel)} onChange={() => setElegido({ ...x, tipo })} style={{ marginTop: '3px' }} />
        <span style={{ flex: 1, fontSize: '13px' }}>
          <strong>{titulo}</strong>
          <span style={{ display: 'block', fontSize: '12px', color: '#666' }}>{detalle}</span>
        </span>
        <span style={{ textAlign: 'right', fontSize: '13px', whiteSpace: 'nowrap' }}>
          <strong>{fmt(x.monto)}</strong>
          <span style={{ display: 'block', fontSize: '11px', color: x.diferencia === 0 ? '#1b5e20' : '#b26a00' }}>
            {x.diferencia === 0 ? '✓ mismo monto' : `diferencia ${fmt(x.diferencia)}`}
          </span>
        </span>
      </label>
    );
  };

  const liqs = opciones?.liquidaciones || [], egs = opciones?.egresos || [], ings = opciones?.ingresos || [];
  const vacio = opciones && !liqs.length && !egs.length && !ings.length;
  const lista = credito ? clientes.filter(c => c.activo !== false).map(c => ({ id: c.id, nombre: c.nombre_razon_social }))
    : destinatarios.map(d => ({ id: d.id, nombre: d.nombre }));

  return (
    <Modal titulo={`Asociar ${credito ? 'cobro' : 'pago'} del banco — ${fmt(mov.importe)}`} onCerrar={onCerrar} ancho={680}>
      <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#666' }}>Banco: {fmtF(mov.fecha)} · {mov.descripcion}</p>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{credito ? 'Cliente' : 'Destinatario'}</label>
      <select value={quien} onChange={e => setQuien(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #d0d0d0', fontSize: '14px', marginBottom: '14px', fontFamily: 'inherit' }}>
        <option value="">Seleccioná…</option>
        {[...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
      </select>
      {error && <AlertaError mensaje={error} onCerrar={() => setError('')} />}
      {cargando && <p style={{ fontSize: '13px', color: '#666' }}>Buscando…</p>}
      {vacio && <p style={{ fontSize: '13px', color: '#666' }}>No hay {credito ? 'ingresos' : 'liquidaciones ni egresos'} sin vincular para {credito ? 'este cliente' : 'este destinatario'}.</p>}
      {opciones && !vacio && (
        <div style={{ border: '1px solid #e0e0e0', borderRadius: '10px', maxHeight: '340px', overflowY: 'auto', marginBottom: '14px' }}>
          {liqs.length > 0 && <p style={{ margin: 0, padding: '8px 12px', fontSize: '11px', color: '#666', textTransform: 'uppercase', background: '#fafafa' }}>Liquidaciones de horas</p>}
          {liqs.map(l => <Opcion key={'l' + l.id} x={l} tipo="liquidacion" titulo={`Liquidación ${l.mes}/${l.anio}`}
            detalle={`Liquidada el ${fmtF(l.fecha)} · ${l.cantidad} egreso${l.cantidad > 1 ? 's' : ''}${l.proyectos ? ` (${l.proyectos})` : ''}${l.monotributo ? ` · incluye monotributo ${fmt(l.monotributo)}` : ''}`} />)}
          {egs.length > 0 && <p style={{ margin: 0, padding: '8px 12px', fontSize: '11px', color: '#666', textTransform: 'uppercase', background: '#fafafa' }}>Egresos</p>}
          {egs.map(e => <Opcion key={'e' + e.id} x={e} tipo="egreso" titulo={`Egreso del ${fmtF(e.fecha)}`} detalle={[e.proyecto, e.descripcion].filter(Boolean).join(' · ') || '—'} />)}
          {ings.map(i => <Opcion key={'i' + i.id} x={i} tipo="ingreso" titulo={`Ingreso del ${fmtF(i.fecha)}`} detalle={[i.proyecto, i.comprobante, i.descripcion].filter(Boolean).join(' · ') || '—'} />)}
        </div>
      )}
      {elegido && elegido.diferencia !== 0 && (
        <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#7a4b00', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px', padding: '8px 10px' }}>
          El monto del banco y el del registro no coinciden (diferencia de {fmt(elegido.diferencia)}). Se vincula igual; si la diferencia es un gasto aparte, cargalo como egreso.
        </p>
      )}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={confirmar} disabled={!elegido || guardando}>{guardando ? 'Vinculando…' : 'Vincular'}</Boton>
      </div>
    </Modal>
  );
}

export default function Banco() {
  const [movs, setMovs] = useState([]);
  const [arqueo, setArqueo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [pestana, setPestana] = useState('pendiente');
  const [buscar, setBuscar] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [errorSubida, setErrorSubida] = useState(null);
  const [elecciones, setElecciones] = useState({});
  const [ocupado, setOcupado] = useState(null);
  const [modal, setModal] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState('');
  const [clientes, setClientes] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [socios, setSocios] = useState([]);
  const inputRef = useRef(null);
  const { destinatarios, crear: crearDestinatario } = useDestinatarios();

  const cargar = useCallback(async () => {
    try {
      const [m, a] = await Promise.all([get('/banco/movimientos'), get('/banco/arqueo')]);
      setMovs(m); setArqueo(a); setError('');
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => {
    cargar();
    Promise.all([get('/clientes'), get('/proyectos'), get('/socios')])
      .then(([c, p, s]) => { setClientes(c); setProyectos(p); setSocios(s); }).catch(() => {});
  }, [cargar]);

  const subirResumen = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setSubiendo(true); setResultado(null); setErrorSubida(null);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const resp = await fetch(`${BASE}/banco/importar`, {
        method: 'POST', headers: { Authorization: `Bearer ${getAccessToken()}` }, body: fd, credentials: 'include',
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setErrorSubida({ mensaje: data.error || 'Error al leer el resumen', detalles: data.detalles }); return; }
      setResultado(data);
      setPestana('pendiente');
      await cargar();
    } catch (err) {
      setErrorSubida({ mensaje: err.message });
    } finally { setSubiendo(false); }
  };

  const accion = async (id, fn) => {
    setOcupado(id); setError('');
    try { await fn(); await cargar(); }
    catch (err) { setError(err.message); }
    finally { setOcupado(null); }
  };
  const vincular = (m) => {
    const elegido = m.coincidencias.find(x => String(x.id) === String(elecciones[m.id] || m.coincidencias[0].id));
    return accion(m.id, () => post(`/banco/movimientos/${m.id}/vincular`, datosVinculo(elegido)));
  };
  const cambiarEstado = (m, estado) => accion(m.id, () => post(`/banco/movimientos/${m.id}/estado`, { estado }));

  // Confirmaciones en bloque (siempre con un paso de confirmación)
  const pendientes = movs.filter(m => m.estado === 'pendiente');
  const inversionesPend = pendientes.filter(m => m.clase === 'inversion');
  const coincidenciasUnicas = pendientes.filter(m => m.clase !== 'inversion' && m.coincidencias?.length === 1);
  const ejecutarBloque = async () => {
    const { tipo } = modal;
    setGuardando(true); setErrorModal('');
    try {
      if (tipo === 'bloque-inversiones') {
        for (const m of inversionesPend) await post(`/banco/movimientos/${m.id}/estado`, { estado: 'inversion' });
      } else {
        for (const m of coincidenciasUnicas) {
          await post(`/banco/movimientos/${m.id}/vincular`, datosVinculo(m.coincidencias[0]));
        }
      }
      setModal(null);
      await cargar();
    } catch (err) { setErrorModal(err.message); await cargar(); }
    finally { setGuardando(false); }
  };

  // Crear un ingreso/egreso nuevo a partir del movimiento y vincularlo
  const guardarNuevo = async (datos) => {
    const m = modal.mov;
    setGuardando(true); setErrorModal('');
    try {
      if (modal.tipo === 'crear-ingreso') {
        const nuevo = await post('/ingresos', datos);
        await post(`/banco/movimientos/${m.id}/vincular`, { ingreso_id: nuevo.id, creado: true });
      } else {
        const nuevo = await post('/egresos', datos);
        await post(`/banco/movimientos/${m.id}/vincular`, { egreso_ids: [nuevo.id], creado: true });
      }
      setModal(null);
      await cargar();
    } catch (err) { setErrorModal(err.message); }
    finally { setGuardando(false); }
  };

  const pestanaActual = PESTANAS.find(p => p.id === pestana);
  const b = buscar.toLowerCase();
  const visibles = movs.filter(pestanaActual.filtro).filter(m => !b
    || m.descripcion.toLowerCase().includes(b)
    || (m.cuit || '').includes(b.replace(/\D/g, '') || '¬')
    || String(Math.abs(Number(m.importe))).includes(b.replace(/\./g, '').replace(',', '.')));

  const btn = { padding: '4px 10px', fontSize: '12px' };

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <EncabezadoSeccion
        titulo="Banco"
        subtitulo="Cuenta en pesos · Banco Macro"
        accion={
          <>
            <input ref={inputRef} type="file" accept="application/pdf" onChange={subirResumen} style={{ display: 'none' }} />
            <Boton onClick={() => inputRef.current?.click()} disabled={subiendo}>{subiendo ? 'Leyendo resumen…' : '⬆ Subir resumen (PDF)'}</Boton>
          </>
        }
      />

      {resultado && (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#1b5e20', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
          <span>
            ✓ Se leyeron <strong>{resultado.total}</strong> movimientos del {fmtF(resultado.desde)} al {fmtF(resultado.hasta)} y los saldos cierran.{' '}
            <strong>{resultado.nuevos}</strong> nuevos{resultado.repetidos > 0 && <>; <strong>{resultado.repetidos}</strong> ya estaban importados y se descartaron</>}.
          </span>
          <button onClick={() => setResultado(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1b5e20' }}>✕</button>
        </div>
      )}
      {errorSubida && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#b71c1c' }}>
          <strong>{errorSubida.mensaje}</strong>
          {errorSubida.detalles?.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>{errorSubida.detalles.map((d, i) => <li key={i}>{d}</li>)}</ul>}
        </div>
      )}
      <AlertaError mensaje={error} onCerrar={() => setError('')} />

      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : !movs.length ? (
        <div style={{ background: '#fff', border: '2px dashed #c7d2fe', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
          <p style={{ margin: '0 0 6px', fontSize: '15px', color: '#1a1a1a' }}>Todavía no hay movimientos del banco.</p>
          <p style={{ margin: 0 }}>Descargá de home banking el PDF de "Últimos movimientos" de la cuenta y subilo con el botón de arriba.<br />
            Nada se carga como ingreso o egreso hasta que lo confirmes.</p>
        </div>
      ) : (
        <>
          <PanelArqueo arqueo={arqueo} />

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px', borderBottom: '1px solid #e0e0e0' }}>
            {PESTANAS.map(p => {
              const n = movs.filter(p.filtro).length;
              const activa = pestana === p.id;
              return (
                <button key={p.id} onClick={() => setPestana(p.id)} style={{
                  background: 'none', border: 'none', borderBottom: `2px solid ${activa ? AZUL : 'transparent'}`,
                  padding: '8px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: activa ? 600 : 400,
                  color: activa ? AZUL : '#666', fontFamily: 'inherit', marginBottom: '-1px',
                }}>{p.label} <span style={{ color: '#999' }}>({n})</span></button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Buscador value={buscar} onChange={setBuscar} placeholder="Buscar por concepto, CUIT o importe…" />
            {pestana === 'pendiente' && coincidenciasUnicas.length > 0 && (
              <Boton variante="secundario" style={btn} onClick={() => setModal({ tipo: 'bloque-vincular' })}>✓ Vincular las {coincidenciasUnicas.length} coincidencias seguras</Boton>
            )}
            {pestana === 'pendiente' && inversionesPend.length > 0 && (
              <Boton variante="secundario" style={btn} onClick={() => setModal({ tipo: 'bloque-inversiones' })}>Confirmar los {inversionesPend.length} movimientos de fondos</Boton>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
            <Tabla
              columnas={['Fecha', 'Concepto', 'Importe', 'Saldo', 'Qué es', 'Estado', '']}
              ordenable={[
                { campo: 'fecha', tipo: 'fecha' },
                { campo: 'descripcion', tipo: 'texto' },
                { campo: 'importe', tipo: 'numero' },
                null,
                null,
                { campo: 'estado', tipo: 'texto' },
                null,
              ]}
              datos={visibles}
              vacio={pestana === 'pendiente' ? '¡No queda nada por revisar!' : 'No hay movimientos en esta vista.'}
              renderFila={(m) => {
                const credito = Number(m.importe) > 0;
                const espera = ocupado === m.id;
                return (
                  <Fila key={m.id}>
                    <Celda style={{ whiteSpace: 'nowrap', color: '#666', fontSize: '13px' }}>{fmtF(m.fecha)}</Celda>
                    <Celda style={{ fontSize: '13px', maxWidth: '260px', wordBreak: 'break-word' }}>{m.descripcion}</Celda>
                    <Celda style={{ whiteSpace: 'nowrap', fontWeight: 600, color: credito ? '#1b5e20' : '#b71c1c' }}>{fmt(m.importe)}</Celda>
                    <Celda style={{ whiteSpace: 'nowrap', fontSize: '12px', color: '#999' }}>{m.saldo != null ? fmt(m.saldo) : '—'}</Celda>
                    <Celda><Sugerencia m={m} eleccion={elecciones[m.id]} onElegir={(id) => setElecciones(p => ({ ...p, [m.id]: id }))} /></Celda>
                    <Celda><BadgeEstado estado={m.estado} /></Celda>
                    <Celda align="right">
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap', opacity: espera ? 0.5 : 1 }}>
                        {m.estado === 'pendiente' ? (
                          <>
                            {m.clase === 'inversion' && <Boton style={btn} disabled={espera} onClick={() => cambiarEstado(m, 'inversion')}>Es fondo</Boton>}
                            {m.clase !== 'inversion' && m.coincidencias?.length > 0 && <Boton style={btn} disabled={espera} onClick={() => vincular(m)}>Vincular</Boton>}
                            {m.clase !== 'inversion' && (
                              <Boton variante={m.coincidencias?.length ? 'secundario' : 'primario'} style={btn} disabled={espera}
                                onClick={() => { setErrorModal(''); setModal({ tipo: credito ? 'crear-ingreso' : 'crear-egreso', mov: m }); }}>
                                {credito ? '+ Ingreso' : '+ Egreso'}
                              </Boton>
                            )}
                            {m.clase !== 'inversion' && <Boton variante="secundario" style={btn} disabled={espera} onClick={() => setModal({ tipo: 'asociar', mov: m })} title="Elegir un registro ya cargado aunque el monto o la fecha no coincidan">Asociar…</Boton>}
                            {m.clase !== 'inversion' && <Boton variante="secundario" style={btn} disabled={espera} onClick={() => cambiarEstado(m, 'inversion')} title="Movimiento de fondos de inversión">Fondo</Boton>}
                            <Boton variante="secundario" style={btn} disabled={espera} onClick={() => cambiarEstado(m, 'ignorado')} title="No se registra (por ejemplo, transferencia entre cuentas propias)">Ignorar</Boton>
                          </>
                        ) : (
                          <Boton variante="texto" style={{ ...btn, padding: '4px 0' }} disabled={espera} onClick={() => cambiarEstado(m, 'pendiente')}
                            title={m.estado === 'creado' ? 'Vuelve a "Por revisar". El ingreso/egreso creado NO se borra.' : 'Vuelve a "Por revisar"'}>
                            Deshacer
                          </Boton>
                        )}
                      </div>
                    </Celda>
                  </Fila>
                );
              }}
            />
          </div>
        </>
      )}

      {modal?.tipo === 'asociar' && (
        <ModalAsociar mov={modal.mov} clientes={clientes} destinatarios={destinatarios} onCerrar={() => setModal(null)}
          onVincular={async (datos) => { await post(`/banco/movimientos/${modal.mov.id}/vincular`, datos); setModal(null); await cargar(); }} />
      )}
      {modal?.tipo === 'crear-ingreso' && (
        <Modal titulo={`Nuevo ingreso desde el banco — ${fmt(modal.mov.importe)}`} onCerrar={() => setModal(null)} ancho={680}>
          <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#666' }}>Banco: {fmtF(modal.mov.fecha)} · {modal.mov.descripcion}</p>
          <FormIngreso
            inicial={{
              cliente_id: modal.mov.cliente_sugerido_id || '', proyecto_id: modal.mov.proyecto_sugerido_id || '',
              monto: String(Math.abs(Number(modal.mov.importe))),
              moneda: 'ARS', fecha: iso(modal.mov.fecha), es_del_estudio: true, descripcion: `Banco: ${modal.mov.descripcion}`,
            }}
            clientes={clientes} proyectos={proyectos} socios={socios}
            onGuardar={guardarNuevo} onCancelar={() => setModal(null)} guardando={guardando} errorServidor={errorModal} />
        </Modal>
      )}
      {modal?.tipo === 'crear-egreso' && (
        <Modal titulo={`Nuevo egreso desde el banco — ${fmt(modal.mov.importe)}`} onCerrar={() => setModal(null)} ancho={680}>
          <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#666' }}>Banco: {fmtF(modal.mov.fecha)} · {modal.mov.descripcion}</p>
          {modal.mov.destinatario_es_dibujante && (
            <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '12px', color: '#7a4b00' }}>
              ⚠ Es un pago a un dibujante. Si corresponde a horas trabajadas, cancelá y liquidalas en <strong>Horas</strong>:
              la liquidación crea los egresos por proyecto y después solo tenés que vincular este pago. Cargarlo acá
              y además liquidar las horas duplicaría el gasto.
            </div>
          )}
          <FormEgreso
            inicial={{
              destinatario_id: modal.mov.destinatario_sugerido_id || '', proyecto_id: modal.mov.proyecto_sugerido_id || '',
              categoria: modal.mov.destinatario_es_dibujante ? 'dibujantes' : (modal.mov.categoria_sugerida || 'generales'),
              monto: String(Math.abs(Number(modal.mov.importe))), moneda: 'ARS', fecha: iso(modal.mov.fecha),
              pagado_por_estudio: true, descripcion: `Banco: ${modal.mov.descripcion}`,
            }}
            destinatarioSugerido={!modal.mov.destinatario_sugerido_id && modal.mov.cuit ? { nombre: '', cuit: fmtCuit(modal.mov.cuit) } : null}
            proyectos={proyectos} socios={socios} destinatarios={destinatarios} onNuevoDestinatario={crearDestinatario}
            onGuardar={guardarNuevo} onCancelar={() => setModal(null)} guardando={guardando} errorServidor={errorModal} />
        </Modal>
      )}
      {(modal?.tipo === 'bloque-vincular' || modal?.tipo === 'bloque-inversiones') && (
        <Modal titulo={modal.tipo === 'bloque-vincular' ? 'Vincular coincidencias seguras' : 'Confirmar movimientos de fondos'} onCerrar={() => setModal(null)} ancho={620}>
          <AlertaError mensaje={errorModal} onCerrar={() => setErrorModal('')} />
          <p style={{ fontSize: '14px', margin: '0 0 10px' }}>
            {modal.tipo === 'bloque-vincular'
              ? 'Estos movimientos del banco coinciden con un único registro ya cargado (mismo importe, fecha cercana): un ingreso, un egreso o una liquidación de horas completa. Se van a vincular, sin crear registros nuevos:'
              : 'Estos movimientos son suscripciones, rescates de fondos o intereses. Se van a marcar como fondos: no se cargan como ingresos ni egresos.'}
          </p>
          <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', marginBottom: '16px' }}>
            {(modal.tipo === 'bloque-vincular' ? coincidenciasUnicas : inversionesPend).map(m => (
              <div key={m.id} style={{ display: 'flex', gap: '10px', padding: '6px 10px', fontSize: '12px', borderBottom: '1px solid #f3f3f3' }}>
                <span style={{ width: '72px', color: '#666' }}>{fmtF(m.fecha)}</span>
                <span style={{ flex: 1 }}>
                  {m.descripcion}
                  {modal.tipo === 'bloque-vincular' && <span style={{ color: '#1b5e20' }}> → {textoCoincidencia(m.coincidencias[0])}</span>}
                </span>
                <span style={{ fontWeight: 600, color: Number(m.importe) > 0 ? '#1b5e20' : '#b71c1c' }}>{fmt(m.importe)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Boton variante="secundario" onClick={() => setModal(null)}>Cancelar</Boton>
            <Boton onClick={ejecutarBloque} disabled={guardando}>{guardando ? 'Guardando…' : 'Confirmar'}</Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
