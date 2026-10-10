-- Guarda el link al archivo del comprobante leído con OCR en ingresos y egresos.
-- Correr en el SQL Editor de Supabase ANTES de desplegar el backend nuevo.
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS archivo_url TEXT;
ALTER TABLE egresos  ADD COLUMN IF NOT EXISTS archivo_url TEXT;
