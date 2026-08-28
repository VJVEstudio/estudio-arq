import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRendicion } from '../../hooks/useRendiciones';
import { getAccessToken, get, post, put, del } from '../../lib/api';
import {
  Boton, Tabla, Fila, Celda,
  Modal, Campo, Input, Select, AlertaError,
} from '../../components/ui';

const AZUL = '#1a2744';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const fmt = (n, moneda = 'ARS') =>
  moneda === 'USD'
    ? `U$S ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtF = (f) => {
  if (!f) return '—';
  const fecha = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR');
};

// ── Formulario de comprobante ─────────────────────────────────────────────────
function FormComprobante({ inicial = {}, rendicionId, onGuardar, onCancelar, guardando }) {
  const [form, setForm] = useState({
    descripcion: inicial.descripcion || '',
    numero_comprobante: inicial.numero_comprobante || '',
    proveedor: inicial.proveedor || '',
    fecha: inicial.fecha ? String(inicial.fecha).slice(0, 10) : new Date().toISOString().split('T')[0],
    moneda: inicial.moneda || 'ARS',
    monto_neto: inicial.monto_neto ?? '',
    iva: inicial.iva ?? '',
    iibb: inicial.iibb ?? '',
    archivo_url: inicial.archivo_url || '',
  });
  const [errores, setErrores] = useState({});
  const [procesandoOCR, setProcesandoOCR] = useState(false);
  const [errorOCR, setErrorOCR] = useState('');
  const inputArchivoRef = useRef(null);
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const totalPreview = Number(form.monto_neto || 0) + Number(form.iva || 0) + Number(form.iibb || 0);

  const handleArchivoSeleccionado = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setProcesandoOCR(true);
    setErrorOCR('');
    try {
      const token = getAccessToken();
      const formData = new FormData();
      formData.append('archivo', archivo);
      const resp = await fetch(`${BASE}/rendiciones/${rendicionId}/comprobantes/ocr`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        credentials: 'include',
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Error al leer el comprobante');
      }
      const datos = await resp.json();
      setForm(p => ({
        ...p,
        descripcion: datos.descripcion || p.descripcion,
        proveedor: datos.proveedor || p.proveedor,
        numero_comprobante: datos.numero_comprobante || p.numero_comprobante,
        fecha: datos.fecha || p.fecha,
        moneda: datos.moneda || p.moneda,
        monto_neto: datos.monto_neto ?? p.monto_neto,
        iva: datos.iva ?? p.iva,
        iibb: datos.iibb ?? p.iibb,
        archivo_url: datos.archivo_url || p.archivo_url,
      }));
    } catch (err) {
      setErrorOCR(err.message);
    } finally {
      setProcesandoOCR(false);
    }
  };

  const validar = () => {
    const errs = {};
    if (!form.descripcion.trim()) errs.descripcion = 'La descripción es obligatoria';
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validar()) return;
    onGuardar({
      ...form,
      monto_neto: Number(form.monto_neto || 0),
      iva: Number(form.iva || 0),
      iibb: Number(form.iibb || 0),
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{
        border: '2px dashed #c7d2fe', borderRadius: '10px', padding: '16px',
        marginBottom: '20px', background: '#f8faff', textAlign: 'center',
      }}>
        <input ref={inputArchivoRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleArchivoSeleccionado} style={{ display: 'none' }} />
        {procesandoOCR ? (
          <p style={{ margin: 0, fontSize: '13px', color: AZUL }}>🔍 Leyendo el comprobante…</p>
        ) : form.archivo_url ? (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#1b5e20' }}>✓ Comprobante cargado y leído</p>
            <Boton type="button" variante="secundario" style={{ fontSize: '12px', padding: '5px 12px' }}
              onClick={() => inputArchivoRef.current?.click()}>Cambiar archivo</Boton>
          </div>
        ) : (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#666' }}>
              📎 Subí una foto o PDF de la factura para autocompletar los datos
            </p>
            <Boton type="button" variante="secundario" style={{ fontSize: '12px', padding: '5px 12px' }}
              onClick={() => inputArchivoRef.current?.click()}>Seleccionar archivo</Boton>
          </div>
        )}
        {errorOCR && <p style={{ color: '#b91c1c', fontSize: '12px', margin: '8px 0 0' }}>{errorOCR}</p>}
      </div>

      <Campo label="Descripción *" error={errores.descripcion}>
        <Input value={form.descripcion} onChange={set('descripcion')} placeholder="Ej: Cerramientos y Estructuras - Certificado Obra" autoFocus />
      </Campo>
      <Campo label="Proveedor">
        <Input value={form.proveedor} onChange={set('proveedor')} placeholder="Ej: Cerramientos y Estructuras SA" />
      </Campo>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '16px' }}>
        <Campo label="Fecha">
          <Input type="date" value={form.fecha} onChange={set('fecha')} />
        </Campo>
        <Campo label="N° de comprobante">
          <Input value={form.numero_comprobante} onChange={set('numero_comprobante')} placeholder="A00003-00004197" />
        </Campo>
        <Campo label="Moneda">
          <Select value={form.moneda} onChange={set('moneda')}>
            <option value="ARS">$ ARS</option>
            <option value="USD">U$S USD</option>
          </Select>
        </Campo>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
        <Campo label="Monto neto">
          <Input type="number" step="0.01" value={form.monto_neto} onChange={set('monto_neto')} placeholder="0.00" />
        </Campo>
        <Campo label="IVA">
          <Input type="number" step="0.01" value={form.iva} onChange={set('iva')} placeholder="0.00" />
        </Campo>
        <Campo label="IIBB">
          <Input type="number" step="0.01" value={form.iibb} onChange={set('iibb')} placeholder="0.00" />
        </Campo>
      </div>
      <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', color: '#666' }}>Total con impuestos</span>
        <span style={{ fontWeight: 700, color: AZUL }}>{fmt(totalPreview, form.moneda)}</span>
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>{guardando ? 'Guardando…' : inicial.id ? 'Guardar cambios' : 'Agregar comprobante'}</Boton>
      </div>
    </form>
  );
}

// ── Rendición de Honorarios DT/HP ────────────────────────────────────────────
function RendicionHonorarios({ rendicion, id, cargar }) {
  const navigate = useNavigate();
  const [honorarios, setHonorarios] = useState({ bases: [], socios: [] });
  const [pct, setPct] = useState(rendicion.porcentaje_honorarios || '');
  const [todasRendiciones, setTodasRendiciones] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');
  const [formSocio, setFormSocio] = useState({ nombre: '', porcentaje: '', aplica_iva: false });
  const [mostrarFormSocio, setMostrarFormSocio] = useState(false);

  const cargarHonorarios = async () => {
    const [h, r] = await Promise.all([
      get(`/rendiciones/${id}/honorarios`),
      get('/rendiciones'),
    ]);
    setHonorarios(h);
    setTodasRendiciones(r.filter(r2 => r2.id !== id && !r2.es_honorarios));
  };

  useEffect(() => { cargarHonorarios(); }, [id]);

  const totalBase = honorarios.bases.reduce((s, b) => s + Number(b.total_ars), 0);
  const honorarioTotal = totalBase * Number(pct || 0) / 100;
  const totalSocios = honorarios.socios.reduce((s, sc) => s + Number(sc.monto_total), 0);

  const handleAgregarBase = async (rendicion_base_id) => {
    try {
      await post(`/rendiciones/${id}/honorarios/base`, { rendicion_base_id });
      await cargarHonorarios();
    } catch (err) { setErrorAccion(err.message); }
  };

  const handleEliminarBase = async (baseId) => {
    try {
      await del(`/rendiciones/honorarios/base/${baseId}`);
      await cargarHonorarios();
    } catch (err) { setErrorAccion(err.message); }
  };

  const handleRecalcular = async () => {
    try {
      await put(`/rendiciones/${id}/honorarios/calcular`, { porcentaje_honorarios: Number(pct) });
      await cargarHonorarios();
    } catch (err) { setErrorAccion(err.message); }
  };

  const handleAgregarSocio = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await post(`/rendiciones/${id}/honorarios/socios`, {
        nombre: formSocio.nombre,
        porcentaje: Number(formSocio.porcentaje),
        aplica_iva: formSocio.aplica_iva,
        honorario_total: honorarioTotal,
      });
      setFormSocio({ nombre: '', porcentaje: '', aplica_iva: false });
      setMostrarFormSocio(false);
      await cargarHonorarios();
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleEliminarSocio = async (socioId) => {
    try {
      await del(`/rendiciones/honorarios/socios/${socioId}`);
      await cargarHonorarios();
    } catch (err) { setErrorAccion(err.message); }
  };

  const handleExportarPDF = () => {
    const token = getAccessToken();
    window.open(`${BASE}/rendiciones/${id}/pdf?token=${token}`, '_blank');
  };

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>
      <Boton variante="texto" onClick={() => navigate('/admin/rendiciones')} style={{ marginBottom: '12px', color: '#666', fontSize: '13px' }}>← Volver</Boton>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 500 }}>{rendicion.tipo}{rendicion.numero}</h1>
          <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#666' }}>{rendicion.cliente_nombre} — {rendicion.proyecto_nombre}</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#999' }}>{fmtF(rendicion.fecha)}</p>
        </div>
        <Boton variante="secundario" onClick={handleExportarPDF}>⬇ Exportar PDF</Boton>
      </div>

      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />

      {/* Rendiciones base */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <p style={{ fontWeight: 500, fontSize: '15px', margin: '0 0 14px' }}>Rendiciones base</p>
        {honorarios.bases.length === 0 ? (
          <p style={{ color: '#999', fontSize: '13px', marginBottom: '12px' }}>No hay rendiciones base agregadas todavía.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', marginBottom: '12px' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>Rendición</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>Neto</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {honorarios.bases.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{b.tipo}{b.numero}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(b.total_ars)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(b.total_ars)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <Boton variante="peligro" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => handleEliminarBase(b.id)}>✕</Boton>
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f8f9fa', fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: '8px 12px' }}></td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: AZUL }}>TOTAL {fmt(totalBase)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
        <Select value="" onChange={e => { if (e.target.value) handleAgregarBase(e.target.value); }} style={{ width: 'auto' }}>
          <option value="">+ Agregar rendición base…</option>
          {todasRendiciones
            .filter(r => !honorarios.bases.find(b => b.rendicion_base_id === r.id))
            .map(r => <option key={r.id} value={r.id}>{r.tipo}{r.numero} — {r.proyecto_nombre}</option>)
          }
        </Select>
      </div>

      {/* Porcentaje de honorarios */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
        <p style={{ fontWeight: 500, fontSize: '15px', margin: '0 0 14px' }}>Honorarios VJV</p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Campo label="% de honorarios">
            <Input type="number" min="0" max="100" step="0.01" value={pct}
              onChange={e => setPct(e.target.value)} placeholder="Ej: 7" style={{ width: '120px' }} />
          </Campo>
          <Boton onClick={handleRecalcular} disabled={!pct || honorarios.bases.length === 0}>Calcular</Boton>
          {honorarioTotal > 0 && (
            <div style={{ fontSize: '14px', color: '#666' }}>
              {fmt(totalBase)} × {pct}% = <strong style={{ color: AZUL, fontSize: '16px' }}>{fmt(honorarioTotal)}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Distribución de honorarios */}
      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <p style={{ fontWeight: 500, fontSize: '15px', margin: '0 0 4px' }}>Distribución de honorarios</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '120px', height: '6px', background: '#e0e0e0', borderRadius: '3px' }}>
                <div style={{
                  width: `${Math.min(100, honorarios.socios.reduce((s, sc) => s + Number(sc.porcentaje), 0))}%`,
                  height: '100%', borderRadius: '3px',
                  background: honorarios.socios.reduce((s, sc) => s + Number(sc.porcentaje), 0) > 100 ? '#b71c1c' : '#1a2744',
                  transition: 'width 0.3s',
                }} />
              </div>
              <span style={{
                fontSize: '12px', fontWeight: 600,
                color: honorarios.socios.reduce((s, sc) => s + Number(sc.porcentaje), 0) > 100 ? '#b71c1c' : '#666',
              }}>
                {honorarios.socios.reduce((s, sc) => s + Number(sc.porcentaje), 0).toFixed(2)}% asignado
              </span>
            </div>
          </div>
          <Boton style={{ padding: '5px 12px', fontSize: '13px' }}
            onClick={() => setMostrarFormSocio(true)}
            disabled={honorarios.socios.reduce((s, sc) => s + Number(sc.porcentaje), 0) >= 100}>
            + Agregar socio
          </Boton>
        </div>

        {mostrarFormSocio && (
          <form onSubmit={handleAgregarSocio} style={{ background: '#f8f9fa', borderRadius: '8px', padding: '14px', marginBottom: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '12px', alignItems: 'flex-end' }}>
              <Campo label="Nombre / Factura">
                <Input value={formSocio.nombre} onChange={e => setFormSocio(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej: Factura SMV" autoFocus />
              </Campo>
              <Campo label="% del honorario">
                <Input type="number" min="0" max="100" step="0.01" value={formSocio.porcentaje}
                  onChange={e => setFormSocio(p => ({ ...p, porcentaje: e.target.value }))} placeholder="Ej: 33.33" />
              </Campo>
              <div style={{ paddingBottom: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formSocio.aplica_iva}
                    onChange={e => setFormSocio(p => ({ ...p, aplica_iva: e.target.checked }))} />
                  IVA 21%
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <Boton type="button" variante="secundario" onClick={() => setMostrarFormSocio(false)}>Cancelar</Boton>
              <Boton type="submit" disabled={guardando}>Agregar</Boton>
            </div>
          </form>
        )}

        {honorarios.socios.length === 0 ? (
          <p style={{ color: '#999', fontSize: '13px' }}>No hay socios agregados todavía.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>Nombre</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>%</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>Neto</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>IVA</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {honorarios.socios.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{s.nombre}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#666' }}>{s.porcentaje}%</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(s.monto_neto)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#666' }}>{s.aplica_iva ? fmt(s.monto_iva) : '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(s.monto_total)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <Boton variante="peligro" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => handleEliminarSocio(s.id)}>✕</Boton>
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f8f9fa', fontWeight: 700 }}>
                <td colSpan={4} style={{ padding: '8px 12px', textAlign: 'right' }}>Total</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: AZUL }}>{fmt(totalSocios)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Rendición de Obra (comprobantes) ─────────────────────────────────────────
export default function RendicionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rendicion, cargando, error, agregarComprobante, actualizarComprobante, eliminarComprobante, cargar } = useRendicion(id);
  const [modal, setModal] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');

  if (cargando) return <div style={{ padding: '32px', color: '#666', fontSize: '14px' }}>Cargando…</div>;
  if (error) return <div style={{ padding: '32px' }}><AlertaError mensaje={error} /></div>;
  if (!rendicion) return null;

  if (rendicion.es_honorarios) {
    return <RendicionHonorarios rendicion={rendicion} id={id} cargar={cargar} />;
  }

  const cerrarModal = () => { setModal(null); setErrorAccion(''); };

  const handleGuardar = async (datos) => {
    setGuardando(true);
    setErrorAccion('');
    try {
      if (modal === 'crear') await agregarComprobante(datos);
      else await actualizarComprobante(modal.id, datos);
      cerrarModal();
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleEliminar = async () => {
    try { await eliminarComprobante(modal.comprobante.id); cerrarModal(); }
    catch (err) { setErrorAccion(err.message); }
  };

  const handleExportarPDF = () => {
    const token = getAccessToken();
    window.open(`${BASE}/rendiciones/${id}/pdf?token=${token}`, '_blank');
  };

  const porMoneda = { ARS: [], USD: [] };
  rendicion.comprobantes.forEach(c => { porMoneda[c.moneda]?.push(c); });

  return (
    <div style={{ padding: '32px', maxWidth: '1000px' }}>
      <Boton variante="texto" onClick={() => navigate('/admin/rendiciones')} style={{ marginBottom: '12px', color: '#666', fontSize: '13px' }}>← Volver</Boton>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 500 }}>{rendicion.tipo}{rendicion.numero}</h1>
          <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#666' }}>{rendicion.cliente_nombre} — {rendicion.proyecto_nombre}</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#999' }}>{fmtF(rendicion.fecha)}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Boton variante="secundario" onClick={handleExportarPDF}>⬇ Exportar PDF</Boton>
          <Boton onClick={() => setModal('crear')}>+ Agregar comprobante</Boton>
        </div>
      </div>

      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />

      {['ARS', 'USD'].map(moneda => {
        const lista = porMoneda[moneda];
        if (!lista.length) return null;
        const total = lista.reduce((s, c) => s + Number(c.monto_total), 0);
        return (
          <div key={moneda} style={{ marginBottom: '28px' }}>
            <p style={{ fontWeight: 500, fontSize: '15px', marginBottom: '12px' }}>{moneda === 'ARS' ? '$ Pesos argentinos' : 'U$S Dólares'}</p>
            <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '8px' }}>
              <Tabla
                columnas={['Descripción', 'Comprobante', 'Neto', 'IVA', 'IIBB', 'Total', '']}
                datos={lista}
                renderFila={(c) => (
                  <Fila key={c.id}>
                    <Celda style={{ fontWeight: 500 }}>{c.descripcion}</Celda>
                    <Celda style={{ fontFamily: 'monospace', fontSize: '12px', color: '#666' }}>{c.numero_comprobante || '—'}</Celda>
                    <Celda style={{ whiteSpace: 'nowrap' }}>{fmt(c.monto_neto, moneda)}</Celda>
                    <Celda style={{ whiteSpace: 'nowrap', color: '#666' }}>{Number(c.iva) !== 0 ? fmt(c.iva, moneda) : '—'}</Celda>
                    <Celda style={{ whiteSpace: 'nowrap', color: '#666' }}>{Number(c.iibb) !== 0 ? fmt(c.iibb, moneda) : '—'}</Celda>
                    <Celda style={{ whiteSpace: 'nowrap', fontWeight: 600, color: Number(c.monto_total) >= 0 ? AZUL : '#b71c1c' }}>{fmt(c.monto_total, moneda)}</Celda>
                    <Celda align="right">
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <Boton variante="secundario" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setModal(c)}>Editar</Boton>
                        <Boton variante="peligro" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setModal({ comprobante: c, eliminar: true })}>✕</Boton>
                      </div>
                    </Celda>
                  </Fila>
                )}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px', fontSize: '15px', fontWeight: 700, color: AZUL }}>
              Total {moneda}: {fmt(total, moneda)}
            </div>
          </div>
        );
      })}

      {rendicion.comprobantes.length === 0 && (
        <p style={{ color: '#999', fontSize: '14px', textAlign: 'center', padding: '40px' }}>
          Esta rendición no tiene comprobantes todavía. Agregá el primero.
        </p>
      )}

      {modal === 'crear' && (
        <Modal titulo="Agregar comprobante" onCerrar={cerrarModal} ancho={560}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormComprobante rendicionId={id} onGuardar={handleGuardar} onCancelar={cerrarModal} guardando={guardando} />
        </Modal>
      )}

      {modal && modal !== 'crear' && !modal.eliminar && (
        <Modal titulo="Editar comprobante" onCerrar={cerrarModal} ancho={560}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormComprobante inicial={modal} rendicionId={id} onGuardar={handleGuardar} onCancelar={cerrarModal} guardando={guardando} />
        </Modal>
      )}

      {modal?.eliminar && (
        <Modal titulo="Eliminar comprobante" onCerrar={cerrarModal} ancho={420}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <p style={{ fontSize: '14px', marginBottom: '24px' }}>
            ¿Eliminar <strong>{modal.comprobante.descripcion}</strong>?
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
