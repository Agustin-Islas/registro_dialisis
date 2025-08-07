const PDFDocument = require('pdfkit');
require('pdfkit-table');               // ➜ `npm i pdfkit pdfkit-table`
const path = require('path');
const db   = require('../db/db');

/* ───────────────────── helpers ───────────────────── */
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

/* ─────────────────── controlador PDF ─────────────────── */
module.exports = async (req, res) => {
  const { mes } = req.query;
  if (!mes) return res.status(400).send('mes requerido (YYYY-MM)');

  // ── 1. Traer datos ──
  const { rows } = await db.execute({
    sql : `SELECT * FROM sesiones WHERE fecha LIKE ?`,
    args: [`${mes}-%`]
  });
  if (!rows.length) return res.status(404).send('Sin registros para ese mes');

  const porDia = rows.reduce((acc, r) => ((acc[r.fecha] ??= []).push(r), acc), {});
  const fechas = Object.keys(porDia).sort((a, b) => b.localeCompare(a));

  // ── 2. Crear documento en memoria ──
  const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: false });
  try {
    doc.registerFont('regular', path.join(__dirname, '../fonts/NotoSans-Regular.ttf'));
    doc.registerFont('bold',    path.join(__dirname, '../fonts/NotoSans-Bold.ttf'));
  } catch {/* fallback Helvetica */}

  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('error', err => {
    console.error('PDF error', err);
    res.status(500).send('Error generando PDF');
  });
  doc.on('end', () => {
    const pdf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', `attachment; filename="registro-${mes}.pdf"`);
    res.end(pdf);
  });

  // ── 3. Portada mensual ──
  doc.addPage();
  doc.font('bold').fontSize(20).text(`Registro mensual de diálisis`, { align: 'center' });
  doc.moveDown(0.5).fontSize(16).text(mes, { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(10).font('regular').text(`Generado: ${new Date().toLocaleString('es-AR')}`);

  // ── 4. Config tabla ──
  const colSizes = [60, 40, 50, 60, 60, 60, 150];
  const opts = {
    width: doc.page.width - doc.options.margin * 2,
    columnsSize: colSizes,
    columnSpacing: 4,
    prepareHeader: () => doc.font('bold').fontSize(10),
    prepareRow   : (row, i) => {
      doc.font('regular').fontSize(10);
      if (i % 2) doc.fillColor('#000000'); else doc.fillColor('#000000'); // solo texto negro → evita errores de color
    },
    border: null,
  };

  // ── 5. Un día por página ──
  for (const fecha of fechas) {
    const lista = porDia[fecha].sort((a, b) => toMinutes(a.hora) - toMinutes(b.hora));
    const total = lista.reduce((s, r) => s + Number(r.parcial), 0);

    doc.addPage();
    doc.font('bold').fontSize(14).text(`${fmtFecha(fecha)} — Total diario: ${total} ml`, { align: 'left' });
    doc.moveDown(0.4);

    const rowsDia = lista.map(r => ([
      r.hora,
      r.bolsa,
      fmtConc(r.concentracion),
      `${r.infusion} ml`,
      `${r.drenaje} ml`,
      `${r.parcial >= 0 ? '+' : ''}${r.parcial} ml`,
      r.observaciones || '-'
    ]));

    await doc.table({ headers: ['Hora','Bolsa','Conc.','Infusión','Drenaje','Parcial','Obs.'], rows: rowsDia }, opts);
  }

  // ── 6. Finalizar ──
  doc.end();
};