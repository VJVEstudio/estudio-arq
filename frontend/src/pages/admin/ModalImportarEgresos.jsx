import { useState } from 'react';
import { post, enviarForm } from '../../lib/api';
import { Modal, Boton, AlertaError } from '../../components/ui';

const CAT_LABEL = {
  servicios: 'Servicios', impuestos: 'Impuestos', generales: 'Gastos generales',
  dibujantes: 'Dibujantes', viaticos: 'Viáticos',
};
const fmt = (monto, moneda) =>
  `${moneda === 'USD' ? 'U$S' : '$'} ${Number(monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtF = (f) => {
  if (!f) return '—';
  const [a, m, d] = String(f).split('T')[0].split('-');
  return `${d}/${m}/${a}`;
};

// Importa egresos desde una planilla: elegir archivo → vista previa → confirmar
export default function ModalImportarEgresos({ onCerrar, onImportado }) {
  const [vista, setVista] = useState(null);       // { filas, totales }
  const [incluir, setIncluir] = useState(new Set());
  const [abierta, setAbierta] = useState(null);   // fila con la descripción desplegada
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);

  const leer = async (archivo) => {
    if (!archivo) return;
    setError(''); setCargando(true); setVista(null);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const v = await enviarForm('/egresos/importar/vista-previa', fd);
      setVista(v);
      // Por defecto se importan las filas sin errores y sin posibles duplicados
      setIncluir(new Set(v.filas.filter(f => !f.errores.length && !f.posibles_duplicados.length).map(f => f.fila)));
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  };

  const alternar = (n) => setIncluir(prev => {
    const s = new Set(prev);
    s.has(n) ? s.delete(n) : s.add(n);
    return s;
  });

  const elegidas = vista ? vista.filas.filter(f => incluir.has(f.fila)) : [];
  const totales = elegidas.reduce((t, f) => ({ ...t, [f.moneda]: (t[f.moneda] || 0) + f.monto }), { ARS: 0, USD: 0 });
  const conError = vista ? vista.filas.filter(f => f.errores.length).length : 0;
  const nuevosDest = [...new Set(elegidas.filter(f => f.destinatario_nuevo).map(f => f.destinatario_nombre))];

  const confirmar = async () => {
    setError(''); setCargando(true);
    try {
      const r = await post('/egresos/importar', { filas: elegidas.map(f => f.cruda) });
      setResultado(r);
      onImportado?.();
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  };

  const th = { textAlign: 'left', padding: '6px 8px', fontSize: '11px', color: '#666', textTransform: 'uppercase', borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap' };
  const td = { padding: '6px 8px', fontSize: '13px', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' };

  return (
    <Modal titulo="Importar egresos desde planilla" onCerrar={onCerrar} ancho={vista && !resultado ? 1050 : 560}>
      <AlertaError mensaje={error} onCerrar={() => setError('')} />

      {resultado ? (
        <div>
          <p style={{ fontSize: '15px', margin: '0 0 8px' }}>✓ Se cargaron <strong>{resultado.creados}</strong> egresos.</p>
          {resultado.destinatarios_nuevos > 0 && (
            <p style={{ fontSize: '13px', color: '#666', margin: '0 0 16px' }}>Se crearon {resultado.destinatarios_nuevos} destinatario(s) nuevo(s).</p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Boton onClick={onCerrar}>Listo</Boton></div>
        </div>
      ) : !vista ? (
        <div>
          <p style={{ fontSize: '13px', color: '#555', margin: '0 0 12px' }}>
            La planilla (.xlsx) tiene que tener estas columnas, con los títulos en una fila:
          </p>
          <p style={{ fontSize: '13px', margin: '0 0 6px', fontFamily: 'monospace', background: '#f5f5f5', padding: '8px 10px', borderRadius: '6px' }}>
            Fecha · Proyecto · Categoría · Destinatario · Monto · Moneda · Descripción · Pagó
          </p>
          <ul style={{ fontSize: '12px', color: '#666', margin: '0 0 16px', paddingLeft: '18px' }}>
            <li>Proyecto vacío = sin proyecto. Moneda: ARS o USD.</li>
            <li>Pagó: «Estudio» o el nombre del socio que lo pagó de su bolsillo.</li>
            <li>Si el destinatario no existe, se crea. Antes de cargar vas a ver una vista previa.</li>
          </ul>
          <label style={{ display: 'inline-block', padding: '10px 18px', background: '#1a2744', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
            {cargando ? 'Leyendo…' : 'Elegir planilla'}
            <input type="file" accept=".xlsx" style={{ display: 'none' }} disabled={cargando}
              onChange={e => leer(e.target.files?.[0])} />
          </label>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px', fontSize: '13px' }}>
            <span><strong>{elegidas.length}</strong> de {vista.filas.length} filas a cargar</span>
            {totales.ARS > 0 && <span style={{ color: '#b71c1c', fontWeight: 600 }}>{fmt(totales.ARS, 'ARS')}</span>}
            {totales.USD > 0 && <span style={{ color: '#880e4f', fontWeight: 600 }}>{fmt(totales.USD, 'USD')}</span>}
            {conError > 0 && <span style={{ color: '#b71c1c' }}>⚠ {conError} con errores (no se cargan)</span>}
          </div>

          <div style={{ maxHeight: '55vh', overflow: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#fafafa' }}>
                <tr>
                  <th style={th}></th><th style={th}>Fecha</th><th style={th}>Proyecto</th><th style={th}>Categoría</th>
                  <th style={th}>Destinatario</th><th style={th}>Pagó</th><th style={{ ...th, textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {vista.filas.map(f => {
                  const ok = !f.errores.length;
                  const dup = f.posibles_duplicados.length > 0;
                  return (
                    <tr key={f.fila} style={{ background: !ok ? '#fff5f5' : dup ? '#fffbea' : undefined, opacity: ok && !incluir.has(f.fila) ? 0.55 : 1 }}>
                      <td style={td}>
                        <input type="checkbox" disabled={!ok} checked={incluir.has(f.fila)} onChange={() => alternar(f.fila)} />
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtF(f.fecha)}</td>
                      <td style={td}>{f.proyecto_nombre || <span style={{ color: '#999' }}>Sin proyecto</span>}</td>
                      <td style={td}>{CAT_LABEL[f.categoria] || '—'}</td>
                      <td style={td}>
                        {f.destinatario_nombre}
                        {f.destinatario_nuevo && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#0d47a1' }}>(nuevo)</span>}
                        {f.descripcion && (
                          <div>
                            <button onClick={() => setAbierta(abierta === f.fila ? null : f.fila)}
                              style={{ border: 'none', background: 'none', padding: 0, color: '#1565c0', fontSize: '12px', cursor: 'pointer' }}>
                              {abierta === f.fila ? 'Ocultar detalle' : 'Ver detalle'}
                            </button>
                            {abierta === f.fila && (
                              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '12px', color: '#444', margin: '4px 0 0' }}>{f.descripcion}</pre>
                            )}
                          </div>
                        )}
                        {f.errores.map(e => <div key={e} style={{ color: '#b71c1c', fontSize: '12px' }}>⚠ {e}</div>)}
                        {dup && (
                          <div style={{ color: '#8a6d00', fontSize: '12px' }}>
                            ¿Ya cargado? Hay un egreso igual: {f.posibles_duplicados.map(d => `${fmtF(d.fecha)} ${d.destinatario}`).join('; ')}
                          </div>
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{f.pagado_por_estudio ? 'Estudio' : f.socio_nombre}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 500 }}>{f.monto ? fmt(f.monto, f.moneda) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {nuevosDest.length > 0 && (
            <p style={{ fontSize: '12px', color: '#666', margin: '10px 0 0' }}>Destinatarios nuevos que se van a crear: {nuevosDest.join(', ')}</p>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <Boton variante="secundario" onClick={() => setVista(null)} disabled={cargando}>Elegir otra planilla</Boton>
            <Boton onClick={confirmar} disabled={cargando || !elegidas.length}>
              {cargando ? 'Cargando…' : `Cargar ${elegidas.length} egreso${elegidas.length !== 1 ? 's' : ''}`}
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
