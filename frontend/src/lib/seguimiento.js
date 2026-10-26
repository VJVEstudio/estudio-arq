// Constantes y utilidades del módulo Seguimiento de proyectos

export const ETAPAS = ['Master plan', 'Anteproyecto', 'Proyecto', 'Proyecto ejecutivo', 'Gestiones administrativas', 'Licitación', 'Obra'];
export const ROLES = ['Project manager', 'Senior PM', 'Dibujante', 'Colaborador'];
export const ORDEN_ROL = { 'Project manager': 0, 'Senior PM': 1, 'Dibujante': 2, 'Colaborador': 3, 'Socio': 4 };
export const SIGLA_ROL = { 'Project manager': ' (PM)', 'Senior PM': ' (Sr. PM)', 'Dibujante': '', 'Colaborador': '' };

// Responsabilidad estándar de cada rol; cada proyecto puede definir un encargo puntual
export const RESP_ROL = {
  'Senior PM': 'Supervisa el proyecto, valida criterios técnicos y destraba problemas.',
  'Project manager': 'Lleva el proyecto día a día: cliente, plazos, tareas y asesores.',
  'Dibujante': 'Desarrolla la documentación gráfica que se le asigna.',
  'Colaborador': 'Colabora en tareas puntuales del proyecto.',
  'Socio': 'Aprueba decisiones de diseño, entregas y honorarios.',
};

export const TIPOS_HIST = {
  decision: { t: 'Decisión', bg: '#fff1d6', fg: '#7a4a00' },
  foto:     { t: 'Archivo',  bg: '#e6eef8', fg: '#1d4f86' },
  tarea:    { t: 'Tarea',    bg: '#e8f3ec', fg: '#1f5e37' },
  etapa:    { t: 'Etapa',    bg: '#efe9f6', fg: '#4b2a78' },
  equipo:   { t: 'Equipo',   bg: '#ececec', fg: '#333333' },
  mensaje:  { t: 'Mensaje',  bg: '#fbe9e7', fg: '#8a2c1a' },
  datos:    { t: 'Datos',    bg: '#eef3f1', fg: '#2f5a4c' },
};

export const RE_MENCION = /@([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)/g;

export const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || '';

// Iniciales de nombre y apellido: "Salvador Viales" → "SV"
export function iniciales(nombre) {
  const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

const PALETA = ['#1a2744', '#2d5f8a', '#a0522d', '#2f6b5a', '#8a3d5c', '#4f6b2d', '#7a5c1e', '#6a4c7c', '#35606b', '#3d4f8a', '#6b4a2d', '#4a5a7a'];
export function colorDe(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}

const pad = (n) => String(n).padStart(2, '0');
export const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoyISO = () => isoLocal(new Date());
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

// "Hoy", "Ayer" o "lun 12/10" para una marca de tiempo
export function diaDe(ts) {
  const d = new Date(ts);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (isoLocal(d) === isoLocal(hoy)) return 'Hoy';
  if (isoLocal(d) === isoLocal(ayer)) return 'Ayer';
  return `${DIAS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}
export const horaDe = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const cuando = (ts) => `${diaDe(ts)} ${horaDe(ts)}`;

// Fecha límite de una tarea ('2026-10-23' → 'vie 23/10', 'Hoy', 'Mañana')
export function fmtFecha(iso) {
  if (!iso) return 'Sin fecha';
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d);
  const hoy = new Date();
  const man = new Date(); man.setDate(hoy.getDate() + 1);
  if (iso === isoLocal(hoy)) return 'Hoy';
  if (iso === isoLocal(man)) return 'Mañana';
  return `${DIAS[f.getDay()]} ${pad(d)}/${pad(m)}`;
}

// Parte el texto en tramos y marca las menciones válidas (@Nombre o @todos).
// Las que nombran a `yo` (o a todos) se resaltan más fuerte.
export function segmentar(texto, validos, yo) {
  const out = [];
  let ultimo = 0;
  const re = new RegExp(RE_MENCION.source, 'g');
  let mm;
  while ((mm = re.exec(texto))) {
    const nom = mm[1].toLowerCase();
    if (!validos.includes(nom)) continue;
    if (mm.index > ultimo) out.push({ txt: texto.slice(ultimo, mm.index) });
    out.push({ txt: mm[0], fuerte: nom === 'todos' || nom === yo, mencion: true });
    ultimo = mm.index + mm[0].length;
  }
  if (ultimo < texto.length) out.push({ txt: texto.slice(ultimo) });
  return out;
}

// ── Archivos adjuntos ──────────────────────────────────────────────────────────
export const MAX_MB_ARCHIVO = 25;
export const EXTENSIONES_PERMITIDAS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'dwg'];
export const ACCEPT_ARCHIVOS = EXTENSIONES_PERMITIDAS.map(e => '.' + e).join(',');
export const extensionDe = (nombre) => String(nombre || '').split('.').pop().toLowerCase();

// Cómo se muestra cada tipo de archivo (etiqueta y colores)
export function tipoArchivo(nombre, mime) {
  const ext = extensionDe(nombre);
  if ((mime || '').startsWith('image/') && ext !== 'dwg') return { clase: 'imagen', etiqueta: 'Imagen' };
  if (ext === 'pdf') return { clase: 'pdf', etiqueta: 'PDF', bg: '#fdecea', fg: '#a3261b' };
  if (ext === 'doc' || ext === 'docx') return { clase: 'word', etiqueta: 'Word', bg: '#e8f0fb', fg: '#1d4f91' };
  if (ext === 'xls' || ext === 'xlsx') return { clase: 'excel', etiqueta: 'Excel', bg: '#e6f4ea', fg: '#1e6b3a' };
  if (ext === 'dwg') return { clase: 'dwg', etiqueta: 'DWG', bg: '#f1ecf9', fg: '#5a3591' };
  return { clase: 'otro', etiqueta: ext.toUpperCase() || 'Archivo', bg: '#f1f1f1', fg: '#333333' };
}

// ¿El usuario está en el equipo del proyecto? (para "Solo mis proyectos")
export const participaEn = (proyecto, usuarioId) =>
  (proyecto.equipo || []).some(e => String(e.usuario_id) === String(usuarioId));

// Preferencias chicas que se recuerdan en esta computadora (si el navegador lo permite)
export function leerPref(clave, porDefecto) {
  try { const v = localStorage.getItem(clave); return v === null ? porDefecto : JSON.parse(v); } catch { return porDefecto; }
}
export function guardarPref(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento: no se recuerda */ }
}
