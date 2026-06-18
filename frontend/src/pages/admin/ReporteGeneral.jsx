import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../../lib/api';
import { AlertaError, Boton, Input } from '../../components/ui';

const AZUL = '#1a2744';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const fmt = (n, moneda = 'ARS') =>
  moneda === 'USD'
    ? `U$S ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtH = (h) => `${Number(h || 0).toFixed(1)} h`;

const CAT_LABELS = { servicios: 'Servicios', impuestos: 'Impuestos', generales: 'Gastos generales', dibujantes: 'Dibujantes' };
const CAT_COLOR  = { servicios: '#0d47a1', impuestos: '#f57f17', generales: '#4a148c', dibujantes: '#1b5e20' };

function BarraHorizontal({ valor, maximo, color }) {
  const pct = maximo > 0 ? Math.max(0, Math.min(100, (valor / maximo) * 100)) : 0;
  return (
    <div style={{ background: '#e0e0e0', borderRadius: '4px', height: '6px', marginTop: '4px' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: '4px', background: color, transition: 'width 0.4s' }} />
    </div>
  );
}

function TarjetasTotales({ ingresos, egresos }) {
  const tot = { ARS: { ing: 0, egr: 0 }, USD: { ing: 0, egr: 0 } };
  ingresos.forEach(r => { tot[r.moneda].ing += Number(r.total); });
  egresos.forEach(r =>  { tot[r.moneda].egr += Number(r.total); });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '28px' }}>
      {[
        { label: 'Ingresos ARS',  valor: fmt(tot.ARS.ing, 'ARS'), color: '#1b5e20' },
        { label: 'Egresos ARS',   valor: fmt(tot.ARS.egr, 'ARS'), color: '#b71c1c' },
        { label: 'Resultado ARS', valor: fmt(tot.ARS.ing - tot.ARS.egr, 'ARS'), color: tot.ARS.ing - tot.ARS.egr >= 0 ? '#1b5e20' : '#b71c1c' },
        { label: 'Ingresos USD',  valor: fmt(tot.USD.ing, 'USD'), color: '#0d47a1' },
        { label: 'Egresos USD',   valor: fmt(tot.USD.egr, 'USD'), color: '#880e4f' },
        { label: 'Resultado USD', valor: fmt(tot.USD.ing - tot.USD.egr, 'USD'), color: tot.USD.ing - tot.USD.egr >= 0 ? '#0d47a1' : '#880e4f' },
      ].map(t => (
        <div key={t.label} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '16px 18px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</p>
          <p style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: t.color }}>{t.valor}</p>
        </div>
      ))}
    </div>
  );
}

function EgresosPorCategoria({ egresos }) {
  const porCat = {};
  egresos.forEach(r => {
    if (!porCat[r.categoria]) porCat[r.categoria] = { ARS: 0, USD: 0 };
    porCat[r.categoria][r.moneda] += Number(r.total);
  });
  const maxARS = Math.max(...Object.values(porCat).map(c => c.ARS), 1);
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' }}>
      <p style={{ margin: '0 0 16px', fontWeight: 500 }}>Egresos por categoría</p>
      {Object.entries(porCat).map(([cat, montos]) => (
        <div key={cat} style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ fontWeight: 500, color: CAT_COLOR[cat] || '#333' }}>{CAT_LABELS[cat] || cat}</span>
            <div>
              {montos.ARS > 0 && <span style={{ marginLeft: '16px' }}>{fmt(montos.ARS, 'ARS')}</span>}
              {montos.USD > 0 && <span style={{ marginLeft: '16px', color: '#0d47a1' }}>{fmt(montos.USD, 'USD')}</span>}
            </div>
          </div>
          <BarraHorizontal valor={montos.ARS} maximo={maxARS} color={CAT_COLOR[cat] || '#999'} />
        </div>
      ))}
    </div>
  );
}

function TablaPorProyecto({ proyectos, onVerReporte }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
      <p style={{ margin: 0, fontWeight: 500, padding: '16px 20px', borderBottom: '1px solid #e0e0e0' }}>Resultado por proyecto</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr>
              {['Proyecto', 'Cliente', 'Estado', 'Ingresos ARS', 'Egresos ARS', 'Resultado ARS', 'Ingresos USD', 'Egresos USD', 'Resultado USD', 'Horas', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '12px', color: '#666', borderBottom: '1px solid #e0e0e0', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proyectos.length === 0
              ? <tr><td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: '#999' }}>Sin proyectos en este período</td></tr>
              : proyectos.map(p => {
                const resultadoArs = Number(p.ingresos_ars) - Number(p.egresos_ars) - Number(p.costo_horas);
                const resultadoUsd = Number(p.ingresos_usd) - Number(p.egresos_usd);
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500, whiteSpace: 'nowrap' }}>{p.proyecto}</td>
                    <td style={{ padding: '10px 14px', color: '#666', fontSize: '13px', whiteSpace: 'nowrap' }}>{p.cliente}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        background: p.estado === 'activo' ? '#e8f5e9' : p.estado === 'pausado' ? '#fff8e1' : '#ede7f6',
                        color: p.estado === 'activo' ? '#1b5e20' : p.estado === 'pausado' ? '#f57f17' : '#311b92',
                        borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap',
                      }}>
                        {p.estado}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#1b5e20', whiteSpace: 'nowrap' }}>{fmt(p.ingresos_ars)}</td>
                    <td style={{ padding: '10px 14px', color: '#b71c1c', whiteSpace: 'nowrap' }}>{fmt(p.egresos_ars)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: resultadoArs >= 0 ? '#1b5e20' : '#b71c1c', whiteSpace: 'nowrap' }}>
                      {resultadoArs >= 0 ? '+' : ''}{fmt(resultadoArs)}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#0d47a1', whiteSpace: 'nowrap' }}>{fmt(p.ingresos_usd, 'USD')}</td>
                    <td style={{ padding: '10px 14px', color: '#880e4f', whiteSpace: 'nowrap' }}>{fmt(p.egresos_usd, 'USD')}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: resultadoUsd >= 0 ? '#0d47a1' : '#880e4f', whiteSpace: 'nowrap' }}>
                      {resultadoUsd >= 0 ? '+' : ''}{fmt(resultadoUsd, 'USD')}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#666', whiteSpace: 'nowrap' }}>{fmtH(p.horas_totales)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <Boton variante="secundario" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => onVerReporte(p.id)}>Ver reporte</Boton>
                    </td>
                  </tr>
                );
              })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TablaDibujantes({ dibujantes }) {
  if (!dibujantes.length) return null;
  const maxHoras = Math.max(...dibujantes.map(d => Number(d.horas_totales)), 1);
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px 24px', marginBottom: '20px' }}>
      <p style={{ margin: '0 0 16px', fontWeight: 500 }}>Horas y costos por dibujante</p>
      {dibujantes.map(d => (
        <div key={d.dibujante} style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ fontWeight: 500 }}>{d.dibujante}</span>
            <div>
              <span style={{ color: '#666', marginRight: '16px' }}>{fmtH(d.horas_totales)}</span>
              <span style={{ fontWeight: 600, color: '#b71c1c' }}>{fmt(d.costo_total)}</span>
            </div>
          </div>
          <BarraHorizontal valor={Number(d.horas_totales)} maximo={maxHoras} color={AZUL} />
        </div>
      ))}
    </div>
  );
}

export default function ReporteGeneral() {
  const navigate  = useNavigate();
  const hoy       = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
  const hoyStr    = hoy.toISOString().split('T')[0];

  const [desde,    setDesde]    = useState(primerDia);
  const [hasta,    setHasta]    = useState(hoyStr);
  const [reporte,  setReporte]  = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      setReporte(await get(`/reportes/general?${params}`));
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const descargarCSV = () => {
    const params = new URLSearchParams();
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    window.open(`${BASE}/reportes/general/csv?${params}`, '_blank');
  };

  const setPeriodo = (meses) => {
    const fin   = new Date();
    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - meses + 1);
    inicio.setDate(1);
    setDesde(inicio.toISOString().split('T')[0]);
    setHasta(fin.toISOString().split('T')[0]);
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 500 }}>Reporte general</h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#666' }}>Visión financiera completa del estudio</p>
        </div>
        <Boton onClick={descargarCSV}>⬇ Exportar CSV</Boton>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', color: '#666' }}>Desde</label>
          <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', color: '#666' }}>Hasta</label>
          <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[{ label: 'Este mes', meses: 1 }, { label: '3 meses', meses: 3 }, { label: '6 meses', meses: 6 }, { label: 'Este año', meses: 12 }].map(p => (
            <button key={p.label} onClick={() => setPeriodo(p.meses)} style={{
              padding: '5px 12px', fontSize: '12px', borderRadius: '20px',
              border: '1px solid #d0d0d0', background: 'transparent',
              cursor: 'pointer', fontFamily: 'inherit', color: '#666',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {error && <AlertaError mensaje={error} />}
      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Generando reporte…</p>
      : reporte && (
        <>
          <TarjetasTotales ingresos={reporte.ingresos} egresos={reporte.egresos} />
          <EgresosPorCategoria egresos={reporte.egresos} />
          <TablaPorProyecto proyectos={reporte.por_proyecto} onVerReporte={(id) => navigate(`/admin/reportes/proyecto/${id}`)} />
          <TablaDibujantes dibujantes={reporte.por_dibujante} />
        </>
      )}
    </div>
  );
}
