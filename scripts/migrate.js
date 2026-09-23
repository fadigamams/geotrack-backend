// Exécute les fichiers .sql de /migrations dans l'ordre alphabétique.
// Usage : npm run migrate  (après avoir défini DATABASE_URL)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function run() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    console.log('→ Exécution de', file);
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query(sql);
  }
  console.log('✔ Migrations terminées');
  await pool.end();
}

run().catch(err => {
  console.error('✖ Échec de la migration :', err.message);
  process.exit(1);
});
