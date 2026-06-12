import { useState } from 'react';
import { useClientes } from '../../hooks/useClientes';
import {
  EncabezadoSeccion, Buscador, Boton, Tabla, Fila, Celda,
  Badge, Modal, Campo, Input, Textarea, AlertaError,
} from '../../components/ui';

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

export default function Clientes() {
  const [buscar,       setBuscar]      = useState('');
  const [verInactivos, setVerInactivos]= useState(false);
  const [modal,        setModal]       = useState(null);
  const [guardando,    setGuardando]   = useState(false);
  const [errorAccion,  setErrorAccion] = useState('');

  const { clientes, cargando, error, crear, actualizar, desactivar, activar } =
    useClientes({ buscar, inactivos: verInactivos });

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

  const handleToggle = async (c) => {
    try {
      if (c.activo) await desactivar(c.id);
      else await activar(c.id);
    } catch (err) { setErrorAccion(err.message); }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <EncabezadoSeccion
        titulo="Clientes"
        subtitulo={`${clientes.length} cliente${clientes.length !== 1 ? 's' : ''}`}
        accion={<Boton onClick={() => setModal('crear')}>+ Nuevo cliente</Boton>}
      />
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <Buscador value={buscar} onChange={setBuscar} placeholder="Buscar por nombre o CUIT…" />
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
          <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} />
          Ver inactivos
        </label>
      </div>
      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : error ? <AlertaError mensaje={error} />
      : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <Tabla
            columnas={['Nombre / Razón social', 'CUIT', 'Contacto', 'Proyectos activos', 'Estado', '']}
            datos={clientes}
            vacio="No hay clientes. Creá el primero."
            renderFila={(c) => (
              <Fila key={c.id}>
                <Celda><span style={{ fontWeight: 500 }}>{c.nombre_razon_social}</span></Celda>
                <Celda style={{ color: '#666', fontFamily: 'monospace' }}>{c.cuit || '—'}</Celda>
                <Celda style={{ color: '#666' }}>{c.email || c.telefono || '—'}</Celda>
                <Celda align="center">{c.proyectos_activos || 0}</Celda>
                <Celda><Badge estado={c.activo ? 'activo' : 'finalizado'} /></Celda>
                <Celda align="right">
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <Boton variante="secundario" style={{ padding: '5px 12px', fontSize: '13px' }}
                      onClick={() => setModal(c)}>Editar</Boton>
                    <Boton variante={c.activo ? 'peligro' : 'secundario'}
                      style={{ padding: '5px 12px', fontSize: '13px' }}
                      onClick={() => handleToggle(c)}>
                      {c.activo ? 'Desactivar' : 'Activar'}
                    </Boton>
                  </div>
                </Celda>
              </Fila>
            )}
          />
        </div>
      )}
      {modal && (
        <Modal titulo={modal === 'crear' ? 'Nuevo cliente' : `Editar — ${modal.nombre_razon_social}`} onCerrar={cerrarModal}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormCliente inicial={modal === 'crear' ? {} : modal} onGuardar={handleGuardar}
            onCancelar={cerrarModal} guardando={guardando} />
        </Modal>
      )}
    </div>
  );
}
