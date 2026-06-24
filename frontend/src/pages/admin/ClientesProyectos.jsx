import { useState } from 'react';
import { useClientes } from '../../hooks/useClientes';
import { useProyectos } from '../../hooks/useProyectos';
import { get } from '../../lib/api';
import {
  EncabezadoSeccion, Buscador, Boton, Badge,
  Modal, Campo, Input, Select, Textarea, AlertaError,
} from '../../components/ui';

const AZUL = '#1a2744';
const ESTADOS = ['activo', 'pausado', 'finalizado'];
const fmtF = (f) => {
  if (!f) return '—';
  const fecha = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR');
};

// ── Formulario de cliente ─────────────────────────────────────────────────────
function FormCliente({ inicial = {}, onGuardar, onCancelar, guardando }) {
  const [form, setForm] = useState({
    nombre_razon_social: inicial.nombre_razon_social || '',
    cuit:     inicial.cuit     || '',
    email:    inicial.email    || '',
    telefono: inicial.telefono || '',
    notas:    inicial.notas    || '',
  });
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const validar = () => {
    const errs = {};
    if (!form.nombre_razon_social.trim()) errs.nombre_razon_social = 'El nombre es obligatorio';
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Email inválido';
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
      <Campo label="Nombre / Razón social *" error={errores.nombre_razon_social}>
        <Input value={form.nombre_razon_social} onChange={set('nombre_razon_social')}
          placeholder="Ej: Hospital Provincial SA" autoFocus />
      </Campo>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Campo label="CUIT" error={errores.cuit}>
          <Input value={form.cuit} onChange={set('cuit')} placeholder="20-12345678-9" />
        </Campo>
        <Campo label="Teléfono">
          <Input value={form.telefono} onChange={set('telefono')} placeholder="351 000-0000" />
        </Campo>
      </div>
      <Campo label="Email" error={errores.email}>
        <Input type="email" value={form.email} onChange={set('email')} placeholder="contacto@cliente.com" />
      </Campo>
      <Campo label="Notas">
        <Textarea value={form.notas} onChange={set('notas')} placeholder="Información adicional…" />
      </Campo>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : inicial.id ? 'Guardar cambios' : 'Crear cliente'}
        </Boton>
      </div>
    </form>
  );
}

// ── Formulario de proyecto ─────────────────────────────────────────────────────
function FormProyecto({ inicial = {}, clienteId, onGuardar, onCancelar, guardando }) {
  const [form, setForm] = useState({
    nombre:                inicial.nombre               || '',
    descripcion:           inicial.descripcion          || '',
    estado:                inicial.estado               || 'activo',
    fecha_inicio:          inicial.fecha_inicio         || new Date().toISOString().split('T')[0],
    fecha_cierre_estimada: inicial.fecha_cierre_estimada || '',
    notas_internas:        inicial.notas_internas       || '',
  });
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const validar = () => {
    const errs = {};
    if (!form.nombre.trim()) errs.nombre = 'El nombre es obligatorio';
    if (!form.fecha_inicio)  errs.fecha_inicio = 'La fecha de inicio es obligatoria';
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validar()) return;
    onGuardar({ ...form, cliente_id: clienteId });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
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
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : inicial.id ? 'Guardar cambios' : 'Crear proyecto'}
        </Boton>
      </div>
    </form>
  );
}

// ── Fila de proyecto dentro del acordeón ──────────────────────────────────────
function FilaProyecto({ proyecto, onEditar, onCambiarEstado }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', borderBottom: '1px solid #eee', flexWrap: 'wrap', gap: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '200px' }}>
        <span style={{ fontWeight: 500, fontSize: '14px' }}>{proyecto.nombre}</span>
        <select
          value={proyecto.estado}
          onChange={e => onCambiarEstado(proyecto.id, e.target.value)}
          style={{
            fontSize: '12px', padding: '3px 8px', borderRadius: '20px',
            border: '1px solid #d0d0d0', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px', color: '#666' }}>
        <span>Inicio: {fmtF(proyecto.fecha_inicio)}</span>
        <span>{Number(proyecto.horas_totales || 0).toFixed(1)}h</span>
        <Boton variante="secundario" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => onEditar(proyecto)}>
          Editar
        </Boton>
      </div>
    </div>
  );
}

// ── Tarjeta de cliente expandible ─────────────────────────────────────────────
function TarjetaCliente({ cliente, expandido, onToggle, onEditarCliente, onToggleActivo, onNuevoProyecto, onEditarProyecto, onCambiarEstadoProyecto }) {
  const { proyectos, cargando } = useProyectos({ cliente_id: expandido ? cliente.id : null });

  return (
    <div style={{
      background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px',
      marginBottom: '12px', overflow: 'hidden',
    }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', cursor: 'pointer', flexWrap: 'wrap', gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            display: 'inline-block', transition: 'transform 0.2s',
            transform: expandido ? 'rotate(90deg)' : 'rotate(0deg)', color: '#999',
          }}>▶</span>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '15px' }}>{cliente.nombre_razon_social}</p>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>{cliente.cuit || 'Sin CUIT'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Badge estado={cliente.activo ? 'activo' : 'finalizado'} />
          <span style={{ fontSize: '13px', color: '#666' }}>
            {cliente.proyectos_activos || 0} proyecto{cliente.proyectos_activos !== 1 ? 's' : ''} activo{cliente.proyectos_activos !== 1 ? 's' : ''}
          </span>
          <Boton variante="secundario" style={{ padding: '5px 12px', fontSize: '13px' }}
            onClick={(e) => { e.stopPropagation(); onEditarCliente(cliente); }}>
            Editar
          </Boton>
          <Boton variante={cliente.activo ? 'peligro' : 'secundario'} style={{ padding: '5px 12px', fontSize: '13px' }}
            onClick={(e) => { e.stopPropagation(); onToggleActivo(cliente); }}>
            {cliente.activo ? 'Desactivar' : 'Activar'}
          </Boton>
        </div>
      </div>

      {expandido && (
        <div style={{ borderTop: '1px solid #e0e0e0', background: '#fafafa' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px 0' }}>
            <Boton style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => onNuevoProyecto(cliente)}>
              + Nuevo proyecto
            </Boton>
          </div>
          {cargando ? (
            <p style={{ padding: '16px', fontSize: '13px', color: '#999' }}>Cargando proyectos…</p>
          ) : proyectos.length === 0 ? (
            <p style={{ padding: '16px', fontSize: '13px', color: '#999' }}>Este cliente no tiene proyectos todavía.</p>
          ) : (
            <div>
              {proyectos.map(p => (
                <FilaProyecto
                  key={p.id}
                  proyecto={p}
                  onEditar={onEditarProyecto}
                  onCambiarEstado={onCambiarEstadoProyecto}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ClientesProyectos() {
  const [buscar,        setBuscar]       = useState('');
  const [verInactivos,  setVerInactivos] = useState(false);
  const [expandidoId,   setExpandidoId]  = useState(null);
  const [modalCliente,  setModalCliente] = useState(null);
  const [modalProyecto, setModalProyecto]= useState(null);
  const [guardando,     setGuardando]    = useState(false);
  const [errorAccion,   setErrorAccion]  = useState('');

  const { clientes, cargando, error, crear, actualizar, desactivar, activar, cargar } = useClientes({
    buscar, inactivos: verInactivos,
  });

  const { crear: crearProyecto, actualizar: actualizarProyecto, cambiarEstado: cambiarEstadoProyecto } = useProyectos({});

  const toggleExpandir = (id) => setExpandidoId(prev => prev === id ? null : id);

  const cerrarModales = () => { setModalCliente(null); setModalProyecto(null); setErrorAccion(''); };

  const handleGuardarCliente = async (datos) => {
    setGuardando(true);
    setErrorAccion('');
    try {
      if (modalCliente === 'crear') await crear(datos);
      else await actualizar(modalCliente.id, datos);
      cerrarModales();
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleToggleActivo = async (c) => {
    setErrorAccion('');
    try {
      if (c.activo) await desactivar(c.id);
      else await activar(c.id);
    } catch (err) { setErrorAccion(err.message); }
  };

  const handleGuardarProyecto = async (datos) => {
    setGuardando(true);
    setErrorAccion('');
    try {
      if (modalProyecto.modo === 'crear') await crearProyecto(datos);
      else await actualizarProyecto(modalProyecto.proyecto.id, datos);
      cerrarModales();
      // Forzar refresco del acordeón abierto
      setExpandidoId(prev => prev);
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleCambiarEstadoProyecto = async (proyectoId, nuevoEstado) => {
    try { await cambiarEstadoProyecto(proyectoId, nuevoEstado); }
    catch (err) { setErrorAccion(err.message); }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <EncabezadoSeccion
        titulo="Clientes y Proyectos"
        subtitulo={`${clientes.length} cliente${clientes.length !== 1 ? 's' : ''}`}
        accion={<Boton onClick={() => setModalCliente('crear')}>+ Nuevo cliente</Boton>}
      />

      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Buscador value={buscar} onChange={setBuscar} placeholder="Buscar por nombre o CUIT…" />
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
          <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} />
          Ver inactivos
        </label>
      </div>

      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />

      {cargando ? (
        <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      ) : error ? (
        <AlertaError mensaje={error} />
      ) : clientes.length === 0 ? (
        <p style={{ color: '#999', fontSize: '14px', textAlign: 'center', padding: '40px' }}>
          No hay clientes. Creá el primero.
        </p>
      ) : (
        <div>
          {clientes.map(c => (
            <TarjetaCliente
              key={c.id}
              cliente={c}
              expandido={expandidoId === c.id}
              onToggle={() => toggleExpandir(c.id)}
              onEditarCliente={setModalCliente}
              onToggleActivo={handleToggleActivo}
              onNuevoProyecto={(cliente) => setModalProyecto({ modo: 'crear', cliente })}
              onEditarProyecto={(proyecto) => setModalProyecto({ modo: 'editar', proyecto, cliente: c })}
              onCambiarEstadoProyecto={handleCambiarEstadoProyecto}
            />
          ))}
        </div>
      )}

      {/* Modal cliente */}
      {modalCliente && (
        <Modal
          titulo={modalCliente === 'crear' ? 'Nuevo cliente' : `Editar — ${modalCliente.nombre_razon_social}`}
          onCerrar={cerrarModales}
        >
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormCliente
            inicial={modalCliente === 'crear' ? {} : modalCliente}
            onGuardar={handleGuardarCliente}
            onCancelar={cerrarModales}
            guardando={guardando}
          />
        </Modal>
      )}

      {/* Modal proyecto */}
      {modalProyecto && (
        <Modal
          titulo={modalProyecto.modo === 'crear'
            ? `Nuevo proyecto — ${modalProyecto.cliente.nombre_razon_social}`
            : `Editar — ${modalProyecto.proyecto.nombre}`}
          onCerrar={cerrarModales}
          ancho={620}
        >
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormProyecto
            inicial={modalProyecto.modo === 'editar' ? modalProyecto.proyecto : {}}
            clienteId={modalProyecto.modo === 'crear' ? modalProyecto.cliente.id : modalProyecto.proyecto.cliente_id}
            onGuardar={handleGuardarProyecto}
            onCancelar={cerrarModales}
            guardando={guardando}
          />
        </Modal>
      )}
    </div>
  );
}
