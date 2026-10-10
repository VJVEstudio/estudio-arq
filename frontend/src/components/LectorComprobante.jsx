import { useState, useRef } from 'react';
import { getAccessToken } from '../lib/api';
import { Boton } from './ui';

const AZUL = '#1a2744';
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const normalizar = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(s\.?a\.?s?|s\.?r\.?l\.?|s\.?a\.?u\.?)\b/g, '')
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Busca en una lista (clientes o destinatarios) el registro que coincide con
// el CUIT o el nombre leídos del comprobante. Devuelve null si no hay coincidencia clara.
export function buscarCoincidencia(lista, { cuit, nombre }, campoNombre) {
  const cuitLeido = soloDigitos(cuit);
  if (cuitLeido.length === 11) {
    const porCuit = lista.find(x => soloDigitos(x.cuit) === cuitLeido);
    if (porCuit) return porCuit;
  }
  const nombreLeido = normalizar(nombre);
  if (nombreLeido.length < 3) return null;
  const exacto = lista.find(x => normalizar(x[campoNombre]) === nombreLeido);
  if (exacto) return exacto;
  const parciales = lista.filter(x => {
    const n = normalizar(x[campoNombre]);
    return n.length >= 3 && (n.includes(nombreLeido) || nombreLeido.includes(n));
  });
  return parciales.length === 1 ? parciales[0] : null;
}

// Recuadro para subir una foto o PDF de la factura y autocompletar el formulario.
// `endpoint` es la ruta del backend (ej: '/egresos/ocr'); `onDatos` recibe lo leído.
export default function LectorComprobante({ endpoint, archivoUrl, onDatos }) {
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setProcesando(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('archivo', archivo);
      const resp = await fetch(`${BASE}${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        body: formData,
        credentials: 'include',
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Error al leer el comprobante');
      }
      onDatos(await resp.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div style={{
      border: '2px dashed #c7d2fe', borderRadius: '10px', padding: '16px',
      marginBottom: '20px', background: '#f8faff', textAlign: 'center',
    }}>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleArchivo} style={{ display: 'none' }} />
      {procesando ? (
        <p style={{ margin: 0, fontSize: '13px', color: AZUL }}>🔍 Leyendo el comprobante…</p>
      ) : archivoUrl ? (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#1b5e20' }}>
            ✓ Comprobante cargado ·{' '}
            <a href={archivoUrl} target="_blank" rel="noopener noreferrer" style={{ color: AZUL }}>Ver archivo</a>
          </p>
          <Boton type="button" variante="secundario" style={{ fontSize: '12px', padding: '5px 12px' }}
            onClick={() => inputRef.current?.click()}>Cambiar archivo</Boton>
        </div>
      ) : (
        <div>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#666' }}>
            📎 Subí una foto o PDF de la factura para autocompletar los datos
          </p>
          <Boton type="button" variante="secundario" style={{ fontSize: '12px', padding: '5px 12px' }}
            onClick={() => inputRef.current?.click()}>Seleccionar archivo</Boton>
        </div>
      )}
      {error && <p style={{ color: '#b91c1c', fontSize: '12px', margin: '8px 0 0' }}>{error}</p>}
    </div>
  );
}
