const jwt = require('jsonwebtoken');

function verificar(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
  next();
}

function soloDibujante(req, res, next) {
  if (req.usuario?.rol !== 'dibujante') {
    return res.status(403).json({ error: 'Acceso restringido a dibujantes' });
  }
  next();
}

async function configurarRLS(req, res, next) {
  const { query } = require('../db');
  try {
    await query(`SET LOCAL app.rol_usuario = $1`, [req.usuario.rol]);
    await query(`SET LOCAL app.usuario_id = $1`, [req.usuario.id]);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { verificar, soloAdmin, soloDibujante, configurarRLS };
