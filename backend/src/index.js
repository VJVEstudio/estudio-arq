require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/clientes',      require('./routes/clientes'));
app.use('/api/proyectos',     require('./routes/proyectos'));
app.use('/api/ingresos',      require('./routes/ingresos'));
app.use('/api/egresos',       require('./routes/egresos'));
app.use('/api/destinatarios', require('./routes/destinatarios'));
app.use('/api/balance',       require('./routes/balance'));
app.use('/api/dibujantes',    require('./routes/dibujantes'));
app.use('/api/horas',         require('./routes/horas'));
app.use('/api/reportes',      require('./routes/reportes'));
app.use('/api/socios',        require('./routes/socios'));

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use((err, req, res, _next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
