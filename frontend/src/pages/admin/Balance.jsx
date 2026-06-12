import { useState, useEffect, useCallback } from 'react';
import { get, post, del } from '../../lib/api';
import {
  EncabezadoSeccion, Boton, Modal, Campo,
  Input, Select, Textarea, AlertaError,
} from '../../components/ui';

const AZUL = '#1a2744';
const fmt = (monto, moneda) =>
  moneda === 'USD'
    ? `U$S ${Math.abs(Number(monto)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
    : `$ ${Math.abs(Number(monto)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
const fmtF = (f) => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-AR') : '—';
const signoColor = (n) => Number(n) > 0 ? '#1b5e20' : Number(n) < 0 ? '#b71c1c' : '#666';

function TarjetaSocio({ socio }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '14px', overflow: 'hidden', flex: '1 1 220px' }}>
      <div style={{ background: AZUL, padding: '14px 18px' }}>
        <p style={{ margin: 0, fontSize: '16px', fontWeight: 500, color: 'white' }}>{socio.nombre}</p>
        <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>{socio.porcentaje_participacion}% de participación</p>
      </div>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {[{ label: 'Saldo ARS', saldo: socio.saldo_ARS, moneda: 'ARS' }, { label: 'Saldo USD', saldo: socio.saldo_USD, moneda: 'USD' }].map(({ label, saldo, moneda }) => (
          <div key={moneda}>
            <p style={{ margin: '0 0 4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#999' }}>{label}</p>
            <p style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: signoColor(saldo) }}>
              {Number(saldo) >= 0 ? '+' : '-'} {fmt(saldo, moneda)}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#666' }}>{Number(saldo) >= 0 ? 'le deben' : 'debe'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelTransferencias({ transferencias, onLiquidar }) {
  if (!transferencias.length) {
    return (
      <div style={{ background: '#e8f5e9', borderRadius: '12px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>✓</span>
        <div>
          <p style={{ margin: 0, fontWeight: 500, color: '#1b5e20' }}>¡Todo está saldado!</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#2e7d32' }}>No hay deudas pendientes entre los socios.</p>
        </div>
      </div>
    );
  }
  const porMoneda = { ARS: [], USD: [] };
  transferencias.forEach(t => porMoneda[t.moneda].push(t));
  return (
    <div>
      <p style={{ fontWeight: 500, fontSize: '15px', margin: '0 0 14px' }}>Para saldar todas las cuentas se necesitan estas transferencias:</p>
      {['ARS', 'USD'].map(moneda => {
        const lista = porMoneda[moneda];
        if (!lista.length) return null;
        return (
          <div key={moneda} style={{ marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#666', margin: '0 0 8px' }}>
              {moneda === 'ARS' ? '$ Pesos argentinos' : 'U$S Dólares'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {lista.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '12px 16px', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ background: '#fce4ec', color: '#b71c1c', borderRadius: '20px', padding: '3px 12px', fontSize: '13px', fontWeight: 500 }}>{t.de.nombre}</span>
                    <span style={{ color: '#999', fontSize: '16px' }}>→</span>
                    <span style={{ background: '#e8f5e9', color: '#1b5e20', borderRadius: '20px', padding: '3px 12px', fontSize: '13px', fontWeight: 500 }}>{t.para.nombre}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontWeight: 700, fontSize: '16px', color: AZUL }}>{fmt(t.monto, moneda)}</span>
                    <Boton style={{ padding: '5px 14px', fontSize: '13px' }} onClick={() => onLiquidar(t)}>Registrar pago</Boton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistorialLiquidaciones({ liquidaciones, onEliminar }) {
  if (!liquidaciones.length) return <p style={{ color: '#999', fontSize: '14px' }}>No hay liquidaciones registradas aún.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
      <thead>
        <tr>
          {['Fecha', 'De', 'Para', 'Monto', 'Descripción', ''].map(h => (
            <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '12px', color: '#666', borderBottom: '1px solid #e0e0e0', fontWeight: 500 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {liquidaciones.map(l => (
          <tr key={l.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
            <td style={{ padding: '10px 12px', color: '#666', whiteSpace: 'nowrap' }}>{fmtF(l.fecha)}</td>
            <td style={{ padding: '10px 12px' }}><span style={{ background: '#fce4ec', color: '#b71c1c', borderRadius: '20px', padding: '2px 10px', fontSize: '12px' }}>{l.socio_pagador_nombre}</span></td>
            <td style={{ padding: '10px 12px' }}><span style={{ background: '#e8f5e9', color: '#1b5e20', borderRadius: '20px', padding: '2px 10px', fontSize: '12px' }}>{l.socio_receptor_nombre}</span></td>
            <td style={{ padding: '10px 12px', fontWeight: 600 }}>{fmt(l.monto, l.moneda)} <span style={{ fontSize: '11px', color: '#999' }}>{l.moneda}</span></td>
            <td style={{ padding: '10px 12px', color: '#666', fontSize: '13px' }}>{l.descripcion || '—'}</td>
            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
              <Boton variante="texto" style={{ color: '#b91c1c', fontSize: '13px' }} onClick={() => onEliminar(l)}>✕ Revertir</Boton>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FormLiquidacion({ inicial = {}, socios, onGuardar, onCancelar, guardando }) {
  const [form, setForm] = useState({
    socio_pagador_id:  inicial.de?.id   || '',
    socio_receptor_id: inicial.para?.id || '',
    monto:             inicial.monto    || '',
    moneda:            inicial.moneda   || 'ARS',
    fecha:             new Date().toISOString().split('T')[0],
    descripcion:       '',
  });
  const [errores, setErrores] = useState({});
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const validar = () => {
    const errs = {};
    if (!form.socio_pagador_id)  errs.pagador  = 'Seleccioná el socio que paga';
    if (!form.socio_receptor_id) errs.receptor = 'Seleccioná el socio que recibe';
    if (form.socio_pagador_id === form.socio_receptor_id) errs.receptor = 'Deben ser socios distintos';
    if (!form.monto || Number(form.monto) <= 0) errs.monto = 'El monto debe ser mayor a 0';
    setErrores(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validar()) return;
    onGuardar({ ...form, monto: Number(form.monto) });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {form.socio_pagador_id && form.socio_receptor_id && form.monto > 0 && (
        <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ background: '#fce4ec', color: '#b71c1c', borderRadius: '20px', padding: '3px 12px', fontSize: '13px', fontWeight: 500 }}>{socios.find(s => s.id === form.socio_pagador_id)?.nombre}</span>
          <span style={{ color: '#666' }}>le transfiere</span>
          <span style={{ fontWeight: 700, color: AZUL }}>{fmt(form.monto, form.moneda)}</span>
          <span style={{ color: '#666' }}>a</span>
          <span style={{ background: '#e8f5e9', color: '#1b5e20', borderRadius: '20px', padding: '3px 12px', fontSize: '13px', fontWeight: 500 }}>{socios.find(s => s.id === form.socio_receptor_id)?.nombre}</span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <Campo label="Socio que paga *" error={errores.pagador}>
          <Select value={form.socio_pagador_id} onChange={set('socio_pagador_id')}>
            <option value="">Seleccioná…</option>
            {socios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Select>
        </Campo>
        <Campo label="Socio que recibe *" error={errores.receptor}>
          <Select value={form.socio_receptor_id} onChange={set('socio_receptor_id')}>
            <option value="">Seleccioná…</option>
            {socios.filter(s => s.id !== form.socio_pagador_id).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Select>
        </Campo>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
        <Campo label="Monto *" error={errores.monto}>
          <Input type="number" min="0" step="0.01" value={form.monto} onChange={set('monto')} placeholder="0.00" />
        </Campo>
        <Campo label="Moneda">
          <Select value={form.moneda} onChange={set('moneda')}>
            <option value="ARS">$ ARS</option>
            <option value="USD">U$S USD</option>
          </Select>
        </Campo>
        <Campo label="Fecha">
          <Input type="date" value={form.fecha} onChange={set('fecha')} />
        </Campo>
      </div>
      <Campo label="Descripción (opcional)">
        <Textarea value={form.descripcion} onChange={set('descripcion')} placeholder="Ej: Transferencia bancaria — saldo julio" rows={2} />
      </Campo>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        <Boton type="submit" disabled={guardando}>{guardando ? 'Registrando…' : 'Registrar liquidación'}</Boton>
      </div>
    </form>
  );
}

export default function Balance() {
  const [datos,         setDatos]         = useState(null);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [cargando,      setCargando]      = useState(true);
  const [error,         setError]         = useState(null);
  const [modal,         setModal]         = useState(null);
  const [confirmElim,   setConfirmElim]   = useState(null);
  const [guardando,     setGuardando]     = useState(false);
  const [eliminando,    setEliminando]    = useState(false);
  const [errorAccion,   setErrorAccion]   = useState('');
  const [tabActiva,     setTabActiva]     = useState('balance');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [bal, liq] = await Promise.all([get('/balance'), get('/balance/liquidaciones')]);
      setDatos(bal);
      setLiquidaciones(liq);
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cerrarModal = () => { setModal(null); setErrorAccion(''); };

  const handleGuardar = async (datos) => {
    setGuardando(true);
    setErrorAccion('');
    try {
      const nueva = await post('/balance/liquidaciones', datos);
      setLiquidaciones(prev => [nueva, ...prev]);
      await cargar();
      cerrarModal();
    } catch (err) { setErrorAccion(err.message); }
    finally { setGuardando(false); }
  };

  const handleEliminar = async () => {
    setEliminando(true);
    try {
      await del(`/balance/liquidaciones/${confirmElim.id}`);
      setLiquidaciones(prev => prev.filter(l => l.id !== confirmElim.id));
      await cargar();
      setConfirmElim(null);
    } catch (err) { setErrorAccion(err.message); }
    finally { setEliminando(false); }
  };

  const TABS = [
    { id: 'balance',   label: 'Balance actual' },
    { id: 'historial', label: `Historial (${liquidaciones.length})` },
  ];

  return (
    <div style={{ padding: '32px', maxWidth: '1100px' }}>
      <EncabezadoSeccion
        titulo="Balance entre socios"
        subtitulo="Estado de cuentas en tiempo real · ARS y USD por separado"
        accion={<Boton onClick={() => setModal('manual')}>+ Registrar liquidación</Boton>}
      />
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #e0e0e0', marginBottom: '28px' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTabActiva(t.id)} style={{
            padding: '8px 18px', border: 'none', background: 'none',
            borderBottom: tabActiva === t.id ? `2px solid ${AZUL}` : '2px solid transparent',
            color: tabActiva === t.id ? AZUL : '#666',
            fontWeight: tabActiva === t.id ? 500 : 400,
            cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </div>
      <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
      {cargando ? <p style={{ color: '#666', fontSize: '14px' }}>Calculando balance…</p>
      : error ? <AlertaError mensaje={error} />
      : tabActiva === 'balance' ? (
        <>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
            {datos?.socios?.map(s => <TarjetaSocio key={s.id} socio={s} />)}
          </div>
          <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '24px' }}>
            <PanelTransferencias transferencias={datos?.transferencias || []} onLiquidar={(t) => setModal(t)} />
          </div>
        </>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '24px' }}>
          <HistorialLiquidaciones liquidaciones={liquidaciones} onEliminar={setConfirmElim} />
        </div>
      )}
      {modal && modal !== 'manual' && (
        <Modal titulo="Registrar pago" onCerrar={cerrarModal} ancho={520}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormLiquidacion inicial={modal} socios={datos?.socios || []} onGuardar={handleGuardar} onCancelar={cerrarModal} guardando={guardando} />
        </Modal>
      )}
      {modal === 'manual' && (
        <Modal titulo="Nueva liquidación" onCerrar={cerrarModal} ancho={520}>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <FormLiquidacion inicial={{}} socios={datos?.socios || []} onGuardar={handleGuardar} onCancelar={cerrarModal} guardando={guardando} />
        </Modal>
      )}
      {confirmElim && (
        <Modal titulo="Revertir liquidación" onCerrar={() => setConfirmElim(null)} ancho={440}>
          <p style={{ fontSize: '14px', marginBottom: '8px' }}>¿Revertís esta liquidación?</p>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>
            <strong>{confirmElim.socio_pagador_nombre}</strong> → <strong>{confirmElim.socio_receptor_nombre}</strong> — {fmt(confirmElim.monto, confirmElim.moneda)} {confirmElim.moneda} — {fmtF(confirmElim.fecha)}
          </p>
          <AlertaError mensaje={errorAccion} onCerrar={() => setErrorAccion('')} />
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Boton variante="secundario" onClick={() => setConfirmElim(null)}>Cancelar</Boton>
            <Boton variante="peligro" onClick={handleEliminar} disabled={eliminando}>{eliminando ? 'Revirtiendo…' : 'Sí, revertir'}</Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
