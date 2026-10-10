-- Tablas para importar resúmenes bancarios y hacer el arqueo.
-- NO hace falta correr esto a mano: el backend las crea solo la primera vez que
-- se usa la pantalla Banco (ver asegurarEsquema en src/routes/banco.js).
-- Queda acá como referencia. Supone que ingresos.id y egresos.id son UUID.
CREATE TABLE IF NOT EXISTS banco_importaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banco TEXT NOT NULL, archivo TEXT, desde DATE, hasta DATE,
  saldo_inicial NUMERIC(16,2), saldo_final NUMERIC(16,2),
  nuevos INTEGER DEFAULT 0, repetidos INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS banco_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacion_id UUID REFERENCES banco_importaciones(id) ON DELETE SET NULL,
  huella TEXT NOT NULL UNIQUE,            -- evita importar dos veces el mismo movimiento
  fecha DATE NOT NULL, nro_transaccion TEXT, descripcion TEXT NOT NULL,
  importe NUMERIC(16,2) NOT NULL, saldo NUMERIC(16,2), posicion INTEGER NOT NULL DEFAULT 0,
  cuit TEXT, clase TEXT NOT NULL, categoria_sugerida TEXT, destinatario_sugerido TEXT, detalle TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | vinculado | creado | inversion | ignorado
  ingreso_id UUID REFERENCES ingresos(id) ON DELETE SET NULL,
  egreso_id  UUID REFERENCES egresos(id)  ON DELETE SET NULL,
  nota TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS banco_movimientos_fecha_idx ON banco_movimientos (fecha);
CREATE INDEX IF NOT EXISTS banco_movimientos_estado_idx ON banco_movimientos (estado);
