// Configurations
// This has database, SMTP, JWT, SSL, and App Configuration

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const fs = require('fs');

// Environment Variables
const {
  PORT = 443,
  DB_HOST = 'localhost',
  DB_PORT = 5432,
  DB_USER = 'postgres',
  DB_PASSWORD = '',
  DB_NAME = 'skiclub',
  JWT_SECRET = 'change_me',
  APP_BASE_URL = 'http://localhost:443',
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM, 
  SSL_KEY = '/path/to/privkey.pem', // Default paths for Let's Encrypt certs; change if needed but honestly this just uses env file so idk if I need this anymore? Keep this tho
  SSL_CERT = '/path/to/fullchain.pem',
} = process.env;

const ssl = {
  key: fs.readFileSync(SSL_KEY),
  cert: fs.readFileSync(SSL_CERT),
};

// Database Pool probably
const pool = new Pool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  options: '-c timezone=UTC'
});

// SMTP configuration
const secureByPort = Number(SMTP_PORT) === 465;
const smtpConfig = {
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: secureByPort,
  auth: { user: SMTP_USER, pass: SMTP_PASS }
};

const FROM = SMTP_FROM || SMTP_USER;

module.exports = {
  PORT,
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  JWT_SECRET,
  APP_BASE_URL,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  FROM,
  SSL_KEY,
  SSL_CERT,
  ssl,
  pool,
  smtpConfig,
};
