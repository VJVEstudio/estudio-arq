import { useState, useEffect } from 'react';
import { useNavigate, Outlet, NavLink, useLocation } from 'react-router-dom';
import { useEsCelular } from '../lib/useEsCelular';
import { useAuth } from '../context/AuthContext';
import { CampanaNotificaciones } from '../pages/seguimiento/comunes';

const AZUL = '#1a2744';

export default function LayoutDibujante() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const movil = useEsCelular();
  const [menuMovil, setMenuMovil] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setMenuMovil(false); }, [pathname, movil]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f5f5' }}>
      {movil && menuMovil && <div onClick={() => setMenuMovil(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 399 }} />}
      {(!movil || menuMovil) && (
      <aside style={{
        width: 220, background: AZUL, display: 'flex', flexDirection: 'column', top: 0, minHeight: '100vh', flexShrink: 0,
        ...(movil ? { position: 'fixed', left: 0, bottom: 0, zIndex: 400, boxShadow: '4px 0 20px rgba(0,0,0,0.25)' } : { position: 'sticky' }),
      }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'white' }}>Arq. Hospitalaria</p>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Portal dibujantes</p>
          </div>
          {movil && <button type="button" onClick={() => setMenuMovil(false)} aria-label="Cerrar menú" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#fff', padding: '6px 8px', cursor: 'pointer' }}>✕</button>}
        </div>

        <nav onClick={(e) => { if (e.target.closest('a')) setMenuMovil(false); }} style={{ flex: 1, padding: '16px 0' }}>
<NavLink to="/dibujante/horas"
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 20px', margin: '1px 8px', borderRadius: '8px',
              color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
              background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
              textDecoration: 'none', fontSize: '14px',
            })}>
            <span>⏱</span> Mis horas
          </NavLink>
          <NavLink to="/dibujante/liquidaciones"
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 20px', margin: '1px 8px', borderRadius: '8px',
              color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
              background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
              textDecoration: 'none', fontSize: '14px',
            })}>
            <span>💰</span> Mis liquidaciones
          </NavLink>
          <NavLink to="/dibujante/proyectos"
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 20px', margin: '1px 8px', borderRadius: '8px',
              color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
              background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
              textDecoration: 'none', fontSize: '14px',
            })}>
            <span>💬</span> Proyectos
          </NavLink>
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '13px', fontWeight: 600,
            }}>
              {usuario?.nombre?.charAt(0)?.toUpperCase()}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '13px', color: 'white', fontWeight: 500 }}>{usuario?.nombre}</p>
              <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Dibujante</p>
            </div>
          </div>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '8px', background: 'rgba(255,255,255,0.08)',
            border: 'none', borderRadius: '8px', color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit',
          }}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      )}

      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <header style={{
          height: movil ? 50 : 52, background: '#fff', borderBottom: '1px solid #e0e0e0', display: 'flex',
          alignItems: 'center', justifyContent: 'flex-end', padding: movil ? '0 10px' : '0 20px', position: 'sticky', top: 0, zIndex: 90,
        }}>
          {movil && (
            <button type="button" onClick={() => setMenuMovil(true)} aria-label="Abrir menú" style={{
              font: 'inherit', fontSize: 20, lineHeight: 1, width: 38, height: 36, border: '1px solid #e0e0e0', borderRadius: 8,
              background: '#fff', color: '#333', cursor: 'pointer', marginRight: 'auto',
            }}>☰</button>
          )}
          <CampanaNotificaciones base="/dibujante/proyectos" />
        </header>
        <Outlet />
      </div>
    </div>
  );
}
