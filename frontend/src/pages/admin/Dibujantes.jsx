import { useState, useEffect, useCallback } from 'react';
import { get, post, put } from '../../lib/api';
import {
  EncabezadoSeccion, Tabla, Fila, Celda, Boton,
  Modal, Campo, Input, Select, AlertaError,
} from '../../components/ui';

const fmt = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtF = (f) => {
  if (!f) return '—';
  const fecha = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR');
};

function FormNuevoDibujante({ onGuardar, onCancelar, guardando }) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', tarifa_hora_base: '', fecha_inicio: new Date().toISOString().split('T')[0] });
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const validar = () => {
    const errs = {};
    if (!form.nombre.trim())        errs.nombre = 'El nombre es obligatorio';
    if (!form.email.trim())         errs.email = 'El email es obligatorio';
    if (!form.password.trim())      errs.password = 'La contraseña es obligatoria';
    if (!form.tarifa_hora_base || Number(form.tarifa_hora_base) <= 0) errs.tarifa = 'La tarifa debe ser mayor a 0';
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validar()) return;
    onGuardar({ ...form, tarifa_hora_base: Number(form.tarifa_hora_base) });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Campo label="Nombre completo *" error={errores.nombre}>
        <Input value={form.nombre} onChange={set('nombre')} placeholder="Ej: Juan Pérez" autoFocus />
      </Campo>
      <Campo label="Email *" error={errores.email}>
        <Input type="email" value={form.email} onChange={set('email')} placeholder="juan@estudio.com" />
      </Campo>
      <Campo label="Contraseña inicial *" error={errores.password}>
        <Input type="password" value={form.password} onChange={set('password')} placeholder="Contraseña para el primer acceso" />
      </Campo>
      <Campo label="Tarifa por hora ($ ARS) *" error={errores.tarifa}>
        <Input type="number" min="0" step="0.01" value={form.tarifa_hora_base} onChange={set('tarifa_hora_base')} placeholder="Ej: 5000" />
      </Campo>
      <Campo label="Fecha de inicio">
        <Input type="date" value={form.fecha_inicio} onChange={set('fecha_inicio')} />
      </Campo>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>{guardando ? 'Creando…' : 'Crear dibujante'}</Boton>
      </div>
    </form>
  );
}

function PanelDibujante({ dibujante, onCerrar, onActualizar }) {
  const [tab, setTab] = useState('info');
  const [historial, setHistorial] = useState([]);
  const [formInfo, setFormInfo] = useState({
    nombre: dibujante.nombre,
    tarifa_hora_base: dibujante.tarifa_hora_base,
    fecha_inicio: dibujante.fecha_inicio?.split('T')[0] || '',
    activo: dibujante.usuario_activo,
    monotributo_activo: dibujante.monotributo_activo ?? false,
    monotributo_monto: dibujante.monotributo_monto ?? 0,
  });
  const [formCAC, setFormCAC] = useState({ indice_cac: '', motivo: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const setI = (k) => (e) => setFormInfo(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setC = (k) => (e) => setFormCAC(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    get(`/dibujantes/${dibujante.id}`).then(d => setHistorial(d.historial_tarifas || [])).catch(() => {});
  }, [dibujante.id]);

  const handleGuardarInfo = async (e) => {
    e.preventDefault();
    setGuardando(true); setError('');
    try {
      const actualizado = await put(`/dibujantes/${dibujante.id}`, {
        nombre: formInfo.nombre,
        fecha_inicio: formInfo.fecha_inicio,
        activo: formInfo.activo,
        tarifa_hora_base: formInfo.tarifa_hora_base ? Number(formInfo.tarifa_hora_base) : undefined,
        monotributo_activo: formInfo.monotributo_activo,
        monotributo_monto: formInfo.monotributo_monto ? Number(formInfo.monotributo_monto) : 0,
      });
      onActualizar(actualizado);
      onCerrar();
    } catch (err) { setError(err.message); }
    finally { setGuardando(false); }
  };

  const handleAjusteCAC = async (e) => {
    e.preventDefault();
    const idx = Number(formCAC.indice_cac);
    if (!idx || idx <= 0) { setError('El porcentaje debe ser mayor a 0'); return; }
    setGuardando(true); setError('');
    try {
      const actualizado = await post(`/dibujantes/${dibujante.id}/ajuste-cac`, { indice_cac: idx, motivo: formCAC.motivo });
      onActualizar(actualizado);
      setFormCAC({ indice_cac: '', motivo: '' });
      get(`/dibujantes/${dibujante.id}`).then(d => setHistorial(d.historial_tarifas || [])).catch(() => {});
    } catch (err) { setError(err.message); }
    finally { setGuardando(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#f0f0f0', borderRadius: '8px', padding: '3px', width: 'fit-content' }}>
        {[{ id: 'info', label: 'Datos' }, { id: 'cac', label: 'Ajuste CAC / Tarifa' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 14px', fontSize: '13px', borderRadius: '6px', border: 'none',
            background: tab === t.id ? '#fff' : 'transparent',
            boxShadow: tab === t.id ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
            cursor: 'pointer', fontFamily: 'inherit',
            color: tab === t.id ? '#1a2744' : '#666',
            fontWeight: tab === t.id ? 600 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ background: '#f8f9fa', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', display: 'flex', gap: '24px' }}>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#999', textTransform: 'uppercase' }}>Tarifa actual</p>
          <p style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1a2744' }}>{fmt(dibujante.tarifa_hora_base)} / hora</p>
        </div>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#999', textTransform: 'uppercase' }}>Desde</p>
          <p style={{ margin: 0, fontSize: '14px', color: '#333' }}>{fmtF(dibujante.fecha_inicio)}</p>
        </div>
        {dibujante.monotributo_activo && (
          <div>
            <p style={{ margin: '0 0 2px', fontSize: '11px', color: '#999', textTransform: 'uppercase' }}>Monotributo</p>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: '#0d47a1' }}>{fmt(dibujante.monotributo_monto)}/mes</p>
          </div>
        )}
      </div>

      <AlertaError mensaje={error} onCerrar={() => setError('')} />

      {tab === 'info' && (
        <form onSubmit={handleGuardarInfo}>
          <Campo label="Nombre">
            <Input value={formInfo.nombre} onChange={setI('nombre')} />
          </Campo>
          <Campo label="Tarifa por hora ($ ARS)">
            <Input type="number" min="0" step="0.01"
              value={formInfo.tarifa_hora_base ?? dibujante.tarifa_hora_base}
              onChange={setI('tarifa_hora_base')} />
          </Campo>
          <Campo label="Fecha de inicio">
            <Input type="date" value={formInfo.fecha_inicio} onChange={setI('fecha_inicio')} />
          </Campo>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', marginBottom: '16px', cursor: 'pointer' }}>
            <input type="checkbox" checked={formInfo.activo} onChange={setI('activo')} />
            Usuario activo (puede iniciar sesión)
          </label>

          {/* Monotributo */}
          <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', marginBottom: formInfo.monotributo_activo ? '12px' : '0', cursor: 'pointer' }}>
              <input type="checkbox" checked={formInfo.monotributo_activo}
                onChange={e => setFormInfo(p => ({ ...p, monotributo_activo: e.target.checked }))} />
              <span style={{ fontWeight: 500 }}>Cobra monotributo</span>
            </label>
            {formInfo.monotributo_activo && (
              <Campo label="Monto mensual del monotributo ($)">
                <Input type="number" min="0" step="0.01"
                  value={formInfo.monotributo_monto}
                  onChange={setI('monotributo_monto')}
                  placeholder="Ej: 45000" />
              </Campo>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Boton type="button" variante="secundario" onClick={onCerrar}>Cerrar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Boton>
          </div>
        </form>
      )}

      {tab === 'cac' && (
        <div>
          <form onSubmit={handleAjusteCAC} style={{ marginBottom: '28px' }}>
            <p style={{ fontSize: '14px', color: '#666', marginTop: 0 }}>
              Ingresá el porcentaje de aumento. La tarifa actual se incrementará en ese porcentaje.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Campo label="% de aumento (CAC)">
                <Input type="number" min="0" step="0.01" value={formCAC.indice_cac} onChange={setC('indice_cac')} placeholder="Ej: 2.4 (= +2.4%)" />
              </Campo>
              <Campo label="Nueva tarifa (vista previa)">
                <Input readOnly value={formCAC.indice_cac > 0 ? fmt(dibujante.tarifa_hora_base * (1 + Number(formCAC.indice_cac) / 100)) : '—'} style={{ background: '#f5f5f5', cursor: 'default' }} />
              </Campo>
            </div>
            <Campo label="Motivo (opcional)">
              <Input value={formCAC.motivo} onChange={setC('motivo')} placeholder="Ej: Actualización julio 2026" />
            </Campo>
            <Boton type="submit" disabled={guardando || !formCAC.indice_cac}>{guardando ? 'Aplicando…' : 'Aplicar ajuste'}</Boton>
          </form>
          <p style={{ fontWeight: 500, fontSize: '14px', marginBottom: '10px' }}>Historial de ajustes</p>
          {historial.length === 0
            ? <p style={{ color: '#999', fontSize: '14px' }}>Sin ajustes registrados.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {historial.map((h, i) => (
                  <div key={i} style={{ background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ color: '#999' }}>{fmtF(h.fecha_ajuste)}</span>
                      {h.motivo && <span style={{ marginLeft: '10px', color: '#666' }}>{h.motivo}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <span style={{ color: '#999', textDecoration: 'line-through' }}>{fmt(h.tarifa_anterior)}</span>
                      <span>→</span>
                      <span style={{ fontWeight: 600, color: '#1b5e20' }}>{fmt(h.tarifa_nueva)}</span>
                      {h.indice_cac && <span style={{ background: '#e8f5e9', color: '#1b5e20', borderRadius: '20px', padding: '1px 8px', fontSize: '11px' }}>+{Number(h.indice_cac).toFixed(2)}%</span>}
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}
    </div>
  );
}

export default function Dibujantes() {
  const [dibujantes, setDibujantes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [modalCAC, setModalCAC] = useState(false);
  const [formCAC, setFormCAC] = useState({ indice_cac: '', motivo: '' });
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');
  const [dibSeleccionado, setDibSeleccionado] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setDibujantes(await get('/dibujantes')); }
    catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleCrear = async (datos) => {
    setGuardando(true); setErrorAccion('');
    try { await post('/dibujantes', datos); await cargar(); setModal(null); }
    catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleActualizar = (actualizado) => {
    setDibujantes(prev => prev.map(d => d.id === actualizado.id ? { ...d, ...actualizado } : d));
  };

  const handleAjusteMasivo = async (e) => {
    e.preventDefault();
    const idx = Number(formCAC.indice_cac);
    if (!idx || idx <= 0) { setErrorAccion('El índice debe ser mayor a 0'); return; }
    setGuardando(true); setErrorAccion('');
    try {
      const res = await post('/dibujantes/ajuste-cac-masivo', { indice_cac: idx, motivo: formCAC.motivo });
      await cargar();
      setModalCAC(false);
      setFormCAC({ indice_cac: '', motivo: '' });
      alert(`Ajuste aplicado a ${res.ajustados} dibujante${res.ajustados !== 1 ? 's' : ''}.`);
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <EncabezadoSeccion
        titulo="Dibujantes"
        subtitulo={`${dibujantes.length} dibujante${dibujantes.length !== 1 ? 's' : ''}`}
        accion={
          <div style={{ display: 'flex', gap: '10px' }}>
            <Boton variante="secundario" onClick={() => setModalCAC(true)}>📊 Ajuste CAC masivo</Boton>
            <Boton onClick={() => { setModal('crear'); setErrorAccion(''); }}>+ Nuevo dibujante</Boton>
          </div>
        }
      />
      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : error ? <AlertaError mensaje={error} />
      : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <Tabla
            columnas={['Nombre', 'Tarifa actual', 'Monotributo', 'Inicio', 'Proyectos', 'Horas totales', 'Costo total', 'Estado', '']}
            datos={dibujantes}
            vacio="No hay dibujantes. Agregá el primero."
            renderFila={(d) => (
              <Fila key={d.id}>
                <Celda style={{ fontWeight: 500 }}>{d.nombre}</Celda>
                <Celda style={{ fontFamily: 'monospace', fontSize: '13px', color: '#1b5e20' }}>{fmt(d.tarifa_hora_base)}/h</Celda>
                <Celda style={{ fontSize: '13px' }}>
                  {d.monotributo_activo
                    ? <span style={{ color: '#0d47a1', fontWeight: 500 }}>{fmt(d.monotributo_monto)}/mes</span>
                    : <span style={{ color: '#999' }}>—</span>}
                </Celda>
                <Celda style={{ color: '#666', fontSize: '13px' }}>{fmtF(d.fecha_inicio)}</Celda>
                <Celda align="center" style={{ color: '#0d47a1', fontWeight: 500 }}>{d.proyectos_trabajados || 0}</Celda>
                <Celda style={{ color: d.horas_totales > 0 ? '#1a2744' : '#999' }}>{Number(d.horas_totales || 0).toFixed(1)} h</Celda>
                <Celda style={{ color: '#b71c1c', fontWeight: 500 }}>{fmt(d.costo_total_historico)}</Celda>
                <Celda>
                  <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: '20px',
                    fontSize: '12px', fontWeight: 500,
                    background: d.usuario_activo ? '#e8f5e9' : '#fce4ec',
                    color: d.usuario_activo ? '#1b5e20' : '#b71c1c',
                  }}>
                    {d.usuario_activo ? 'Activo' : 'Inactivo'}
                  </span>
                </Celda>
                <Celda align="right">
                  <Boton variante="secundario" style={{ padding: '5px 12px', fontSize: '13px' }}
                    onClick={() => setDibSeleccionado(d)}>
                    Ver / Editar
                  </Boton>
                </Celda>
              </Fila>
            )}
          />
        </div>
      )}

      {/* Modal crear */}
      {modal === 'crear' && (
        <Modal titulo="Nuevo dibujante" onCerrar={() => { setModal(null); setErrorAccion(''); }}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormNuevoDibujante onGuardar={handleCrear} onCancelar={() => setModal(null)} guardando={guardando} />
        </Modal>
      )}

      {/* Modal ver/editar */}
      {dibSeleccionado && (
        <Modal titulo={dibSeleccionado.nombre} onCerrar={() => setDibSeleccionado(null)} ancho={520}>
          <PanelDibujante
            dibujante={dibSeleccionado}
            onCerrar={() => setDibSeleccionado(null)}
            onActualizar={handleActualizar}
          />
        </Modal>
      )}

      {/* Modal ajuste masivo */}
      {modalCAC && (
        <Modal titulo="Ajuste CAC masivo" onCerrar={() => { setModalCAC(false); setFormCAC({ indice_cac: '', motivo: '' }); setErrorAccion(''); }} ancho={480}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <form onSubmit={handleAjusteMasivo}>
            <p style={{ fontSize: '14px', color: '#666', marginTop: 0 }}>
              Este ajuste se aplicará a todos los dibujantes activos. Ingresá el porcentaje de aumento.
            </p>
            <Campo label="% de aumento (CAC)">
              <Input type="number" min="0" step="0.01" value={formCAC.indice_cac} onChange={e => setFormCAC(p => ({ ...p, indice_cac: e.target.value }))} placeholder="Ej: 2.4 (= +2.4%)" />
            </Campo>
            <Campo label="Motivo (opcional)">
              <Input value={formCAC.motivo} onChange={e => setFormCAC(p => ({ ...p, motivo: e.target.value }))} placeholder="Ej: Actualización julio 2026" />
            </Campo>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <Boton type="button" variante="secundario" onClick={() => { setModalCAC(false); setFormCAC({ indice_cac: '', motivo: '' }); }}>Cancelar</Boton>
              <Boton type="submit" disabled={guardando || !formCAC.indice_cac}>{guardando ? 'Aplicando…' : 'Aplicar a todos'}</Boton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
