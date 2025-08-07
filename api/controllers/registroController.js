const db = require('../db/db');
const generarPDF = require('../utils/generarPDF');

/* --- LISTAR --- */
exports.getRegistros = async (req, res) => {
  try {
    let { desde, hasta } = req.query;
    if (!desde) desde = '0000-01-01';
    if (!hasta) hasta = '9999-12-31';

    const result = await db.execute({
      sql: `SELECT * FROM sesiones
            WHERE fecha BETWEEN ? AND ?
            ORDER BY fecha DESC, hora DESC`,
      args: [desde, hasta]
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json(err);
  }
};

/* --- CREAR --- */
exports.crearRegistro = async (req, res) => {
  try {
    const { fecha, hora, bolsa, concentracion, infusion, drenaje, observaciones } = req.body;
    const parcial = drenaje - infusion;
    await db.execute({
      sql: `INSERT INTO sesiones (fecha,hora,bolsa,concentracion,infusion,drenaje,parcial,observaciones)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: [fecha, hora, bolsa, concentracion, infusion, drenaje, parcial, observaciones]
    });
    res.status(201).json({ mensaje: 'Registro creado' });
  } catch (err) {
    res.status(500).json(err);
  }
};

/* --- ACTUALIZAR --- */
exports.actualizarRegistro = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha, hora, bolsa, concentracion, infusion, drenaje, observaciones } = req.body;
    const parcial = drenaje - infusion;
    await db.execute({
      sql: `UPDATE sesiones SET fecha=?,hora=?,bolsa=?,concentracion=?,infusion=?,drenaje=?,parcial=?,observaciones=?
            WHERE id=?`,
      args: [fecha, hora, bolsa, concentracion, infusion, drenaje, parcial, observaciones, id]
    });
    res.json({ mensaje: 'Registro actualizado' });
  } catch (err) {
    res.status(500).json(err);
  }
};

/* --- ELIMINAR --- */
exports.borrarRegistro = async (req, res) => {
  try {
    await db.execute({
      sql: 'DELETE FROM sesiones WHERE id=?',
      args: [req.params.id]
    });
    res.json({ mensaje: 'Registro eliminado' });
  } catch (err) {
    res.status(500).json(err);
  }
};

/* --- PDF --- */
exports.generarPDF = (req, res) => generarPDF(req, res);
