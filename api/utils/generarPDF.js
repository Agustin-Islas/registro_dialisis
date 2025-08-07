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
const fmtFecha = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const fmtConc = n => `${String(n).replace('.', ',')} %`;

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
    const headers = ['Hora', 'Bolsa', 'Conc.', 'Infusión', 'Drenaje', 'Parcial', 'Obs.'];
    const widths = [55, 40, 45, 60, 60, 55, 150];
    const x0 = doc.x;
    const colX = widths.reduce((arr, w, i) => (arr[i + 1] = arr[i] + w, arr), [x0]);

    let primerDia = true;
    Object.keys(porDia).sort((a, b) => b.localeCompare(a)).forEach(fecha => {
      const lista = porDia[fecha].sort((x, y) => toMinutes(x.hora) - toMinutes(y.hora));
      const total = lista.reduce((s, r) => s + r.parcial, 0);

      // Espacio y línea horizontal antes de cada día (menos el primero)
      if (!primerDia) {
        doc.moveDown(1);
        doc.moveTo(x0, doc.y).lineTo(x0 + widths.reduce((a, b) => a + b), doc.y).strokeColor('#444').stroke();
        doc.moveDown(0.3);
      }
      primerDia = false;

      // Cabecera de día: alineada a la izquierda, formato humano
      doc.font('bold').fontSize(12)
        .text(`📅 ${fmtFecha(fecha)}   —   Total diario: ${total} ml`, { align: 'left', width: 520 });
      doc.moveDown(0.2);

      // Cabecera tabla alineada con las columnas
      const yHeader = doc.y;
      headers.forEach((h, i) => {
        doc.font('bold').fontSize(9).text(h, colX[i], yHeader, { width: widths[i], align: 'left' });
      });
      doc.y = yHeader + doc.currentLineHeight(true);
      // Línea bajo encabezado
      doc.moveTo(x0, doc.y).lineTo(x0 + widths.reduce((a, b) => a + b), doc.y).strokeColor('#444').stroke();

      // Filas
      lista.forEach(s => {
        // Cada fila puede ser multilínea por observaciones largas
        const yFila = doc.y;
        const cells = [
          s.hora,
          s.bolsa,
          fmtConc(s.concentracion),
          `${s.infusion} ml`,
          `${s.drenaje} ml`,
          `${s.parcial >= 0 ? '+' : ''}${s.parcial} ml`,
          s.observaciones || '-'
        ];
        // Datos normales
        cells.slice(0, 6).forEach((txt, i) => {
          const alignRight = [3, 4, 5].includes(i); // numéricas
          doc.font('regular').fontSize(9).text(
            String(txt),
            colX[i],
            yFila,
            { width: widths[i], align: alignRight ? 'right' : 'left' }
          );
        });
        // Observación: multilínea permitida
        const obs = cells[6];
        doc.font('regular').fontSize(9).text(
          obs,
          colX[6],
          yFila,
          { width: widths[6], align: 'left' }
        );
        // Calcular alto de la fila
        const obsHeight = doc.heightOfString(obs, { width: widths[6], font: 'NotoSans-Regular', size: 9 });
        const rowHeight = Math.max(obsHeight, doc.currentLineHeight(true));
        doc.y = yFila + rowHeight;
      });
    });

    doc.end();
  } catch (err) {
    doc.font('regular').text('Error al generar PDF');
    doc.end();
  }
};
