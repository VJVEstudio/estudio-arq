import { useState, useEffect } from 'react';
import { get, post } from '../../lib/api';
import { Modal, Boton, Campo, Select, AlertaError } from '../../components/ui';

const AZUL = '#1a2744';

// Deshace un movimiento: devuelve cada rendición a su proyecto y número anteriores.
// `resultado` es lo que devolvió /rendiciones/mover al mover.
export async function deshacerMovimiento(resultado) {
  const porOrigen = {};
  for (const r of resultado.rendiciones) (porOrigen[r.proyecto_origen_id] ||= []).push(r);
  for (const [origen, lista] of Object.entries(porOrigen)) {
    await post('/rendiciones/mover', {
      ids: lista.map(r => r.id), proyecto_id: origen,
      numeros: Object.fromEntries(lista.map(r => [r.id, r.numero_actual])),
    });
  }
}

// Pasa una o varias rendiciones a otro proyecto. Cada una conserva su número (RV3 sigue
// siendo RV3). Solo si ese número ya existe en el destino toma el primer número libre
// (el hueco que haya: así, devolver una rendición a su proyecto le devuelve su número);
// en ese caso se avisa en naranja y hay que confirmarlo a propósito.
export default function ModalMoverRendiciones({ ids: idsProp, proyectoActualId, onCerrar, onMovidas }) {
  // Se fija la lista al abrir: así no cambia (ni se recalcula) mientras el modal está abierto
  const [ids] = useState(() => [...idsProp]);
  const [proyectos, setProyectos] = useState([]);
  const [destino, setDestino] = useState('');
  const [aceptaCambio, setAceptaCambio] = useState(false);
  const [vista, setVista] = useState(null);
  const [error, setError] = useState('');
  const [moviendo, setMoviendo] = useState(false);

  useEffect(() => {
    get('/proyectos').then(lista => setProyectos([...lista].sort((a, b) =>
      `${a.cliente_nombre} ${a.nombre}`.localeCompare(`${b.cliente_nombre} ${b.nombre}`, 'es', { sensitivity: 'base' }))))
      .catch(err => setError(err.message));
  }, []);

  // Al elegir el destino se calcula cómo quedaría (sin cambiar nada)
  useEffect(() => {
    setError('');
    if (!destino) { setVista(null); return; }
    let vigente = true;
    const t = setTimeout(() => {
      post('/rendiciones/mover', { ids, proyecto_id: destino, simular: true })
        .then(r => { if (vigente) setVista(r); })
        .catch(err => { if (vigente) { setVista(null); setError(err.message); } });
    }, 100);
    return () => { vigente = false; clearTimeout(t); };
  }, [destino, ids]);

  const elegirDestino = (v) => { setAceptaCambio(false); setDestino(v); };

  const mover = async () => {
    setMoviendo(true); setError('');
    try {
      // Se mandan los números que se vieron en la vista previa: lo que se confirma es lo que se mostró
      const numeros = Object.fromEntries(vista.rendiciones.map(x => [x.id, x.numero]));
      const r = await post('/rendiciones/mover', { ids, proyecto_id: destino, numeros });
      onMovidas?.(r);
    } catch (err) { setError(err.message); }
    finally { setMoviendo(false); }
  };

  const n = ids.length;
  const cambianNumero = vista ? vista.rendiciones.filter(r => !r.conserva) : [];
  return (
    <Modal titulo={n === 1 ? 'Cambiar de proyecto' : `Cambiar de proyecto ${n} rendiciones`} onCerrar={onCerrar} ancho={560}>
      <AlertaError mensaje={error} onCerrar={() => setError('')} />
      <Campo label="Proyecto destino">
        <Select value={destino} onChange={e => elegirDestino(e.target.value)}>
          <option value="">Elegí el proyecto…</option>
          {proyectos.filter(p => String(p.id) !== String(proyectoActualId)).map(p => (
            <option key={p.id} value={p.id}>{p.cliente_nombre} - {p.nombre}</option>
          ))}
        </Select>
      </Campo>

      {vista && (
        <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: AZUL }}>
          <p style={{ margin: '0 0 6px' }}>Así quedan en <strong>{vista.proyecto.nombre}</strong>:</p>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {vista.rendiciones.map(r => (
              <li key={r.id} style={{ color: r.conserva ? undefined : '#8a4b00' }}>
                <strong>{r.antes}</strong> <span style={{ color: '#555' }}>de {r.proyecto_origen}</span> → <strong>{r.despues}</strong>
                {r.conserva ? <span style={{ color: '#1b5e20' }}> · mismo número</span> : <strong> · cambia de número</strong>}
              </li>
            ))}
          </ul>
          <p style={{ margin: '6px 0 0', color: '#555' }}>Los comprobantes van con cada rendición.</p>
        </div>
      )}

      {cambianNumero.length > 0 && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fff4e5', border: '1px solid #f0c78a', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#6b3a00', cursor: 'pointer' }}>
          <input type="checkbox" checked={aceptaCambio} onChange={e => setAceptaCambio(e.target.checked)} style={{ marginTop: 2, accentColor: '#b45309' }} />
          <span>
            {cambianNumero.length === 1 ? `${cambianNumero[0].antes} ya existe` : `${cambianNumero.map(r => r.antes).join(', ')} ya existen`} en {vista.proyecto.nombre},
            así que {cambianNumero.length === 1 ? 'pasaría a llamarse' : 'pasarían a llamarse'} <strong>{cambianNumero.map(r => r.despues).join(', ')}</strong>.
            Tildá para confirmar el cambio de número.
          </span>
        </label>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={mover} disabled={!vista || moviendo || (cambianNumero.length > 0 && !aceptaCambio)}>
          {moviendo ? 'Moviendo…' : n === 1 ? 'Mover rendición' : `Mover ${n} rendiciones`}
        </Boton>
      </div>
    </Modal>
  );
}
