import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ rol }) {
  const { usuario, cargando } = useAuth();
  const location = useLocation();

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
    // Se recuerda adónde quería ir, para volver ahí después de ingresar
    return <Navigate to="/login" replace state={{ desde: location.pathname + location.search }} />;
  }

  if (rol && usuario.rol !== rol) {
    return <Navigate to={usuario.rol === 'admin' ? '/admin' : '/dibujante'} replace />;
  }

  return <Outlet />;
}
