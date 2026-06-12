const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
    process.exit(1);
  }
  release();
  console.log('✅ Conectado a PostgreSQL');
});

const query = (text, params) => pool.query(text, params);

module.exports = { query, pool };
