import { useState, useEffect } from 'react';
import { useIngresos } from '../../hooks/useIngresos';
import { useEgresos, useDestinatarios } from '../../hooks/useEgresos';
import { FormIngreso } from './Ingresos';
import { FormEgreso } from './Egresos';
import { get } from '../../lib/api';
import {
  EncabezadoSeccion, Boton, Tabla, Fila, Celda, Badge,
  Modal, Input, Select, AlertaError, Buscador,
} from '../../components/ui';

const AZUL = '#1a2744';

const CATEGORIAS_EGRESO = [
  { value: 'servicios',  label: 'Servicios' },
  { value: 'impuestos',  label: 'Impuestos' },
  { value: 'generales',  label: 'Gastos generales' },
  { value: 'dibujantes', label: 'Dibujantes' },
];
const CAT_COLORES = {
  servicios:  { bg: '#e3f2fd', color: '#0d47a1' },
  impuestos:  { bg: '#fff8e1', color: '#f57f17' },
  generales:  { bg: '#f3e5f5', color: '#4a148c' },
  dibujantes: { bg: '#e8f5e9', color: '#1b5e20' },
};

const fmt = (monto, moneda) =>
  moneda === 'USD'
    ? `U$S ${Number(monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$ ${Number(monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtF = (f) => {
  if (!f) return '—';
  const fecha = typeof f === 'string' ? f.split('T')[0] : f;
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR');
};

function BadgeCategoria({ cat }) {
  const c = CAT_COLORES[cat] || { bg: '#f5f5f5', color: '#333' };
  const label = CATEGORIAS_EGRESO.find(x => x.value === cat)?.label || cat;
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: c.bg, color: c.color }}>{label}</span>;
}

function TarjetasResumen({ vista, ingresos, egresos }) {
  const totIng = { ARS: 0, USD: 0 };
  const totEgr = { ARS: 0, USD: 0 };
  ingresos.forEach(i => { totIng[i.moneda] = (totIng[i.moneda] || 0) + Number(i.monto); });
  egresos.forEach(e => { totEgr[e.moneda] = (totEgr[e.moneda] || 0) + Number(e.monto); });

  const tarjetas = [];
  if (vista !== 'egresos') {
    tarjetas.push({ label: 'Ingresos ARS', valor: fmt(totIng.ARS, 'ARS'), color: '#1b5e20' });
    tarjetas.push({ label: 'Ingresos USD', valor: fmt(totIng.USD, 'USD'), color: '#0d47a1' });
  }
  if (vista !== 'ingresos') {
    tarjetas.push({ label: 'Egresos ARS', valor: fmt(totEgr.ARS, 'ARS'), color: '#b71c1c' });
    tarjetas.push({ label: 'Egresos USD', valor: fmt(totEgr.USD, 'USD'), color: '#880e4f' });
  }
  if (vista === 'todos') {
    tarjetas.push({ label: 'Resultado ARS', valor: fmt(totIng.ARS - totEgr.ARS, 'ARS'), color: totIng.ARS - totEgr.ARS >= 0 ? '#1b5e20' : '#b71c1c' });
    tarjetas.push({ label: 'Resultado USD', valor: fmt(totIng.USD - totEgr.USD, 'USD'), color: totIng.USD - totEgr.USD >= 0 ? '#0d47a1' : '#880e4f' });
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '28px' }}>
      {tarjetas.map(t => (
        <div key={t.label} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '16px 20px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.label}</p>
          <p style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: t.color }}>{t.valor}</p>
        </div>
      ))}
    </div>
  );
}

export default function MovimientosFinancieros() {
  const [vista, setVista] = useState('todos'); // 'todos' | 'ingresos' | 'egresos'
  const [filtros, setFiltros] = useState({ moneda: '', desde: '', hasta: '' });
  const [buscar, setBuscar] = useState('');
  const [modal, setModal] = useState(null); // 'crear-ingreso' | 'crear-egreso' | objeto a editar/eliminar
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');
  const [clientes, setClientes] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [socios, setSocios] = useState([]);

  useEffect(() => {
    Promise.all([get('/clientes'), get('/proyectos'), get('/socios')])
      .then(([c, p, s]) => { setClientes(c); setProyectos(p); setSocios(s); })
      .catch(() => {});
  }, []);

  const filtrosIngresos = { moneda: filtros.moneda, desde: filtros.desde, hasta: filtros.hasta };
  const filtrosEgresos  = { moneda: filtros.moneda, desde: filtros.desde, hasta: filtros.hasta };

  const { ingresos, cargando: cargandoIng, error: errorIng, crear: crearIngreso, actualizar: actualizarIngreso, eliminar: eliminarIngreso } = useIngresos(filtrosIngresos);
  const { egresos, cargando: cargandoEgr, error: errorEgr, crear: crearEgreso, actualizar: actualizarEgreso, eliminar: eliminarEgreso } = useEgresos(filtrosEgresos);
  const { destinatarios, crear: crearDestinatario } = useDestinatarios();

  const cargando = cargandoIng || cargandoEgr;
  const error = errorIng || errorEgr;

  // Combinar y filtrar según la vista elegida
  const movimientos = (() => {
    let combinados = [];
    if (vista !== 'egresos') combinados = combinados.concat(ingresos.map(i => ({ ...i, _tipo: 'ingreso' })));
    if (vista !== 'ingresos') combinados = combinados.concat(egresos.map(e => ({ ...e, _tipo: 'egreso' })));
    combinados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    if (buscar) {
      const b = buscar.toLowerCase();
      combinados = combinados.filter(m => {
        const nombre = m._tipo === 'ingreso' ? m.cliente_nombre : m.destinatario_nombre;
        return nombre?.toLowerCase().includes(b) || m.proyecto_nombre?.toLowerCase().includes(b);
      });
    }
    return combinados;
  })();

  const cerrarModal = () => { setModal(null); setErrorAccion(''); };

  const handleGuardarIngreso = async (datos) => {
    setGuardando(true);
    setErrorAccion('');
    try {
      if (modal === 'crear-ingreso') await crearIngreso(datos);
      else await actualizarIngreso(modal.id, datos);
      cerrarModal();
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleGuardarEgreso = async (datos) => {
    setGuardando(true);
    setErrorAccion('');
    try {
      if (modal === 'crear-egreso') await crearEgreso(datos);
      else await actualizarEgreso(modal.id, datos);
      cerrarModal();
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleEliminar = async () => {
    setEliminando(true);
    try {
      if (modal.movimiento._tipo === 'ingreso') await eliminarIngreso(modal.movimiento.id);
      else await eliminarEgreso(modal.movimiento.id);
      cerrarModal();
    } catch (err) { setErrorAccion(err.message); }
    finally { setEliminando(false); }
  };

  const setFiltro = (k) => (e) => setFiltros(p => ({ ...p, [k]: e.target.value }));

  const esEdicionIngreso = modal && typeof modal === 'object' && modal._tipo === 'ingreso' && !modal.eliminar;
  const esEdicionEgreso   = modal && typeof modal === 'object' && modal._tipo === 'egreso'  && !modal.eliminar;

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <EncabezadoSeccion
        titulo="Movimientos financieros"
        subtitulo={`${movimientos.length} registro${movimientos.length !== 1 ? 's' : ''}`}
        accion={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Boton variante="secundario" onClick={() => setModal('crear-ingreso')}>+ Ingreso</Boton>
            <Boton onClick={() => setModal('crear-egreso')}>+ Egreso</Boton>
          </div>
        }
      />

      {/* Selector de vista */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#f0f0f0', borderRadius: '10px', padding: '4px', width: 'fit-content' }}>
        {[{ id: 'todos', label: 'Todos' }, { id: 'ingresos', label: '↑ Ingresos' }, { id: 'egresos', label: '↓ Egresos' }].map(opt => (
          <button key={opt.id} onClick={() => setVista(opt.id)} style={{
            padding: '8px 18px', fontSize: '13px', borderRadius: '8px', border: 'none',
            background: vista === opt.id ? '#fff' : 'transparent',
            boxShadow: vista === opt.id ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
            color: vista === opt.id ? AZUL : '#666',
            fontWeight: vista === opt.id ? 600 : 400,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {opt.label}
          </button>
        ))}
      </div>

      <TarjetasResumen vista={vista} ingresos={ingresos} egresos={egresos} />

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Buscador value={buscar} onChange={setBuscar} placeholder="Buscar por cliente, destinatario, proyecto…" />
        <Select value={filtros.moneda} onChange={setFiltro('moneda')} style={{ width: 'auto' }}>
          <option value="">Todas las monedas</option>
          <option value="ARS">$ ARS</option>
          <option value="USD">U$S USD</option>
        </Select>
        <Input type="date" value={filtros.desde} onChange={setFiltro('desde')} style={{ width: 'auto' }} title="Desde" />
        <Input type="date" value={filtros.hasta} onChange={setFiltro('hasta')} style={{ width: 'auto' }} title="Hasta" />
        {Object.values(filtros).some(Boolean) && (
          <Boton variante="texto" onClick={() => setFiltros({ moneda: '', desde: '', hasta: '' })}>Limpiar filtros</Boton>
        )}
      </div>

      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />

      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Cargando…</p>
      : error ? <AlertaError mensaje={error} />
      : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', overflow: 'hidden' }}>
          <Tabla
            columnas={['Fecha', 'Tipo', 'Cliente / Destinatario', 'Proyecto', 'Monto', 'Detalle', 'Comprobante', '']}
            datos={movimientos}
            vacio="No hay movimientos para los filtros seleccionados."
            renderFila={(m) => (
              <Fila key={`${m._tipo}-${m.id}`}>
                <Celda style={{ whiteSpace: 'nowrap', color: '#666', fontSize: '13px' }}>{fmtF(m.fecha)}</Celda>
                <Celda>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    background: m._tipo === 'ingreso' ? '#e8f5e9' : '#fce4ec',
                    color: m._tipo === 'ingreso' ? '#1b5e20' : '#b71c1c',
                    borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: 500,
                  }}>
                    {m._tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                  </span>
                </Celda>
                <Celda><span style={{ fontWeight: 500 }}>{m._tipo === 'ingreso' ? m.cliente_nombre : m.destinatario_nombre}</span></Celda>
                <Celda style={{ color: '#666', fontSize: '13px' }}>{m.proyecto_nombre || '—'}</Celda>
                <Celda>
                  <span style={{ fontWeight: 600, color: m._tipo === 'ingreso' ? '#1b5e20' : '#b71c1c' }}>
                    {m._tipo === 'ingreso' ? '+' : '−'} {fmt(m.monto, m.moneda)}
                  </span>
                </Celda>
                <Celda style={{ fontSize: '13px' }}>
                  {m._tipo === 'ingreso' ? <Badge estado={m.tipo} /> : <BadgeCategoria cat={m.categoria} />}
                </Celda>
                <Celda style={{ fontSize: '13px', color: '#999', fontFamily: 'monospace' }}>{m.comprobante || '—'}</Celda>
                <Celda align="right">
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    <Boton variante="secundario" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setModal(m)}>Editar</Boton>
                    <Boton variante="peligro" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setModal({ movimiento: m, eliminar: true })}>✕</Boton>
                  </div>
                </Celda>
              </Fila>
            )}
          />
        </div>
      )}

      {/* Crear ingreso */}
      {modal === 'crear-ingreso' && (
        <Modal titulo="Nuevo ingreso" onCerrar={cerrarModal} ancho={660}>
          <FormIngreso inicial={{}} clientes={clientes} proyectos={proyectos} socios={socios}
            onGuardar={handleGuardarIngreso} onCancelar={cerrarModal} guardando={guardando} errorServidor={errorAccion} />
        </Modal>
      )}

      {/* Crear egreso */}
      {modal === 'crear-egreso' && (
        <Modal titulo="Nuevo egreso" onCerrar={cerrarModal} ancho={680}>
          <FormEgreso inicial={{}} proyectos={proyectos} socios={socios} destinatarios={destinatarios}
            onNuevoDestinatario={crearDestinatario} onGuardar={handleGuardarEgreso} onCancelar={cerrarModal}
            guardando={guardando} errorServidor={errorAccion} />
        </Modal>
      )}

      {/* Editar ingreso */}
      {esEdicionIngreso && (
        <Modal titulo={`Editar ingreso — ${fmtF(modal.fecha)}`} onCerrar={cerrarModal} ancho={660}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormIngreso inicial={modal} clientes={clientes} proyectos={proyectos} socios={socios}
            onGuardar={handleGuardarIngreso} onCancelar={cerrarModal} guardando={guardando} errorServidor={errorAccion} />
        </Modal>
      )}

      {/* Editar egreso */}
      {esEdicionEgreso && (
        <Modal titulo={`Editar egreso — ${fmtF(modal.fecha)}`} onCerrar={cerrarModal} ancho={680}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormEgreso inicial={modal} proyectos={proyectos} socios={socios} destinatarios={destinatarios}
            onNuevoDestinatario={crearDestinatario} onGuardar={handleGuardarEgreso} onCancelar={cerrarModal}
            guardando={guardando} errorServidor={errorAccion} />
        </Modal>
      )}

      {/* Eliminar */}
      {modal?.eliminar && (
        <Modal titulo={`Eliminar ${modal.movimiento._tipo === 'ingreso' ? 'ingreso' : 'egreso'}`} onCerrar={cerrarModal} ancho={440}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <p style={{ fontSize: '14px', marginBottom: '8px' }}>
            ¿Eliminar este {modal.movimiento._tipo === 'ingreso' ? 'ingreso' : 'egreso'}?
          </p>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
            <strong>{fmt(modal.movimiento.monto, modal.movimiento.moneda)}</strong> —{' '}
            {modal.movimiento._tipo === 'ingreso' ? modal.movimiento.cliente_nombre : modal.movimiento.destinatario_nombre} —{' '}
            {fmtF(modal.movimiento.fecha)}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Boton variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
            <Boton variante="peligro" onClick={handleEliminar} disabled={eliminando}>
              {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
            </Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
