const PDFDocument = require('pdfkit');
const path = require('path');
const db = require('../db/db');

// Helpers
const toMinutes = h => {
  let t = h.trim().toUpperCase(), ampm = null;
  if (t.endsWith('AM') || t.endsWith('PM')) { ampm = t.slice(-2); t = t.slice(0, -2).trim(); }
  const [hh, mm = '0'] = t.split(':'), m = parseInt(mm, 10);
  let h24 = parseInt(hh, 10);
  if (ampm === 'PM' && h24 !== 12) h24 += 12;
  if (ampm === 'AM' && h24 === 12) h24 = 0;
  return h24 * 60 + m;
};
const fmtFecha = iso => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
const fmtConc = n => `${String(n).replace('.', ',')} %`;

module.exports = async (req, res) => {
  const { mes } = req.query;
  if (!mes) return res.status(400).send('mes requerido');

  const doc = new PDFDocument({ margin: 40 });
  try {
    doc.registerFont('regular', path.join(__dirname, '../fonts/NotoSans-Regular.ttf'));
    doc.registerFont('bold', path.join(__dirname, '../fonts/NotoSans-Bold.ttf'));
  } catch {}

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
    // --- FIX: agrupar bien ---
    const porDia = rows.reduce((acc, r) => {
      (acc[r.fecha] ??= []).push(r);
      return acc;
    }, {});

    // --- Config tabla ---
    const headers = ['Hora', 'Bolsa', 'Conc.', 'Infusión', 'Drenaje', 'Parcial', 'Obs.'];
    const widths = [55, 40, 45, 60, 60, 55, 150];
    const x0 = doc.x; // posición X de inicio
    const colX = widths.reduce((arr, w, i) => (arr[i+1] = arr[i] + w, arr), [x0]);

    // --- Función para imprimir fila con posición absoluta ---
    const drawRow = (cells, font='regular', opts={}) => {
      const y = doc.y;
      cells.forEach((txt, i) => {
        // Justifica derecha en columnas numéricas
        const alignRight = [3,4,5].includes(i); // Infusión, Drenaje, Parcial
        doc.font(font).fontSize(9).text(
          String(txt),
          colX[i],
          y,
          { width: widths[i], align: alignRight ? 'right' : 'left', ellipsis: true, ...opts }
        );
      });
      doc.moveDown(0.35); // espacio entre filas
    };

    // --- Pintar días y sesiones ---
    Object.keys(porDia).sort((a, b) => b.localeCompare(a)).forEach(fecha => {
      const lista = porDia[fecha].sort((x, y) => toMinutes(x.hora) - toMinutes(y.hora));
      const total = lista.reduce((s, r) => s + r.parcial, 0);

      doc.moveDown(0.5)
        .font('bold').fontSize(12)
        .text(`${fmtFecha(fecha)}   —   Total diario: ${total} ml`);
      doc.moveDown(0.2);

      drawRow(headers, 'bold', { underline: true });
      doc.moveTo(colX[0], doc.y).lineTo(colX.at(-1), doc.y).strokeColor('#444').stroke();

      lista.forEach(s => {
        drawRow([
          s.hora,
          s.bolsa,
          fmtConc(s.concentracion),
          `${s.infusion} ml`,
          `${s.drenaje} ml`,
          `${s.parcial >= 0 ? '+' : ''}${s.parcial} ml`,
          (s.observaciones || '-').slice(0, 60) // recorta observaciones largas
        ]);
      });
    });

    doc.end();
  } catch (err) {
    doc.font('regular').text('Error al generar PDF');
    doc.end();
  }
};
