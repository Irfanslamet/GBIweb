import mysql from 'mysql2/promise';
import 'dotenv/config';

const sslCa = process.env.DB_SSL_CA?.replace(/\\n/g, '\n');

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gbiweb',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: Boolean(sslCa), ...(sslCa ? { ca: sslCa } : {}) } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true
});
