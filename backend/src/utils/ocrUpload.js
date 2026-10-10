const multer = require('multer');
const { subirArchivo } = require('./supabaseStorage');
const { leerComprobante } = require('./ocrComprobante');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// Devuelve los middlewares para un endpoint POST que recibe un comprobante,
// lo sube a Supabase Storage y lo lee con OCR (mismo flujo que rendiciones).
function rutaOcr(carpeta) {
  return [
    upload.single('archivo'),
    async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
      try {
        const { buffer, mimetype, originalname } = req.file;
        if (!TIPOS_PERMITIDOS.includes(mimetype)) return res.status(400).json({ error: 'Formato no soportado.' });
        const [archivoUrl, datosExtraidos] = await Promise.all([
          subirArchivo(buffer, originalname, mimetype, carpeta),
          leerComprobante(buffer, mimetype),
        ]);
        res.json({ ...datosExtraidos, archivo_url: archivoUrl });
      } catch (err) {
        console.error('Error procesando OCR:', err);
        res.status(500).json({ error: err.message || 'Error al procesar el comprobante' });
      }
    },
  ];
}

module.exports = { rutaOcr };
