const PDFDocument = require('pdfkit');
const path = require('path');
const db   = require('../db/db');

/* ---- helpers ---- */
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

const fmtConc  = n => `${String(n).replace('.', ',')} %`;

module.exports = async (req, res) => {
  const { mes } = req.query;
  if (!mes) return res.status(400).send('mes requerido (YYYY-MM)');

  /* ---- PDF ---- */
  const doc = new PDFDocument({ margin: 40 });
  try {
    // Si tenés las fuentes, mantené; si no, comentá estas dos líneas.
    doc.registerFont('regular', path.join(__dirname, '../fonts/NotoSans-Regular.ttf'));
    doc.registerFont('bold',    path.join(__dirname, '../fonts/NotoSans-Bold.ttf'));
  } catch { /* fallback a Helvetica */ }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="registro-${mes}.pdf"`);
  doc.pipe(res);

  /* ---- Cabecera ---- */
  doc.font('bold').fontSize(16).text(`Registro mensual de diálisis — ${mes}`, { align: 'center' });
  doc.moveDown();

  /* ---- Datos ---- */
  const result = await db.execute({
    sql : `SELECT * FROM sesiones WHERE fecha LIKE ?`,
    args: [`${mes}-%`]
  });

  const rows   = result.rows;
  const porDia = rows.reduce((acc, r) => ((acc[r.fecha] ??= []).push(r), acc), {});

  //                      Hora  Bolsa Conc. Infus. Drena. Parcial Obs.
  const widths =          [55,   40,   45,   60,    60,    60,     140]; // +5 px de aire extra en las últimas dos columnas

  for (const fecha of Object.keys(porDia).sort((a, b) => b.localeCompare(a))) {
    const lista  = porDia[fecha].sort((a, b) => toMinutes(a.hora) - toMinutes(b.hora));
    const total  = lista.reduce((s, r) => s + Number(r.parcial), 0);

    /* título del día */
    doc.moveDown(0.5)
       .font('bold').fontSize(12)
       .text(`${fmtFecha(fecha)} — Total diario: ${total} ml`, { align: 'left' });
    doc.moveDown(0.2);

    /* encabezado de tabla */
    const headers = ['Hora','Bolsa','Conc.','Infusión','Drenaje','Parcial','Obs.'];
    headers.forEach((h, i) =>
      doc.text(h, {
        continued: i < headers.length - 1,
        width: widths[i],
        underline: true,
        align: 'left'
      })
    );

    /* filas */
    lista.forEach(s => {
      const datos = [
        s.hora,
        s.bolsa,
        fmtConc(s.concentracion),
        `${s.infusion} ml`,
        `${s.drenaje} ml`,
        `${s.parcial >= 0 ? '+' : ''}${s.parcial} ml`,
        s.observaciones || '-'
      ];

      datos.forEach((d, i) =>
        doc.font('regular')
           .text(String(d), {
             continued: i < datos.length - 1,
             width: widths[i],
             align: 'left'
           })
      );
    });
  }

  doc.end();
};
