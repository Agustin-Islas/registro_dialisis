const PDFDocument = require('pdfkit');
require('pdfkit-table');               // <─ NUEVA dependencia (npm i pdfkit-table)
const path = require('path');
const db   = require('../db/db');

/* ───────────────────────── helpers ───────────────────────── */
const toMinutes = h => {
  let t = h.trim().toUpperCase(), am = null;
  if (t.endsWith('AM') || t.endsWith('PM')) { am = t.slice(-2); t = t.slice(0, -2).trim(); }
  const [hh, mm = '0'] = t.split(':'), m = parseInt(mm, 10);
  let h24 = parseInt(hh, 10);
  if (am === 'PM' && h24 !== 12) h24 += 12;
  if (am === 'AM' && h24 === 12) h24 = 0;
  return h24 * 60 + m;
};

const fmtFecha = iso => {
  const [y, m, d] = iso.split('-');
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
};

const fmtConc = n => `${String(n).replace('.', ',')} %`;

/* ───────────────────────── controlador ───────────────────────── */
module.exports = async (req, res) => {
  const { mes } = req.query;
  if (!mes) return res.status(400).send('mes requerido (YYYY-MM)');

  /* ───── PDF ───── */
  const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: false });
  try {
    doc.registerFont('regular', path.join(__dirname, '../fonts/NotoSans-Regular.ttf'));
    doc.registerFont('bold',    path.join(__dirname, '../fonts/NotoSans-Bold.ttf'));
  } catch {/* si faltan fuentes → Helvetica */}

  res.setHeader('Content-Type',        'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="registro-${mes}.pdf"`);
  doc.pipe(res);

  /* ───── datos ───── */
  const result = await db.execute({
    sql : `SELECT * FROM sesiones WHERE fecha LIKE ?`,
    args: [`${mes}-%`]
  });

  const porDia = result.rows.reduce((acc, r) => ((acc[r.fecha] ??= []).push(r), acc), {});
  const fechas = Object.keys(porDia).sort((a, b) => b.localeCompare(a)); // más recientes arriba

  /* ───── estilos tabla ───── */
  const colSizes = [60, 40, 50, 60, 60, 60, 150];
  const tableOpts = {
    width: doc.page.width - doc.options.margin * 2,
    columnsSize: colSizes,
    columnSpacing: 4,
    prepareHeader: () => doc.font('bold').fontSize(10),
    prepareRow   : (row, i) => {
      doc.font('regular').fontSize(10);
      if (i % 2) doc.fillColor('#555555'); else doc.fillColor('#dddddd');
    },
    border: null,
  };

  /* ───── recorrer días ───── */
  fechas.forEach(fecha => {
    const lista = porDia[fecha].sort((a, b) => toMinutes(a.hora) - toMinutes(b.hora));
    const total = lista.reduce((s, r) => s + Number(r.parcial), 0);

    // nueva página para cada día
    doc.addPage();

    // encabezado del día
    doc.font('bold').fontSize(14)
       .fillColor('#000000')
       .text(`${fmtFecha(fecha)} — Total diario: ${total} ml`, { align: 'left' })
       .moveDown(0.5);

    // construir filas de la tabla
    const rows = lista.map(s => ([
      s.hora,
      s.bolsa,
      fmtConc(s.concentracion),
      `${s.infusion} ml`,
      `${s.drenaje} ml`,
      `${s.parcial >= 0 ? '+' : ''}${s.parcial} ml`,
      s.observaciones || '-'
    ]));

    doc.table({
      headers: ['Hora', 'Bolsa', 'Conc.', 'Infusión', 'Drenaje', 'Parcial', 'Obs.'],
      rows
    }, tableOpts);
  });

  doc.end();
};