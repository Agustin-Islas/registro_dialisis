const express = require('express');
const router = express.Router();
const {
  getRegistros,
  crearRegistro,
  actualizarRegistro,
  borrarRegistro,
  generarPDF
} = require('../controllers/registroController');

router.get('/registros', getRegistros);
router.post('/registro', crearRegistro);
router.put('/registro/:id', actualizarRegistro);
router.delete('/registro/:id', borrarRegistro);
router.get('/pdf', generarPDF);

module.exports = router;
