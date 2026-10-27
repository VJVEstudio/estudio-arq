// Notificaciones push al celular (o la computadora) de cada usuario.
// Usa el estándar Web Push: no hace falta contratar nada. Las claves del servidor
// (VAPID) se generan solas la primera vez y quedan guardadas en la base, así no hay
// que configurar variables en Render. Si existen VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
// en el entorno, se usan esas.
const webpush = require('web-push');
const { query } = require('../db');

let claves = null;
async function obtenerClaves() {
  if (claves) return claves;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    claves = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const { rows } = await query(`SELECT valor FROM seg_config WHERE clave = 'vapid'`);
    if (rows[0]) {
      claves = JSON.parse(rows[0].valor);
    } else {
      const nuevas = webpush.generateVAPIDKeys();
      // Si dos procesos las generan a la vez, gana la primera que se guardó
      await query(`INSERT INTO seg_config (clave, valor) VALUES ('vapid', $1) ON CONFLICT (clave) DO NOTHING`, [JSON.stringify(nuevas)]);
      const { rows: [r] } = await query(`SELECT valor FROM seg_config WHERE clave = 'vapid'`);
      claves = JSON.parse(r.valor);
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:administrativo@vjvarq.com', claves.publicKey, claves.privateKey);
  return claves;
}

async function clavePublica() {
  return (await obtenerClaves()).publicKey;
}

// Envía `datos` ({ title, body, url, tag }) a todos los dispositivos de esos usuarios.
// Nunca tira error: un aviso que no sale no debe romper nada.
async function enviarA(usuarioIds, datos) {
  try {
    const ids = [...new Set((usuarioIds || []).map(String))];
    if (!ids.length) return;
    await obtenerClaves();
    const { rows } = await query(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth, ps.usuario_id, u.rol
       FROM seg_push ps JOIN usuarios u ON u.id = ps.usuario_id
       WHERE ps.usuario_id::text = ANY($1::text[]) AND u.activo = TRUE`, [ids]);
    await Promise.all(rows.map(async (s) => {
      const carga = typeof datos === 'function' ? datos(s) : datos;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(carga),
          { TTL: 60 * 60 * 24, urgency: 'high' }
        );
      } catch (err) {
        // 404/410: el dispositivo dio de baja la suscripción (desinstaló, bloqueó avisos…)
        if (err.statusCode === 404 || err.statusCode === 410) {
          await query(`DELETE FROM seg_push WHERE id = $1`, [s.id]).catch(() => {});
        } else {
          console.error('Push no enviado:', err.statusCode || '', err.body || err.message);
        }
      }
    }));
  } catch (err) {
    console.error('Error enviando avisos push:', err.message);
  }
}

module.exports = { clavePublica, enviarA };
