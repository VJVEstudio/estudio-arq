import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ rol }) {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: '#666', fontSize: 14,
      }}>
        Verificando sesión…
      </div>
    );
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  if (rol && usuario.rol !== rol) {
    return <Navigate to={usuario.rol === 'admin' ? '/admin' : '/dibujante'} replace />;
  }

  return <Outlet />;
}
