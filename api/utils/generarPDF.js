const PDFDocument = require('pdfkit');
const path = require('path');
const db = require('../db/db');

const toMinutes = h => {
  let t = h.trim().toUpperCase(), ampm = null;
  if (t.endsWith('AM') || t.endsWith('PM')) { ampm = t.slice(-2); t = t.slice(0, -2).trim(); }
  const [hh, mm = '0'] = t.split(':'), m = parseInt(mm, 10);
  let h24 = parseInt(hh, 10);
  if (ampm === 'PM' && h24 !== 12) h24 += 12;
  if (ampm === 'AM' && h24 === 12) h24 = 0;
  return h24 * 60 + m;
};

module.exports = async (req, res) => {
  const { mes } = req.query;
  if (!mes) return res.status(400).send('mes requerido');

  const doc = new PDFDocument({ margin: 40 });
  doc.registerFont('regular', path.join(__dirname, '../fonts/NotoSans-Regular.ttf'));
  doc.registerFont('bold', path.join(__dirname, '../fonts/NotoSans-Bold.ttf'));

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="registro-${mes}.pdf"`);
  doc.pipe(res);

  doc.font('bold').fontSize(16).text(`Registro mensual de diálisis – ${mes}`, { align: 'center' });
  doc.moveDown(1);

  try {
    const result = await db.execute({
      sql: `SELECT * FROM sesiones WHERE fecha LIKE ?`,
      args: [`${mes}-%`]
    });

    const rows = result.rows;
    const porDia = rows.reduce((a, r) => ((a[r.fecha] ??= []).push(r), a), {});
    Object.keys(porDia).sort((a, b) => b.localeCompare(a)).forEach(fecha => {
      const lista = porDia[fecha].sort((x, y) => toMinutes(x.hora) - toMinutes(y.hora));
      const total = lista.reduce((s, r) => s + r.parcial, 0);

      doc.moveDown(0.5)
        .font('bold').fontSize(12)
        .text(`${fecha}   —   Total diario: ${total} ml`);
      doc.moveDown(0.2);

      const headers = ['Hora', 'Bolsa', 'Conc.', 'Infusión', 'Drenaje', 'Parcial', 'Obs.'];
      const widths = [55, 40, 45, 60, 60, 55, 150];
      headers.forEach((h, i) => doc.font('bold').fontSize(9).text(h, { continued: i < headers.length - 1, width: widths[i] }));
      doc.moveDown(0.1);
      doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();

      lista.forEach(s => {
        const datos = [s.hora.padEnd(8), s.bolsa, s.concentracion, s.infusion, s.drenaje, s.parcial, s.observaciones || '-'];
        datos.forEach((d, i) =>
          doc.font('regular').fontSize(9).text(String(d), { continued: i < datos.length - 1, width: widths[i] })
        );
      });
    });

    doc.end();
  } catch (err) {
    doc.font('regular').text('Error al generar PDF');
    doc.end();
  }
};
