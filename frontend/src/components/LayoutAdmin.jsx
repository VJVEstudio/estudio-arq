import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AZUL = '#6b6b6b';

const NAV = [
  { grupo: 'Principal', items: [
    { to: '/admin', label: 'Dashboard', icono: '◈', exact: true },
  ]},
  { grupo: 'Gestión', items: [
    { to: '/admin/clientes-proyectos', label: 'Clientes y Proyectos', icono: '📐' },
  ]},
{ grupo: 'Finanzas', items: [
    { to: '/admin/movimientos', label: 'Movimientos', icono: '↕' },
    { to: '/admin/ingresos', label: 'Ingresos', icono: '↑' },
    { to: '/admin/egresos',  label: 'Egresos',  icono: '↓' },
    { to: '/admin/balance',  label: 'Balance',  icono: '⇄' },
      ]},
  { grupo: 'Equipo', items: [
    { to: '/admin/dibujantes', label: 'Dibujantes', icono: '✏' },
    { to: '/admin/horas',      label: 'Horas',      icono: '⏱' },
  ]},
{ grupo: 'Reportes', items: [
    { to: '/admin/reportes', label: 'Reporte general', icono: '📊' },
  ]},
  { grupo: 'Obras', items: [
    { to: '/admin/rendiciones', label: 'Rendiciones', icono: '📋' },
  ]},
];

function Sidebar({ colapsado, onToggle }) {
  return (
    <aside style={{
      width: colapsado ? 60 : 240, minHeight: '100vh', background: AZUL,
      display: 'flex', flexDirection: 'column', transition: 'width 0.22s ease',
      flexShrink: 0, position: 'sticky', top: 0, zIndex: 100,
    }}>
      <div style={{
        padding: colapsado ? '20px 0' : '20px', borderBottom: '1px solid rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center',
        justifyContent: colapsado ? 'center' : 'space-between', minHeight: 64,
      }}>
        {!colapsado && (
          <div>
            <img src="/logo-vjv.jpg" alt="VJV" style={{ width: '52px', marginBottom: '8px', borderRadius: '4px', display: 'block' }} />
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'white' }}>VJV Arquitectos</p>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Panel de gestión</p>
          </div>
        )}
        <button onClick={onToggle} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px',
          color: 'white', cursor: 'pointer', padding: '6px 8px',
          fontSize: '14px', lineHeight: 1,
        }}>
          {colapsado ? '→' : '←'}
        </button>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {NAV.map(grupo => (
          <div key={grupo.grupo} style={{ marginBottom: '4px' }}>
            {!colapsado && (
              <p style={{
                margin: '12px 20px 4px', fontSize: '10px', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.5)',
              }}>{grupo.grupo}</p>
            )}
            {grupo.items.map(item => (
              <NavLink key={item.to} to={item.to} end={item.exact}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center',
                  gap: colapsado ? 0 : '10px',
                  justifyContent: colapsado ? 'center' : 'flex-start',
                  padding: colapsado ? '10px 0' : '9px 20px',
                  margin: '1px 8px', borderRadius: '8px',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.85)',
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
                  textDecoration: 'none', fontSize: '14px',
                  fontWeight: isActive ? 600 : 400,
                })}>
                <span style={{ fontSize: colapsado ? '18px' : '15px', minWidth: 20, textAlign: 'center' }}>
                  {item.icono}
                </span>
                {!colapsado && item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {!colapsado && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.15)' }}>
          <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
            v1.0 · VJV Arquitectos
          </p>
        </div>
      )}
    </aside>
  );
}

function Header({ usuario, onLogout }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  return (
    <header style={{
      height: 56, background: '#fff', borderBottom: '1px solid #e0e0e0',
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
      padding: '0 24px', position: 'sticky', top: 0, zIndex: 90,
    }}>
      <div style={{ position: 'relative' }}>
        <button onClick={() => setMenuAbierto(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: '8px',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: AZUL, color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', fontWeight: 600,
          }}>
            {usuario?.nombre?.charAt(0)?.toUpperCase()}
          </div>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>{usuario?.nombre}</p>
            <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Administrador</p>
          </div>
          <span style={{ color: '#999', fontSize: '12px' }}>▾</span>
        </button>

        {menuAbierto && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setMenuAbierto(false)} />
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '6px', zIndex: 200,
              background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 180, overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e0e0e0' }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>{usuario?.nombre}</p>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#666' }}>{usuario?.email}</p>
              </div>
              <button onClick={() => { setMenuAbierto(false); onLogout(); }} style={{
                display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
                background: 'none', border: 'none', fontSize: '14px', color: '#b91c1c',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export default function LayoutAdmin() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const [colapsado, setColapsado] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f5f5' }}>
      <Sidebar colapsado={colapsado} onToggle={() => setColapsado(v => !v)} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header usuario={usuario} onLogout={handleLogout} />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
