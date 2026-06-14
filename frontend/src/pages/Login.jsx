import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AZUL = '#6b6b6b';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const usuario = await login(email, password);
      navigate(usuario.rol === 'admin' ? '/admin' : '/dibujante', { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Panel izquierdo */}
      <div style={{
        width: '42%',
        background: `linear-gradient(160deg, ${AZUL} 0%, #4a4a4a 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ padding: '48px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <img
            src="/LogoVJVinvert.jpg"
            alt="VJV Arquitectos"
            style={{ width: '260px', borderRadius: '6px' }}
          />
          <div>
            <p style={{ color: 'rgba(255,255,255,0.95)', fontSize: '26px', fontWeight: 300, margin: 0 }}>
              Gestión interna
            </p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: '8px 0 0', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Proyectos · Finanzas · Equipos
            </p>
          </div>
        </div>
      </div>

      {/* Panel derecho */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '48px 24px' }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 500, margin: '0 0 6px' }}>Iniciar sesión</h1>
          <p style={{ fontSize: '14px', color: '#666', margin: '0 0 32px' }}>Ingresá con tu cuenta del estudio</p>

          <form onSubmit={handleSubmit} noValidate>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="tu@estudio.com" required
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: '14px',
                  border: '1px solid #d0d0d0', borderRadius: '8px', outline: 'none', background: '#fafafa',
                }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Contraseña</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 14px', fontSize: '14px',
                  border: '1px solid #d0d0d0', borderRadius: '8px', outline: 'none', background: '#fafafa',
                }}
              />
            </div>
            {error && (
              <div style={{
                background: '#fff0f0', border: '1px solid #fca5a5', color: '#b91c1c',
                borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px',
              }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={cargando} style={{
              width: '100%', padding: '11px', background: AZUL, color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
              cursor: cargando ? 'not-allowed' : 'pointer', opacity: cargando ? 0.7 : 1,
              fontFamily: 'inherit',
            }}>
              {cargando ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
