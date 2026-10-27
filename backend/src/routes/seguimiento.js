// Seguimiento de proyectos: grupo (mensajes con fotos y menciones), tareas, equipo,
// etapa e historial de cada proyecto, más las notificaciones de menciones.
// Lo usan administradores y dibujantes por igual; la única diferencia es que un
// administrador puede editar o borrar mensajes de otros y ve el registro de esos cambios.
const express = require('express');
const multer = require('multer');
const { query, pool } = require('../db');
const auth = require('../middleware/auth');
const { subirArchivo } = require('../utils/supabaseStorage');
const push = require('../utils/push');

const router = express.Router();
router.use(auth.verificar);

const ETAPAS = ['Master plan', 'Anteproyecto', 'Proyecto', 'Proyecto ejecutivo', 'Gestiones administrativas', 'Licitación', 'Obra'];
const ROLES = ['Project manager', 'Senior PM', 'Dibujante', 'Colaborador'];
// Archivos que se pueden adjuntar en el grupo. Se valida por extensión porque Word,
// Excel y sobre todo DWG llegan con tipos MIME distintos según la computadora.
const EXTENSIONES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  dwg: 'image/vnd.dwg',
};
const MAX_MB = 25;
const extension = (nombre) => String(nombre || '').split('.').pop().toLowerCase();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 6 } });
// Recibe los archivos y, si algo no entra (tamaño, cantidad), contesta con un mensaje claro
const recibirArchivos = (req, res, next) => upload.array('archivos', 6)(req, res, (err) => {
  if (!err) return next();
  const msg = err.code === 'LIMIT_FILE_SIZE' ? `Cada archivo puede pesar hasta ${MAX_MB} MB`
    : (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') ? 'Se pueden adjuntar hasta 6 archivos por mensaje'
    : 'No se pudo recibir el archivo';
  res.status(400).json({ error: msg });
});

// Express 4 no captura errores de funciones async: los pasa al manejador de errores
const envolver = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const esAdmin = (req) => req.usuario.rol === 'admin';
const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0].toLowerCase();

// ── Tablas: se crean solas la primera vez (como las del banco) ─────────────────
let esquemaListo = null;
function asegurarEsquema() {
  if (!esquemaListo) {
    esquemaListo = (async () => {
      const { rows } = await query(
        `SELECT table_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name IN ('proyectos','usuarios') AND column_name = 'id'`
      );
      const tipo = (t) => (rows.find(r => r.table_name === t)?.data_type === 'uuid' ? 'UUID' : 'INTEGER');
      const P = tipo('proyectos');
      const U = tipo('usuarios');
      await query(`
        CREATE TABLE IF NOT EXISTS seg_proyectos (
          proyecto_id ${P} PRIMARY KEY REFERENCES proyectos(id) ON DELETE CASCADE,
          etapa       INTEGER NOT NULL DEFAULT 0,
          updated_at  TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS seg_equipo (
          proyecto_id ${P} NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
          usuario_id  ${U} NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          rol         TEXT NOT NULL,
          encargo     TEXT,
          created_at  TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (proyecto_id, usuario_id)
        );
        CREATE TABLE IF NOT EXISTS seg_mensajes (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          proyecto_id ${P} NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
          usuario_id  ${U} NOT NULL REFERENCES usuarios(id),
          texto       TEXT,
          decision    BOOLEAN NOT NULL DEFAULT FALSE,
          todos       BOOLEAN NOT NULL DEFAULT FALSE,
          created_at  TIMESTAMPTZ DEFAULT NOW(),
          editado_at  TIMESTAMPTZ,
          editado_por ${U} REFERENCES usuarios(id),
          borrado_at  TIMESTAMPTZ,
          borrado_por ${U} REFERENCES usuarios(id)
        );
        CREATE INDEX IF NOT EXISTS seg_mensajes_proyecto_idx ON seg_mensajes (proyecto_id, created_at);
        CREATE TABLE IF NOT EXISTS seg_archivos (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          mensaje_id UUID NOT NULL REFERENCES seg_mensajes(id) ON DELETE CASCADE,
          url        TEXT NOT NULL,
          nombre     TEXT,
          tipo       TEXT
        );
        CREATE TABLE IF NOT EXISTS seg_menciones (
          mensaje_id UUID NOT NULL REFERENCES seg_mensajes(id) ON DELETE CASCADE,
          usuario_id ${U} NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          PRIMARY KEY (mensaje_id, usuario_id)
        );
        CREATE TABLE IF NOT EXISTS seg_tareas (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          proyecto_id    ${P} NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
          titulo         TEXT NOT NULL,
          responsable_id ${U} REFERENCES usuarios(id) ON DELETE SET NULL,
          fecha_limite   DATE,
          hecha          BOOLEAN NOT NULL DEFAULT FALSE,
          hecha_at       TIMESTAMPTZ,
          creada_por     ${U} REFERENCES usuarios(id),
          created_at     TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS seg_historial (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          proyecto_id ${P} NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
          usuario_id  ${U} REFERENCES usuarios(id),
          tipo        TEXT NOT NULL,
          texto       TEXT NOT NULL,
          solo_admin  BOOLEAN NOT NULL DEFAULT FALSE,
          created_at  TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS seg_historial_proyecto_idx ON seg_historial (proyecto_id, created_at);
        CREATE TABLE IF NOT EXISTS seg_lecturas (
          usuario_id  ${U} NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          proyecto_id ${P} NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
          leido_hasta TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (usuario_id, proyecto_id)
        );
        CREATE TABLE IF NOT EXISTS seg_notif (
          usuario_id   ${U} PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
          leidas_hasta TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        -- Comentarios sobre una tarea: son mensajes del grupo pegados a esa tarea
        ALTER TABLE seg_mensajes ADD COLUMN IF NOT EXISTS tarea_id UUID REFERENCES seg_tareas(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS seg_mensajes_tarea_idx ON seg_mensajes (tarea_id);
        -- Link a la carpeta del proyecto en Google Drive
        ALTER TABLE seg_proyectos ADD COLUMN IF NOT EXISTS drive_url TEXT;
        -- Avisos push: configuración (claves del servidor) y dispositivos de cada usuario
        CREATE TABLE IF NOT EXISTS seg_config (
          clave TEXT PRIMARY KEY,
          valor TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS seg_push (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          usuario_id ${U} NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          endpoint   TEXT NOT NULL UNIQUE,
          p256dh     TEXT NOT NULL,
          auth       TEXT NOT NULL,
          dispositivo TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
    })().catch(err => { esquemaListo = null; throw err; });
  }
  return esquemaListo;
}
router.use(async (req, res, next) => {
  try { await asegurarEsquema(); next(); }
  catch (err) {
    console.error('Error creando tablas de seguimiento:', err);
    res.status(500).json({ error: 'No se pudieron preparar las tablas de seguimiento' });
  }
});

async function registrar(db, proyectoId, usuarioId, tipo, texto, soloAdmin = false) {
  await db.query(
    // clock_timestamp: varios registros de un mismo cambio quedan en el orden en que se anotaron
    `INSERT INTO seg_historial (proyecto_id, usuario_id, tipo, texto, solo_admin, created_at)
     VALUES ($1, $2, $3, $4, $5, clock_timestamp())`,
    [proyectoId, usuarioId, tipo, texto, soloAdmin]
  );
}

async function nombreDe(db, usuarioId) {
  const { rows } = await db.query(`SELECT nombre FROM usuarios WHERE id = $1`, [usuarioId]);
  return rows[0]?.nombre || 'Alguien';
}

// Quiénes pueden ser mencionados en un proyecto: su equipo y los socios
async function mencionables(db, proyectoId) {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre FROM usuarios u
     WHERE u.activo = TRUE AND (
       EXISTS (SELECT 1 FROM seg_equipo e WHERE e.proyecto_id = $1 AND e.usuario_id = u.id)
       OR EXISTS (SELECT 1 FROM socios s WHERE s.usuario_id = u.id AND s.activo = TRUE)
     )`,
    [proyectoId]
  );
  return rows;
}

// Lee las @menciones del texto y las guarda (reemplaza las anteriores del mensaje)
async function guardarMenciones(db, mensajeId, proyectoId, texto) {
  const tokens = [...String(texto || '').matchAll(/@([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/g)].map(m => m[1].toLowerCase());
  const todos = tokens.includes('todos');
  const gente = await mencionables(db, proyectoId);
  const ids = gente.filter(u => tokens.includes(primerNombre(u.nombre))).map(u => u.id);
  await db.query(`DELETE FROM seg_menciones WHERE mensaje_id = $1`, [mensajeId]);
  for (const id of ids) {
    await db.query(`INSERT INTO seg_menciones (mensaje_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [mensajeId, id]);
  }
  await db.query(`UPDATE seg_mensajes SET todos = $1 WHERE id = $2`, [todos, mensajeId]);
}

const resumirTexto = (t, n = 140) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

// Condición SQL: el mensaje m menciona al usuario $1 (por nombre o con @todos siendo del grupo)
const MENCIONA_A = `(
  EXISTS (SELECT 1 FROM seg_menciones mn WHERE mn.mensaje_id = m.id AND mn.usuario_id = $1)
  OR (m.todos AND (
    EXISTS (SELECT 1 FROM seg_equipo e WHERE e.proyecto_id = m.proyecto_id AND e.usuario_id = $1)
    OR EXISTS (SELECT 1 FROM socios s WHERE s.usuario_id = $1 AND s.activo = TRUE)
  ))
)`;
// Desde cuándo el usuario $1 tiene leído el proyecto m.proyecto_id
const LEIDO_HASTA = `GREATEST(
  COALESCE((SELECT l.leido_hasta FROM seg_lecturas l WHERE l.usuario_id = $1 AND l.proyecto_id = m.proyecto_id), 'epoch'),
  COALESCE((SELECT n.leidas_hasta FROM seg_notif n WHERE n.usuario_id = $1), 'epoch')
)`;

// ── Tablero: todos los proyectos con su resumen ────────────────────────────────
router.get('/proyectos', envolver(async (req, res) => {
  const finalizados = req.query.finalizados === '1';
  const { rows } = await query(
    `SELECT p.id, p.nombre, p.estado, c.nombre_razon_social AS cliente_nombre,
            COALESCE(sp.etapa, 0) AS etapa,
            COALESCE((SELECT json_agg(json_build_object('usuario_id', u.id, 'nombre', u.nombre, 'rol', e.rol) ORDER BY e.created_at)
                      FROM seg_equipo e JOIN usuarios u ON u.id = e.usuario_id WHERE e.proyecto_id = p.id), '[]') AS equipo,
            (SELECT COUNT(*) FROM seg_tareas t WHERE t.proyecto_id = p.id AND NOT t.hecha)::int AS pendientes,
            (SELECT COUNT(*) FROM seg_tareas t WHERE t.proyecto_id = p.id AND NOT t.hecha AND t.fecha_limite < CURRENT_DATE)::int AS vencidas,
            (SELECT json_build_object('texto', m.texto, 'autor', u.nombre, 'created_at', m.created_at,
                                      'archivos', (SELECT COUNT(*) FROM seg_archivos a WHERE a.mensaje_id = m.id))
               FROM seg_mensajes m JOIN usuarios u ON u.id = m.usuario_id
              WHERE m.proyecto_id = p.id AND m.borrado_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS ultimo,
            (SELECT COUNT(*) FROM seg_mensajes m
              WHERE m.proyecto_id = p.id AND m.borrado_at IS NULL AND m.usuario_id <> $1
                AND m.created_at > COALESCE((SELECT l.leido_hasta FROM seg_lecturas l WHERE l.usuario_id = $1 AND l.proyecto_id = p.id), 'epoch'))::int AS no_leidos,
            (SELECT COUNT(*) FROM seg_mensajes m
              WHERE m.proyecto_id = p.id AND m.borrado_at IS NULL AND m.usuario_id <> $1
                AND ${MENCIONA_A} AND m.created_at > ${LEIDO_HASTA})::int AS menciones
     FROM proyectos p
     JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN seg_proyectos sp ON sp.proyecto_id = p.id
     WHERE ${finalizados ? 'TRUE' : `p.estado <> 'finalizado'`}
     ORDER BY COALESCE((SELECT MAX(m.created_at) FROM seg_mensajes m WHERE m.proyecto_id = p.id), p.created_at) DESC`,
    [req.usuario.id]
  );
  res.json(rows);
}));

// Usuarios activos, para armar equipos y para las menciones
router.get('/usuarios', envolver(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.rol,
            (s.id IS NOT NULL) AS es_socio,
            CASE WHEN s.id IS NOT NULL THEN 'Socio' WHEN u.rol = 'dibujante' THEN 'Dibujante' ELSE 'Administración' END AS puesto
     FROM usuarios u LEFT JOIN socios s ON s.usuario_id = u.id AND s.activo = TRUE
     WHERE u.activo = TRUE
     ORDER BY u.nombre`
  );
  res.json(rows);
}));

// ── Detalle de un proyecto ─────────────────────────────────────────────────────
router.get('/proyectos/:id', envolver(async (req, res) => {
  const pid = req.params.id;
  const admin = esAdmin(req);
  const { rows: [proyecto] } = await query(
    `SELECT p.id, p.nombre, p.estado, c.nombre_razon_social AS cliente_nombre, COALESCE(sp.etapa, 0) AS etapa, sp.drive_url
     FROM proyectos p JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN seg_proyectos sp ON sp.proyecto_id = p.id
     WHERE p.id = $1`, [pid]
  );
  if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });

  const [equipo, socios, mensajes, tareas, historial] = await Promise.all([
    query(`SELECT e.usuario_id, u.nombre, e.rol, e.encargo FROM seg_equipo e JOIN usuarios u ON u.id = e.usuario_id
           WHERE e.proyecto_id = $1 ORDER BY e.created_at`, [pid]),
    query(`SELECT u.id AS usuario_id, u.nombre FROM socios s JOIN usuarios u ON u.id = s.usuario_id
           WHERE s.activo = TRUE AND u.activo = TRUE ORDER BY u.nombre`),
    query(
      `SELECT * FROM (
         SELECT m.id, m.usuario_id, u.nombre AS autor, m.decision, m.created_at, m.tarea_id, tt.titulo AS tarea_titulo,
                CASE WHEN m.borrado_at IS NULL THEN m.texto END AS texto,
                m.editado_at, ue.nombre AS editado_por_nombre, (m.editado_por IS NOT NULL AND m.editado_por <> m.usuario_id) AS editado_por_otro,
                m.borrado_at, ub.nombre AS borrado_por_nombre,
                CASE WHEN m.borrado_at IS NULL THEN COALESCE((SELECT json_agg(json_build_object('id', a.id, 'url', a.url, 'nombre', a.nombre, 'tipo', a.tipo))
                          FROM seg_archivos a WHERE a.mensaje_id = m.id), '[]') ELSE '[]' END AS archivos
         FROM seg_mensajes m
         JOIN usuarios u ON u.id = m.usuario_id
         LEFT JOIN usuarios ue ON ue.id = m.editado_por
         LEFT JOIN usuarios ub ON ub.id = m.borrado_por
         LEFT JOIN seg_tareas tt ON tt.id = m.tarea_id
         WHERE m.proyecto_id = $1 ${admin ? '' : 'AND m.borrado_at IS NULL'}
         ORDER BY m.created_at DESC LIMIT 400
       ) x ORDER BY created_at ASC`, [pid]),
    query(`SELECT t.id, t.titulo, t.responsable_id, u.nombre AS responsable, to_char(t.fecha_limite, 'YYYY-MM-DD') AS fecha_limite,
                  t.hecha, t.hecha_at, t.created_at,
                  (SELECT COUNT(*) FROM seg_mensajes m WHERE m.tarea_id = t.id AND m.borrado_at IS NULL)::int AS comentarios
           FROM seg_tareas t LEFT JOIN usuarios u ON u.id = t.responsable_id
           WHERE t.proyecto_id = $1 ORDER BY t.hecha, t.fecha_limite NULLS LAST, t.created_at`, [pid]),
    query(`SELECT h.id, h.tipo, h.texto, h.solo_admin, h.created_at, u.nombre AS usuario
           FROM seg_historial h LEFT JOIN usuarios u ON u.id = h.usuario_id
           WHERE h.proyecto_id = $1 ${admin ? '' : 'AND NOT h.solo_admin'}
           ORDER BY h.created_at DESC LIMIT 400`, [pid]),
  ]);

  res.json({
    proyecto, etapas: ETAPAS, roles: ROLES,
    equipo: equipo.rows, socios: socios.rows,
    mensajes: mensajes.rows, tareas: tareas.rows, historial: historial.rows,
  });
}));

// Marca el proyecto como leído (mensajes y menciones) para el usuario actual
router.post('/proyectos/:id/leido', envolver(async (req, res) => {
  await query(
    `INSERT INTO seg_lecturas (usuario_id, proyecto_id, leido_hasta) VALUES ($1, $2, NOW())
     ON CONFLICT (usuario_id, proyecto_id) DO UPDATE SET leido_hasta = NOW()`,
    [req.usuario.id, req.params.id]
  );
  res.json({ ok: true });
}));

// ── Etapa ──────────────────────────────────────────────────────────────────────
router.put('/proyectos/:id/etapa', envolver(async (req, res) => {
  const pid = req.params.id;
  const etapa = Number(req.body.etapa);
  if (!Number.isInteger(etapa) || etapa < 0 || etapa >= ETAPAS.length) {
    return res.status(400).json({ error: 'Etapa inválida' });
  }
  const { rows: [actual] } = await query(`SELECT COALESCE((SELECT etapa FROM seg_proyectos WHERE proyecto_id = $1), 0) AS etapa`, [pid]);
  if (actual.etapa === etapa) return res.json({ etapa });
  await query(
    `INSERT INTO seg_proyectos (proyecto_id, etapa, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (proyecto_id) DO UPDATE SET etapa = $2, updated_at = NOW()`, [pid, etapa]
  );
  const quien = await nombreDe({ query }, req.usuario.id);
  await registrar({ query }, pid, req.usuario.id, 'etapa', `${quien} pasó el proyecto de ${ETAPAS[actual.etapa]} a ${ETAPAS[etapa]}`);
  res.json({ etapa });
}));

// ── Link a la carpeta de Google Drive ──────────────────────────────────────────
router.put('/proyectos/:id/drive', envolver(async (req, res) => {
  const pid = req.params.id;
  const url = (req.body.url || '').trim();
  if (url && !/^https:\/\/\S+$/i.test(url)) {
    return res.status(400).json({ error: 'El link tiene que empezar con https://' });
  }
  const { rows: [antes] } = await query(`SELECT drive_url FROM seg_proyectos WHERE proyecto_id = $1`, [pid]);
  if ((antes?.drive_url || '') === url) return res.json({ drive_url: url || null });
  await query(
    `INSERT INTO seg_proyectos (proyecto_id, drive_url, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (proyecto_id) DO UPDATE SET drive_url = $2, updated_at = NOW()`, [pid, url || null]
  );
  const quien = await nombreDe({ query }, req.usuario.id);
  await registrar({ query }, pid, req.usuario.id, 'datos',
    url ? `${quien} ${antes?.drive_url ? 'cambió' : 'agregó'} el link a la carpeta de Drive` : `${quien} quitó el link a la carpeta de Drive`);
  res.json({ drive_url: url || null });
}));

// ── Equipo ─────────────────────────────────────────────────────────────────────
router.put('/proyectos/:id/equipo', envolver(async (req, res) => {
  const pid = req.params.id;
  const miembros = Array.isArray(req.body.miembros) ? req.body.miembros : [];
  if (miembros.some(m => !m.usuario_id || !ROLES.includes(m.rol))) {
    return res.status(400).json({ error: 'Cada integrante necesita un usuario y un rol válido' });
  }
  if (!miembros.some(m => m.rol === 'Project manager')) {
    return res.status(400).json({ error: 'El proyecto necesita al menos un project manager' });
  }
  if (new Set(miembros.map(m => String(m.usuario_id))).size !== miembros.length) {
    return res.status(400).json({ error: 'Hay un integrante repetido' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: antes } = await client.query(
      `SELECT e.usuario_id, e.rol, e.encargo, e.created_at, u.nombre FROM seg_equipo e JOIN usuarios u ON u.id = e.usuario_id WHERE e.proyecto_id = $1`, [pid]);
    const { rows: usuarios } = await client.query(
      `SELECT id, nombre FROM usuarios WHERE id::text = ANY($1)`, [miembros.map(m => String(m.usuario_id))]);
    if (usuarios.length !== miembros.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Algún usuario no existe' });
    }
    const nombre = (id) => usuarios.find(u => String(u.id) === String(id))?.nombre;
    const quien = await nombreDe(client, req.usuario.id);
    const previo = Object.fromEntries(antes.map(a => [String(a.usuario_id), a]));
    const nuevo = Object.fromEntries(miembros.map(m => [String(m.usuario_id), m]));
    const cambios = [];
    for (const m of miembros) {
      const a = previo[String(m.usuario_id)];
      const encargo = (m.encargo || '').trim() || null;
      if (!a) cambios.push(`${quien} sumó a ${nombre(m.usuario_id)} al equipo como ${m.rol}`);
      else if (a.rol !== m.rol) cambios.push(`${quien} cambió el rol de ${a.nombre}: de ${a.rol} a ${m.rol}`);
      if (encargo && encargo !== (a?.encargo || null)) cambios.push(`${quien} definió el encargo de ${nombre(m.usuario_id)}: ${encargo}`);
    }
    for (const a of antes) {
      if (!nuevo[String(a.usuario_id)]) cambios.push(`${quien} quitó a ${a.nombre} del equipo`);
    }
    await client.query(`DELETE FROM seg_equipo WHERE proyecto_id = $1`, [pid]);
    for (const m of miembros) {
      const a = previo[String(m.usuario_id)];
      await client.query(
        `INSERT INTO seg_equipo (proyecto_id, usuario_id, rol, encargo, created_at) VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))`,
        [pid, m.usuario_id, m.rol, (m.encargo || '').trim() || null, a ? a.created_at || null : null]
      );
    }
    for (const c of cambios) await registrar(client, pid, req.usuario.id, 'equipo', c);
    await client.query('COMMIT');
    res.json({ ok: true, cambios: cambios.length });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ── Mensajes ───────────────────────────────────────────────────────────────────
const nombreSeguro = (n) => String(n || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);

router.post('/proyectos/:id/mensajes', recibirArchivos, envolver(async (req, res) => {
  const pid = req.params.id;
  const texto = (req.body.texto || '').trim();
  const decision = req.body.decision === 'true' || req.body.decision === true;
  const tareaId = req.body.tarea_id || null;
  if (tareaId) {
    const { rows } = await query(`SELECT 1 FROM seg_tareas WHERE id = $1 AND proyecto_id = $2`, [tareaId, pid]);
    if (!rows.length) return res.status(400).json({ error: 'La tarea no es de este proyecto' });
  }
  // multer entrega el nombre original en latin1: se pasa a UTF-8 para no romper los acentos
  const archivos = (req.files || []).map(a => ({ ...a, originalname: Buffer.from(a.originalname, 'latin1').toString('utf8') }));
  if (!texto && !archivos.length) return res.status(400).json({ error: 'El mensaje está vacío' });
  const noPermitido = archivos.find(a => !EXTENSIONES[extension(a.originalname)]);
  if (noPermitido) {
    return res.status(400).json({ error: `«${noPermitido.originalname}»: solo se pueden adjuntar fotos (JPG, PNG, WEBP, GIF), PDF, Word, Excel o DWG` });
  }
  // Primero se suben los archivos; si falla, no queda un mensaje a medias
  const subidos = [];
  for (const a of archivos) {
    const tipo = EXTENSIONES[extension(a.originalname)];
    try {
      const url = await subirArchivo(a.buffer, nombreSeguro(a.originalname), tipo, `seguimiento/${pid}`);
      subidos.push({ url, nombre: a.originalname, tipo });
    } catch (err) {
      console.error('Error subiendo archivo de seguimiento:', a.originalname, err.message);
      return res.status(502).json({ error: `No se pudo subir «${a.originalname}» al almacenamiento. Probá de nuevo o avisá si sigue pasando.` });
    }
  }
  const client = await pool.connect();
  let quien = '';
  try {
    await client.query('BEGIN');
    const { rows: [m] } = await client.query(
      `INSERT INTO seg_mensajes (proyecto_id, usuario_id, texto, decision, tarea_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [pid, req.usuario.id, texto || null, decision, tareaId]
    );
    for (const s of subidos) {
      await client.query(`INSERT INTO seg_archivos (mensaje_id, url, nombre, tipo) VALUES ($1, $2, $3, $4)`, [m.id, s.url, s.nombre, s.tipo]);
    }
    if (texto) await guardarMenciones(client, m.id, pid, texto);
    quien = await nombreDe(client, req.usuario.id);
    if (decision) await registrar(client, pid, req.usuario.id, 'decision', `${quien}: ${resumirTexto(texto || 'Decisión con imagen adjunta', 300)}`);
    if (subidos.length) {
      const n = subidos.length;
      await registrar(client, pid, req.usuario.id, 'foto', `${quien} subió ${n === 1 ? 'un archivo' : `${n} archivos`}: ${subidos.map(s => s.nombre).join(', ')}`);
    }
    await client.query(
      `INSERT INTO seg_lecturas (usuario_id, proyecto_id, leido_hasta) VALUES ($1, $2, NOW())
       ON CONFLICT (usuario_id, proyecto_id) DO UPDATE SET leido_hasta = NOW()`, [req.usuario.id, pid]);
    await client.query('COMMIT');
    res.status(201).json({ id: m.id });
    // Aviso al celular del resto del equipo (después de responder, sin demorar al que escribe)
    avisarMensaje({ mensajeId: m.id, pid, autorId: req.usuario.id, quien, texto, subidos, tareaId, decision });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ── Avisos push ───────────────────────────────────────────────────────────────
// Reciben aviso de cada mensaje: el equipo del proyecto y quienes fueron mencionados
// (con @todos, también los socios). Nunca el que lo escribió.
async function avisarMensaje({ mensajeId, pid, autorId, quien, texto, subidos, tareaId, decision }) {
  try {
    const { rows: dest } = await query(
      `SELECT usuario_id FROM seg_equipo WHERE proyecto_id = $1
       UNION SELECT usuario_id FROM seg_menciones WHERE mensaje_id = $2
       UNION SELECT s.usuario_id FROM socios s, seg_mensajes m
             WHERE m.id = $2 AND m.todos AND s.activo = TRUE AND s.usuario_id IS NOT NULL`, [pid, mensajeId]);
    const ids = dest.map(d => d.usuario_id).filter(id => String(id) !== String(autorId));
    if (!ids.length) return;
    const { rows: [p] } = await query(`SELECT nombre FROM proyectos WHERE id = $1`, [pid]);
    let tarea = null;
    if (tareaId) ({ rows: [tarea] } = await query(`SELECT titulo FROM seg_tareas WHERE id = $1`, [tareaId]));
    const adjuntos = subidos.length === 1 ? `📎 ${subidos[0].nombre}` : subidos.length ? `📎 ${subidos.length} archivos` : '';
    let cuerpo = resumirTexto(texto, 180) || adjuntos;
    if (texto && adjuntos) cuerpo += ` · ${adjuntos}`;
    if (tarea) cuerpo = `Sobre «${resumirTexto(tarea.titulo, 50)}»: ${cuerpo}`;
    if (decision) cuerpo = `Decisión: ${cuerpo}`;
    await push.enviarA(ids, (s) => ({
      title: `${quien} · ${p?.nombre || 'Proyecto'}`,
      body: cuerpo,
      url: `${s.rol === 'admin' ? '/admin/seguimiento' : '/dibujante/proyectos'}/${pid}${tareaId ? `?tarea=${tareaId}` : ''}`,
      tag: `proyecto-${pid}`,
    }));
  } catch (err) {
    console.error('Error armando aviso push:', err.message);
  }
}

router.get('/push/clave', envolver(async (req, res) => {
  res.json({ clave: await push.clavePublica() });
}));

// Este dispositivo quiere recibir avisos (si ya estaba, se reasigna al usuario actual)
router.post('/push/suscribir', envolver(async (req, res) => {
  const s = req.body?.suscripcion;
  if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth || !/^https:\/\//.test(s.endpoint)) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }
  await query(
    `INSERT INTO seg_push (usuario_id, endpoint, p256dh, auth, dispositivo) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth, dispositivo = EXCLUDED.dispositivo`,
    [req.usuario.id, s.endpoint, s.keys.p256dh, s.keys.auth, String(req.headers['user-agent'] || '').slice(0, 300)]);
  res.json({ ok: true });
}));

router.post('/push/desuscribir', envolver(async (req, res) => {
  if (req.body?.endpoint) await query(`DELETE FROM seg_push WHERE endpoint = $1 AND usuario_id = $2`, [req.body.endpoint, req.usuario.id]);
  res.json({ ok: true });
}));

// Aviso de prueba a los dispositivos del usuario actual
router.post('/push/probar', envolver(async (req, res) => {
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM seg_push WHERE usuario_id = $1`, [req.usuario.id]);
  if (!rows[0].n) return res.status(400).json({ error: 'Este usuario no tiene dispositivos con avisos activados' });
  await push.enviarA([req.usuario.id], { title: 'VJV · Avisos activados', body: 'Así te van a llegar los mensajes de tus proyectos.', url: '/', tag: 'prueba' });
  res.json({ ok: true, dispositivos: rows[0].n });
}));

// Cada uno edita o borra sus mensajes; un administrador, los de cualquiera.
// El original queda en el historial (visible solo para administradores).
async function mensajePropio(req, res) {
  const { rows: [m] } = await query(
    `SELECT m.*, u.nombre AS autor FROM seg_mensajes m JOIN usuarios u ON u.id = m.usuario_id WHERE m.id = $1`, [req.params.id]);
  if (!m || m.borrado_at) { res.status(404).json({ error: 'Mensaje no encontrado' }); return null; }
  if (String(m.usuario_id) !== String(req.usuario.id) && !esAdmin(req)) {
    res.status(403).json({ error: 'Solo podés modificar tus propios mensajes' }); return null;
  }
  return m;
}

router.put('/mensajes/:id', envolver(async (req, res) => {
  const m = await mensajePropio(req, res);
  if (!m) return;
  const texto = (req.body.texto || '').trim();
  const { rows: [{ n }] } = await query(`SELECT COUNT(*)::int AS n FROM seg_archivos WHERE mensaje_id = $1`, [m.id]);
  if (!texto && !n) return res.status(400).json({ error: 'El mensaje no puede quedar vacío' });
  if (texto === (m.texto || '')) return res.json({ ok: true });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE seg_mensajes SET texto = $1, editado_at = NOW(), editado_por = $2 WHERE id = $3`,
      [texto || null, req.usuario.id, m.id]);
    await guardarMenciones(client, m.id, m.proyecto_id, texto);
    const quien = await nombreDe(client, req.usuario.id);
    const deQuien = String(m.usuario_id) === String(req.usuario.id) ? 'un mensaje suyo' : `un mensaje de ${m.autor}`;
    await registrar(client, m.proyecto_id, req.usuario.id, 'mensaje',
      `${quien} editó ${deQuien}. Antes: «${m.texto || ''}» · Ahora: «${texto}»`, true);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

router.delete('/mensajes/:id', envolver(async (req, res) => {
  const m = await mensajePropio(req, res);
  if (!m) return;
  const { rows: archivos } = await query(`SELECT nombre FROM seg_archivos WHERE mensaje_id = $1`, [m.id]);
  const quien = await nombreDe({ query }, req.usuario.id);
  const deQuien = String(m.usuario_id) === String(req.usuario.id) ? 'un mensaje suyo' : `un mensaje de ${m.autor}`;
  const desc = [m.texto ? `«${m.texto}»` : '', archivos.length ? `archivos: ${archivos.map(a => a.nombre).join(', ')}` : '']
    .filter(Boolean).join(' · ');
  await query(`UPDATE seg_mensajes SET borrado_at = NOW(), borrado_por = $1 WHERE id = $2`, [req.usuario.id, m.id]);
  await registrar({ query }, m.proyecto_id, req.usuario.id, 'mensaje', `${quien} borró ${deQuien}: ${desc}`, true);
  res.json({ ok: true });
}));

// ── Tareas ─────────────────────────────────────────────────────────────────────
const fechaCorta = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : 'sin fecha');

router.post('/proyectos/:id/tareas', envolver(async (req, res) => {
  const pid = req.params.id;
  const titulo = (req.body.titulo || '').trim();
  const { responsable_id, fecha_limite } = req.body;
  if (!titulo) return res.status(400).json({ error: 'La tarea necesita un título' });
  const { rows: [t] } = await query(
    `INSERT INTO seg_tareas (proyecto_id, titulo, responsable_id, fecha_limite, creada_por)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [pid, titulo, responsable_id || null, fecha_limite || null, req.usuario.id]
  );
  const quien = await nombreDe({ query }, req.usuario.id);
  const resp = responsable_id ? await nombreDe({ query }, responsable_id) : null;
  await registrar({ query }, pid, req.usuario.id, 'tarea',
    resp ? `${quien} asignó a ${resp} la tarea «${titulo}» (${fechaCorta(fecha_limite)})`
         : `${quien} creó la tarea «${titulo}» (${fechaCorta(fecha_limite)})`);
  res.status(201).json({ id: t.id });
}));

router.patch('/tareas/:id', envolver(async (req, res) => {
  const hecha = Boolean(req.body.hecha);
  const { rows: [t] } = await query(
    `UPDATE seg_tareas SET hecha = $1, hecha_at = CASE WHEN $1 THEN NOW() END WHERE id = $2 RETURNING proyecto_id, titulo`,
    [hecha, req.params.id]
  );
  if (!t) return res.status(404).json({ error: 'Tarea no encontrada' });
  const quien = await nombreDe({ query }, req.usuario.id);
  await registrar({ query }, t.proyecto_id, req.usuario.id, 'tarea', `${quien} ${hecha ? 'marcó como hecha' : 'reabrió'} «${t.titulo}»`);
  res.json({ ok: true });
}));

// ── Notificaciones: menciones al usuario actual ────────────────────────────────
router.get('/notificaciones', envolver(async (req, res) => {
  const { rows } = await query(
    `SELECT m.id, m.proyecto_id, p.nombre AS proyecto, m.texto, m.created_at, u.nombre AS autor, m.usuario_id AS autor_id,
            EXISTS (SELECT 1 FROM seg_menciones mn WHERE mn.mensaje_id = m.id AND mn.usuario_id = $1) AS a_mi,
            (m.created_at > ${LEIDO_HASTA}) AS sin_leer
     FROM seg_mensajes m
     JOIN proyectos p ON p.id = m.proyecto_id
     JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.borrado_at IS NULL AND m.usuario_id <> $1 AND ${MENCIONA_A}
     ORDER BY m.created_at DESC
     LIMIT 50`,
    [req.usuario.id]
  );
  res.json({ notificaciones: rows, sin_leer: rows.filter(r => r.sin_leer).length });
}));

router.post('/notificaciones/leidas', envolver(async (req, res) => {
  await query(
    `INSERT INTO seg_notif (usuario_id, leidas_hasta) VALUES ($1, NOW())
     ON CONFLICT (usuario_id) DO UPDATE SET leidas_hasta = NOW()`, [req.usuario.id]);
  res.json({ ok: true });
}));

module.exports = router;
