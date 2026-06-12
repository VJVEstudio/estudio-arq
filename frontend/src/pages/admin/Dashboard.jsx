import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { get } from '../../lib/api';

const AZUL = '#1a2744';
const fmt = (n, moneda = 'ARS') =>
  moneda === 'USD'
    ? `U$S ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtF = (f) => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-AR') : '—';

function Metrica({ label, valor, subtexto, color = AZUL, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px',
      padding: '18px 20px', cursor: onClick ? 'pointer' : 'default',
    }}>
      <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '24px', fontWeight: 700, color }}>{valor}</p>
      {subtexto && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#999' }}>{subtexto}</p>}
    </div>
  );
}

function AccesoRapido({ icono, label, descripcion, to, navigate }) {
  return (
    <div onClick={() => navigate(to)} style={{
      display: 'flex', alignItems: 'center', gap: '14px',
      padding: '14px 16px', borderRadius: '10px', background: '#f8f9fa',
      cursor: 'pointer',
    }}>
      <span style={{ fontSize: '22px' }}>{icono}</span>
      <div>
        <p style={{ margin: 0, fontWeight: 500, fontSize: '14px' }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#666' }}>{descripcion}</p>
      </div>
      <span style={{ marginLeft: 'auto', color: '#999', fontSize: '16px' }}>›</span>
    </div>
  );
}

export default function Dashboard() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const hoy   = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
    const hasta = hoy.toISOString().split('T')[0];
    Promise.all([
      get(`/reportes/general?desde=${desde}&hasta=${hasta}`),
      get('/proyectos?estado=activo'),
      get('/ingresos?desde=' + desde).catch(() => []),
      get('/egresos?desde='  + desde).catch(() => []),
    ]).then(([reporte, proyectos, ingresos, egresos]) => {
      setDatos({ reporte, proyectos, ingresos: ingresos.slice(0, 5), egresos: egresos.slice(0, 5) });
    }).catch(() => {}).finally(() => setCargando(false));
  }, []);

  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const ing = datos?.reporte?.ingresos || [];
  const egr = datos?.reporte?.egresos  || [];
  const totIngARS = ing.filter(r => r.moneda === 'ARS').reduce((s, r) => s + Number(r.total), 0);
  const totEgrARS = egr.filter(r => r.moneda === 'ARS').reduce((s, r) => s + Number(r.total), 0);

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 400 }}>
          {saludo}, <strong>{usuario?.nombre?.split(' ')[0]}</strong> 👋
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#666' }}>
          {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {cargando ? (
        <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '28px' }}>
            <Metrica label="Proyectos activos" valor={datos?.proyectos?.length || 0} subtexto="En curso ahora" onClick={() => navigate('/admin/proyectos')} />
            <Metrica label="Ingresos del mes" valor={fmt(totIngARS)} subtexto="En pesos argentinos" color="#1b5e20" onClick={() => navigate('/admin/ingresos')} />
            <Metrica label="Egresos del mes" valor={fmt(totEgrARS)} subtexto="En pesos argentinos" color="#b71c1c" onClick={() => navigate('/admin/egresos')} />
            <Metrica label="Resultado del mes" valor={fmt(totIngARS - totEgrARS)} subtexto="Ingresos − Egresos ARS"
              color={totIngARS - totEgrARS >= 0 ? '#1b5e20' : '#b71c1c'}
              onClick={() => navigate('/admin/reportes')} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            {[
              { titulo: 'Últimos ingresos', datos: datos?.ingresos, ruta: '/admin/ingresos', renderFila: (i) => (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid #e0e0e0', fontSize: '13px' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 500 }}>{i.cliente_nombre}</p>
                    <p style={{ margin: '2px 0 0', color: '#666', fontSize: '12px' }}>{fmtF(i.fecha)}</p>
                  </div>
                  <span style={{ fontWeight: 600, color: '#1b5e20' }}>{fmt(i.monto, i.moneda)}</span>
                </div>
              )},
              { titulo: 'Últimos egresos', datos: datos?.egresos, ruta: '/admin/egresos', renderFila: (e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid #e0e0e0', fontSize: '13px' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 500 }}>{e.destinatario_nombre}</p>
                    <p style={{ margin: '2px 0 0', color: '#666', fontSize: '12px' }}>{fmtF(e.fecha)}</p>
                  </div>
                  <span style={{ fontWeight: 600, color: '#b71c1c' }}>{fmt(e.monto, e.moneda)}</span>
                </div>
              )},
            ].map(panel => (
              <div key={panel.titulo} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e0e0e0' }}>
                  <p style={{ margin: 0, fontWeight: 500, fontSize: '14px' }}>{panel.titulo}</p>
                  <button onClick={() => navigate(panel.ruta)} style={{ background: 'none', border: 'none', color: AZUL, cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' }}>
                    Ver todos →
                  </button>
                </div>
                {!panel.datos?.length
                  ? <p style={{ padding: '20px 18px', fontSize: '14px', color: '#999', margin: 0 }}>Sin registros este mes.</p>
                  : panel.datos.map(panel.renderFila)
                }
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '18px 20px' }}>
            <p style={{ margin: '0 0 14px', fontWeight: 500, fontSize: '14px' }}>Acciones rápidas</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
              {[
                { icono: '↑', label: 'Registrar ingreso',  descripcion: 'Nuevo cobro de cliente',        to: '/admin/ingresos' },
                { icono: '↓', label: 'Registrar egreso',   descripcion: 'Nuevo gasto del estudio',       to: '/admin/egresos' },
                { icono: '⇄', label: 'Ver balance',        descripcion: 'Estado de cuentas entre socios', to: '/admin/balance' },
                { icono: '📊', label: 'Reporte general',   descripcion: 'Resumen financiero del estudio', to: '/admin/reportes' },
              ].map(a => <AccesoRapido key={a.to} {...a} navigate={navigate} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
