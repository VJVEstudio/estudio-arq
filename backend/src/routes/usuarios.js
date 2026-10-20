// Usuarios de la app: alta de administradores, cambio de contraseña y activación.
// Los dibujantes se crean desde la pantalla Dibujantes (llevan tarifa y perfil propio);
// acá se listan para tener la vista completa, pero solo se les puede cambiar la contraseña.
const express = require('express');
const bcrypt  = require('bcryptjs');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth.verificar, auth.soloAdmin);

const MIN_PASSWORD = 8;
const emailValido = (e) => /^\S+@\S+\.\S+$/.test((e || '').trim());
const normalizarEmail = (e) => e.toLowerCase().trim();
// Express 4 no captura errores de funciones async: los pasa al manejador de errores
const envolver = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', envolver(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.rol, u.activo,
            (s.id IS NOT NULL) AS es_socio,
            (d.id IS NOT NULL) AS es_dibujante
     FROM usuarios u
     LEFT JOIN socios     s ON s.usuario_id = u.id
     LEFT JOIN dibujantes d ON d.usuario_id = u.id
     ORDER BY u.activo DESC, (u.rol = 'admin') DESC, u.nombre ASC`
  );
  res.json(rows.map(u => ({ ...u, es_yo: u.id === req.usuario.id })));
}));

// Alta de administrador
router.post('/', envolver(async (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre?.trim())                       return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (!emailValido(email))                   return res.status(400).json({ error: 'El email no es válido' });
  if (!password || password.length < MIN_PASSWORD)
    return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` });

  const { rows: existe } = await query(`SELECT id FROM usuarios WHERE email = $1`, [normalizarEmail(email)]);
  if (existe.length) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol)
     VALUES ($1, $2, $3, 'admin')
     RETURNING id, nombre, email, rol, activo`,
    [nombre.trim(), normalizarEmail(email), hash]
  );
  res.status(201).json(rows[0]);
}));

// Editar nombre y email (solo administradores; los dibujantes se editan en su pantalla)
router.put('/:id', envolver(async (req, res) => {
  const { nombre, email } = req.body;
  if (!nombre?.trim())     return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (!emailValido(email)) return res.status(400).json({ error: 'El email no es válido' });

  const { rows: [u] } = await query(`SELECT id, rol FROM usuarios WHERE id = $1`, [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (u.rol !== 'admin') return res.status(400).json({ error: 'Los dibujantes se editan desde la pantalla Dibujantes' });

  const { rows: repetido } = await query(
    `SELECT id FROM usuarios WHERE email = $1 AND id <> $2`, [normalizarEmail(email), req.params.id]
  );
  if (repetido.length) return res.status(409).json({ error: 'Ya existe otro usuario con ese email' });

  const { rows } = await query(
    `UPDATE usuarios SET nombre = $1, email = $2 WHERE id = $3
     RETURNING id, nombre, email, rol, activo`,
    [nombre.trim(), normalizarEmail(email), req.params.id]
  );
  res.json(rows[0]);
}));

// Nueva contraseña (para cualquier usuario). Cierra sus sesiones abiertas.
router.put('/:id/password', envolver(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < MIN_PASSWORD)
    return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` });
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await query(
    `UPDATE usuarios SET password_hash = $1 WHERE id = $2 RETURNING id`, [hash, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  await query(`UPDATE refresh_tokens SET revocado = TRUE WHERE usuario_id = $1 AND revocado = FALSE`, [req.params.id]);
  res.json({ ok: true });
}));

// Activar / desactivar administradores. No se puede desactivar uno mismo ni dejar
// la app sin ningún administrador activo.
router.patch('/:id/activo', async (req, res) => {
  const activo = Boolean(req.body.activo);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [u] } = await client.query(
      `SELECT id, rol FROM usuarios WHERE id = $1 FOR UPDATE`, [req.params.id]
    );
    if (!u) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Usuario no encontrado' }); }
    if (u.rol !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Los dibujantes se activan o desactivan desde la pantalla Dibujantes' });
    }
    if (!activo) {
      if (u.id === req.usuario.id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No podés desactivar tu propio usuario' });
      }
      const { rows: [{ n }] } = await client.query(
        `SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'admin' AND activo = TRUE AND id <> $1`, [u.id]
      );
      if (n === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Tiene que quedar al menos un administrador activo' });
      }
    }
    const { rows } = await client.query(
      `UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING id, nombre, email, rol, activo`, [activo, u.id]
    );
    if (!activo) {
      await client.query(`UPDATE refresh_tokens SET revocado = TRUE WHERE usuario_id = $1 AND revocado = FALSE`, [u.id]);
    }
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error cambiando estado de usuario:', err);
    res.status(500).json({ error: 'Error al cambiar el estado del usuario' });
  } finally {
    client.release();
  }
});

module.exports = router;
