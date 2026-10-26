import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute   from './components/ProtectedRoute';
import LayoutAdmin      from './components/LayoutAdmin';
import LayoutDibujante  from './components/LayoutDibujante';

import Login from './pages/Login';

import Dashboard       from './pages/admin/Dashboard';
import ClientesProyectos from './pages/admin/ClientesProyectos';
import MovimientosFinancieros from './pages/admin/MovimientosFinancieros';
import Banco from './pages/admin/Banco';
import Rendiciones from './pages/admin/Rendiciones';
import RendicionDetalle from './pages/admin/RendicionDetalle';import Balance         from './pages/admin/Balance';
import Dibujantes      from './pages/admin/Dibujantes';
import Horas           from './pages/admin/Horas';
import ReporteGeneral  from './pages/admin/ReporteGeneral';
import ReporteProyecto from './pages/admin/ReporteProyecto';
import Usuarios        from './pages/admin/Usuarios';

import MisHoras from './pages/dibujante/MisHoras';
import MisLiquidaciones from './pages/dibujante/MisLiquidaciones';
import Seguimiento from './pages/seguimiento/Seguimiento';
import ProyectoSeguimiento from './pages/seguimiento/ProyectoSeguimiento';
import Revision from './pages/seguimiento/Revision';

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
              {/* Ingresos y Egresos ahora se ven dentro de Movimientos */}
              <Route path="/admin/ingresos"                element={<Navigate to="/admin/movimientos?vista=ingresos" replace />} />
              <Route path="/admin/egresos"                 element={<Navigate to="/admin/movimientos?vista=egresos" replace />} />
<Route path="/admin/movimientos"             element={<MovimientosFinancieros />} />
              <Route path="/admin/banco"                   element={<Banco />} />
              <Route path="/admin/rendiciones"             element={<Rendiciones />} />
              <Route path="/admin/rendiciones/:id"         element={<RendicionDetalle />} />              <Route path="/admin/balance"               element={<Balance />} />
              <Route path="/admin/dibujantes"            element={<Dibujantes />} />
              <Route path="/admin/horas"                 element={<Horas />} />
              <Route path="/admin/reportes"              element={<ReporteGeneral />} />
              <Route path="/admin/reportes/proyecto/:id" element={<ReporteProyecto />} />
              <Route path="/admin/usuarios"              element={<Usuarios />} />
              <Route path="/admin/seguimiento"           element={<Seguimiento base="/admin/seguimiento" />} />
              <Route path="/admin/seguimiento/revision"  element={<Revision base="/admin/seguimiento" />} />
              <Route path="/admin/seguimiento/:id"       element={<ProyectoSeguimiento base="/admin/seguimiento" />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute rol="dibujante" />}>
            <Route element={<LayoutDibujante />}>
<Route path="/dibujante/horas"         element={<MisHoras />} />
              <Route path="/dibujante/liquidaciones"  element={<MisLiquidaciones />} />
              <Route path="/dibujante/proyectos"      element={<Seguimiento base="/dibujante/proyectos" />} />
              <Route path="/dibujante/proyectos/revision" element={<Revision base="/dibujante/proyectos" />} />
              <Route path="/dibujante/proyectos/:id"  element={<ProyectoSeguimiento base="/dibujante/proyectos" />} />
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
