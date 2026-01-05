
const sql = require('mssql');

const config = {
    user: 'sa',
    password: 'Pass@word',
    server: 'localhost',
    database: 'master',
    options: {
        encrypt: false, // for local dev
        trustServerCertificate: true // for local dev
    }
};

async function createDbs() {
    try {
        console.log('Connecting to SQL Server...');
        const pool = await sql.connect(config);
        console.log('Connected.');

        console.log('Creating innovationdb if not exists...');
        await pool.request().query("IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'innovationdb') BEGIN CREATE DATABASE innovationdb; END");
        console.log('innovationdb checked/created.');

        console.log('Creating tests db if not exists...');
        await pool.request().query("IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'tests') BEGIN CREATE DATABASE tests; END");
        console.log('tests db checked/created.');

        console.log('Setting READ_COMMITTED_SNAPSHOT ON for tests db...');
        // This might fail if there are active connections, so we might need to set single user mode first or just try.
        // Usually safe on a fresh local instance.
        await pool.request().query("ALTER DATABASE tests SET READ_COMMITTED_SNAPSHOT ON");
        console.log('READ_COMMITTED_SNAPSHOT set.');

        await pool.close();
        console.log('Done.');
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

createDbs();
