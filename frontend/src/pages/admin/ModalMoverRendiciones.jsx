import { useState, useEffect } from 'react';
import { get, post } from '../../lib/api';
import { Modal, Boton, Campo, Select, AlertaError } from '../../components/ui';

const AZUL = '#1a2744';

// Pasa una o varias rendiciones a otro proyecto. Antes de confirmar muestra cómo
// queda la numeración (cada una toma el número siguiente de su tipo en el destino).
export default function ModalMoverRendiciones({ ids: idsProp, proyectoActualId, onCerrar, onMovidas }) {
  // Se fija la lista al abrir: así no cambia (ni se recalcula) mientras el modal está abierto
  const [ids] = useState(() => [...idsProp]);
  const [proyectos, setProyectos] = useState([]);
  const [destino, setDestino] = useState('');
  const [vista, setVista] = useState(null);
  const [error, setError] = useState('');
  const [moviendo, setMoviendo] = useState(false);

  useEffect(() => {
    get('/proyectos').then(lista => setProyectos([...lista].sort((a, b) =>
      `${a.cliente_nombre} ${a.nombre}`.localeCompare(`${b.cliente_nombre} ${b.nombre}`, 'es', { sensitivity: 'base' }))))
      .catch(err => setError(err.message));
  }, []);

  // Al elegir el destino, se calcula cómo quedaría (sin cambiar nada todavía)
  useEffect(() => {
    setVista(null); setError('');
    if (!destino) return;
    let vigente = true;
    post('/rendiciones/mover', { ids, proyecto_id: destino, simular: true })
      .then(r => { if (vigente) setVista(r); })
      .catch(err => { if (vigente) setError(err.message); });
    return () => { vigente = false; };
  }, [destino, ids]);

  const mover = async () => {
    setMoviendo(true); setError('');
    try {
      const r = await post('/rendiciones/mover', { ids, proyecto_id: destino });
      onMovidas?.(r);
    } catch (err) { setError(err.message); }
    finally { setMoviendo(false); }
  };

  const n = ids.length;
  return (
    <Modal titulo={n === 1 ? 'Cambiar de proyecto' : `Cambiar de proyecto ${n} rendiciones`} onCerrar={onCerrar} ancho={540}>
      <AlertaError mensaje={error} onCerrar={() => setError('')} />
      <Campo label="Proyecto destino">
        <Select value={destino} onChange={e => setDestino(e.target.value)}>
          <option value="">Elegí el proyecto…</option>
          {proyectos.filter(p => String(p.id) !== String(proyectoActualId)).map(p => (
            <option key={p.id} value={p.id}>{p.cliente_nombre} - {p.nombre}</option>
          ))}
        </Select>
      </Campo>

      {vista && (
        <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: AZUL }}>
          <p style={{ margin: '0 0 6px' }}>Así quedan en <strong>{vista.proyecto.nombre}</strong> (toman el número siguiente de su tipo):</p>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {vista.rendiciones.map(r => (
              <li key={r.id}>
                <strong>{r.antes}</strong> <span style={{ color: '#555' }}>de {r.proyecto_origen}</span> → <strong>{r.despues}</strong>
              </li>
            ))}
          </ul>
          <p style={{ margin: '6px 0 0', color: '#555' }}>Los comprobantes van con cada rendición. En el proyecto de origen queda el hueco en la numeración.</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton onClick={mover} disabled={!vista || moviendo}>
          {moviendo ? 'Moviendo…' : n === 1 ? 'Mover rendición' : `Mover ${n} rendiciones`}
        </Boton>
      </div>
    </Modal>
  );
}
