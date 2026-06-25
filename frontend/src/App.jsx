import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute   from './components/ProtectedRoute';
import LayoutAdmin      from './components/LayoutAdmin';
import LayoutDibujante  from './components/LayoutDibujante';

import Login from './pages/Login';

import Dashboard       from './pages/admin/Dashboard';
import ClientesProyectos from './pages/admin/ClientesProyectos';
import Ingresos        from './pages/admin/Ingresos';
import Egresos         from './pages/admin/Egresos';
import MovimientosFinancieros from './pages/admin/MovimientosFinancieros';
import Rendiciones from './pages/admin/Rendiciones';
import RendicionDetalle from './pages/admin/RendicionDetalle';import Balance         from './pages/admin/Balance';
import Dibujantes      from './pages/admin/Dibujantes';
import Horas           from './pages/admin/Horas';
import ReporteGeneral  from './pages/admin/ReporteGeneral';
import ReporteProyecto from './pages/admin/ReporteProyecto';

import MisHoras from './pages/dibujante/MisHoras';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute rol="admin" />}>
            <Route element={<LayoutAdmin />}>
              <Route path="/admin"                       element={<Dashboard />} />
              <Route path="/admin/clientes-proyectos"      element={<ClientesProyectos />} />
              <Route path="/admin/ingresos"                element={<Ingresos />} />
              <Route path="/admin/egresos"                 element={<Egresos />} />
<Route path="/admin/movimientos"             element={<MovimientosFinancieros />} />
              <Route path="/admin/rendiciones"             element={<Rendiciones />} />
              <Route path="/admin/rendiciones/:id"         element={<RendicionDetalle />} />              <Route path="/admin/balance"               element={<Balance />} />
              <Route path="/admin/dibujantes"            element={<Dibujantes />} />
              <Route path="/admin/horas"                 element={<Horas />} />
              <Route path="/admin/reportes"              element={<ReporteGeneral />} />
              <Route path="/admin/reportes/proyecto/:id" element={<ReporteProyecto />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute rol="dibujante" />}>
            <Route element={<LayoutDibujante />}>
              <Route path="/dibujante/horas" element={<MisHoras />} />
              <Route path="/dibujante" element={<Navigate to="/dibujante/horas" replace />} />
            </Route>
          </Route>

          <Route path="/"  element={<Navigate to="/login" replace />} />
          <Route path="*"  element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
