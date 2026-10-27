// Avisos push en este dispositivo (celular o computadora).
import { get, post } from './api';

export const soportaPush = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const esIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ¿Se abrió como app instalada (desde el ícono de la pantalla de inicio)?
export const esAppInstalada = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

function claveABytes(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

async function suscripcionActual() {
  if (!soportaPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// Estado para mostrar en pantalla:
// 'ios-instalar' (iPhone sin instalar: no puede recibir avisos), 'no-soportado',
// 'bloqueado' (el usuario los rechazó en el navegador), 'activo', 'inactivo'
export async function estadoPush() {
  if (esIOS() && !esAppInstalada()) return 'ios-instalar';
  if (!soportaPush()) return 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  if (Notification.permission === 'granted' && await suscripcionActual()) return 'activo';
  return 'inactivo';
}

export async function activarPush() {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error(permiso === 'denied'
    ? 'Los avisos están bloqueados para esta app. Habilitalos en la configuración del navegador.'
    : 'No se activaron los avisos.');
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { clave } = await get('/seguimiento/push/clave');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clave) });
  }
  await post('/seguimiento/push/suscribir', { suscripcion: sub.toJSON() });
}

export async function desactivarPush() {
  const sub = await suscripcionActual();
  if (!sub) return;
  await post('/seguimiento/push/desuscribir', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// Al ingresar: si este dispositivo ya tenía avisos, quedan a nombre del usuario que entró
export async function sincronizarPush() {
  try {
    if (!soportaPush() || Notification.permission !== 'granted') return;
    const sub = await suscripcionActual();
    if (sub) await post('/seguimiento/push/suscribir', { suscripcion: sub.toJSON() });
  } catch { /* sin conexión: se reintenta en el próximo ingreso */ }
}

// Al salir: el servidor deja de mandar avisos de ese usuario a este dispositivo
// (la suscripción del navegador queda, para reactivarla sola al volver a ingresar)
export async function olvidarPushEnServidor() {
  try {
    const sub = await suscripcionActual();
    if (sub) await post('/seguimiento/push/desuscribir', { endpoint: sub.endpoint });
  } catch { /* nada */ }
}

export const probarPush = () => post('/seguimiento/push/probar', {});
