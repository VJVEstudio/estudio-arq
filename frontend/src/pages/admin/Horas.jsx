import { useState, useEffect, useCallback } from 'react';
import { get } from '../../lib/api';
import {
  EncabezadoSeccion, Tabla, Fila, Celda,
  Select, Input, AlertaError, Boton,
} from '../../components/ui';

const fmt  = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtF = (f) => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-AR') : '—';
const AZUL = '#1a2744';

function TarjetasHoras({ resumen }) {
  const totHoras = resumen.reduce((s, r) => s + Number(r.horas_totales), 0);
  const totCosto = resumen.reduce((s, r) => s + Number(r.costo_total), 0);
  const dibujantesUnicos = [...new Set(resumen.map(r => r.dibujante_id))].length;
  const proyectosUnicos  = [...new Set(resumen.map(r => r.proyecto_id))].length;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
      {[
        { label: 'Horas totales', valor: `${totHoras.toFixed(1)} h`, color: AZUL },
        { label: 'Costo total',   valor: fmt(totCosto),              color: '#b71c1c' },
        { label: 'Dibujantes',    valor: dibujantesUnicos,           color: '#0d47a1' },
        { label: 'Proyectos',     valor: proyectosUnicos,            color: '#1b5e20' },
      ].map(t => (
        <div key={t.label} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '16px 20px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</p>
          <p style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: t.color }}>{t.valor}</p>
        </div>
      ))}
    </div>
  );
}

function TablaResumen({ resumen }) {
  if (!resumen.length) return null;
  const porDibujante = {};
  resumen.forEach(r => {
    if (!porDibujante[r.dibujante_id]) {
      porDibujante[r.dibujante_id] = { nombre: r.dibujante_nombre, tarifa_actual: r.tarifa_actual, proyectos: [], horas_total: 0, costo_total: 0 };
    }
    porDibujante[r.dibujante_id].proyectos.push(r);
    porDibujante[r.dibujante_id].horas_total += Number(r.horas_totales);
    porDibujante[r.dibujante_id].costo_total += Number(r.costo_total);
  });

  return (
    <div style={{ marginBottom: '28px' }}>
      <p style={{ fontWeight: 500, fontSize: '15px', marginBottom: '12px' }}>Resumen por dibujante</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Object.values(porDibujante).map(d => (
          <div key={d.nombre} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8f9fa', borderBottom: '1px solid #e0e0e0' }}>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <span style={{ fontWeight: 500 }}>{d.nombre}</span>
                <span style={{ fontSize: '12px', color: '#666' }}>Tarifa actual: {fmt(d.tarifa_actual)}/h</span>
              </div>
              <div style={{ display: 'flex', gap: '24px', fontSize: '14px' }}>
                <span><strong>{d.horas_total.toFixed(1)}</strong> h totales</span>
                <span style={{ fontWeight: 600, color: '#b71c1c' }}>{fmt(d.costo_total)}</span>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                {d.proyectos.map(p => (
                  <tr key={p.proyecto_id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <td style={{ padding: '8px 16px', color: '#666' }}>{p.proyecto_nombre}</td>
                    <td style={{ padding: '8px 16px' }}>{Number(p.horas_totales).toFixed(1)} h</td>
                    <td style={{ padding: '8px 16px', fontFamily: 'monospace', fontSize: '12px', color: '#999' }}>× {fmt(p.tarifa_actual)}/h</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 500 }}>{fmt(p.costo_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Horas() {
  const [horas,      setHoras]      = useState([]);
  const [resumen,    setResumen]    = useState([]);
  const [dibujantes, setDibujantes] = useState([]);
  const [proyectos,  setProyectos]  = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [error,      setError]      = useState(null);
  const [filtros,    setFiltros]    = useState({ dibujante_id: '', proyecto_id: '', desde: '', hasta: '' });
  const [vista,      setVista]      = useState('detalle');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v); });
      const [h, r, d, p] = await Promise.all([
        get(`/horas?${params}`),
        get(`/horas/resumen?${params}`),
        get('/dibujantes'),
        get('/proyectos'),
      ]);
      setHoras(h); setResumen(r); setDibujantes(d); setProyectos(p);
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtros)]);

  useEffect(() => { cargar(); }, [cargar]);

  const setF = (k) => (e) => setFiltros(p => ({ ...p, [k]: e.target.value }));

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <EncabezadoSeccion titulo="Horas trabajadas" subtitulo="Vista completa con costos por dibujante y proyecto" />
      <TarjetasHoras resumen={resumen} />
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Select value={filtros.dibujante_id} onChange={setF('dibujante_id')} style={{ width: 'auto' }}>
          <option value="">Todos los dibujantes</option>
          {dibujantes.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </Select>
        <Select value={filtros.proyecto_id} onChange={setF('proyecto_id')} style={{ width: 'auto' }}>
          <option value="">Todos los proyectos</option>
          {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </Select>
        <Input type="date" value={filtros.desde} onChange={setF('desde')} style={{ width: 'auto' }} title="Desde" />
        <Input type="date" value={filtros.hasta} onChange={setF('hasta')} style={{ width: 'auto' }} title="Hasta" />
        {Object.values(filtros).some(Boolean) && (
          <Boton variante="texto" onClick={() => setFiltros({ dibujante_id: '', proyecto_id: '', desde: '', hasta: '' })}>Limpiar</Boton>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          {['detalle', 'resumen'].map(v => (
            <button key={v} onClick={() => setVista(v)} style={{
              padding: '6px 14px', fontSize: '13px', borderRadius: '20px', border: '1px solid',
              borderColor: vista === v ? AZUL : '#d0d0d0',
              background:  vista === v ? AZUL : 'transparent',
              color:       vista === v ? 'white' : '#666',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{v === 'detalle' ? 'Detalle' : 'Por dibujante'}</button>
          ))}
        </div>
      </div>
      {error && <AlertaError mensaje={error} />}
      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : vista === 'resumen' ? <TablaResumen resumen={resumen} />
      : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <Tabla
            columnas={['Fecha', 'Dibujante', 'Proyecto', 'Horas', 'Tarifa aplicada', 'Costo', 'Descripción']}
            datos={horas}
            vacio="No hay registros de horas para los filtros seleccionados."
            renderFila={(h) => (
              <Fila key={h.id}>
                <Celda style={{ whiteSpace: 'nowrap', color: '#666', fontSize: '13px' }}>{fmtF(h.fecha)}</Celda>
                <Celda style={{ fontWeight: 500 }}>{h.dibujante_nombre}</Celda>
                <Celda style={{ color: '#666', fontSize: '13px' }}>{h.proyecto_nombre}</Celda>
                <Celda align="center" style={{ fontWeight: 600, color: AZUL }}>{Number(h.horas).toFixed(1)} h</Celda>
                <Celda style={{ fontFamily: 'monospace', fontSize: '12px', color: '#999' }}>{fmt(h.tarifa_aplicada)}/h</Celda>
                <Celda style={{ fontWeight: 600, color: '#b71c1c' }}>{fmt(h.costo_total)}</Celda>
                <Celda style={{ color: '#666', fontSize: '13px', maxWidth: '280px' }}>
                  <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {h.descripcion_tarea || '—'}
                  </span>
                </Celda>
              </Fila>
            )}
          />
        </div>
      )}
    </div>
  );
}
