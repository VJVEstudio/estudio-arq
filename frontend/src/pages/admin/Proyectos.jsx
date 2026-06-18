import { useState, useEffect } from 'react';
import { useProyectos } from '../../hooks/useProyectos';
import { useClientes }  from '../../hooks/useClientes';
import { get } from '../../lib/api';
import {
  EncabezadoSeccion, Boton, Tabla, Fila, Celda, Badge,
  Modal, Campo, Input, Select, Textarea, AlertaError, Buscador,
} from '../../components/ui';

const ESTADOS = ['activo', 'pausado', 'finalizado'];
const fmtF = (f) => {
  if (!f) return '—';
  const fecha = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR');
};

function FormProyecto({ inicial = {}, clientes, onGuardar, onCancelar, guardando, errorServidor }) {
  const [form, setForm] = useState({
    cliente_id:            inicial.cliente_id            || '',
    nombre:                inicial.nombre                || '',
    descripcion:           inicial.descripcion           || '',
    estado:                inicial.estado                || 'activo',
    fecha_inicio:          inicial.fecha_inicio          || new Date().toISOString().split('T')[0],
    fecha_cierre_estimada: inicial.fecha_cierre_estimada || '',
    notas_internas:        inicial.notas_internas        || '',
  });
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const validar = () => {
    const errs = {};
    if (!form.cliente_id)    errs.cliente_id   = 'Seleccioná un cliente';
    if (!form.nombre.trim()) errs.nombre       = 'El nombre es obligatorio';
    if (!form.fecha_inicio)  errs.fecha_inicio = 'La fecha de inicio es obligatoria';
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validar()) return;
    onGuardar(form);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Campo label="Cliente *" error={errores.cliente_id}>
        <Select value={form.cliente_id} onChange={e => setForm(p => ({ ...p, cliente_id: e.target.value }))}>
          <option value="">Seleccioná un cliente…</option>
          {clientes.filter(c => c.activo).map(c => (
            <option key={c.id} value={c.id}>{c.nombre_razon_social}</option>
          ))}
        </Select>
      </Campo>
      <Campo label="Nombre del proyecto *" error={errores.nombre}>
        <Input value={form.nombre} onChange={set('nombre')} placeholder="Ej: Hospital Regional — Ala Norte" autoFocus />
      </Campo>
      <Campo label="Descripción">
        <Textarea value={form.descripcion} onChange={set('descripcion')} placeholder="Descripción del alcance…" />
      </Campo>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
        <Campo label="Estado">
          <Select value={form.estado} onChange={set('estado')}>
            {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
          </Select>
        </Campo>
        <Campo label="Fecha inicio *" error={errores.fecha_inicio}>
          <Input type="date" value={form.fecha_inicio} onChange={set('fecha_inicio')} />
        </Campo>
        <Campo label="Cierre estimado">
          <Input type="date" value={form.fecha_cierre_estimada} onChange={set('fecha_cierre_estimada')} />
        </Campo>
      </div>
      <Campo label="Notas internas">
        <Textarea value={form.notas_internas} onChange={set('notas_internas')} placeholder="Información confidencial del equipo…" />
      </Campo>
      {errorServidor && <AlertaError mensaje={errorServidor} />}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : inicial.id ? 'Guardar cambios' : 'Crear proyecto'}
        </Boton>
      </div>
    </form>
  );
}

function PanelDibujantes({ proyecto, onAsignar, onDesasignar }) {
  const [todos,     setTodos]     = useState([]);
  const [seleccion, setSeleccion] = useState('');
  const [cargando,  setCargando]  = useState(false);

  useEffect(() => { get('/dibujantes').then(setTodos).catch(() => {}); }, []);

  const asignados   = proyecto.dibujantes || [];
  const disponibles = todos.filter(d => !asignados.find(a => a.id === d.id));

  return (
    <div>
      <p style={{ fontWeight: 500, fontSize: '15px', margin: '0 0 12px' }}>Dibujantes asignados</p>
      {asignados.length === 0
        ? <p style={{ color: '#999', fontSize: '14px', marginBottom: '16px' }}>Sin dibujantes asignados.</p>
        : (
          <ul style={{ listStyle: 'none', margin: '0 0 16px', padding: 0 }}>
            {asignados.map(d => (
              <li key={d.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: '8px', marginBottom: '6px',
                background: '#f8f9fa', fontSize: '14px',
              }}>
                <span>{d.nombre}</span>
                <Boton variante="texto" style={{ color: '#b91c1c', fontSize: '13px' }}
                  onClick={() => onDesasignar(proyecto.id, d.id)}>Quitar</Boton>
              </li>
            ))}
          </ul>
        )
      }
      {disponibles.length > 0 && (
        <div style={{ display: 'flex', gap: '10px' }}>
          <Select value={seleccion} onChange={e => setSeleccion(e.target.value)} style={{ flex: 1 }}>
            <option value="">Agregar dibujante…</option>
            {disponibles.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </Select>
          <Boton onClick={async () => {
            if (!seleccion) return;
            setCargando(true);
            try { await onAsignar(proyecto.id, seleccion); setSeleccion(''); }
            finally { setCargando(false); }
          }} disabled={!seleccion || cargando}>Asignar</Boton>
        </div>
      )}
    </div>
  );
}

export default function Proyectos() {
  const [filtroEstado, setFiltroEstado] = useState('');
  const [buscar,       setBuscar]       = useState('');
  const [modal,        setModal]        = useState(null);
  const [modalDib,     setModalDib]     = useState(null);
  const [guardando,    setGuardando]    = useState(false);
  const [errorAccion,  setErrorAccion]  = useState('');

  const { proyectos, cargando, error, crear, actualizar, cambiarEstado, asignarDibujante, desasignarDibujante, cargar } =
    useProyectos({ estado: filtroEstado });
  const { clientes } = useClientes();

  const proyectosFiltrados = buscar
    ? proyectos.filter(p => p.nombre.toLowerCase().includes(buscar.toLowerCase()))
    : proyectos;

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

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <EncabezadoSeccion
        titulo="Proyectos"
        subtitulo={`${proyectosFiltrados.length} proyecto${proyectosFiltrados.length !== 1 ? 's' : ''}`}
        accion={<Boton onClick={() => setModal('crear')}>+ Nuevo proyecto</Boton>}
      />
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Buscador value={buscar} onChange={setBuscar} placeholder="Buscar por nombre…" />
        <div style={{ display: 'flex', gap: '4px' }}>
          {['', ...ESTADOS].map(e => (
            <button key={e} onClick={() => setFiltroEstado(e)} style={{
              padding: '6px 14px', fontSize: '13px', borderRadius: '20px',
              border: '1px solid', cursor: 'pointer', fontFamily: 'inherit',
              borderColor: filtroEstado === e ? '#1a2744' : '#d0d0d0',
              background:  filtroEstado === e ? '#1a2744' : 'transparent',
              color:       filtroEstado === e ? 'white'  : '#666',
            }}>
              {e === '' ? 'Todos' : e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : error ? <AlertaError mensaje={error} />
      : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <Tabla
            columnas={['Proyecto', 'Cliente', 'Estado', 'Inicio', 'Cierre est.', 'Dibujantes', 'Horas', '']}
            datos={proyectosFiltrados}
            vacio="No hay proyectos. Creá el primero."
            renderFila={(p) => (
              <Fila key={p.id}>
                <Celda><span style={{ fontWeight: 500 }}>{p.nombre}</span></Celda>
                <Celda style={{ color: '#666' }}>{p.cliente_nombre}</Celda>
                <Celda>
                  <select value={p.estado} onChange={e => cambiarEstado(p.id, e.target.value)}
                    style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '20px', border: '1px solid #d0d0d0', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                  </select>
                </Celda>
                <Celda style={{ color: '#666', whiteSpace: 'nowrap', fontSize: '13px' }}>{fmtF(p.fecha_inicio)}</Celda>
                <Celda style={{ color: '#666', whiteSpace: 'nowrap', fontSize: '13px' }}>{fmtF(p.fecha_cierre_estimada)}</Celda>
                <Celda align="center">
                  <button onClick={() => setModalDib(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#1a2744', fontFamily: 'inherit', textDecoration: 'underline' }}>
                    {p.dibujantes_asignados || 0}
                  </button>
                </Celda>
                <Celda align="center" style={{ color: '#666' }}>{Number(p.horas_totales || 0).toFixed(1)}h</Celda>
                <Celda align="right">
                  <Boton variante="secundario" style={{ padding: '5px 12px', fontSize: '13px' }} onClick={() => setModal(p)}>Editar</Boton>
                </Celda>
              </Fila>
            )}
          />
        </div>
      )}
      {modal && (
        <Modal titulo={modal === 'crear' ? 'Nuevo proyecto' : `Editar — ${modal.nombre}`} onCerrar={cerrarModal} ancho={620}>
          <FormProyecto inicial={modal === 'crear' ? {} : modal} clientes={clientes}
            onGuardar={handleGuardar} onCancelar={cerrarModal}
            guardando={guardando} errorServidor={errorAccion} />
        </Modal>
      )}
      {modalDib && (
        <Modal titulo={`Dibujantes — ${modalDib.nombre}`} onCerrar={() => setModalDib(null)} ancho={480}>
          <PanelDibujantes proyecto={modalDib}
            onAsignar={async (pid, did) => { await asignarDibujante(pid, did); await cargar(); }}
            onDesasignar={async (pid, did) => { await desasignarDibujante(pid, did); await cargar(); }} />
        </Modal>
      )}
    </div>
  );
}
