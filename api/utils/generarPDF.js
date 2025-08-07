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

    // Función para simular el alto de bloque de un día
    function getDayBlockHeight(doc, fecha, lista) {
      let h = 0;
      const startY = doc.y;
      h += doc.heightOfString(`${fmtFecha(fecha)}   —   Total diario: 0000 ml`, { font: 'NotoSans-Bold', size: 12 });
      h += doc.currentLineHeight(true) * 0.7;
      h += doc.heightOfString(headers.join(' '), { font: 'NotoSans-Bold', size: 9 });
      h += 3; // espacio/borde
      for (const s of lista) {
        h += doc.heightOfString(
          [
            s.hora,
            s.bolsa,
            fmtConc(s.concentracion),
            `${s.infusion} ml`,
            `${s.drenaje} ml`,
            `${s.parcial >= 0 ? '+' : ''}${s.parcial} ml`,
            s.observaciones || '-'
          ].join(' '),
          { width: widths[6], font: 'NotoSans-Regular', size: 9 }
        );
        h += doc.currentLineHeight(true) * 0.15;
      }
      h += doc.currentLineHeight(true) * 0.3; // extra margen
      return h;
    }

    // Dibuja una fila, observación multi-línea
    function drawRow(s, yBase) {
      // Resto de columnas en posición fija, obs. ocupa varias líneas si es necesario
      const obs = s.observaciones || '-';
      const y = doc.y;
      doc.font('regular').fontSize(9);

      // Calcular alto de observación para saber cuántas líneas
      const obsHeight = doc.heightOfString(obs, { width: widths[6], font: 'NotoSans-Regular', size: 9 });
      // Altura de la fila es el máximo entre obsHeight y el alto de una línea normal
      const rowHeight = Math.max(obsHeight, doc.currentLineHeight(true));

      // Pintar columnas normales (todas menos observación)
      [s.hora, s.bolsa, fmtConc(s.concentracion), `${s.infusion} ml`, `${s.drenaje} ml`, `${s.parcial >= 0 ? '+' : ''}${s.parcial} ml`]
        .forEach((txt, i) => {
          const alignRight = [3, 4, 5].includes(i);
          doc.font('regular').fontSize(9).text(
            String(txt),
            colX[i],
            y,
            { width: widths[i], align: alignRight ? 'right' : 'left' }
          );
        });
      // Pintar observación (multi-line)
      doc.font('regular').fontSize(9).text(
        obs,
        colX[6],
        y,
        { width: widths[6], align: 'left' }
      );
      doc.y = y + rowHeight + doc.currentLineHeight(true) * 0.05;
    }

    Object.keys(porDia).sort((a, b) => b.localeCompare(a)).forEach(fecha => {
      const lista = porDia[fecha].sort((x, y) => toMinutes(x.hora) - toMinutes(y.hora));
      const total = lista.reduce((s, r) => s + r.parcial, 0);

      // --- CONTROL DE CORTE DE PÁGINA ---
      // ¿Cabe el bloque entero?
      const blockHeight = getDayBlockHeight(doc, fecha, lista);
      const bottomMargin = 40;
      const spaceLeft = doc.page.height - doc.y - bottomMargin;
      if (blockHeight > spaceLeft) doc.addPage();

      // --- Imprimir cabecera de día ---
      doc.moveDown(0.5)
        .font('bold').fontSize(12)
        .text(`${fmtFecha(fecha)}   —   Total diario: ${total} ml`);
      doc.moveDown(0.2);

      // --- Imprimir encabezado tabla ---
      headers.forEach((h, i) => {
        doc.font('bold').fontSize(9).text(h, colX[i], doc.y, { width: widths[i], underline: true });
      });
      doc.moveDown(0.1);
      doc.moveTo(colX[0], doc.y).lineTo(colX.at(-1), doc.y).strokeColor('#444').stroke();

      // --- Imprimir cada fila de sesión ---
      lista.forEach(s => drawRow(s));

      doc.moveDown(0.2);
    });

    doc.end();
  } catch (err) {
    doc.font('regular').text('Error al generar PDF');
    doc.end();
  }
};
