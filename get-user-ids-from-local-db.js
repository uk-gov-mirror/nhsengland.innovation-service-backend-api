const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'innovation-service-backend-api', '.env') });

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PWD || 'Pass@word',
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'innovationdb',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function run() {
  try {
    await sql.connect(config);
    const result = await sql.query("SELECT TOP 1000 id FROM [user] WHERE status = 'ACTIVE' AND id IS NOT NULL");
    console.log(JSON.stringify(result.recordset.map(r => r.id)));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sql.close();
  }
}

run();
