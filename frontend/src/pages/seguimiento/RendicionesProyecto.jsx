import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../../lib/api';
import { Modal, AlertaError } from '../../components/ui';
import { FormNuevaRendicion, BadgeEstado, fmt, fmtF } from '../admin/Rendiciones';
import { AZUL } from './comunes';

const caja = { background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10 };

// Orden numeral: agrupadas por tipo (RO, RH, …) y dentro de cada tipo por número.
export const ordenarRendiciones = (lista) => [...lista].sort((a, b) =>
  String(a.tipo).localeCompare(String(b.tipo), 'es') || Number(a.numero) - Number(b.numero));

// Pestaña "Rendiciones" dentro del seguimiento de un proyecto (solo administradores).
export default function RendicionesProyecto({ proyecto, rendiciones, cargando, error, onRecargar }) {
  const navigate = useNavigate();
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');

  const lista = ordenarRendiciones(rendiciones || []);
  const totARS = lista.reduce((s, r) => s + Number(r.total_ars || 0), 0);
  const totUSD = lista.reduce((s, r) => s + Number(r.total_usd || 0), 0);

  const siguienteNumero = async (proyecto_id, tipo) =>
    (await get(`/rendiciones/siguiente-numero/calcular?proyecto_id=${proyecto_id}&tipo=${encodeURIComponent(tipo)}`)).siguiente;

  const crear = async (datos) => {
    setGuardando(true); setErrorAccion('');
    try {
      const nueva = await post('/rendiciones', datos);
      onRecargar?.();
      navigate(`/admin/rendiciones/${nueva.id}`);
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const th = { textAlign: 'left', fontWeight: 500, fontSize: 11, color: '#6b6b6b', textTransform: 'uppercase', padding: '6px 10px', borderBottom: '1px solid #ececec', whiteSpace: 'nowrap' };
  const td = { padding: '6px 10px', fontSize: 13, borderBottom: '1px solid #f1f1f1', whiteSpace: 'nowrap' };

  return (
    <div style={{ ...caja, padding: '10px 12px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#595959' }}>
          {lista.length === 1 ? '1 rendición' : `${lista.length} rendiciones`}
          {totARS !== 0 && <> · Total <strong style={{ color: '#1a1a1a' }}>{fmt(totARS, 'ARS')}</strong></>}
          {totUSD !== 0 && <> · <strong style={{ color: '#1a1a1a' }}>{fmt(totUSD, 'USD')}</strong></>}
        </p>
        <button type="button" onClick={() => { setErrorAccion(''); setCreando(true); }} style={{
          font: 'inherit', fontSize: 13, fontWeight: 500, padding: '6px 12px', border: 'none', borderRadius: 8, background: AZUL, color: '#fff', cursor: 'pointer',
        }}>+ Nueva rendición</button>
      </div>

      {cargando ? <p style={{ color: '#666', fontSize: 13, margin: '6px 0' }}>Cargando…</p>
        : error ? <AlertaError mensaje={error} />
        : !lista.length ? <p style={{ color: '#595959', fontSize: 13, margin: '6px 0' }}>Este proyecto todavía no tiene rendiciones.</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Rendición</th><th style={th}>Fecha</th><th style={{ ...th, textAlign: 'center' }}>Comprob.</th>
                  <th style={{ ...th, textAlign: 'right' }}>Total ARS</th><th style={{ ...th, textAlign: 'right' }}>Total USD</th>
                  <th style={th}>Estado</th><th style={{ ...th, width: '100%' }}>Notas</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(r => (
                  <tr key={r.id} onClick={() => navigate(`/admin/rendiciones/${r.id}`)} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f7f8fa'; }} onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
                    <td style={td}>
                      <span style={{ fontWeight: 600, color: AZUL }}>{r.tipo}{r.numero}</span>
                      {r.es_honorarios && <span style={{ marginLeft: 6, fontSize: 11, background: '#e3f2fd', color: '#0d47a1', borderRadius: 10, padding: '1px 6px' }}>Honorarios</span>}
                    </td>
                    <td style={{ ...td, color: '#595959' }}>{fmtF(r.fecha)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{r.cantidad_comprobantes}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>{Number(r.total_ars) !== 0 ? fmt(r.total_ars, 'ARS') : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 500 }}>{Number(r.total_usd) !== 0 ? fmt(r.total_usd, 'USD') : '—'}</td>
                    <td style={td}><BadgeEstado estado={r.estado} /></td>
                    <td style={{ ...td, color: '#595959', whiteSpace: 'normal', fontSize: 12 }}>{r.notas || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {creando && (
        <Modal titulo="Nueva rendición" onCerrar={() => setCreando(false)} ancho={520}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormNuevaRendicion proyectoFijo={proyecto} onGuardar={crear} onCancelar={() => setCreando(false)}
            guardando={guardando} obtenerSiguienteNumero={siguienteNumero} />
        </Modal>
      )}
    </div>
  );
}
