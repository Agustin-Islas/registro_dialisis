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
    const sepY = 18; // espacio vertical entre días

    function getBlockHeight(fecha, lista) {
      let h = 0;
      h += doc.heightOfString(`${fmtFecha(fecha)}   —   Total diario: 99999 ml`, { width: 540, font: 'NotoSans-Bold', size: 12 });
      h += doc.currentLineHeight(true) * 0.4;
      h += doc.currentLineHeight(true) + 2.5;
      h += 1.5;
      lista.forEach(s => {
        const obs = s.observaciones || '-';
        const obsHeight = doc.heightOfString(obs, { width: widths[6], font: 'NotoSans-Regular', size: 9 });
        h += Math.max(obsHeight, doc.currentLineHeight(true));
      });
      // ¡No sumes sepY aquí!
      return h;
    }

    let primerDia = true;
    Object.keys(porDia).sort((a, b) => b.localeCompare(a)).forEach((fecha, idx, arr) => {
      const lista = porDia[fecha].sort((x, y) => toMinutes(x.hora) - toMinutes(y.hora));
      const total = lista.reduce((s, r) => s + r.parcial, 0);

      // Simular alto y saltar página si hace falta
      const blockHeight = getBlockHeight(fecha, lista);
      const bottomMargin = 40;
      const spaceLeft = doc.page.height - doc.y - bottomMargin;
      if (blockHeight > spaceLeft && !primerDia) {
        doc.addPage();
      }

      // Línea horizontal y margen antes del día, pero NO si estamos justo tras un salto de página
      if (!primerDia && doc.y > 80) { // 80 px: no poner si estamos muy arriba
        doc.moveDown(0.6);
        doc.moveTo(x0, doc.y).lineTo(x0 + widths.reduce((a, b) => a + b), doc.y).strokeColor('#aaa').lineWidth(1.2).stroke();
        doc.moveDown(0.5);
      }
      primerDia = false;

      doc.font('bold').fontSize(12)
        .text(`${fmtFecha(fecha)}   —   Total diario: ${total} ml`, { align: 'left', width: 540 });
      doc.moveDown(0.4);

      // Encabezado tabla
      const yHeader = doc.y;
      headers.forEach((h, i) => {
        doc.font('bold').fontSize(9).text(h, colX[i], yHeader, { width: widths[i], align: 'left' });
      });
      doc.y = yHeader + doc.currentLineHeight(true) + 1.5;
      doc.moveTo(x0, doc.y).lineTo(x0 + widths.reduce((a, b) => a + b), doc.y).strokeColor('#444').lineWidth(1).stroke();

      // Filas del día
      lista.forEach(s => {
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
        // Celdas alineadas
        cells.slice(0, 6).forEach((txt, i) => {
          const alignRight = [3, 4, 5].includes(i);
          doc.font('regular').fontSize(9).text(
            String(txt),
            colX[i],
            yFila,
            { width: widths[i], align: alignRight ? 'right' : 'left' }
          );
        });
        // Observación multilínea
        const obs = cells[6];
        doc.font('regular').fontSize(9).text(
          obs,
          colX[6],
          yFila,
          { width: widths[6], align: 'left' }
        );
        const obsHeight = doc.heightOfString(obs, { width: widths[6], font: 'NotoSans-Regular', size: 9 });
        const rowHeight = Math.max(obsHeight, doc.currentLineHeight(true));
        doc.y = yFila + rowHeight;
      });

      // Solo sumar margen al final si NO es el último bloque del mes (evita hoja extra al final)
      if (idx !== arr.length - 1) {
        doc.moveDown(sepY / doc.currentLineHeight(true));
      }
    });

    doc.end();
  } catch (err) {
    doc.font('regular').text('Error al generar PDF');
    doc.end();
  }
};
