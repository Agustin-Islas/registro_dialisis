// db.js
const { createClient } = require('@libsql/client'); 
require('dotenv').config();


const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN
});

module.exports = db;
