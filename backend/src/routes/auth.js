const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { query } = require('../db');
const auth    = require('../middleware/auth');

const router = express.Router();

function generarAccessToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

function generarRefreshToken(usuario) {
  return jwt.sign(
    { id: usuario.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }
  try {
    const { rows } = await query(
      `SELECT u.id, u.nombre, u.email, u.password_hash, u.rol, u.activo,
              d.id AS dibujante_id, s.id AS socio_id
       FROM usuarios u
       LEFT JOIN dibujantes d ON d.usuario_id = u.id
       LEFT JOIN socios     s ON s.usuario_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );
    const usuario = rows[0];
    if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas' });
    if (!usuario.activo) return res.status(403).json({ error: 'Usuario desactivado.' });
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const accessToken  = generarAccessToken(usuario);
    const refreshToken = generarRefreshToken(usuario);
    await query(
      `INSERT INTO refresh_tokens (usuario_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [usuario.id, refreshToken]
    );
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });
    return res.json({
      accessToken,
      usuario: {
        id:           usuario.id,
        nombre:       usuario.nombre,
        email:        usuario.email,
        rol:          usuario.rol,
        dibujante_id: usuario.dibujante_id || null,
        socio_id:     usuario.socio_id     || null,
      },
    });
  } catch (err) {
    console.error('Error en /login:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) return res.status(401).json({ error: 'Sin refresh token' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { rows } = await query(
      `SELECT rt.id, u.id AS uid, u.nombre, u.email, u.rol, u.activo
       FROM refresh_tokens rt
       JOIN usuarios u ON u.id = rt.usuario_id
       WHERE rt.token = $1 AND rt.expires_at > NOW() AND rt.revocado = FALSE`,
      [refreshToken]
    );
    if (!rows[0]) return res.status(401).json({ error: 'Refresh token inválido o expirado' });
    const usuario = rows[0];
    if (!usuario.activo) return res.status(403).json({ error: 'Usuario desactivado' });
    const nuevoRefreshToken = generarRefreshToken(usuario);
    const nuevoAccessToken  = generarAccessToken(usuario);
    await query(`UPDATE refresh_tokens SET revocado = TRUE WHERE token = $1`, [refreshToken]);
    await query(
      `INSERT INTO refresh_tokens (usuario_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [usuario.uid, nuevoRefreshToken]
    );
    res.cookie('refresh_token', nuevoRefreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });
    return res.json({ accessToken: nuevoAccessToken });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token inválido' });
    }
    console.error('Error en /refresh:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.post('/logout', async (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken) {
    try {
      await query(`UPDATE refresh_tokens SET revocado = TRUE WHERE token = $1`, [refreshToken]);
    } catch (_) {}
  }
  res.clearCookie('refresh_token');
  return res.json({ mensaje: 'Sesión cerrada' });
});

router.get('/me', auth.verificar, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.nombre, u.email, u.rol,
              d.id AS dibujante_id,
              s.id AS socio_id, s.porcentaje_participacion
       FROM usuarios u
       LEFT JOIN dibujantes d ON d.usuario_id = u.id
       LEFT JOIN socios     s ON s.usuario_id = u.id
       WHERE u.id = $1`,
      [req.usuario.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('Error en /me:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});
// Ruta temporal para crear usuario admin — BORRAR DESPUÉS
router.post('/setup', async (req, res) => {
  const { nombre, email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET password_hash = $3
       RETURNING id, nombre, email, rol`,
      [nombre, email, hash]
    );
    await query(
      `INSERT INTO socios (usuario_id, nombre, porcentaje_participacion)
       VALUES ($1, $2, 33.34)
       ON CONFLICT DO NOTHING`,
      [rows[0].id, nombre]
    );
    res.json({ ok: true, usuario: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
