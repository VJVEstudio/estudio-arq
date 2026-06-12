import { useState, useEffect } from 'react';
import { useIngresos } from '../../hooks/useIngresos';
import { get } from '../../lib/api';
import {
  EncabezadoSeccion, Boton, Tabla, Fila, Celda, Badge,
  Modal, Campo, Input, Select, Textarea, AlertaError, Buscador,
} from '../../components/ui';

const fmt = (monto, moneda) =>
  moneda === 'USD'
    ? `U$S ${Number(monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$ ${Number(monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtF = (f) => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-AR') : '—';

function TarjetasResumen({ resumen }) {
  const porMoneda = { ARS: { facturado: 0, no_facturado: 0 }, USD: { facturado: 0, no_facturado: 0 } };
  resumen.forEach(r => { if (porMoneda[r.moneda]) porMoneda[r.moneda][r.tipo] = Number(r.total); });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
      {[
        { label: 'Facturado ARS',    valor: fmt(porMoneda.ARS.facturado,    'ARS'), color: '#1b5e20' },
        { label: 'No facturado ARS', valor: fmt(porMoneda.ARS.no_facturado, 'ARS'), color: '#e65100' },
        { label: 'Facturado USD',    valor: fmt(porMoneda.USD.facturado,    'USD'), color: '#0d47a1' },
        { label: 'No facturado USD', valor: fmt(porMoneda.USD.no_facturado, 'USD'), color: '#880e4f' },
      ].map(t => (
        <div key={t.label} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '18px 20px' }}>
          <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</p>
          <p style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: t.color }}>{t.valor}</p>
        </div>
      ))}
    </div>
  );
}

function FormIngreso({ inicial = {}, clientes, proyectos, socios, onGuardar, onCancelar, guardando, errorServidor }) {
  const [form, setForm] = useState({
    cliente_id:    inicial.cliente_id    || '',
    proyecto_id:   inicial.proyecto_id   || '',
    monto:         inicial.monto         || '',
    moneda:        inicial.moneda        || 'ARS',
    tipo:          inicial.tipo          || 'facturado',
    es_del_estudio: inicial.es_del_estudio !== undefined ? inicial.es_del_estudio : true,
    socio_id:      inicial.socio_id      || '',
    fecha:         inicial.fecha         || new Date().toISOString().split('T')[0],
    comprobante:   inicial.comprobante   || '',
    descripcion:   inicial.descripcion   || '',
  });
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const proyectosFiltrados = form.cliente_id
    ? proyectos.filter(p => p.cliente_id === form.cliente_id && p.estado !== 'finalizado')
    : proyectos.filter(p => p.estado !== 'finalizado');

  const validar = () => {
    const errs = {};
    if (!form.cliente_id) errs.cliente_id = 'Seleccioná un cliente';
    if (!form.monto || Number(form.monto) <= 0) errs.monto = 'El monto debe ser mayor a 0';
    if (!form.fecha) errs.fecha = 'La fecha es obligatoria';
    if (!form.es_del_estudio && !form.socio_id) errs.socio_id = 'Seleccioná el socio acreedor';
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validar()) return;
    onGuardar({ ...form, monto: Number(form.monto), es_del_estudio: Boolean(form.es_del_estudio), socio_id: form.es_del_estudio ? null : form.socio_id });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Campo label="Cliente *" error={errores.cliente_id}>
          <Select value={form.cliente_id} onChange={e => setForm(p => ({ ...p, cliente_id: e.target.value, proyecto_id: '' }))}>
            <option value="">Seleccioná…</option>
            {clientes.filter(c => c.activo).map(c => <option key={c.id} value={c.id}>{c.nombre_razon_social}</option>)}
          </Select>
        </Campo>
        <Campo label="Proyecto">
          <Select value={form.proyecto_id} onChange={set('proyecto_id')}>
            <option value="">Sin proyecto específico</option>
            {proyectosFiltrados.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </Select>
        </Campo>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
        <Campo label="Monto *" error={errores.monto}>
          <Input type="number" min="0" step="0.01" value={form.monto} onChange={set('monto')} placeholder="0.00" />
        </Campo>
        <Campo label="Moneda">
          <Select value={form.moneda} onChange={set('moneda')}>
            <option value="ARS">$ ARS</option>
            <option value="USD">U$S USD</option>
          </Select>
        </Campo>
        <Campo label="Tipo">
          <Select value={form.tipo} onChange={set('tipo')}>
            <option value="facturado">Facturado</option>
            <option value="no_facturado">No facturado</option>
          </Select>
        </Campo>
      </div>
      <div style={{ border: '1px solid #d0d0d0', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
        <p style={{ margin: '0 0 12px', fontWeight: 500, fontSize: '14px' }}>¿A quién se acredita?</p>
        <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
            <input type="radio" name="acreditacion" checked={form.es_del_estudio}
              onChange={() => setForm(p => ({ ...p, es_del_estudio: true, socio_id: '' }))} />
            Al estudio (se divide entre los 3 socios)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
            <input type="radio" name="acreditacion" checked={!form.es_del_estudio}
              onChange={() => setForm(p => ({ ...p, es_del_estudio: false }))} />
            A un socio específico
          </label>
        </div>
        {!form.es_del_estudio && (
          <Campo label="Socio acreedor *" error={errores.socio_id}>
            <Select value={form.socio_id} onChange={set('socio_id')}>
              <option value="">Seleccioná…</option>
              {socios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
          </Campo>
        )}
        {form.es_del_estudio && form.monto > 0 && socios.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#666' }}>Vista previa de distribución:</p>
            {socios.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span style={{ color: '#666' }}>{s.nombre}</span>
                <span style={{ fontWeight: 500 }}>
                  {fmt(Math.round(Number(form.monto) * Number(s.porcentaje_participacion)) / 100, form.moneda)}
                  <span style={{ color: '#999', fontSize: '12px', marginLeft: '6px' }}>({s.porcentaje_participacion}%)</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Campo label="Fecha *" error={errores.fecha}>
          <Input type="date" value={form.fecha} onChange={set('fecha')} />
        </Campo>
        <Campo label="N° comprobante / factura">
          <Input value={form.comprobante} onChange={set('comprobante')} placeholder="A-0001-00001234" />
        </Campo>
      </div>
      <Campo label="Descripción">
        <Textarea value={form.descripcion} onChange={set('descripcion')} placeholder="Detalles del pago…" />
      </Campo>
      {errorServidor && <AlertaError mensaje={errorServidor} />}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : inicial.id ? 'Guardar cambios' : 'Registrar ingreso'}
        </Boton>
      </div>
    </form>
  );
}

export default function Ingresos() {
  const [filtros,     setFiltros]     = useState({ moneda: '', tipo: '', desde: '', hasta: '' });
  const [buscar,      setBuscar]      = useState('');
  const [modal,       setModal]       = useState(null);
  const [guardando,   setGuardando]   = useState(false);
  const [eliminando,  setEliminando]  = useState(false);
  const [errorAccion, setErrorAccion] = useState('');
  const [clientes,    setClientes]    = useState([]);
  const [proyectos,   setProyectos]   = useState([]);
  const [socios,      setSocios]      = useState([]);

  useEffect(() => {
    Promise.all([get('/clientes'), get('/proyectos'), get('/socios')])
      .then(([c, p, s]) => { setClientes(c); setProyectos(p); setSocios(s); })
      .catch(() => {});
  }, []);

  const { ingresos, resumen, cargando, error, crear, actualizar, eliminar } = useIngresos(filtros);
  const ingresosFiltrados = buscar
    ? ingresos.filter(i => i.cliente_nombre?.toLowerCase().includes(buscar.toLowerCase()) || i.proyecto_nombre?.toLowerCase().includes(buscar.toLowerCase()))
    : ingresos;

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
    try { await eliminar(modal.ingreso.id); cerrarModal(); }
    catch (err) { setErrorAccion(err.message); }
    finally { setEliminando(false); }
  };

  const setFiltro = (k) => (e) => setFiltros(p => ({ ...p, [k]: e.target.value }));

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <EncabezadoSeccion
        titulo="Ingresos"
        subtitulo={`${ingresosFiltrados.length} registro${ingresosFiltrados.length !== 1 ? 's' : ''}`}
        accion={<Boton onClick={() => setModal('crear')}>+ Nuevo ingreso</Boton>}
      />
      <TarjetasResumen resumen={resumen} />
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Buscador value={buscar} onChange={setBuscar} placeholder="Buscar por cliente, proyecto…" />
        <Select value={filtros.moneda} onChange={setFiltro('moneda')} style={{ width: 'auto' }}>
          <option value="">Todas las monedas</option>
          <option value="ARS">$ ARS</option>
          <option value="USD">U$S USD</option>
        </Select>
        <Select value={filtros.tipo} onChange={setFiltro('tipo')} style={{ width: 'auto' }}>
          <option value="">Todos los tipos</option>
          <option value="facturado">Facturado</option>
          <option value="no_facturado">No facturado</option>
        </Select>
        <Input type="date" value={filtros.desde} onChange={setFiltro('desde')} style={{ width: 'auto' }} title="Desde" />
        <Input type="date" value={filtros.hasta} onChange={setFiltro('hasta')} style={{ width: 'auto' }} title="Hasta" />
        {Object.values(filtros).some(Boolean) && (
          <Boton variante="texto" onClick={() => setFiltros({ moneda: '', tipo: '', desde: '', hasta: '' })}>Limpiar filtros</Boton>
        )}
      </div>
      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : error ? <AlertaError mensaje={error} />
      : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <Tabla
            columnas={['Fecha', 'Cliente', 'Proyecto', 'Monto', 'Tipo', 'Acreditado a', 'Comprobante', '']}
            datos={ingresosFiltrados}
            vacio="No hay ingresos registrados."
            renderFila={(i) => (
              <Fila key={i.id}>
                <Celda style={{ whiteSpace: 'nowrap', color: '#666', fontSize: '13px' }}>{fmtF(i.fecha)}</Celda>
                <Celda><span style={{ fontWeight: 500 }}>{i.cliente_nombre}</span></Celda>
                <Celda style={{ color: '#666', fontSize: '13px' }}>{i.proyecto_nombre || '—'}</Celda>
                <Celda><span style={{ fontWeight: 600, color: '#1b5e20' }}>{fmt(i.monto, i.moneda)}</span></Celda>
                <Celda><Badge estado={i.tipo} /></Celda>
                <Celda style={{ fontSize: '13px', color: '#666' }}>
                  {i.es_del_estudio ? '🏢 Estudio' : i.socio_nombre}
                </Celda>
                <Celda style={{ fontSize: '13px', color: '#999', fontFamily: 'monospace' }}>{i.comprobante || '—'}</Celda>
                <Celda align="right">
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <Boton variante="secundario" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setModal(i)}>Editar</Boton>
                    <Boton variante="peligro" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setModal({ ingreso: i, eliminar: true })}>✕</Boton>
                  </div>
                </Celda>
              </Fila>
            )}
          />
        </div>
      )}
      {modal === 'crear' && (
        <Modal titulo="Nuevo ingreso" onCerrar={cerrarModal} ancho={660}>
          <FormIngreso inicial={{}} clientes={clientes} proyectos={proyectos} socios={socios}
            onGuardar={handleGuardar} onCancelar={cerrarModal} guardando={guardando} errorServidor={errorAccion} />
        </Modal>
      )}
      {modal && modal !== 'crear' && !modal.eliminar && (
        <Modal titulo={`Editar ingreso — ${fmtF(modal.fecha)}`} onCerrar={cerrarModal} ancho={660}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormIngreso inicial={modal} clientes={clientes} proyectos={proyectos} socios={socios}
            onGuardar={handleGuardar} onCancelar={cerrarModal} guardando={guardando} errorServidor={errorAccion} />
        </Modal>
      )}
      {modal?.eliminar && (
        <Modal titulo="Eliminar ingreso" onCerrar={cerrarModal} ancho={440}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <p style={{ fontSize: '15px', marginBottom: '8px' }}>¿Estás seguro que querés eliminar este ingreso?</p>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
            <strong>{fmt(modal.ingreso.monto, modal.ingreso.moneda)}</strong> — {modal.ingreso.cliente_nombre} — {fmtF(modal.ingreso.fecha)}
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
