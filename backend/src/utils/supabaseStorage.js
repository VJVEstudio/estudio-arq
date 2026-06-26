const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUCKET = 'comprobantes-rendiciones';

async function subirArchivo(buffer, nombreArchivo, mimeType) {
  const rutaArchivo = `${Date.now()}-${nombreArchivo}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(rutaArchivo, buffer, { contentType: mimeType, upsert: false });

  if (error) {
    console.error('Error subiendo archivo a Supabase Storage:', error);
    throw new Error('No se pudo subir el archivo');
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(rutaArchivo);
  return data.publicUrl;
}

module.exports = { subirArchivo };
