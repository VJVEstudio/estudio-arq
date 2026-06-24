import { useState, useEffect, useCallback } from 'react';
import { get, post, getAccessToken } from '../../lib/api';import {
  EncabezadoSeccion, Tabla, Fila, Celda,
  Select, Input, AlertaError, Boton, Modal, Campo,
} from '../../components/ui';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const fmt  = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtF = (f) => {
  if (!f) return '—';
  const fecha = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR');
};
const AZUL = '#1a2744';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

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
  if (!resumen.length) return (
    <p style={{ color: '#999', fontSize: '14px', textAlign: 'center', padding: '32px' }}>
      No hay registros para los filtros seleccionados.
    </p>
  );
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

function PanelLiquidacion({ pendientes, socios, destinatarios, onLiquidar, cargando }) {
  const [seleccion, setSeleccion] = useState(null);
  const [pagado_por_estudio, setPagadoPorEstudio] = useState(true);
  const [socio_id, setSocioId] = useState('');
  const [destinatario_id, setDestinatarioId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const handleLiquidar = async () => {
    if (!seleccion || !destinatario_id) { setError('Seleccioná un destinatario'); return; }
    setGuardando(true);
    setError('');
    try {
      await onLiquidar({
        dibujante_id: seleccion.dibujante_id,
        mes: seleccion.numero_mes,
        anio: seleccion.anio,
        destinatario_id,
        pagado_por_estudio,
        socio_id: pagado_por_estudio ? null : socio_id,
      });
      setSeleccion(null);
    } catch (err) { setError(err.message); }
    finally { setGuardando(false); }
  };

  if (cargando) return <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>;

  if (!pendientes.length) {
    return (
      <div style={{ background: '#e8f5e9', borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>✓</span>
        <div>
          <p style={{ margin: 0, fontWeight: 500, color: '#1b5e20' }}>¡Todo liquidado!</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#2e7d32' }}>No hay horas pendientes de pago.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontWeight: 500, fontSize: '15px', margin: '0 0 14px' }}>Horas pendientes de liquidación:</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
        {pendientes.map((p, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: seleccion === p ? '#e3f2fd' : '#fff',
            border: `1px solid ${seleccion === p ? '#1a2744' : '#e0e0e0'}`,
            borderRadius: '10px', padding: '12px 16px', cursor: 'pointer', flexWrap: 'wrap', gap: '12px',
          }} onClick={() => setSeleccion(p)}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>{p.dibujante_nombre}</span>
              <span style={{ background: '#f0f0f0', borderRadius: '20px', padding: '2px 10px', fontSize: '12px', color: '#666' }}>
                {MESES[Number(p.numero_mes) - 1]} {p.anio}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '20px', fontSize: '14px' }}>
              <span>{Number(p.horas_totales).toFixed(1)} h</span>
              <span style={{ fontWeight: 700, color: '#b71c1c' }}>{fmt(p.monto_total)}</span>
            </div>
          </div>
        ))}
      </div>

      {seleccion && (
        <div style={{ background: '#f8f9fa', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ margin: '0 0 12px', fontWeight: 500, fontSize: '14px' }}>
            Liquidar: {seleccion.dibujante_nombre} — {MESES[Number(seleccion.numero_mes) - 1]} {seleccion.anio}
          </p>
          <p style={{ margin: '0 0 16px', fontSize: '22px', fontWeight: 700, color: '#b71c1c' }}>{fmt(seleccion.monto_total)}</p>

          <Campo label="Destinatario (dibujante) *">
            <Select value={destinatario_id} onChange={e => setDestinatarioId(e.target.value)}>
              <option value="">Seleccioná…</option>
              {destinatarios.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </Select>
          </Campo>

          <div style={{ display: 'flex', gap: '24px', marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
              <input type="radio" name="pagador_liq" checked={pagado_por_estudio}
                onChange={() => setPagadoPorEstudio(true)} />
              El estudio
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
              <input type="radio" name="pagador_liq" checked={!pagado_por_estudio}
                onChange={() => setPagadoPorEstudio(false)} />
              Un socio específico
            </label>
          </div>

          {!pagado_por_estudio && (
            <Campo label="Socio que pagó">
              <Select value={socio_id} onChange={e => setSocioId(e.target.value)}>
                <option value="">Seleccioná…</option>
                {socios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </Select>
            </Campo>
          )}

          {error && <p style={{ color: '#b91c1c', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '10px' }}>
            <Boton variante="secundario" onClick={() => setSeleccion(null)}>Cancelar</Boton>
            <Boton onClick={handleLiquidar} disabled={guardando || !destinatario_id}>
              {guardando ? 'Procesando…' : '✓ Confirmar liquidación'}
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Horas() {
  const [horas,      setHoras]      = useState([]);
  const [resumen,    setResumen]    = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [dibujantes, setDibujantes] = useState([]);
  const [proyectos,  setProyectos]  = useState([]);
  const [socios,     setSocios]     = useState([]);
  const [destinatarios, setDestinatarios] = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [cargandoPendientes, setCargandoPendientes] = useState(true);
  const [error,      setError]      = useState(null);

  // Filtros: dibujante, proyecto, y modo de fecha (rango exacto o mes)
  const [modoFecha, setModoFecha] = useState('rango'); // 'rango' | 'mes'
  const hoy = new Date();
  const [mesSeleccionado, setMesSeleccionado] = useState(
    `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  );
  const [filtros, setFiltros] = useState({ dibujante_id: '', proyecto_id: '', desde: '', hasta: '' });
  const [vista, setVista] = useState('resumen'); // Vista por defecto: "Por dibujante"

  // Calcular desde/hasta efectivos según el modo de fecha
  const filtrosEfectivos = (() => {
    if (modoFecha === 'mes' && mesSeleccionado) {
      const [anio, mes] = mesSeleccionado.split('-').map(Number);
      const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
      const ultimoDia = new Date(anio, mes, 0).getDate();
      const hasta = `${anio}-${String(mes).padStart(2, '0')}-${ultimoDia}`;
      return { ...filtros, desde, hasta };
    }
    return filtros;
  })();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries(filtrosEfectivos).forEach(([k, v]) => { if (v) params.set(k, v); });
      const [h, r, d, p, s, dest, pend] = await Promise.all([
        get(`/horas?${params}`),
        get(`/horas/resumen?${params}`),
        get('/dibujantes'),
        get('/proyectos'),
        get('/socios'),
        get('/destinatarios'),
        get('/horas/pendientes'),
      ]);
      setHoras(h); setResumen(r); setDibujantes(d); setProyectos(p);
      setSocios(s); setDestinatarios(dest); setPendientes(pend);
    } catch (err) { setError(err.message); }
    finally { setCargando(false); setCargandoPendientes(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filtrosEfectivos)]);

  useEffect(() => { cargar(); }, [cargar]);

  const handleLiquidar = async (datos) => {
    await post('/horas/liquidar', datos);
    await cargar();
  };

  const setF = (k) => (e) => setFiltros(p => ({ ...p, [k]: e.target.value }));

  const limpiarFiltros = () => {
    setFiltros({ dibujante_id: '', proyecto_id: '', desde: '', hasta: '' });
    setModoFecha('rango');
  };

const exportar = (formato) => {
    const params = new URLSearchParams();
    Object.entries(filtrosEfectivos).forEach(([k, v]) => { if (v) params.set(k, v); });
    const token = getAccessToken();
    if (token) params.set('token', token);
    window.open(`${BASE}/horas/exportar/${formato}?${params}`, '_blank');
  };
  const hayFiltrosActivos = filtros.dibujante_id || filtros.proyecto_id || filtros.desde || filtros.hasta || modoFecha === 'mes';

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <EncabezadoSeccion
        titulo="Horas trabajadas"
        subtitulo="Vista completa con costos por dibujante y proyecto"
        accion={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Boton variante="secundario" onClick={() => exportar('excel')}>⬇ Excel</Boton>
            <Boton variante="secundario" onClick={() => exportar('pdf')}>⬇ PDF</Boton>
          </div>
        }
      />
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

        {/* Toggle entre filtro por rango o por mes */}
        <div style={{ display: 'flex', gap: '4px', background: '#f0f0f0', borderRadius: '8px', padding: '3px' }}>
          {[{ id: 'rango', label: 'Fecha exacta' }, { id: 'mes', label: 'Por mes' }].map(opt => (
            <button key={opt.id} onClick={() => setModoFecha(opt.id)} style={{
              padding: '5px 10px', fontSize: '12px', borderRadius: '6px', border: 'none',
              background: modoFecha === opt.id ? '#fff' : 'transparent',
              boxShadow: modoFecha === opt.id ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer', fontFamily: 'inherit', color: modoFecha === opt.id ? AZUL : '#666',
              fontWeight: modoFecha === opt.id ? 600 : 400,
            }}>
              {opt.label}
            </button>
          ))}
        </div>

        {modoFecha === 'rango' ? (
          <>
            <Input type="date" value={filtros.desde} onChange={setF('desde')} style={{ width: 'auto' }} title="Desde" />
            <Input type="date" value={filtros.hasta} onChange={setF('hasta')} style={{ width: 'auto' }} title="Hasta" />
          </>
        ) : (
          <Input type="month" value={mesSeleccionado} onChange={e => setMesSeleccionado(e.target.value)} style={{ width: 'auto' }} />
        )}

        {hayFiltrosActivos && (
          <Boton variante="texto" onClick={limpiarFiltros}>Limpiar</Boton>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
          {['resumen', 'detalle', 'liquidar'].map(v => (
            <button key={v} onClick={() => setVista(v)} style={{
              padding: '6px 14px', fontSize: '13px', borderRadius: '20px', border: '1px solid',
              borderColor: vista === v ? AZUL : '#d0d0d0',
              background:  vista === v ? AZUL : 'transparent',
              color:       vista === v ? 'white' : '#666',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {v === 'detalle' ? 'Detalle' : v === 'resumen' ? 'Por dibujante' : `💰 Liquidar (${pendientes.length})`}
            </button>
          ))}
        </div>
      </div>

      {error && <AlertaError mensaje={error} />}

      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : vista === 'resumen' ? <TablaResumen resumen={resumen} />
      : vista === 'liquidar' ? (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '24px' }}>
          <PanelLiquidacion
            pendientes={pendientes}
            socios={socios}
            destinatarios={destinatarios}
            onLiquidar={handleLiquidar}
            cargando={cargandoPendientes}
          />
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <Tabla
            columnas={['Fecha', 'Dibujante', 'Proyecto', 'Horas', 'Tarifa aplicada', 'Costo', 'Estado', 'Descripción']}
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
                <Celda>
                  <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: '20px',
                    fontSize: '12px', fontWeight: 500,
                    background: h.liquidada ? '#e8f5e9' : '#fff8e1',
                    color: h.liquidada ? '#1b5e20' : '#f57f17',
                  }}>
                    {h.liquidada ? 'Liquidada' : 'Pendiente'}
                  </span>
                </Celda>
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
