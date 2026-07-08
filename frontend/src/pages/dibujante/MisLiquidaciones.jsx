import { useState, useEffect, useCallback } from 'react';
import { get } from '../../lib/api';
import { EncabezadoSeccion, AlertaError } from '../../components/ui';

const AZUL_DIBUJANTE = '#1a2744';

function formatearFecha(valorFecha) {
  if (!valorFecha) return '—';
  const soloFecha = String(valorFecha).slice(0, 10);
  const partes = soloFecha.split('-');
  if (partes.length !== 3) return '—';
  const [anio, mes, dia] = partes;
  return `${dia}/${mes}/${anio}`;
}

const fmt = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

export default function MisLiquidaciones() {
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setLiquidaciones(await get('/horas/mis-liquidaciones'));
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const totalLiquidado = liquidaciones.reduce((s, l) => s + Number(l.monto_total), 0);
  const totalHoras = liquidaciones.reduce((s, l) => s + Number(l.horas_totales), 0);

  return (
    <div style={{ padding: '32px', maxWidth: '800px' }}>
      <EncabezadoSeccion
        titulo="Mis liquidaciones"
        subtitulo={`${liquidaciones.length} liquidación${liquidaciones.length !== 1 ? 'es' : ''} registrada${liquidaciones.length !== 1 ? 's' : ''}`}
      />

      {/* Tarjetas resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        {[
          { label: 'Total liquidado', valor: fmt(totalLiquidado), color: AZUL_DIBUJANTE },
          { label: 'Horas liquidadas', valor: `${totalHoras.toFixed(1)} h`, color: '#1b5e20' },
          { label: 'Períodos', valor: liquidaciones.length, color: '#0d47a1' },
        ].map(t => (
          <div key={t.label} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '16px 20px' }}>
            <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</p>
            <p style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: t.color }}>{t.valor}</p>
          </div>
        ))}
      </div>

      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : error ? <AlertaError mensaje={error} />
      : liquidaciones.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
          <p style={{ color: '#999', fontSize: '14px', margin: 0 }}>Todavía no tenés liquidaciones registradas.</p>
          <p style={{ color: '#bbb', fontSize: '13px', margin: '8px 0 0' }}>Cuando el administrador liquide tus horas, aparecerán acá.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {liquidaciones.map(l => (
            <div key={l.id} style={{
              background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px',
              padding: '18px 22px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: '16px',
            }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '16px', color: AZUL_DIBUJANTE }}>
                  {formatearFecha(l.fecha_desde)} → {formatearFecha(l.fecha_hasta)}
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#666' }}>
                  {Number(l.horas_totales).toFixed(1)} horas × {fmt(l.tarifa_aplicada)}/h
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: AZUL_DIBUJANTE }}>
                  {fmt(l.monto_total)}
                </p>
                <span style={{
                  display: 'inline-block', marginTop: '6px',
                  padding: '3px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
                  background: l.estado === 'pagado' ? '#e8f5e9' : '#fff8e1',
                  color: l.estado === 'pagado' ? '#1b5e20' : '#f57f17',
                }}>
                  {l.estado === 'pagado' ? '✓ Pagado' : '⏳ Pendiente de pago'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
