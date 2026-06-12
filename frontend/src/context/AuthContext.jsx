import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { post, get, setAccessToken, clearAccessToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario,  setUsuario]  = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const inicializar = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/auth/refresh`,
          { method: 'POST', credentials: 'include' }
        );
        if (res.ok) {
          const { accessToken } = await res.json();
          setAccessToken(accessToken);
          const me = await get('/auth/me');
          setUsuario(me);
        }
      } catch {
        // Sin sesión previa
      } finally {
        setCargando(false);
      }
    };
    inicializar();
    const manejarLogout = () => { setUsuario(null); clearAccessToken(); };
    window.addEventListener('auth:logout', manejarLogout);
    return () => window.removeEventListener('auth:logout', manejarLogout);
  }, []);

  const login = useCallback(async (email, password) => {
    const datos = await post('/auth/login', { email, password });
    setAccessToken(datos.accessToken);
    setUsuario(datos.usuario);
    return datos.usuario;
  }, []);

  const logout = useCallback(async () => {
    try { await post('/auth/logout', {}); } catch {}
    clearAccessToken();
    setUsuario(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      usuario, login, logout, cargando,
      esAdmin: usuario?.rol === 'admin',
      esDibujante: usuario?.rol === 'dibujante',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
