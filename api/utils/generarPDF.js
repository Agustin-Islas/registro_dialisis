const PDFDocument = require('pdfkit');
const path = require('path');
const db = require('../db/db');

const toMinutes = h => {
  const [hh, mm='0'] = h.split(':');
  return parseInt(hh,10) * 60 + parseInt(mm,10);
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
      return h;
    }

    let primerDia = true;
    Object.keys(porDia).sort((a, b) => b.localeCompare(b)).forEach((fecha, idx, arr) => {
      const lista = porDia[fecha].sort((x, y) => toMinutes(x.hora) - toMinutes(y.hora));
      const total = lista.reduce((s, r) => s + r.parcial, 0);

      // Simular alto y saltar página si hace falta
      const blockHeight = getBlockHeight(fecha, lista);
      const bottomMargin = 40;
      const spaceLeft = doc.page.height - doc.y - bottomMargin;
      let saltoPagina = false;
      
      if (blockHeight > spaceLeft && !primerDia) {
        doc.addPage();
        saltoPagina = true;
      }

      // Línea horizontal y margen antes del día, pero NO si estamos justo tras un salto de página o es el primer día
      if (!primerDia && !saltoPagina) { 
        doc.moveDown(0.8);
        const currentY = doc.y;
        doc.moveTo(x0, currentY).lineTo(x0 + widths.reduce((a, b) => a + b), currentY).strokeColor('#ddd').lineWidth(0.5).stroke();
        doc.y = currentY + 1; // Restaurar Y después del stroke
        doc.moveDown(0.8);
      }
      primerDia = false;

      // Asegurar que el título se dibuje en la posición correcta con alineación izquierda
      const titleY = doc.y;
      doc.font('bold').fontSize(12);
      doc.text(`${fmtFecha(fecha)}   —   Total diario: ${total} ml`, x0, titleY, { 
        align: 'left', 
        width: 540 
      });
      doc.moveDown(0.4);

      // Encabezado tabla
      const yHeader = doc.y;
      headers.forEach((h, i) => {
        doc.font('bold').fontSize(9).text(h, colX[i], yHeader, { width: widths[i], align: 'left' });
      });
      doc.y = yHeader + doc.currentLineHeight(true) + 1.5;
      
      // Dibujar línea del encabezado
      const lineY = doc.y;
      doc.moveTo(x0, lineY).lineTo(x0 + widths.reduce((a, b) => a + b), lineY).strokeColor('#444').lineWidth(1).stroke();
      doc.y = lineY + 1; // Ajustar Y después del stroke

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
        
        // Celdas todas alineadas a la izquierda
        cells.slice(0, 6).forEach((txt, i) => {
          doc.font('regular').fontSize(9).text(
            String(txt),
            colX[i],
            yFila,
            { width: widths[i], align: 'left' }
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

      // Solo agregar margen consistente entre días si NO es el último bloque
      if (idx !== arr.length - 1) {
        doc.moveDown(1.2); // Espacio consistente entre días
      }
    });

    doc.end();
  } catch (err) {
    doc.font('regular').text('Error al generar PDF');
    doc.end();
  }
};