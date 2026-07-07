import { useState, useEffect, useCallback } from 'react';
import { get, post, put } from '../../lib/api';
import {
  EncabezadoSeccion, Boton, Tabla, Fila, Celda,
  Modal, Campo, Input, AlertaError,
} from '../../components/ui';

const fmt  = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtH = (h) => `${Number(h || 0).toFixed(1)} h`;
const fmtF = (f) => {
  if (!f) return '—';
  const fecha = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR');
};
const AZUL = '#1a2744';

function FormNuevoDibujante({ onGuardar, onCancelar, guardando, errorServidor }) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', tarifa_hora_base: '', fecha_inicio: new Date().toISOString().split('T')[0] });
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const validar = () => {
    const errs = {};
    if (!form.nombre.trim())       errs.nombre = 'El nombre es obligatorio';
    if (!form.email.trim())        errs.email  = 'El email es obligatorio';
    if (!form.password.trim())     errs.password = 'La contraseña es obligatoria';
    if (form.password.length < 8)  errs.password = 'Mínimo 8 caracteres';
    if (!form.tarifa_hora_base || Number(form.tarifa_hora_base) <= 0) errs.tarifa_hora_base = 'La tarifa debe ser mayor a 0';
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Campo label="Nombre completo *" error={errores.nombre}>
          <Input value={form.nombre} onChange={set('nombre')} placeholder="Juan Pérez" autoFocus />
        </Campo>
        <Campo label="Fecha de inicio">
          <Input type="date" value={form.fecha_inicio} onChange={set('fecha_inicio')} />
        </Campo>
      </div>
      <Campo label="Email (para login) *" error={errores.email}>
        <Input type="email" value={form.email} onChange={set('email')} placeholder="juan@estudio.com" />
      </Campo>
      <Campo label="Contraseña inicial *" error={errores.password}>
        <Input type="password" value={form.password} onChange={set('password')} placeholder="Mínimo 8 caracteres" />
      </Campo>
      <Campo label="Tarifa por hora ($ ARS) *" error={errores.tarifa_hora_base}>
        <Input type="number" min="0" step="0.01" value={form.tarifa_hora_base} onChange={set('tarifa_hora_base')} placeholder="5000.00" />
      </Campo>
      {errorServidor && <AlertaError mensaje={errorServidor} />}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>{guardando ? 'Creando…' : 'Crear dibujante'}</Boton>
      </div>
    </form>
  );
}

function PanelDetalle({ dibujante, onActualizar, onCerrar }) {
  const [tab,        setTab]        = useState('info');
const [formInfo,   setFormInfo]   = useState({ nombre: dibujante.nombre, fecha_inicio: dibujante.fecha_inicio?.split('T')[0] || '', activo: dibujante.usuario_activo });  const [formCAC,    setFormCAC]    = useState({ indice_cac: '', motivo: '' });
  const [guardando,  setGuardando]  = useState(false);
  const [errorLocal, setErrorLocal] = useState('');
  const [historial,  setHistorial]  = useState(dibujante.historial_tarifas || []);

  const setI = (k) => (e) => setFormInfo(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setC = (k) => (e) => setFormCAC(p => ({ ...p, [k]: e.target.value }));

  const handleGuardarInfo = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorLocal('');
    try {
      const actualizado = await put(`/dibujantes/${dibujante.id}`, formInfo);
      onActualizar(actualizado);
    } catch (err) { setErrorLocal(err.message); }
    finally { setGuardando(false); }
  };

  const handleAjusteCAC = async (e) => {
    e.preventDefault();
    const idx = Number(formCAC.indice_cac);
    if (!idx || idx <= 0) { setErrorLocal('El índice debe ser mayor a 0'); return; }
    setGuardando(true);
    setErrorLocal('');
    try {
      const resultado = await post(`/dibujantes/${dibujante.id}/ajuste-cac`, { indice_cac: idx, motivo: formCAC.motivo });
      onActualizar(resultado);
      const det = await get(`/dibujantes/${dibujante.id}`);
      setHistorial(det.historial_tarifas || []);
      setFormCAC({ indice_cac: '', motivo: '' });
    } catch (err) { setErrorLocal(err.message); }
    finally { setGuardando(false); }
  };

  return (
    <div>
      <div style={{ background: AZUL, color: 'white', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: '12px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tarifa actual</p>
          <p style={{ margin: '4px 0 0', fontSize: '22px', fontWeight: 600 }}>{fmt(dibujante.tarifa_hora_base)} / hora</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: '12px', opacity: 0.7 }}>Desde</p>
          <p style={{ margin: '4px 0 0', fontSize: '15px' }}>{fmtF(dibujante.fecha_inicio)}</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #e0e0e0', marginBottom: '20px' }}>
        {[{ id: 'info', label: 'Datos' }, { id: 'cac', label: 'Ajuste CAC / Tarifa' }].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setErrorLocal(''); }} style={{
            padding: '8px 16px', border: 'none', background: 'none',
            borderBottom: tab === t.id ? `2px solid ${AZUL}` : '2px solid transparent',
            color: tab === t.id ? AZUL : '#666',
            fontWeight: tab === t.id ? 500 : 400,
            cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </div>
      <AlertaError mensaje={errorLocal} onCerrar={() => setErrorLocal('')} />
      {tab === 'info' && (
        <form onSubmit={handleGuardarInfo}>
          <Campo label="Nombre"><Input value={formInfo.nombre} onChange={setI('nombre')} /></Campo>
          <Campo label="Tarifa por hora ($ ARS)">
            <Input
              type="number" min="0" step="0.01"
              value={formInfo.tarifa_hora_base ?? dibujante.tarifa_hora_base}
              onChange={setI('tarifa_hora_base')}
            />
          </Campo>
          <Campo label="Fecha de inicio"><Input type="date" value={formInfo.fecha_inicio} onChange={setI('fecha_inicio')} /></Campo>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', marginBottom: '20px', cursor: 'pointer' }}>
            <input type="checkbox" checked={formInfo.activo} onChange={setI('activo')} />
            Usuario activo (puede iniciar sesión)
          </label>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>{['Fecha', 'Tarifa anterior', 'Índice', 'Tarifa nueva', 'Motivo'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#666', fontWeight: 500, borderBottom: '1px solid #e0e0e0' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {historial.map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e0e0e0' }}>
                      <td style={{ padding: '8px 10px' }}>{fmtF(h.fecha_ajuste)}</td>
                      <td style={{ padding: '8px 10px', color: '#666' }}>{fmt(h.tarifa_anterior)}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>×{Number(h.indice_cac || 0).toFixed(4)}</td>
                      <td style={{ padding: '8px 10px', fontWeight: 500, color: '#1b5e20' }}>{fmt(h.tarifa_nueva)}</td>
                      <td style={{ padding: '8px 10px', color: '#666' }}>{h.motivo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}
    </div>
  );
}

export default function Dibujantes() {
  const [dibujantes,  setDibujantes]  = useState([]);
  const [cargando,    setCargando]    = useState(true);
  const [error,       setError]       = useState(null);
  const [modal,       setModal]       = useState(null);
  const [modalCAC,    setModalCAC]    = useState(false);
  const [guardando,   setGuardando]   = useState(false);
  const [errorAccion, setErrorAccion] = useState('');
  const [formCAC,     setFormCAC]     = useState({ indice_cac: '', motivo: '' });

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setDibujantes(await get('/dibujantes')); }
    catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleCrear = async (datos) => {
    setGuardando(true);
    setErrorAccion('');
    try {
      const nuevo = await post('/dibujantes', datos);
      setDibujantes(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setModal(null);
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleActualizar = (actualizado) => {
    setDibujantes(prev => prev.map(d => d.id === actualizado.id ? { ...d, ...actualizado } : d));
  };

  const handleAjusteMasivo = async (e) => {
    e.preventDefault();
    const idx = Number(formCAC.indice_cac);
    if (!idx || idx <= 0) { setErrorAccion('El índice debe ser mayor a 0'); return; }
    setGuardando(true);
    setErrorAccion('');
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
            columnas={['Nombre', 'Tarifa actual', 'Inicio', 'Proyectos', 'Horas totales', 'Costo total', 'Estado', '']}
            datos={dibujantes}
            vacio="No hay dibujantes. Agregá el primero."
            renderFila={(d) => (
              <Fila key={d.id}>
                <Celda><span style={{ fontWeight: 500 }}>{d.nombre}</span></Celda>
                <Celda style={{ fontFamily: 'monospace', color: '#1b5e20', fontWeight: 500 }}>
                  {fmt(d.tarifa_hora_base)}<span style={{ fontSize: '12px', color: '#999' }}>/h</span>
                </Celda>
                <Celda style={{ color: '#666', fontSize: '13px' }}>{fmtF(d.fecha_inicio)}</Celda>
                <Celda align="center">{d.proyectos_trabajados || 0}</Celda>
                <Celda align="center" style={{ color: '#666' }}>{fmtH(d.horas_totales)}</Celda>
                <Celda style={{ fontWeight: 500, color: '#b71c1c' }}>{fmt(d.costo_total_historico)}</Celda>
                <Celda>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: d.usuario_activo ? '#e8f5e9' : '#f5f5f5', color: d.usuario_activo ? '#1b5e20' : '#666' }}>
                    {d.usuario_activo ? 'Activo' : 'Inactivo'}
                  </span>
                </Celda>
                <Celda align="right">
                  <Boton variante="secundario" style={{ padding: '5px 12px', fontSize: '13px' }}
                    onClick={async () => { const det = await get(`/dibujantes/${d.id}`); setModal(det); }}>
                    Ver / Editar
                  </Boton>
                </Celda>
              </Fila>
            )}
          />
        </div>
      )}
      {modal === 'crear' && (
        <Modal titulo="Nuevo dibujante" onCerrar={() => { setModal(null); setErrorAccion(''); }} ancho={520}>
          <FormNuevoDibujante onGuardar={handleCrear} onCancelar={() => setModal(null)} guardando={guardando} errorServidor={errorAccion} />
        </Modal>
      )}
      {modal && modal !== 'crear' && (
        <Modal titulo={modal.nombre} onCerrar={() => setModal(null)} ancho={600}>
          <PanelDetalle dibujante={modal} onActualizar={handleActualizar} onCerrar={() => setModal(null)} />
        </Modal>
      )}
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
