import mysql from 'mysql2/promise';


declare const process: any;

// MySQL Connection Pool
export const db = mysql.createPool({
  host: process.env?.MYSQL_HOST || 'localhost',
  port: Number(process.env?.MYSQL_PORT) || 3306,
  user: process.env?.MYSQL_USER || 'root',
  password: process.env?.MYSQL_PASSWORD || '',
  database: process.env?.MYSQL_DATABASE || 'replay_console',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
