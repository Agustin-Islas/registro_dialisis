const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const registroRoutes = require('./api/routes/registros');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Montar API
app.use('/api', registroRoutes);

// Servir archivos estáticos (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// (Opcional) Redirigir rutas desconocidas al index.html para SPA:
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Puerto (Render usa variable de entorno PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor corriendo en puerto', PORT);
});
