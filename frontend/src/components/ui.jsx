import { useEffect, useRef } from 'react';

export const AZUL  = '#1a2744';
export const AZUL2 = '#243460';

const ESTADO_COLORES = {
  activo:       { bg: '#e8f5e9', color: '#1b5e20', label: 'Activo' },
  pausado:      { bg: '#fff8e1', color: '#f57f17', label: 'Pausado' },
  finalizado:   { bg: '#ede7f6', color: '#311b92', label: 'Finalizado' },
  facturado:    { bg: '#e3f2fd', color: '#0d47a1', label: 'Facturado' },
  no_facturado: { bg: '#fce4ec', color: '#880e4f', label: 'No facturado' },
};

export function Badge({ estado }) {
  const cfg = ESTADO_COLORES[estado] || { bg: '#f5f5f5', color: '#333', label: estado };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '20px',
      fontSize: '12px', fontWeight: 500, background: cfg.bg, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

export function Modal({ titulo, onCerrar, children, ancho = 520 }) {
  const overlayRef = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCerrar]);

  return (
    <div ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onCerrar(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}>
      <div style={{
        background: '#fff', borderRadius: '12px',
        width: '100%', maxWidth: ancho, maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid #e0e0e0',
        }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 500 }}>{titulo}</h2>
          <button onClick={onCerrar} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '20px', color: '#666', lineHeight: 1, padding: '4px',
          }}>×</button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  );
}

export function Campo({ label, error, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      {label && <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{label}</label>}
      {children}
      {error && <p style={{ color: '#b91c1c', fontSize: '12px', margin: '4px 0 0' }}>{error}</p>}
    </div>
  );
}

export function Input({ ...props }) {
  return (
    <input {...props} style={{
      width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '14px',
      border: '1px solid #d0d0d0', borderRadius: '8px', outline: 'none',
      background: '#fafafa', color: '#1a1a1a', ...props.style,
    }} />
  );
}

export function Select({ children, ...props }) {
  return (
    <select {...props} style={{
      width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '14px',
      border: '1px solid #d0d0d0', borderRadius: '8px', outline: 'none',
      background: '#fafafa', color: '#1a1a1a', ...props.style,
    }}>
      {children}
    </select>
  );
}

export function Textarea({ ...props }) {
  return (
    <textarea {...props} rows={props.rows || 3} style={{
      width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: '14px',
      border: '1px solid #d0d0d0', borderRadius: '8px', outline: 'none',
      resize: 'vertical', background: '#fafafa', color: '#1a1a1a',
      fontFamily: 'inherit', ...props.style,
    }} />
  );
}

export function Boton({ variante = 'primario', children, ...props }) {
  const estilos = {
    primario:   { background: AZUL,          color: 'white',    border: 'none' },
    secundario: { background: 'transparent', color: '#1a1a1a',  border: '1px solid #d0d0d0' },
    peligro:    { background: '#b91c1c',     color: 'white',    border: 'none' },
    texto:      { background: 'none',        color: AZUL,       border: 'none', padding: '6px 0' },
  };
  return (
    <button {...props} style={{
      padding: '9px 18px', borderRadius: '8px', fontSize: '14px', fontWeight: 500,
      cursor: props.disabled ? 'not-allowed' : 'pointer',
      opacity: props.disabled ? 0.6 : 1, fontFamily: 'inherit',
      ...estilos[variante], ...props.style,
    }}>
      {children}
    </button>
  );
}

export function Buscador({ value, onChange, placeholder = 'Buscar…' }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{
        position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
        color: '#999', fontSize: '14px', pointerEvents: 'none',
      }}>⌕</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          padding: '8px 12px 8px 30px', fontSize: '14px',
          border: '1px solid #d0d0d0', borderRadius: '8px', outline: 'none',
          background: '#fafafa', color: '#1a1a1a', minWidth: '220px',
        }} />
    </div>
  );
}

export function Tabla({ columnas, datos, renderFila, vacio = 'Sin resultados' }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr>
            {columnas.map((col, i) => (
              <th key={i} style={{
                padding: '10px 14px', textAlign: 'left', fontWeight: 500,
                fontSize: '12px', color: '#666', borderBottom: '1px solid #e0e0e0',
                whiteSpace: 'nowrap',
              }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.length === 0 ? (
            <tr><td colSpan={columnas.length} style={{
              padding: '32px', textAlign: 'center', color: '#999', fontSize: '14px',
            }}>{vacio}</td></tr>
          ) : datos.map((fila, i) => renderFila(fila, i))}
        </tbody>
      </table>
    </div>
  );
}

export function Fila({ children, onClick }) {
  return (
    <tr onClick={onClick} style={{
      borderBottom: '1px solid #e0e0e0',
      cursor: onClick ? 'pointer' : 'default',
    }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = '#f9f9f9'; }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
    >
      {children}
    </tr>
  );
}

export function Celda({ children, align = 'left', style: s }) {
  return (
    <td style={{ padding: '12px 14px', textAlign: align, color: '#1a1a1a', ...s }}>
      {children}
    </td>
  );
}

export function AlertaError({ mensaje, onCerrar }) {
  if (!mensaje) return null;
  return (
    <div role="alert" style={{
      background: '#fff0f0', border: '1px solid #fca5a5', color: '#b91c1c',
      borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      {mensaje}
      {onCerrar && <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>×</button>}
    </div>
  );
}

export function EncabezadoSeccion({ titulo, subtitulo, accion }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: '24px', gap: '16px',
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 500 }}>{titulo}</h1>
        {subtitulo && <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#666' }}>{subtitulo}</p>}
      </div>
      {accion}
    </div>
  );
}
