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
    const porDia = rows.reduce((acc, r) => {
      (acc[r.fecha] ??= []).push(r);
      return acc;
    }, {});

    const headers = ['Hora', 'Bolsa', 'Conc.', 'Infusión', 'Drenaje', 'Parcial', 'Obs.'];
    const widths = [55, 40, 45, 60, 60, 55, 150];
    const x0 = doc.x;
    const colX = widths.reduce((arr, w, i) => (arr[i + 1] = arr[i] + w, arr), [x0]);

    // Calcula el alto del bloque de día para salto de página atómico
    function getDayBlockHeight(doc, fecha, lista) {
      let h = 0;
      h += doc.heightOfString(`${fmtFecha(fecha)}   —   Total diario: 0000 ml`, { width: 500, font: 'NotoSans-Bold', size: 12 });
      h += doc.currentLineHeight(true) * 0.7;
      // Usa drawRow para encabezado
      h += doc.currentLineHeight(true); // una sola línea para cabecera
      h += 3; // espacio/borde
      for (const s of lista) {
        // Calcula alto de la fila (observación puede ser multilínea)
        const obs = s.observaciones || '-';
        const obsHeight = doc.heightOfString(obs, { width: widths[6], font: 'NotoSans-Regular', size: 9 });
        const rowHeight = Math.max(obsHeight, doc.currentLineHeight(true));
        h += rowHeight + doc.currentLineHeight(true) * 0.05;
      }
      h += doc.currentLineHeight(true) * 0.2;
      return h;
    }

    // Dibuja una fila (puede ser para datos o cabecera)
    function drawRow(arr, font = 'regular') {
      const y = doc.y;
      arr.forEach((txt, i) => {
        const alignRight = [3, 4, 5].includes(i); // columnas numéricas
        doc.font(font).fontSize(9).text(
          String(txt),
          colX[i],
          y,
          { width: widths[i], align: alignRight ? 'right' : 'left' }
        );
      });
      // ¿Observación multilínea? Solo si fila de datos
      if (font === 'regular' && arr.length === 7) {
        const obs = arr[6];
        const obsHeight = doc.heightOfString(obs, { width: widths[6], font: 'NotoSans-Regular', size: 9 });
        const rowHeight = Math.max(obsHeight, doc.currentLineHeight(true));
        doc.y = y + rowHeight + doc.currentLineHeight(true) * 0.05;
      } else {
        doc.y = y + doc.currentLineHeight(true);
      }
    }

    Object.keys(porDia).sort((a, b) => b.localeCompare(a)).forEach(fecha => {
      const lista = porDia[fecha].sort((x, y) => toMinutes(x.hora) - toMinutes(y.hora));
      const total = lista.reduce((s, r) => s + r.parcial, 0);

      // Paginación: bloque de día completo
      const blockHeight = getDayBlockHeight(doc, fecha, lista);
      const bottomMargin = 40;
      const spaceLeft = doc.page.height - doc.y - bottomMargin;
      if (blockHeight > spaceLeft) doc.addPage();

      // Cabecera de día — ancho grande y alineado a la IZQUIERDA
      doc.moveDown(0.5)
        .font('bold').fontSize(12)
        .text(`${fecha}   —   Total diario: ${total} ml`, {
          align: 'left',
          width: 500 // Asegura suficiente espacio horizontal (ajusta si querés)
        });
      doc.moveDown(0.2);


      // Imprimir cabecera tabla usando drawRow para mantener alineación
      drawRow(headers, 'bold');
      doc.moveTo(colX[0], doc.y).lineTo(colX.at(-1), doc.y).strokeColor('#444').stroke();

      // Imprimir filas de sesiones
      lista.forEach(s => {
        drawRow([
          s.hora,
          s.bolsa,
          fmtConc(s.concentracion),
          `${s.infusion} ml`,
          `${s.drenaje} ml`,
          `${s.parcial >= 0 ? '+' : ''}${s.parcial} ml`,
          s.observaciones || '-'
        ]);
      });

      doc.moveDown(0.2);
    });

    doc.end();
  } catch (err) {
    doc.font('regular').text('Error al generar PDF');
    doc.end();
  }
};
