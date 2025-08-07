const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const registroRoutes = require('./routes/registros'); // Ajusta la ruta según tu estructura

const app = express();
app.use(cors());
app.use(bodyParser.json());
//app.use('/', registroRoutes); // ¡NO uses '/api'!
router.get('/ping', (req, res) => res.json({ ok: true }));

module.exports = serverless(app);
