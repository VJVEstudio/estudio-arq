import { useState, useEffect } from 'react';
import { useEgresos, useDestinatarios } from '../../hooks/useEgresos';
import { get } from '../../lib/api';
import {
  EncabezadoSeccion, Boton, Tabla, Fila, Celda,
  Modal, Campo, Input, Select, Textarea, AlertaError, Buscador,
} from '../../components/ui';

const CATEGORIAS = [
  { value: 'servicios',  label: 'Servicios' },
  { value: 'impuestos',  label: 'Impuestos' },
  { value: 'generales',  label: 'Gastos generales' },
  { value: 'dibujantes', label: 'Dibujantes' },
];
const TIPOS_DEST = [
  { value: 'servicios',   label: 'Empresa de servicios' },
  { value: 'impuesto',    label: 'Organismo impositivo' },
  { value: 'profesional', label: 'Profesional' },
  { value: 'otro',        label: 'Otro' },
];
const CAT_COLORES = {
  servicios:  { bg: '#e3f2fd', color: '#0d47a1' },
  impuestos:  { bg: '#fff8e1', color: '#f57f17' },
  generales:  { bg: '#f3e5f5', color: '#4a148c' },
  dibujantes: { bg: '#e8f5e9', color: '#1b5e20' },
};
const fmt = (n, moneda = 'ARS') =>
  moneda === 'USD'
    ? `U$S ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtFecha = (f) => {
  if (!f) return '—';
  const fecha = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR');
};

function BadgeCategoria({ cat }) {
  const c = CAT_COLORES[cat] || { bg: '#f5f5f5', color: '#333' };
  const label = CATEGORIAS.find(x => x.value === cat)?.label || cat;
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: c.bg, color: c.color }}>{label}</span>;
}

function TarjetasResumen({ resumen }) {
  const totales = { ARS: 0, USD: 0 };
  resumen.forEach(r => { totales[r.moneda] = (totales[r.moneda] || 0) + Number(r.total); });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '28px' }}>
      {[
        { label: 'Total egresos ARS', valor: fmt(totales.ARS, 'ARS'), color: '#b71c1c' },
        { label: 'Total egresos USD', valor: fmt(totales.USD, 'USD'), color: '#880e4f' },
      ].map(t => (
        <div key={t.label} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '16px 20px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</p>
          <p style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: t.color }}>{t.valor}</p>
        </div>
      ))}
    </div>
  );
}

function NuevoDestinatario({ onCrear, onCancelar }) {
  const [form, setForm] = useState({ nombre: '', tipo: 'otro', cuit: '', cbu: '', notas: '' });
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setGuardando(true);
    try { await onCrear(form); } finally { setGuardando(false); }
  };
  return (
    <form onSubmit={handleSubmit} style={{ border: '1px solid #d0d0d0', borderRadius: '10px', padding: '16px', marginTop: '8px', background: '#fafafa' }}>
      <p style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 500 }}>Nuevo destinatario</p>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <Campo label="Nombre *"><Input value={form.nombre} onChange={set('nombre')} placeholder="Ej: AFIP" autoFocus /></Campo>
        <Campo label="Tipo">
          <Select value={form.tipo} onChange={set('tipo')}>
            {TIPOS_DEST.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Campo>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <Campo label="CUIT"><Input value={form.cuit} onChange={set('cuit')} placeholder="20-00000000-0" /></Campo>
        <Campo label="CBU"><Input value={form.cbu} onChange={set('cbu')} /></Campo>
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando || !form.nombre.trim()}>{guardando ? 'Guardando…' : 'Crear y seleccionar'}</Boton>
      </div>
    </form>
  );
}

function FormEgreso({ inicial = {}, proyectos, socios, destinatarios, onNuevoDestinatario, onGuardar, onCancelar, guardando, errorServidor }) {
  const [form, setForm] = useState({
    destinatario_id:    inicial.destinatario_id    || '',
    proyecto_id:        inicial.proyecto_id        || '',
    categoria:          inicial.categoria          || 'generales',
    monto:              inicial.monto              || '',
    moneda:             inicial.moneda             || 'ARS',
    pagado_por_estudio: inicial.pagado_por_estudio !== undefined ? inicial.pagado_por_estudio : true,
    socio_id:           inicial.socio_id           || '',
    fecha:              inicial.fecha              || new Date().toISOString().split('T')[0],
    comprobante:        inicial.comprobante        || '',
    descripcion:        inicial.descripcion        || '',
  });
  const [mostrarNuevoDest, setMostrarNuevoDest] = useState(false);
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const validar = () => {
    const errs = {};
    if (!form.destinatario_id) errs.destinatario_id = 'Seleccioná un destinatario';
    if (!form.monto || Number(form.monto) <= 0) errs.monto = 'El monto debe ser mayor a 0';
    if (!form.fecha) errs.fecha = 'La fecha es obligatoria';
    if (!form.pagado_por_estudio && !form.socio_id) errs.socio_id = 'Seleccioná el socio que pagó';
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validar()) return;
    onGuardar({ ...form, monto: Number(form.monto), pagado_por_estudio: Boolean(form.pagado_por_estudio), socio_id: form.pagado_por_estudio ? null : form.socio_id });
  };

  const handleNuevoDestinatario = async (datos) => {
    const nuevo = await onNuevoDestinatario(datos);
    setForm(p => ({ ...p, destinatario_id: nuevo.id }));
    setMostrarNuevoDest(false);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Campo label="Destinatario *" error={errores.destinatario_id}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Select value={form.destinatario_id} onChange={set('destinatario_id')} style={{ flex: 1 }}>
            <option value="">Seleccioná…</option>
            {TIPOS_DEST.map(tipo => {
              const grupo = destinatarios.filter(d => d.tipo === tipo.value);
              if (!grupo.length) return null;
              return <optgroup key={tipo.value} label={tipo.label}>{grupo.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</optgroup>;
            })}
          </Select>
          <Boton type="button" variante="secundario" onClick={() => setMostrarNuevoDest(v => !v)} style={{ whiteSpace: 'nowrap', padding: '8px 12px' }}>
            {mostrarNuevoDest ? '↑ Cancelar' : '+ Nuevo'}
          </Boton>
        </div>
      </Campo>
      {mostrarNuevoDest && <NuevoDestinatario onCrear={handleNuevoDestinatario} onCancelar={() => setMostrarNuevoDest(false)} />}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Campo label="Categoría">
          <Select value={form.categoria} onChange={set('categoria')}>
            {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Campo>
        <Campo label="Proyecto (opcional)">
          <Select value={form.proyecto_id} onChange={set('proyecto_id')}>
            <option value="">Sin proyecto</option>
            {proyectos.filter(p => p.estado !== 'finalizado').map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </Select>
        </Campo>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        <Campo label="Monto *" error={errores.monto}>
          <Input type="number" min="0" step="0.01" value={form.monto} onChange={set('monto')} placeholder="0.00" />
        </Campo>
        <Campo label="Moneda">
          <Select value={form.moneda} onChange={set('moneda')}>
            <option value="ARS">$ ARS</option>
            <option value="USD">U$S USD</option>
          </Select>
        </Campo>
      </div>
      <div style={{ border: '1px solid #d0d0d0', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
        <p style={{ margin: '0 0 12px', fontWeight: 500, fontSize: '14px' }}>¿Quién pagó?</p>
        <div style={{ display: 'flex', gap: '24px', marginBottom: form.pagado_por_estudio ? 0 : '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
            <input type="radio" name="pagador" checked={Boolean(form.pagado_por_estudio)} onChange={() => setForm(p => ({ ...p, pagado_por_estudio: true, socio_id: '' }))} />
            El estudio (caja común)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
            <input type="radio" name="pagador" checked={!form.pagado_por_estudio} onChange={() => setForm(p => ({ ...p, pagado_por_estudio: false }))} />
            Un socio específico
          </label>
        </div>
        {!form.pagado_por_estudio && (
          <Campo label="Socio que pagó *" error={errores.socio_id}>
            <Select value={form.socio_id} onChange={set('socio_id')}>
              <option value="">Seleccioná…</option>
              {socios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
          </Campo>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Campo label="Fecha *" error={errores.fecha}>
          <Input type="date" value={form.fecha} onChange={set('fecha')} />
        </Campo>
        <Campo label="N° comprobante">
          <Input value={form.comprobante} onChange={set('comprobante')} placeholder="Ej: REC-0001" />
        </Campo>
      </div>
      <Campo label="Descripción">
        <Textarea value={form.descripcion} onChange={set('descripcion')} placeholder="Detalles del gasto…" />
      </Campo>
      {errorServidor && <AlertaError mensaje={errorServidor} />}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : inicial.id ? 'Guardar cambios' : 'Registrar egreso'}</Boton>
      </div>
    </form>
  );
}

export default function Egresos() {
  const [filtros,     setFiltros]     = useState({ categoria: '', moneda: '', desde: '', hasta: '' });
  const [buscar,      setBuscar]      = useState('');
  const [modal,       setModal]       = useState(null);
  const [guardando,   setGuardando]   = useState(false);
  const [eliminando,  setEliminando]  = useState(false);
  const [errorAccion, setErrorAccion] = useState('');
  const [proyectos,   setProyectos]   = useState([]);
  const [socios,      setSocios]      = useState([]);

  useEffect(() => {
    Promise.all([get('/proyectos'), get('/socios')])
      .then(([p, s]) => { setProyectos(p); setSocios(s); }).catch(() => {});
  }, []);

  const { egresos, resumen, cargando, error, crear, actualizar, eliminar } = useEgresos(filtros);
  const { destinatarios, crear: crearDestinatario } = useDestinatarios();

  const egresosFiltrados = buscar
    ? egresos.filter(e => e.destinatario_nombre?.toLowerCase().includes(buscar.toLowerCase()) || e.proyecto_nombre?.toLowerCase().includes(buscar.toLowerCase()))
    : egresos;

  const cerrarModal = () => { setModal(null); setErrorAccion(''); };

  const handleGuardar = async (datos) => {
    setGuardando(true);
    setErrorAccion('');
    try {
      if (modal === 'crear') await crear(datos);
      else await actualizar(modal.id, datos);
      cerrarModal();
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleEliminar = async () => {
    setEliminando(true);
    try { await eliminar(modal.egreso.id); cerrarModal(); }
    catch (err) { setErrorAccion(err.message); }
    finally { setEliminando(false); }
  };

  const setFiltro = (k) => (e) => setFiltros(p => ({ ...p, [k]: e.target.value }));

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <EncabezadoSeccion
        titulo="Egresos"
        subtitulo={`${egresosFiltrados.length} registro${egresosFiltrados.length !== 1 ? 's' : ''}`}
        accion={<Boton onClick={() => setModal('crear')}>+ Nuevo egreso</Boton>}
      />
      <TarjetasResumen resumen={resumen} />
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Buscador value={buscar} onChange={setBuscar} placeholder="Buscar por destinatario, proyecto…" />
        <Select value={filtros.categoria} onChange={setFiltro('categoria')} style={{ width: 'auto' }}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </Select>
        <Select value={filtros.moneda} onChange={setFiltro('moneda')} style={{ width: 'auto' }}>
          <option value="">Todas las monedas</option>
          <option value="ARS">$ ARS</option>
          <option value="USD">U$S USD</option>
        </Select>
        <Input type="date" value={filtros.desde} onChange={setFiltro('desde')} style={{ width: 'auto' }} title="Desde" />
        <Input type="date" value={filtros.hasta} onChange={setFiltro('hasta')} style={{ width: 'auto' }} title="Hasta" />
        {Object.values(filtros).some(Boolean) && (
          <Boton variante="texto" onClick={() => setFiltros({ categoria: '', moneda: '', desde: '', hasta: '' })}>Limpiar filtros</Boton>
        )}
      </div>
      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : error ? <AlertaError mensaje={error} />
      : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <Tabla
            columnas={['Fecha', 'Destinatario', 'Categoría', 'Proyecto', 'Monto', 'Pagó', 'Comprobante', '']}
            datos={egresosFiltrados}
            vacio="No hay egresos registrados."
            renderFila={(e) => (
              <Fila key={e.id}>
                <Celda style={{ whiteSpace: 'nowrap', color: '#666', fontSize: '13px' }}>{fmtF(e.fecha)}</Celda>
                <Celda><span style={{ fontWeight: 500 }}>{e.destinatario_nombre}</span></Celda>
                <Celda><BadgeCategoria cat={e.categoria} /></Celda>
                <Celda style={{ color: '#666', fontSize: '13px' }}>{e.proyecto_nombre || '—'}</Celda>
                <Celda><span style={{ fontWeight: 600, color: '#b71c1c' }}>{fmt(e.monto, e.moneda)}</span></Celda>
                <Celda style={{ fontSize: '13px', color: '#666' }}>{e.pagado_por_estudio ? '🏢 Estudio' : e.socio_nombre}</Celda>
                <Celda style={{ fontSize: '13px', color: '#999', fontFamily: 'monospace' }}>{e.comprobante || '—'}</Celda>
                <Celda align="right">
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <Boton variante="secundario" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setModal(e)}>Editar</Boton>
                    <Boton variante="peligro" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setModal({ egreso: e, eliminar: true })}>✕</Boton>
                  </div>
                </Celda>
              </Fila>
            )}
          />
        </div>
      )}
      {modal === 'crear' && (
        <Modal titulo="Nuevo egreso" onCerrar={cerrarModal} ancho={680}>
          <FormEgreso inicial={{}} proyectos={proyectos} socios={socios} destinatarios={destinatarios}
            onNuevoDestinatario={crearDestinatario} onGuardar={handleGuardar} onCancelar={cerrarModal}
            guardando={guardando} errorServidor={errorAccion} />
        </Modal>
      )}
      {modal && modal !== 'crear' && !modal.eliminar && (
        <Modal titulo={`Editar egreso — ${fmtF(modal.fecha)}`} onCerrar={cerrarModal} ancho={680}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormEgreso inicial={modal} proyectos={proyectos} socios={socios} destinatarios={destinatarios}
            onNuevoDestinatario={crearDestinatario} onGuardar={handleGuardar} onCancelar={cerrarModal}
            guardando={guardando} errorServidor={errorAccion} />
        </Modal>
      )}
      {modal?.eliminar && (
        <Modal titulo="Eliminar egreso" onCerrar={cerrarModal} ancho={440}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <p style={{ fontSize: '14px', marginBottom: '8px' }}>¿Eliminar este egreso?</p>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
            <strong>{fmt(modal.egreso.monto, modal.egreso.moneda)}</strong> — {modal.egreso.destinatario_nombre} — {fmtF(modal.egreso.fecha)}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Boton variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
            <Boton variante="peligro" onClick={handleEliminar} disabled={eliminando}>
              {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
            </Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
