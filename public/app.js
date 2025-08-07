/* global M */
const API = '/api'; // Cambiar a la URL de tu API si es necesario
let cache = [];

/* ---------- util ---------- */
const $ = s => document.querySelector(s);
const hoyStr = () => new Date().toISOString().slice(0,10);      // YYYY-MM-DD

const horaAhora = () => {
  const d=new Date(); let h=d.getHours(), m=d.getMinutes(), ap='AM';
  if(h>=12){ ap='PM'; if(h>12) h-=12; } if(h===0) h=12;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`;
};

const formatoFecha = iso => {
  /* iso viene 'YYYY-MM-DD' */
  const [y, m, d] = iso.split('-');            // strings
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
};

const toMinutes = h => {                    // "03:45 PM" → 225
  let t=h.trim().toUpperCase(), am=null;
  if(t.endsWith('AM')||t.endsWith('PM')){am=t.slice(-2);t=t.slice(0,-2).trim();}
  const [hh,mm='0']=t.split(':'), m=parseInt(mm,10); let h24=parseInt(hh,10);
  if(am==='PM'&&h24!==12) h24+=12; if(am==='AM'&&h24===12) h24=0;
  return h24*60+m;
};

/* ---------- arranque ---------- */
document.addEventListener('DOMContentLoaded', () => {
  M.Timepicker.init(document.querySelectorAll('.timepicker'),
    { defaultTime:'now', twelveHour:true, autoClose:true });
  M.FormSelect.init(document.querySelectorAll('select'));
  M.Modal.init($('#modal-editar'));

  // ↓ selecciones iniciales (día y hora actuales)
  $('#fecha').value = hoyStr();
  $('#hora').value  = horaAhora();

  const hoy=new Date();
  $('#filtro-mes').value =
    `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;

  $('#btn-filtrar').addEventListener('click', cargarRegistros);
  $('#btn-pdf')    .addEventListener('click', () =>
      window.open(`${API}/pdf?mes=${$('#filtro-mes').value}`,'_blank'));
  $('#fecha')      .addEventListener('change', autocompletarDia);

  $('#registro-form').addEventListener('submit', crearRegistro);
  $('#editar-form') .addEventListener('submit', guardarEdicion);
  $('#tabla-registros').addEventListener('click', manejarClicksTabla);

  cargarRegistros();
});

/* ---------- CRUD ---------- */
async function crearRegistro(e){
  e.preventDefault();
  await fetch(`${API}/registro`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(datosForm(''))
  });
  e.target.reset();
  $('#fecha').value = hoyStr();            // repone valores por defecto
  $('#hora').value  = horaAhora();
  await cargarRegistros();
}

async function guardarEdicion(e){
  e.preventDefault();
  const id=$('#edit-id').value;
  await fetch(`${API}/registro/${id}`,{
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(datosForm('edit-'))
  });
  M.Modal.getInstance($('#modal-editar')).close();
  await cargarRegistros();
}

/* ---------- clicks tabla ---------- */
async function manejarClicksTabla(e){
  const btn = e.target.closest('button[data-id]');
  if(!btn) return;
  const {id,accion}=btn.dataset;

  if(accion==='borrar'){
    if(confirm('¿Eliminar registro?')){
      await fetch(`${API}/registro/${id}`,{method:'DELETE'});
      await cargarRegistros();
    }
    return;
  }
  const reg=cache.find(r=>r.id===Number(id));
  llenarModal(reg);
  M.Modal.getInstance($('#modal-editar')).open();
}

/* ---------- cargar & pintar ---------- */
async function cargarRegistros(){
  const [y,m]=$('#filtro-mes').value.split('-');
  const desde=`${y}-${m}-01`;
  const hasta=new Date(y,parseInt(m),0).toISOString().slice(0,10);

  const res = await fetch(`${API}/registros?desde=${desde}&hasta=${hasta}`);
  cache = await res.json();
  pintarTabla();
}

function pintarTabla() {
  const porDia = cache.reduce((acc, r) => {
    (acc[r.fecha] ??= []).push(r);
    return acc;
  }, {});
  const dias = Object.keys(porDia).sort((a, b) => b.localeCompare(a));

  const tbody = $('#tabla-registros tbody');
  tbody.innerHTML = '';
  dias.forEach(fecha => {
    const lista = porDia[fecha].sort((a, b) => toMinutes(a.hora) - toMinutes(b.hora)); // asc ↑
    const total = lista.reduce((s, r) => s + r.parcial, 0);

    tbody.insertAdjacentHTML('beforeend',
      `<tr class="dia-row"><td colspan="9">📅 ${formatoFecha(fecha)} — TOTAL: <strong>${total} ml</strong></td></tr>`);

    lista.forEach(r => {
      const observacionCorta = r.observaciones?.substring(0, 20) || '-'; // Limitar a 20 caracteres
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${formatoFecha(r.fecha)}</td><td>${r.hora}</td><td>${r.bolsa}</td>
          <td>${r.concentracion}</td><td>${r.infusion}</td><td>${r.drenaje}</td>
          <td>${r.parcial}</td>
          <td>
            <span class="observacion" data-observacion="${r.observaciones || ''}">
              ${observacionCorta}${r.observaciones?.length > 20 ? '...' : ''}
            </span>
          </td>
          <td>
            <button class="btn-small blue lighten-2" data-id="${r.id}" data-accion="editar"><i class="material-icons">edit</i></button>
            <button class="btn-small red  lighten-2" data-id="${r.id}" data-accion="borrar"><i class="material-icons">delete</i></button>
          </td>
        </tr>`);
    });
  });
}

document.addEventListener('click', (e) => {
  const observacion = e.target.closest('.observacion');
  if (observacion) {
    const textoCompleto = observacion.dataset.observacion;
    alert(`Observación completa:\n\n${textoCompleto}`);
  }
});

/* ---------- PDF ---------- */
function descargarPDF(){
  window.open(`${API}/pdf?mes=${$('#filtro-mes').value}`,'_blank');
}

/* ---------- helpers ---------- */
const datosForm = p => ({
  fecha: $('#'+p+'fecha').value,
  hora : $('#'+p+'hora').value,
  bolsa: Number($('#'+p+'bolsa').value),
  concentracion: $('#'+p+'concentracion').value,
  infusion : Number($('#'+p+'infusion').value),
  drenaje  : Number($('#'+p+'drenaje').value),
  observaciones: $('#'+p+'observaciones').value.trim()
});

/* autocompletar bolsa / concentración */
async function autocompletarDia(){
  const f=$('#fecha').value; if(!f) return;
  const res=await fetch(`${API}/registros?desde=${f}&hasta=${f}`);
  const lista=await res.json();

  $('#bolsa').value = lista.length ? Math.max(...lista.map(r=>r.bolsa))+1 : 1;

  if(lista.length){
    const ult = lista.reduce((a,b)=> toMinutes(b.hora)>toMinutes(a.hora)?b:a);
    $('#concentracion').value = ult.concentracion;
    M.FormSelect.getInstance($('#concentracion'))?.destroy();
    M.FormSelect.init($('#concentracion'));
  }
}

function llenarModal(r){
  $('#edit-id').value=r.id;
  $('#edit-fecha').value=r.fecha;
  $('#edit-hora').value=r.hora;
  $('#edit-bolsa').value=r.bolsa;
  $('#edit-concentracion').value=r.concentracion;
  $('#edit-infusion').value=r.infusion;
  $('#edit-drenaje').value=r.drenaje;
  $('#edit-observaciones').value=r.observaciones||'';
  M.updateTextFields();
  M.FormSelect.getInstance($('#edit-concentracion'))?.destroy();
  M.FormSelect.init($('#edit-concentracion'));
}