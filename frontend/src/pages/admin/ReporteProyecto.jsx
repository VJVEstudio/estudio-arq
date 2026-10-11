import { useState, useEffect, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { get, getAccessToken } from '../../lib/api';
import { AlertaError, Boton, Select } from '../../components/ui';

const AZUL = '#1a2744';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const fmt = (n, moneda) =>
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
const colorResultado = (n) => Number(n) >= 0 ? '#1b5e20' : '#b71c1c';

function BloqueResultado({ label, totales, costoHoras }) {
  const resultado = totales.resultado - (label === 'ARS' ? costoHoras : 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '14px', overflow: 'hidden', flex: '1 1 280px' }}>
      <div style={{ background: AZUL, padding: '12px 18px' }}>
        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resultado en {label}</p>
      </div>
      <div style={{ padding: '18px' }}>
        {[
          { label: 'Ingresos',         valor: totales.ingresos,  color: '#1b5e20' },
          { label: 'Egresos directos', valor: -totales.egresos,  color: '#b71c1c' },
          ...(label === 'ARS' ? [{ label: 'Costo dibujantes', valor: -costoHoras, color: '#e65100' }] : []),
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
            <span style={{ color: '#666' }}>{f.label}</span>
            <span style={{ fontWeight: 500, color: f.color }}>{f.valor >= 0 ? '+' : ''}{fmt(f.valor, label)}</span>
          </div>
        ))}
        <div style={{ height: '1px', background: '#e0e0e0', margin: '12px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700 }}>
          <span>Resultado neto</span>
          <span style={{ color: colorResultado(resultado) }}>{resultado >= 0 ? '+' : ''}{fmt(resultado, label)}</span>
        </div>
      </div>
    </div>
  );
}

// Junta todas las horas de cada dibujante en una sola fila (período, horas y costo).
// Costo de cada hora: liquidada → tarifa de su liquidación; sin liquidar → tarifa
// actual (estimado). Mismo criterio que la tarjeta "Costo dibujantes".
// La fila se ubica en la fecha de la última carga de horas.
const costoHora = (h) => Number(h.costo_valuado ?? h.costo_actual ?? h.costo_total ?? 0);
export function agruparHorasPorDibujante(filas) {
  const grupos = new Map();
  const resultado = [];
  for (const f of filas) {
    if (f.tipo !== 'horas') { resultado.push(f); continue; }
    let g = grupos.get(f.dibujante_nombre);
    if (!g) {
      g = { tipo: 'horas_grupo', dibujante_nombre: f.dibujante_nombre, items: [], horas: 0, costo: 0, horasPendientes: 0 };
      grupos.set(f.dibujante_nombre, g);
    }
    g.items.push(f);
    g.horas += Number(f.horas || 0);
    g.costo += costoHora(f);
    if (f.liquidada === false) g.horasPendientes += Number(f.horas || 0);
  }
  for (const g of grupos.values()) {
    g.items.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    g.desde = g.items[0].fecha;
    g.fecha = g.items[g.items.length - 1].fecha;
    resultado.push(g);
  }
  return resultado.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

function TablaMovimientos({ filas, monedaFiltro }) {
  const [abiertos, setAbiertos] = useState(() => new Set());
  const filtradas = monedaFiltro ? filas.filter(f => f.moneda === monedaFiltro || f.tipo === 'horas_grupo') : filas;
  const iconoTipo = { ingreso: '↑', egreso: '↓', horas: '⏱', horas_grupo: '⏱' };
  const colorTipo = { ingreso: '#1b5e20', egreso: '#b71c1c', horas: '#0d47a1', horas_grupo: '#0d47a1' };
  const alternar = (nombre) => setAbiertos(a => { const n = new Set(a); if (n.has(nombre)) n.delete(nombre); else n.add(nombre); return n; });
  const td = { padding: '10px 14px' };

  const filaSimple = (f, key, sub = false) => (
    <tr key={key} style={{ borderBottom: '1px solid #e0e0e0', background: sub ? '#fafbff' : 'transparent' }}>
      <td style={{ ...td, whiteSpace: 'nowrap', color: '#666', fontSize: '13px', paddingLeft: sub ? '34px' : '14px' }}>{fmtF(f.fecha)}</td>
      <td style={td}>
        {!sub && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: f.tipo === 'ingreso' ? '#e8f5e9' : f.tipo === 'egreso' ? '#fce4ec' : '#e3f2fd',
            color: colorTipo[f.tipo], borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: 500,
          }}>
            {iconoTipo[f.tipo]} {f.tipo === 'ingreso' ? 'Ingreso' : f.tipo === 'egreso' ? 'Egreso' : 'Horas'}
          </span>
        )}
      </td>
      <td style={td}>
        {!sub && (
          <p style={{ margin: 0, fontWeight: 500 }}>
            {f.tipo === 'ingreso' && (f.es_del_estudio ? '🏢 Estudio' : f.socio_nombre)}
            {f.tipo === 'egreso'  && `${f.destinatario_nombre} · ${f.categoria}`}
          </p>
        )}
        {(f.descripcion || f.descripcion_tarea) && (
          <p style={{ margin: sub ? 0 : '2px 0 0', fontSize: '12px', color: '#666' }}>{f.descripcion_tarea || f.descripcion}</p>
        )}
      </td>
      <td style={{ ...td, fontWeight: sub ? 400 : 600, color: colorTipo[f.tipo], whiteSpace: 'nowrap', fontSize: sub ? '13px' : '14px' }}>
        {f.tipo === 'ingreso' && `+ ${fmt(f.monto, f.moneda)}`}
        {f.tipo === 'egreso'  && `− ${fmt(f.monto, f.moneda)}`}
        {f.tipo === 'horas'   && `− ${fmt(costoHora(f), 'ARS')} (${Number(f.horas).toFixed(1)}h)`}
        {f.tipo === 'horas' && f.tarifa_valuada != null && (
          <span style={{ display: 'block', fontSize: '11px', fontWeight: 400, color: f.liquidada === false ? '#b26a00' : '#888' }}>
            {f.liquidada === false ? 'sin liquidar · tarifa actual ' : 'liquidada a '}{fmt(f.tarifa_valuada, 'ARS')}/h
          </span>
        )}
      </td>
      <td style={{ ...td, fontSize: '12px', color: '#999', fontFamily: 'monospace' }}>{f.comprobante || '—'}</td>
    </tr>
  );

  const filaGrupo = (g) => {
    const abierto = abiertos.has(g.dibujante_nombre);
    const mismoDia = fmtF(g.desde) === fmtF(g.fecha);
    return (
      <Fragment key={'g-' + g.dibujante_nombre}>
        <tr onClick={() => alternar(g.dibujante_nombre)} style={{ borderBottom: '1px solid #e0e0e0', cursor: 'pointer' }} title={abierto ? 'Ocultar el detalle por día' : 'Ver el detalle por día'}>
          <td style={{ ...td, whiteSpace: 'nowrap', color: '#666', fontSize: '13px' }}>
            {mismoDia ? fmtF(g.fecha) : `${fmtF(g.desde)} – ${fmtF(g.fecha)}`}
          </td>
          <td style={td}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#e3f2fd', color: colorTipo.horas, borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: 500 }}>⏱ Horas</span>
          </td>
          <td style={td}>
            <p style={{ margin: 0, fontWeight: 500 }}>
              <span style={{ color: AZUL, marginRight: '6px' }}>{abierto ? '▾' : '▸'}</span>{g.dibujante_nombre}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#666' }}>
              {g.items.length} carga{g.items.length !== 1 ? 's' : ''} de horas
              {g.horasPendientes > 0 && <span style={{ color: '#b26a00' }}> · {g.horasPendientes.toFixed(1)} h sin liquidar (tarifa actual)</span>}
            </p>
          </td>
          <td style={{ ...td, fontWeight: 600, color: colorTipo.horas, whiteSpace: 'nowrap' }}>
            − {fmt(g.costo, 'ARS')} ({g.horas.toFixed(1)}h)
          </td>
          <td style={{ ...td, fontSize: '12px', color: '#999' }}>—</td>
        </tr>
        {abierto && g.items.map((h, j) => filaSimple(h, `g-${g.dibujante_nombre}-${j}`, true))}
      </Fragment>
    );
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr>
            {['Fecha', 'Tipo', 'Detalle', 'Monto', 'Comprobante'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '12px', color: '#666', borderBottom: '1px solid #e0e0e0', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtradas.length === 0
            ? <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#999' }}>Sin movimientos</td></tr>
            : filtradas.map((f, i) => (f.tipo === 'horas_grupo' ? filaGrupo(f) : filaSimple(f, i)))
          }
        </tbody>
      </table>
    </div>
  );
}

export default function ReporteProyecto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reporte,      setReporte]      = useState(null);
  const [cargando,     setCargando]     = useState(true);
  const [error,        setError]        = useState(null);
  const [monedaFiltro, setMonedaFiltro] = useState('');

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      try { setReporte(await get(`/reportes/proyecto/${id}`)); }
      catch (err) { setError(err.message); }
      finally { setCargando(false); }
    };
    cargar();
  }, [id]);

  if (cargando) return <div style={{ padding: '32px', fontSize: '14px', color: '#666' }}>Generando reporte…</div>;
  if (error)    return <div style={{ padding: '32px' }}><AlertaError mensaje={error} /></div>;
  if (!reporte) return null;

  const { proyecto, totales, horas_resumen, timeline, resultado_total_convertido: resultadoTotal, cotizacion_oficial: cotizacion } = reporte;
  const estadoColor = { activo: '#1b5e20', pausado: '#e65100', finalizado: '#311b92' };
  const lineaDeTiempo = agruparHorasPorDibujante(timeline);

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <div style={{ marginBottom: '28px' }}>
        <Boton variante="texto" onClick={() => navigate(-1)} style={{ marginBottom: '12px', color: '#666', fontSize: '13px' }}>← Volver</Boton>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 500 }}>{proyecto.nombre}</h1>
            <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#666' }}>
              {proyecto.cliente_nombre}
              {proyecto.cuit && ` · CUIT ${proyecto.cuit}`}
              {' · '}
              <span style={{ color: estadoColor[proyecto.estado], fontWeight: 500 }}>
                {proyecto.estado.charAt(0).toUpperCase() + proyecto.estado.slice(1)}
              </span>
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#999' }}>
              Inicio: {fmtF(proyecto.fecha_inicio)}
              {proyecto.fecha_cierre_estimada && ` · Cierre estimado: ${fmtF(proyecto.fecha_cierre_estimada)}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Boton variante="secundario" onClick={() => {
              const token = getAccessToken();
              window.open(`${BASE}/reportes/proyecto/${id}/csv?token=${token}`, '_blank');
            }}>⬇ CSV</Boton>
            <Boton variante="secundario" onClick={() => {
              const token = getAccessToken();
              window.open(`${BASE}/reportes/proyecto/${id}/pdf?token=${token}`, '_blank');
            }}>⬇ PDF</Boton>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '28px', flexWrap: 'wrap' }}>
        <BloqueResultado label="ARS" totales={totales.ARS} costoHoras={horas_resumen.costo_total} />
        <BloqueResultado label="USD" totales={totales.USD} costoHoras={0} />
        <div style={{ background: AZUL, borderRadius: '14px', padding: '18px', flex: '1 1 220px', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resultado total ($)</p>
          <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: Number(resultadoTotal) >= 0 ? '#a5d6a7' : '#ef9a9a' }}>
            {Number(resultadoTotal) >= 0 ? '+' : ''}{fmt(resultadoTotal, 'ARS')}
          </p>
          <p style={{ margin: '10px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>
            Pesos + dólares convertidos a la cotización del día de cada registro
            {cotizacion ? ` (sin cotización registrada: dólar oficial de hoy, $ ${Number(cotizacion).toLocaleString('es-AR')})` : ''}.
          </p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '14px', padding: '18px', flex: '0 0 auto', minWidth: '200px' }}>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RRHH — Dibujantes</p>
          <p style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: 700, color: AZUL }}>{Number(horas_resumen.total_horas).toFixed(1)} h</p>
          <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600, color: '#e65100' }}>{fmt(horas_resumen.costo_total, 'ARS')}</p>
          <p style={{ margin: '0 0 12px', fontSize: '11px', color: '#888', lineHeight: 1.4 }}>
            A la tarifa de cada liquidación
            {Number(horas_resumen.horas_pendientes) > 0 && <><br /><span style={{ color: '#b26a00' }}>Incluye {Number(horas_resumen.horas_pendientes).toFixed(1)} h sin liquidar a tarifa actual ({fmt(horas_resumen.costo_pendiente, 'ARS')})</span></>}
          </p>
          {Object.entries(horas_resumen.por_dibujante).map(([nombre, d]) => (
            <div key={nombre} style={{ fontSize: '13px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ color: '#666' }}>{nombre}</span>
              <span>{Number(d.horas).toFixed(1)}h</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e0e0e0' }}>
          <p style={{ margin: 0, fontWeight: 500 }}>
            Línea de tiempo ({lineaDeTiempo.length} renglones)
            <span style={{ fontWeight: 400, fontSize: '12px', color: '#999', marginLeft: '8px' }}>Horas agrupadas por dibujante · tocá un dibujante para ver el detalle por día</span>
          </p>
          <Select value={monedaFiltro} onChange={e => setMonedaFiltro(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Todas las monedas</option>
            <option value="ARS">$ ARS</option>
            <option value="USD">U$S USD</option>
          </Select>
        </div>
        <TablaMovimientos filas={lineaDeTiempo} monedaFiltro={monedaFiltro} />
      </div>
    </div>
  );
}
