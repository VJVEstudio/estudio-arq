import { useState, useEffect, useCallback } from 'react';
import { get, post, put, del } from '../../lib/api';
import {
  EncabezadoSeccion, Boton, Tabla, Fila, Celda,
  Modal, Campo, Input, Select, Textarea, AlertaError,
} from '../../components/ui';

const fmtF = (f) => {
  if (!f) return '—';
  const fecha = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR');
};
const AZUL = '#1a2744';

function FormHoras({ inicial = {}, proyectos, onGuardar, onCancelar, guardando }) {
  const [form, setForm] = useState({
    proyecto_id:       inicial.proyecto_id       || '',
    fecha:             inicial.fecha             || new Date().toISOString().split('T')[0],
    horas:             inicial.horas             || '',
    descripcion_tarea: inicial.descripcion_tarea || '',
  });
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const validar = () => {
    const errs = {};
    if (!form.proyecto_id)                       errs.proyecto_id = 'Seleccioná un proyecto';
    if (!form.fecha)                             errs.fecha       = 'La fecha es obligatoria';
    if (!form.horas || Number(form.horas) <= 0)  errs.horas       = 'Las horas deben ser mayor a 0';
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validar()) return;
    onGuardar({ ...form, horas: Number(form.horas) });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
     <Campo label="Proyecto *" error={errores.proyecto_id}>
        <Select value={form.proyecto_id} onChange={set('proyecto_id')}>
          <option value="">Seleccioná un proyecto…</option>
          {proyectos.map(p => (
            <option key={p.id} value={p.id}>
              {p.cliente_nombre ? `${p.cliente_nombre} - ${p.nombre}` : p.nombre}
            </option>
          ))}
        </Select>
      </Campo>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Campo label="Fecha *" error={errores.fecha}>
          <Input type="date" value={form.fecha} onChange={set('fecha')} />
        </Campo>
        <Campo label="Horas trabajadas *" error={errores.horas}>
          <Input type="number" min="0.5" step="0.5" value={form.horas} onChange={set('horas')} placeholder="Ej: 3.5" />
        </Campo>
      </div>
      <Campo label="Descripción de la tarea">
        <Textarea value={form.descripcion_tarea} onChange={set('descripcion_tarea')}
          placeholder="¿Qué trabajaste? Ej: Planta baja sector UCI — revisión de cotas" rows={3} />
      </Campo>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>
          {guardando ? 'Guardando…' : inicial.id ? 'Guardar cambios' : 'Cargar horas'}
        </Boton>
      </div>
    </form>
  );
}

function ResumenProyectos({ horas }) {
  const porProyecto = {};
  horas.forEach(h => {
    if (!porProyecto[h.proyecto_id]) porProyecto[h.proyecto_id] = { nombre: h.proyecto_nombre, horas: 0, registros: 0 };
    porProyecto[h.proyecto_id].horas    += Number(h.horas);
    porProyecto[h.proyecto_id].registros += 1;
  });
  const proyectos = Object.values(porProyecto).sort((a, b) => b.horas - a.horas);
  if (!proyectos.length) return null;
  return (
    <div style={{ marginBottom: '28px' }}>
      <p style={{ fontWeight: 500, fontSize: '15px', marginBottom: '12px' }}>Mis horas por proyecto</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
        {proyectos.map(p => (
          <div key={p.nombre} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '14px 16px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '13px', color: '#666', fontWeight: 500 }}>{p.nombre}</p>
            <p style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: AZUL }}>{Number(p.horas).toFixed(1)} h</p>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#999' }}>{p.registros} registro{p.registros !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MisHoras() {
  const [horas,       setHoras]       = useState([]);
  const [proyectos,   setProyectos]   = useState([]);
  const [cargando,    setCargando]    = useState(true);
  const [error,       setError]       = useState(null);
  const [modal,       setModal]       = useState(null);
  const [confirmElim, setConfirmElim] = useState(null);
  const [guardando,   setGuardando]   = useState(false);
  const [eliminando,  setEliminando]  = useState(false);
  const [errorAccion, setErrorAccion] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
   const [h, p] = await Promise.all([get('/horas'), get('/proyectos?todos=true')]);
      setHoras(h); setProyectos(p);
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const totalHoras = horas.reduce((s, h) => s + Number(h.horas), 0);
  const cerrarModal = () => { setModal(null); setErrorAccion(''); };

  const handleGuardar = async (datos) => {
    setGuardando(true);
    setErrorAccion('');
    try {
      if (modal === 'crear') {
        const nueva = await post('/horas', datos);
        setHoras(prev => [nueva, ...prev]);
      } else {
        const actualizada = await put(`/horas/${modal.id}`, datos);
        setHoras(prev => prev.map(h => h.id === modal.id ? actualizada : h));
      }
      cerrarModal();
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleEliminar = async () => {
    setEliminando(true);
    try {
      await del(`/horas/${confirmElim.id}`);
      setHoras(prev => prev.filter(h => h.id !== confirmElim.id));
      setConfirmElim(null);
    } catch (err) { setErrorAccion(err.message); }
    finally { setEliminando(false); }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1000px' }}>
      <EncabezadoSeccion
        titulo="Mis horas"
        subtitulo={`${totalHoras.toFixed(1)} horas cargadas en total`}
        accion={<Boton onClick={() => setModal('crear')}>+ Cargar horas</Boton>}
      />
      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : error ? <AlertaError mensaje={error} />
      : (
        <>
          <ResumenProyectos horas={horas} />
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
            <Tabla
              columnas={['Fecha', 'Proyecto', 'Horas', 'Descripción', '']}
              datos={horas}
              vacio="Todavía no cargaste horas. ¡Empezá ahora!"
              renderFila={(h) => (
                <Fila key={h.id}>
                  <Celda style={{ whiteSpace: 'nowrap', color: '#666', fontSize: '13px' }}>{fmtF(h.fecha)}</Celda>
                  <Celda><span style={{ fontWeight: 500 }}>{h.proyecto_nombre}</span></Celda>
                  <Celda><span style={{ fontWeight: 600, color: AZUL }}>{Number(h.horas).toFixed(1)} h</span></Celda>
                  <Celda style={{ color: '#666', fontSize: '13px', maxWidth: '300px' }}>
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {h.descripcion_tarea || '—'}
                    </span>
                  </Celda>
                  <Celda align="right">
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <Boton variante="secundario" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setModal(h)}>Editar</Boton>
                      <Boton variante="peligro" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setConfirmElim(h)}>✕</Boton>
                    </div>
                  </Celda>
                </Fila>
              )}
            />
          </div>
        </>
      )}

      {modal && (
        <Modal titulo={modal === 'crear' ? 'Cargar horas' : `Editar registro — ${fmtF(modal.fecha)}`} onCerrar={cerrarModal} ancho={500}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormHoras inicial={modal === 'crear' ? {} : modal} proyectos={proyectos}
            onGuardar={handleGuardar} onCancelar={cerrarModal} guardando={guardando} />
        </Modal>
      )}

      {confirmElim && (
        <Modal titulo="Eliminar registro" onCerrar={() => setConfirmElim(null)} ancho={420}>
          <p style={{ fontSize: '14px', marginBottom: '8px' }}>
            ¿Eliminás este registro de <strong>{Number(confirmElim.horas).toFixed(1)} horas</strong> del {fmtF(confirmElim.fecha)}?
          </p>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '24px' }}>Proyecto: {confirmElim.proyecto_nombre}</p>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Boton variante="secundario" onClick={() => setConfirmElim(null)}>Cancelar</Boton>
            <Boton variante="peligro" onClick={handleEliminar} disabled={eliminando}>
              {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
            </Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
