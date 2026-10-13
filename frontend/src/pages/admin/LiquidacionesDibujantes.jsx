import { useState, useEffect, useCallback, Fragment } from 'react';
import { get, put } from '../../lib/api';
import { Boton, Modal, AlertaError, Input, Campo } from '../../components/ui';

const AZUL = '#1a2744';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmt = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtF = (f) => { if (!f) return '—'; const [a, m, d] = String(f).slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
const cent = (n) => Math.round(Number(n || 0) * 100);

// Mismo reparto que el servidor, para la vista previa
function vistaPrevia(liq, tarifa, monotributo) {
  const horas = liq.horas_totales;
  const montoTotal = Math.round((Math.round(horas * tarifa * 100) / 100 + Number(monotributo || 0)) * 100) / 100;
  return { montoTotal };
}

function ModalCorregir({ liq, onCerrar, onGuardado }) {
  const [tarifa, setTarifa] = useState(String(liq.tarifa));
  const [monotributo, setMonotributo] = useState(String(liq.monotributo));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const t = Number(tarifa), m = Number(monotributo || 0);
  const { montoTotal } = vistaPrevia(liq, t, m);
  const difBanco = liq.pago ? (cent(montoTotal) - cent(liq.pago.importe)) / 100 : null;

  const guardar = async () => {
    setGuardando(true); setError('');
    try { await put(`/liquidaciones/${liq.id}`, { tarifa: t, monotributo: m }); onGuardado(); }
    catch (err) { setError(err.message); setGuardando(false); }
  };

  const opcion = (label, valor, detalle) => (
    <button type="button" onClick={() => setTarifa(String(Math.round(valor * 100) / 100))} style={{
      textAlign: 'left', padding: '8px 10px', border: `1px solid ${cent(t) === cent(valor) ? AZUL : '#d0d0d0'}`,
      background: cent(t) === cent(valor) ? '#eef2ff' : '#fff', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px',
    }}>
      <strong>{label}: {fmt(valor)}/h</strong>
      {detalle && <span style={{ display: 'block', color: '#666' }}>{detalle}</span>}
    </button>
  );

  return (
    <Modal titulo={`Corregir liquidación — ${liq.dibujante}, ${MESES[liq.mes - 1]} ${liq.anio}`} onCerrar={onCerrar} ancho={620}>
      <AlertaError mensaje={error} onCerrar={() => setError('')} />
      <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#666' }}>
        {liq.horas_totales.toFixed(1)} h liquidadas el {fmtF(liq.fecha_liquidacion)} a {fmt(liq.tarifa)}/h
        {liq.tarifa_deducida && ' (tarifa deducida: esta liquidación no la tenía guardada)'}.
      </p>

      <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 500 }}>Tarifas de referencia</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
        {opcion('Vigente al cierre del período', liq.tarifa_vigente_cierre, `al ${fmtF(`${liq.anio}-${String(liq.mes).padStart(2, '0')}-${new Date(liq.anio, liq.mes, 0).getDate()}`)}`)}
        {liq.tarifa_dia_por_dia && cent(liq.tarifa_dia_por_dia) !== cent(liq.tarifa_vigente_cierre)
          && opcion('Día por día (promedio)', liq.tarifa_dia_por_dia, `cada carga a la tarifa de su fecha: ${fmt(liq.monto_dia_por_dia)}`)}
        {cent(liq.tarifa) !== cent(liq.tarifa_vigente_cierre) && opcion('La usada al liquidar', liq.tarifa)}
      </div>
      {liq.cambios_en_periodo.length > 0 && (
        <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#7a4b00' }}>
          Cambios de tarifa dentro del período: {liq.cambios_en_periodo.map(c => `${fmtF(c.fecha)} ${fmt(c.de)} → ${fmt(c.a)}`).join(' · ')}
        </p>
      )}
      {liq.cambios_antes_de_liquidar.length > 0 && (
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#7a4b00' }}>
          La tarifa cambió después del período y antes de liquidar: {liq.cambios_antes_de_liquidar.map(c => `${fmtF(c.fecha)} ${fmt(c.de)} → ${fmt(c.a)}`).join(' · ')}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '10px' }}>
        <Campo label="Tarifa por hora"><Input type="number" min="0" step="0.01" value={tarifa} onChange={e => setTarifa(e.target.value)} /></Campo>
        <Campo label="Monotributo"><Input type="number" min="0" step="0.01" value={monotributo} onChange={e => setMonotributo(e.target.value)} /></Campo>
      </div>

      <div style={{ background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total actual</span><span>{fmt(liq.monto_total)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '15px', margin: '4px 0' }}>
          <span>Total corregido</span><span style={{ color: AZUL }}>{fmt(montoTotal)}</span>
        </div>
        {liq.pago && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: difBanco === 0 ? '#1b5e20' : '#b26a00' }}>
            <span>Transferencia del {fmtF(liq.pago.fecha)}: {fmt(liq.pago.importe)}</span>
            <span>{difBanco === 0 ? '✓ coincide' : `diferencia ${fmt(difBanco)}`}</span>
          </div>
        )}
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#666' }}>
          Al guardar se recalculan los egresos de cada proyecto (con su parte del monotributo) y el reparto entre socios.
          El vínculo con la transferencia del banco se mantiene.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={guardar} disabled={guardando || !(t > 0) || m < 0}>{guardando ? 'Guardando…' : 'Guardar corrección'}</Boton>
      </div>
    </Modal>
  );
}

export default function LiquidacionesDibujantes({ filtros }) {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [editando, setEditando] = useState(null);
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const p = new URLSearchParams();
      if (filtros.dibujante_id) p.set('dibujante_id', filtros.dibujante_id);
      if (filtros.desde) p.set('desde', filtros.desde);
      if (filtros.hasta) p.set('hasta', filtros.hasta);
      setLista(await get(`/liquidaciones?${p}`));
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, [filtros.dibujante_id, filtros.desde, filtros.hasta]);
  useEffect(() => { cargar(); }, [cargar]);

  const visibles = soloAlertas ? lista.filter(l => l.alertas.length) : lista;
  const conAlertas = lista.filter(l => l.alertas.length).length;
  const total = visibles.reduce((s, l) => s + l.monto_total, 0);
  const alternar = (id) => setAbiertas(a => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const th = { textAlign: 'left', padding: '10px 14px', fontSize: '12px', color: '#666', borderBottom: '1px solid #e0e0e0', fontWeight: 500, whiteSpace: 'nowrap' };
  const td = { padding: '10px 14px', borderBottom: '1px solid #eee', fontSize: '13px', verticalAlign: 'top' };

  if (cargando) return <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>;

  return (
    <div>
      <AlertaError mensaje={error} onCerrar={() => setError('')} />
      {aviso && (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#1b5e20', display: 'flex', justifyContent: 'space-between' }}>
          <span>{aviso}</span>
          <button onClick={() => setAviso('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1b5e20' }}>✕</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: '#666' }}>
          {visibles.length} liquidaci{visibles.length === 1 ? 'ón' : 'ones'} · total {fmt(total)}
        </span>
        {conAlertas > 0 && (
          <label style={{ fontSize: '13px', color: '#b26a00', display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={soloAlertas} onChange={e => setSoloAlertas(e.target.checked)} />
            Ver solo las {conAlertas} con inconsistencias
          </label>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Período', 'Dibujante', 'Horas', 'Tarifa', 'Monotributo', 'Total', 'Liquidada', 'Transferencia', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#999', fontSize: '14px' }}>No hay liquidaciones para los filtros elegidos.</td></tr>
            )}
            {visibles.map(l => {
              const abierta = abiertas.has(l.id);
              const difTarifa = cent(l.tarifa) !== cent(l.tarifa_vigente_cierre);
              return (
                <Fragment key={l.id}>
                  <tr style={{ background: l.alertas.length ? '#fffaf0' : 'transparent' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => alternar(l.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', color: AZUL, fontWeight: 600 }}>
                        {abierta ? '▾' : '▸'} {MESES[l.mes - 1]} {l.anio}
                      </button>
                    </td>
                    <td style={{ ...td, fontWeight: 500 }}>{l.dibujante}</td>
                    <td style={td}>{l.horas_totales.toFixed(1)} h</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {fmt(l.tarifa)}/h
                      {difTarifa && <span style={{ display: 'block', fontSize: '11px', color: '#b26a00' }}>vigente: {fmt(l.tarifa_vigente_cierre)}</span>}
                      {l.tarifa_deducida && <span style={{ display: 'block', fontSize: '11px', color: '#999' }}>deducida</span>}
                    </td>
                    <td style={td}>{l.monotributo ? fmt(l.monotributo) : '—'}</td>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(l.monto_total)}</td>
                    <td style={{ ...td, color: '#666', whiteSpace: 'nowrap' }}>{fmtF(l.fecha_liquidacion)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {l.pago ? (
                        <>
                          {fmt(l.pago.importe)}
                          <span style={{ display: 'block', fontSize: '11px', color: cent(l.pago.importe) === cent(l.monto_total) ? '#1b5e20' : '#b26a00' }}>
                            {fmtF(l.pago.fecha)} · {cent(l.pago.importe) === cent(l.monto_total) ? '✓ coincide' : `dif. ${fmt(l.monto_total - l.pago.importe)}`}
                          </span>
                        </>
                      ) : <span style={{ color: '#999' }}>sin vincular</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <Boton variante="secundario" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setEditando(l)}>Corregir</Boton>
                    </td>
                  </tr>
                  {l.alertas.length > 0 && (
                    <tr style={{ background: '#fffaf0' }}>
                      <td colSpan={9} style={{ ...td, paddingTop: 0, color: '#b26a00', fontSize: '12px' }}>⚠ {l.alertas.map(a => a.texto).join(' · ')}</td>
                    </tr>
                  )}
                  {abierta && (
                    <tr>
                      <td colSpan={9} style={{ ...td, background: '#fafbff' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2fr', gap: '20px' }}>
                          <div>
                            <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Por proyecto</p>
                            {l.por_proyecto.map(p => (
                              <div key={p.proyecto} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}>
                                <span>{p.proyecto}</span><span>{p.horas.toFixed(1)} h</span>
                              </div>
                            ))}
                            {l.suma_egresos !== null && (
                              <p style={{ margin: '8px 0 0', fontSize: '12px', color: cent(l.suma_egresos) === cent(l.monto_total) ? '#666' : '#b26a00' }}>
                                Egresos registrados: {fmt(l.suma_egresos)}
                              </p>
                            )}
                          </div>
                          <div>
                            <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Horas ({l.horas.length} cargas)</p>
                            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                              {l.horas.map((h, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 50px', gap: '10px', fontSize: '12px', padding: '2px 0', borderBottom: '1px solid #f0f0f0' }}>
                                  <span style={{ color: '#666' }}>{fmtF(h.fecha)}</span>
                                  <span>{h.proyecto}{h.descripcion_tarea ? ` · ${h.descripcion_tarea}` : ''}</span>
                                  <span style={{ textAlign: 'right' }}>{Number(h.horas).toFixed(1)} h</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {editando && (
        <ModalCorregir liq={editando} onCerrar={() => setEditando(null)}
          onGuardado={async () => {
            const l = editando;
            setEditando(null);
            setAviso(`Liquidación de ${l.dibujante} (${MESES[l.mes - 1]} ${l.anio}) corregida.`);
            await cargar();
          }} />
      )}
    </div>
  );
}
