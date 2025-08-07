const PDFDocument = require('pdfkit');
const path        = require('path');
const db          = require('../db/db');

/* --- helpers --- */
const toMinutes = h => {
  let t = h.trim().toUpperCase(), am = null;
  if (t.endsWith('AM') || t.endsWith('PM')) { am = t.slice(-2); t = t.slice(0, -2).trim(); }
  const [hh, mm = '0'] = t.split(':'), m = +mm;
  let h24 = +hh;
  if (am === 'PM' && h24 !== 12) h24 += 12;
  if (am === 'AM' && h24 === 12) h24 = 0;
  return h24 * 60 + m;
};
const fmtFecha = iso => { const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
const fmtConc  = n   => `${String(n).replace('.', ',')} %`;

module.exports = async (req, res) => {
  const { mes } = req.query;
  if (!mes) return res.status(400).send('mes requerido (YYYY-MM)');

  /* --- PDF --- */
  const doc = new PDFDocument({ margin:40 });
  try {
    doc.registerFont('regular', path.join(__dirname, '../fonts/NotoSans-Regular.ttf'));
    doc.registerFont('bold',    path.join(__dirname, '../fonts/NotoSans-Bold.ttf'));
  } catch {/* fallback Helvetica */}
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="registro-${mes}.pdf"`);
  doc.pipe(res);

  doc.font('bold').fontSize(16).text(`Registro mensual de diálisis — ${mes}`, { align:'center' });
  doc.moveDown();

  /* --- datos --- */
  const { rows } = await db.execute({ sql:'SELECT * FROM sesiones WHERE fecha LIKE ?', args:[`${mes}-%`] });
  const porDia = rows.reduce((acc, r) => {
      (acc[r.fecha] ??= []).push(r);
      return acc;                       // ← devolvemos el acumulador
  }, {});  const widths  = [55,40,45,60,60,55,150];
  const x0      = doc.x;                               // margen izquierdo real
  const colX    = widths.reduce((arr,w,i)=>(arr[i+1]=arr[i]+w,arr),[x0]); // posiciones absolutas

  const drawRow = (cells,font='regular',opts={})=>{
    const y = doc.y;                                   // fija fila
    cells.forEach((txt,i)=>{
      const alignRight = [3,4,5].includes(i);          // columnas numéricas
      doc.font(font).fontSize(9)
         .text(String(txt), colX[i], y,
               { width: widths[i], align: alignRight?'right':'left', ...opts });
    });
    doc.moveDown(0.3);
  };

  for (const fecha of Object.keys(porDia).sort((a,b)=>b.localeCompare(a))) {
    const lista = porDia[fecha].sort((a,b)=>toMinutes(a.hora)-toMinutes(b.hora));
    const total = lista.reduce((s,r)=>s+Number(r.parcial),0);

    doc.moveDown(0.5).font('bold').fontSize(12)
       .text(`${fmtFecha(fecha)} — Total diario: ${total} ml`);
    doc.moveDown(0.2);

    drawRow(['Hora','Bolsa','Conc.','Infusión','Drenaje','Parcial','Obs.'],'bold',{underline:true});

    lista.forEach(s=>{
      drawRow([
        s.hora,
        s.bolsa,
        fmtConc(s.concentracion),
        `${s.infusion} ml`,
        `${s.drenaje} ml`,
        `${s.parcial>=0?'+':''}${s.parcial} ml`,
        s.observaciones||'-'
      ]);
    });
  }

  doc.end();
};
