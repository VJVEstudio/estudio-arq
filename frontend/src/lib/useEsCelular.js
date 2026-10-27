import { useState, useEffect } from 'react';

// true en pantallas angostas (celular). Se actualiza si se gira o cambia el tamaño.
export const ANCHO_CELULAR = 760;
export function useEsCelular() {
  const consulta = `(max-width: ${ANCHO_CELULAR}px)`;
  const [es, setEs] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const cambio = () => setEs(mq.matches);
    mq.addEventListener('change', cambio);
    return () => mq.removeEventListener('change', cambio);
  }, [consulta]);
  return es;
}
