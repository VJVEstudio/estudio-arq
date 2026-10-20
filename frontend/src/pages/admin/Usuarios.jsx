import { useCallback, useEffect, useState } from 'react';
import { get, post, put, patch } from '../../lib/api';
import {
  EncabezadoSeccion, Boton, Tabla, Fila, Celda, Modal, Campo, Input, AlertaError,
} from '../../components/ui';

const MIN_PASSWORD = 8;

function Etiqueta({ children, bg = '#f5f5f5', color = '#333' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '20px',
      fontSize: '12px', fontWeight: 500, background: bg, color, marginRight: '6px',
    }}>{children}</span>
  );
}

function CampoPassword({ value, onChange, error, label = 'Contraseña *', autoFocus }) {
  const [ver, setVer] = useState(false);
  return (
    <Campo label={label} error={error}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Input type={ver ? 'text' : 'password'} value={value} onChange={onChange}
          placeholder={`Mínimo ${MIN_PASSWORD} caracteres`} autoComplete="new-password" autoFocus={autoFocus} />
        <Boton type="button" variante="secundario" style={{ padding: '6px 12px', fontSize: '13px', whiteSpace: 'nowrap' }}
          onClick={() => setVer(v => !v)}>{ver ? 'Ocultar' : 'Ver'}</Boton>
      </div>
    </Campo>
  );
}

function FormUsuario({ inicial, onGuardar, onCancelar, guardando }) {
  const editando = Boolean(inicial?.id);
  const [form, setForm] = useState({
    nombre: inicial?.nombre || '', email: inicial?.email || '', password: '', repetir: '',
  });
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.nombre.trim()) errs.nombre = 'El nombre es obligatorio';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Email inválido';
    if (!editando) {
      if (form.password.length < MIN_PASSWORD) errs.password = `Mínimo ${MIN_PASSWORD} caracteres`;
      else if (form.password !== form.repetir) errs.repetir = 'Las contraseñas no coinciden';
    }
    setErrores(errs);
    if (Object.keys(errs).length) return;
    onGuardar(editando
      ? { nombre: form.nombre, email: form.email }
      : { nombre: form.nombre, email: form.email, password: form.password });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Campo label="Nombre *" error={errores.nombre}>
        <Input value={form.nombre} onChange={set('nombre')} placeholder="Ej: María Pérez" autoFocus />
      </Campo>
      <Campo label="Email (con este entra a la app) *" error={errores.email}>
        <Input type="email" value={form.email} onChange={set('email')} placeholder="nombre@vjvarq.com" />
      </Campo>
      {!editando && (
        <>
          <CampoPassword value={form.password} onChange={set('password')} error={errores.password} />
          <Campo label="Repetir contraseña *" error={errores.repetir}>
            <Input type="password" value={form.repetir} onChange={set('repetir')} autoComplete="new-password" />
          </Campo>
          <p style={{ fontSize: '13px', color: '#666', margin: '0 0 12px' }}>
            Tendrá acceso de administrador a toda la app. No se suma al Balance entre socios.
          </p>
        </>
      )}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear administrador'}
        </Boton>
      </div>
    </form>
  );
}

function FormPassword({ usuario, onGuardar, onCancelar, guardando }) {
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [errores, setErrores] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    if (password.length < MIN_PASSWORD) errs.password = `Mínimo ${MIN_PASSWORD} caracteres`;
    else if (password !== repetir) errs.repetir = 'Las contraseñas no coinciden';
    setErrores(errs);
    if (!Object.keys(errs).length) onGuardar(password);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <p style={{ fontSize: '14px', margin: '0 0 16px' }}>
        Nueva contraseña para <strong>{usuario.nombre}</strong> ({usuario.email}).
        {usuario.es_yo ? ' Después vas a tener que volver a iniciar sesión con la nueva.' : ' Se cierran sus sesiones abiertas.'}
      </p>
      <CampoPassword value={password} onChange={e => setPassword(e.target.value)} error={errores.password}
        label="Nueva contraseña *" autoFocus />
      <Campo label="Repetir contraseña *" error={errores.repetir}>
        <Input type="password" value={repetir} onChange={e => setRepetir(e.target.value)} autoComplete="new-password" />
      </Campo>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Cambiar contraseña'}</Boton>
      </div>
    </form>
  );
}

export default function Usuarios() {
  const [usuarios, setUsuarios]   = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState('');
  const [modal, setModal]         = useState(null); // { tipo: 'crear' | 'editar' | 'password', usuario }
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');
  const [aviso, setAviso]         = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setUsuarios(await get('/usuarios')); setError(''); }
    catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cerrarModal = () => { setModal(null); setErrorAccion(''); };

  const ejecutar = async (accion, mensaje) => {
    setGuardando(true);
    setErrorAccion('');
    try {
      await accion();
      cerrarModal();
      setAviso(mensaje);
      await cargar();
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleGuardarUsuario = (datos) => modal.tipo === 'crear'
    ? ejecutar(() => post('/usuarios', datos), `Administrador ${datos.nombre} creado. Ya puede entrar con su email y contraseña.`)
    : ejecutar(() => put(`/usuarios/${modal.usuario.id}`, datos), 'Cambios guardados.');

  const handleGuardarPassword = (password) =>
    ejecutar(() => put(`/usuarios/${modal.usuario.id}/password`, { password }),
      `Contraseña de ${modal.usuario.nombre} actualizada.`);

  const handleToggle = async (u) => {
    setErrorAccion('');
    setAviso('');
    try {
      await patch(`/usuarios/${u.id}/activo`, { activo: !u.activo });
      setAviso(`${u.nombre} ${u.activo ? 'desactivado' : 'activado'}.`);
      await cargar();
    } catch (err) { setErrorAccion(err.message); }
  };

  const admins = usuarios.filter(u => u.rol === 'admin' && u.activo).length;
  const btn = { padding: '5px 12px', fontSize: '13px' };

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <EncabezadoSeccion
        titulo="Usuarios"
        subtitulo={`${admins} administrador${admins !== 1 ? 'es' : ''} activo${admins !== 1 ? 's' : ''}`}
        accion={<Boton onClick={() => { setAviso(''); setModal({ tipo: 'crear' }); }}>+ Nuevo administrador</Boton>}
      />

      {aviso && (
        <div style={{
          background: '#e8f5e9', border: '1px solid #a5d6a7', color: '#1b5e20', borderRadius: '8px',
          padding: '10px 14px', fontSize: '13px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between',
        }}>
          {aviso}
          <button onClick={() => setAviso('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>×</button>
        </div>
      )}
      {!modal && <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />}

      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : error ? <AlertaError mensaje={error} />
      : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <Tabla
            columnas={['Nombre', 'Email', 'Rol', 'Estado', '']}
            ordenable={[
              { campo: 'nombre', tipo: 'texto' },
              { campo: 'email', tipo: 'texto' },
              { campo: 'rol', tipo: 'texto' },
              { campo: 'activo', tipo: 'texto', valor: (u) => u.activo ? 'Activo' : 'Inactivo' },
              null,
            ]}
            datos={usuarios}
            vacio="No hay usuarios."
            renderFila={(u) => (
              <Fila key={u.id}>
                <Celda>
                  <span style={{ fontWeight: 500, color: u.activo ? '#1a1a1a' : '#999' }}>{u.nombre}</span>
                  {u.es_yo && <span style={{ color: '#999', fontSize: '12px' }}> (vos)</span>}
                </Celda>
                <Celda style={{ color: '#666' }}>{u.email}</Celda>
                <Celda>
                  {u.rol === 'admin'
                    ? <Etiqueta bg="#e3f2fd" color="#0d47a1">Administrador</Etiqueta>
                    : <Etiqueta bg="#fff8e1" color="#f57f17">Dibujante</Etiqueta>}
                  {u.es_socio && <Etiqueta bg="#ede7f6" color="#311b92">Socio</Etiqueta>}
                </Celda>
                <Celda>
                  {u.activo
                    ? <Etiqueta bg="#e8f5e9" color="#1b5e20">Activo</Etiqueta>
                    : <Etiqueta>Inactivo</Etiqueta>}
                </Celda>
                <Celda align="right">
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    {u.rol === 'admin' && (
                      <Boton variante="secundario" style={btn}
                        onClick={() => { setAviso(''); setModal({ tipo: 'editar', usuario: u }); }}>Editar</Boton>
                    )}
                    <Boton variante="secundario" style={btn}
                      onClick={() => { setAviso(''); setModal({ tipo: 'password', usuario: u }); }}>Contraseña</Boton>
                    {u.rol === 'admin' && !u.es_yo && (
                      <Boton variante={u.activo ? 'peligro' : 'secundario'} style={btn} onClick={() => handleToggle(u)}>
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </Boton>
                    )}
                  </div>
                </Celda>
              </Fila>
            )}
          />
        </div>
      )}

      <p style={{ fontSize: '13px', color: '#999', marginTop: '12px' }}>
        Los dibujantes se crean, editan y desactivan desde la pantalla Dibujantes; acá solo se les puede cambiar la contraseña.
      </p>

      {modal && (
        <Modal
          titulo={modal.tipo === 'crear' ? 'Nuevo administrador' : modal.tipo === 'editar' ? 'Editar administrador' : 'Cambiar contraseña'}
          onCerrar={cerrarModal}
        >
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          {modal.tipo === 'password'
            ? <FormPassword usuario={modal.usuario} onGuardar={handleGuardarPassword} onCancelar={cerrarModal} guardando={guardando} />
            : <FormUsuario inicial={modal.usuario} onGuardar={handleGuardarUsuario} onCancelar={cerrarModal} guardando={guardando} />}
        </Modal>
      )}
    </div>
  );
}
