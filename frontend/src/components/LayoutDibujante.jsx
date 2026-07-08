import { useNavigate, Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AZUL = '#1a2744';

export default function LayoutDibujante() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f5f5' }}>
      <aside style={{
        width: 220, background: AZUL, display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, minHeight: '100vh',
      }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'white' }}>Arq. Hospitalaria</p>
          <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Portal dibujantes</p>
        </div>

        <nav style={{ flex: 1, padding: '16px 0' }}>
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

      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  );
}
