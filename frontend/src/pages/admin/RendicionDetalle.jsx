import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRendicion } from '../../hooks/useRendiciones';
import { getAccessToken } from '../../lib/api';
import {
  Boton, Tabla, Fila, Celda,
  Modal, Campo, Input, Select, AlertaError,
} from '../../components/ui';

const AZUL = '#1a2744';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

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

function FormComprobante({ inicial = {}, onGuardar, onCancelar, guardando }) {
const [form, setForm] = useState({
    descripcion: inicial.descripcion || '',
    numero_comprobante: inicial.numero_comprobante || '',
    proveedor: inicial.proveedor || '',
    moneda: inicial.moneda || 'ARS',
    monto_neto: inicial.monto_neto ?? '',
    iva: inicial.iva ?? '',
    iibb: inicial.iibb ?? '',
  });
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const totalPreview = Number(form.monto_neto || 0) + Number(form.iva || 0) + Number(form.iibb || 0);

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
<Campo label="Descripción *" error={errores.descripcion}>
        <Input value={form.descripcion} onChange={set('descripcion')} placeholder="Ej: Cerramientos y Estructuras - Certificado Obra" autoFocus />
      </Campo>
      <Campo label="Proveedor">
        <Input value={form.proveedor} onChange={set('proveedor')} placeholder="Ej: Cerramientos y Estructuras SA" />
      </Campo>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
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

export default function RendicionDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rendicion, cargando, error, agregarComprobante, actualizarComprobante, eliminarComprobante, cargar } = useRendicion(id);
  const [modal, setModal] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');

  if (cargando) return <div style={{ padding: '32px', color: '#666', fontSize: '14px' }}>Cargando…</div>;
  if (error) return <div style={{ padding: '32px' }}><AlertaError mensaje={error} /></div>;
  if (!rendicion) return null;

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

  // Agrupar comprobantes por moneda
  const porMoneda = { ARS: [], USD: [] };
  rendicion.comprobantes.forEach(c => { porMoneda[c.moneda]?.push(c); });

  return (
    <div style={{ padding: '32px', maxWidth: '1000px' }}>
      <Boton variante="texto" onClick={() => navigate('/admin/rendiciones')} style={{ marginBottom: '12px', color: '#666', fontSize: '13px' }}>← Volver</Boton>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 500 }}>{rendicion.tipo}{rendicion.numero}</h1>
          <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#666' }}>
            {rendicion.cliente_nombre} — {rendicion.proyecto_nombre}
          </p>
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
          <FormComprobante onGuardar={handleGuardar} onCancelar={cerrarModal} guardando={guardando} />
        </Modal>
      )}

      {modal && modal !== 'crear' && !modal.eliminar && (
        <Modal titulo="Editar comprobante" onCerrar={cerrarModal} ancho={560}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormComprobante inicial={modal} onGuardar={handleGuardar} onCancelar={cerrarModal} guardando={guardando} />
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
            <Boton variante="peligro" onClick={handleEliminar}>Sí, eliminar</Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
