import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRendiciones } from '../../hooks/useRendiciones';
import { get } from '../../lib/api';
import {
  EncabezadoSeccion, Boton, Tabla, Fila, Celda,
  Modal, Campo, Input, Select, AlertaError, Buscador,
} from '../../components/ui';

const AZUL = '#1a2744';
const TIPOS_SUGERIDOS = ['RH', 'RO'];

const fmt = (n, moneda = 'ARS') =>
  moneda === 'USD'
    ? `U$S ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtF = (f) => {
  if (!f) return '—';
  const fecha = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR');
};

const ESTADO_COLORES = {
  borrador: { bg: '#fff8e1', color: '#f57f17', label: 'Borrador' },
  cerrada:  { bg: '#e8f5e9', color: '#1b5e20', label: 'Cerrada' },
  enviada:  { bg: '#e3f2fd', color: '#0d47a1', label: 'Enviada' },
};

function BadgeEstado({ estado }) {
  const cfg = ESTADO_COLORES[estado] || { bg: '#f5f5f5', color: '#333', label: estado };
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function FormNuevaRendicion({ proyectos, onGuardar, onCancelar, guardando, obtenerSiguienteNumero }) {
  const [form, setForm] = useState({
    proyecto_id: '',
    tipo: 'RO',
    tipoPersonalizado: '',
    fecha: new Date().toISOString().split('T')[0],
    notas: '',
  });
  const [siguienteNumero, setSiguienteNumero] = useState(null);
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const tipoFinal = form.tipo === 'otro' ? form.tipoPersonalizado.trim().toUpperCase() : form.tipo;

  useEffect(() => {
    if (form.proyecto_id && tipoFinal) {
      obtenerSiguienteNumero(form.proyecto_id, tipoFinal).then(setSiguienteNumero).catch(() => setSiguienteNumero(null));
    } else {
      setSiguienteNumero(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.proyecto_id, tipoFinal]);

  const validar = () => {
    const errs = {};
    if (!form.proyecto_id) errs.proyecto_id = 'Seleccioná un proyecto';
    if (!tipoFinal) errs.tipo = 'Indicá el tipo de rendición';
    if (!form.fecha) errs.fecha = 'La fecha es obligatoria';
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validar()) return;
    onGuardar({ proyecto_id: form.proyecto_id, tipo: tipoFinal, fecha: form.fecha, notas: form.notas });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Campo label="Proyecto / Obra *" error={errores.proyecto_id}>
        <Select value={form.proyecto_id} onChange={set('proyecto_id')}>
          <option value="">Seleccioná un proyecto…</option>
          {proyectos.map(p => <option key={p.id} value={p.id}>{p.cliente_nombre} - {p.nombre}</option>)}
        </Select>
      </Campo>
      <div style={{ display: 'grid', gridTemplateColumns: form.tipo === 'otro' ? '1fr 1fr' : '1fr', gap: '16px' }}>
        <Campo label="Tipo de rendición *" error={errores.tipo}>
          <Select value={form.tipo} onChange={set('tipo')}>
            {TIPOS_SUGERIDOS.map(t => <option key={t} value={t}>{t === 'RH' ? 'RH — Honorarios' : 'RO — Obra'}</option>)}
            <option value="otro">Otro…</option>
          </Select>
        </Campo>
        {form.tipo === 'otro' && (
          <Campo label="Especificar tipo">
            <Input value={form.tipoPersonalizado} onChange={set('tipoPersonalizado')} placeholder="Ej: RM" />
          </Campo>
        )}
      </div>
      {siguienteNumero !== null && (
        <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#1a2744' }}>
          Esta será la rendición <strong>{tipoFinal}{siguienteNumero}</strong> para este proyecto.
        </div>
      )}
      <Campo label="Fecha *" error={errores.fecha}>
        <Input type="date" value={form.fecha} onChange={set('fecha')} />
      </Campo>
      <Campo label="Notas (opcional)">
        <Input value={form.notas} onChange={set('notas')} placeholder="Notas internas…" />
      </Campo>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>{guardando ? 'Creando…' : 'Crear rendición'}</Boton>
      </div>
    </form>
  );
}

export default function Rendiciones() {
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState({ proyecto_id: '', tipo: '' });
  const [buscar, setBuscar] = useState('');
  const [proyectos, setProyectos] = useState([]);
  const [modal, setModal] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');

  useEffect(() => {
    get('/proyectos').then(setProyectos).catch(() => {});
  }, []);

  const { rendiciones, cargando, error, crear, eliminar, obtenerSiguienteNumero } = useRendiciones(filtros);

  const rendicionesFiltradas = buscar
    ? rendiciones.filter(r =>
        r.proyecto_nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
        r.cliente_nombre?.toLowerCase().includes(buscar.toLowerCase()))
    : rendiciones;

  const cerrarModal = () => { setModal(null); setErrorAccion(''); };

  const handleCrear = async (datos) => {
    setGuardando(true);
    setErrorAccion('');
    try {
      const nueva = await crear(datos);
      cerrarModal();
      navigate(`/admin/rendiciones/${nueva.id}`);
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleEliminar = async () => {
    try { await eliminar(modal.id); cerrarModal(); }
    catch (err) { setErrorAccion(err.message); }
  };

  const setFiltro = (k) => (e) => setFiltros(p => ({ ...p, [k]: e.target.value }));

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <EncabezadoSeccion
        titulo="Rendiciones"
        subtitulo={`${rendicionesFiltradas.length} rendición${rendicionesFiltradas.length !== 1 ? 'es' : ''}`}
        accion={<Boton onClick={() => setModal('crear')}>+ Nueva rendición</Boton>}
      />

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Buscador value={buscar} onChange={setBuscar} placeholder="Buscar por cliente o proyecto…" />
        <Select value={filtros.proyecto_id} onChange={setFiltro('proyecto_id')} style={{ width: 'auto' }}>
          <option value="">Todos los proyectos</option>
          {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Select>
        <Select value={filtros.tipo} onChange={setFiltro('tipo')} style={{ width: 'auto' }}>
          <option value="">Todos los tipos</option>
          <option value="RH">RH — Honorarios</option>
          <option value="RO">RO — Obra</option>
        </Select>
      </div>

      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />

      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : error ? <AlertaError mensaje={error} />
      : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <Tabla
            columnas={['Rendición', 'Cliente', 'Proyecto', 'Fecha', 'Comprobantes', 'Total ARS', 'Total USD', 'Estado', '']}
            datos={rendicionesFiltradas}
            vacio="No hay rendiciones. Creá la primera."
            renderFila={(r) => (
              <Fila key={r.id} onClick={() => navigate(`/admin/rendiciones/${r.id}`)}>
                <Celda><span style={{ fontWeight: 600, color: AZUL }}>{r.tipo}{r.numero}</span></Celda>
                <Celda style={{ fontWeight: 500 }}>{r.cliente_nombre}</Celda>
                <Celda style={{ color: '#666', fontSize: '13px' }}>{r.proyecto_nombre}</Celda>
                <Celda style={{ color: '#666', fontSize: '13px', whiteSpace: 'nowrap' }}>{fmtF(r.fecha)}</Celda>
                <Celda align="center">{r.cantidad_comprobantes}</Celda>
                <Celda style={{ fontWeight: 500 }}>{Number(r.total_ars) !== 0 ? fmt(r.total_ars, 'ARS') : '—'}</Celda>
                <Celda style={{ fontWeight: 500 }}>{Number(r.total_usd) !== 0 ? fmt(r.total_usd, 'USD') : '—'}</Celda>
                <Celda><BadgeEstado estado={r.estado} /></Celda>
                <Celda align="right">
                  <Boton variante="peligro" style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={(e) => { e.stopPropagation(); setModal(r); }}>✕</Boton>
                </Celda>
              </Fila>
            )}
          />
        </div>
      )}

      {modal === 'crear' && (
        <Modal titulo="Nueva rendición" onCerrar={cerrarModal} ancho={520}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormNuevaRendicion proyectos={proyectos} onGuardar={handleCrear} onCancelar={cerrarModal}
            guardando={guardando} obtenerSiguienteNumero={obtenerSiguienteNumero} />
        </Modal>
      )}

      {modal && modal !== 'crear' && (
        <Modal titulo="Eliminar rendición" onCerrar={cerrarModal} ancho={440}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <p style={{ fontSize: '14px', marginBottom: '8px' }}>
            ¿Eliminar la rendición <strong>{modal.tipo}{modal.numero}</strong>?
          </p>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '24px' }}>
            Esto también eliminará todos sus comprobantes asociados. Esta acción no se puede deshacer.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Boton variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
            <Boton variante="peligro" onClick={handleEliminar}>Sí, eliminar</Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
