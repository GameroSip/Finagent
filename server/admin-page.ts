// Panel de administración (una sola página, sin dependencias): crear códigos de invitación, ver el uso y el costo reales y bloquear usuarios.
// No lleva ningún secreto adentro: pide el token de administrador y lo guarda solo en la pestaña (sessionStorage). Todo el texto dinámico se
// inserta con textContent (nunca innerHTML), así que nada de lo que venga del servidor puede ejecutarse.
export const ADMIN_HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Panel de FinAgent</title>
<style>
:root{color-scheme:light dark;--bg:#0b0f14;--card:#141b24;--tx:#e8eef5;--mu:#8da0b3;--ac:#3ddc97;--bd:#243040}
@media(prefers-color-scheme:light){:root{--bg:#f4f6f9;--card:#fff;--tx:#0e1621;--mu:#5b6b7c;--ac:#0a8f5b;--bd:#dde3ea}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--tx);padding:16px;max-width:760px;margin:auto}
h1{font-size:20px;margin:0 0 14px}h2{font-size:16px;margin:0 0 10px}.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:14px;margin-bottom:14px}
label{display:block;font-size:12px;color:var(--mu);margin:8px 0 3px}input,select,button{font:inherit;padding:9px 11px;border-radius:9px;border:1px solid var(--bd);background:var(--bg);color:var(--tx);width:100%}
button{background:var(--ac);color:#04140d;border:0;font-weight:650;cursor:pointer;margin-top:10px}button.sec{background:transparent;color:var(--tx);border:1px solid var(--bd)}
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:5px 6px;text-align:left;border-bottom:1px solid var(--bd)}th{color:var(--mu);font-weight:500}
.codes{font:600 15px ui-monospace,monospace;white-space:pre;overflow:auto;background:var(--bg);padding:10px;border-radius:9px;margin-top:10px}.mu{color:var(--mu);font-size:13px}.err{color:#ff6b6b}.big{font-size:22px;font-weight:700}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
</style></head><body>
<h1>Panel de FinAgent</h1>
<div class="card" id="login"><h2>Ingresar</h2><label for="tok">Token de administrador</label><input id="tok" type="password" autocomplete="off" placeholder="El ADMIN_TOKEN del servidor"><button id="go">Entrar</button><p class="mu err" id="lerr"></p></div>
<div id="app" hidden>
 <div class="card"><h2>Uso y costo (últimos 7 días)</h2><div class="kpis" id="kpis"></div><div style="overflow:auto"><table id="byday"></table></div><p class="mu" id="top"></p><button class="sec" id="refresh">Actualizar</button></div>
 <div class="card" id="beta"><h2>Beta: uso, retención y qué piden</h2><p class="mu">Solo cuentan quienes aceptaron las estadísticas. Cada porcentaje trae entre paréntesis cuántas personas hay detrás y su intervalo de confianza del 95 %: con pocas personas el margen es enorme, así que sirve para detectar problemas grandes, no diferencias chicas.</p>
  <div class="row"><div><label for="b-days">Período</label><select id="b-days"><option value="7">7 días</option><option value="14" selected>14 días</option><option value="30">30 días</option></select></div><div><button id="b-go">Actualizar</button> <button class="sec" id="b-csv">Descargar eventos (CSV)</button></div></div>
  <div id="b-out"></div></div>
 <div class="card"><h2>Calculadora de precios</h2><p class="mu">Cuánto cuesta atender a una persona de cada plan y qué precio conviene cobrar. Usa los costos reales medidos cuando hay muestra suficiente; si no, estima con el precio oficial de Gemini.</p>
  <div class="row"><div><label for="p-util">Uso del cupo diario (%)</label><input id="p-util" type="number" min="1" max="100" value="40"></div><div><label for="p-days">Días de uso por mes</label><input id="p-days" type="number" min="1" max="30" value="15"></div></div>
  <div class="row"><div><label for="p-fee">Comisión de Google Play (%)</label><input id="p-fee" type="number" min="0" max="50" value="15"></div><div><label for="p-tax">Impuestos incluidos en el precio (%)</label><input id="p-tax" type="number" min="0" max="60" value="0"></div></div>
  <label for="p-margin">Margen que querés ganar (%)</label><input id="p-margin" type="number" min="5" max="95" value="60">
  <button id="p-go">Calcular</button><div id="p-out"></div></div>
 <div class="card"><h2>Crear códigos de acceso a un plan</h2><p class="mu">La app se abre sin código. Estos códigos son para tus testers: al canjearlos en Ajustes, su cuenta pasa al plan elegido.</p>
  <div class="row"><div><label for="cnt">Cantidad de códigos</label><input id="cnt" type="number" min="1" max="200" value="5"></div><div><label for="plan">Plan que desbloquean</label><select id="plan"><option value="plus">Plus</option><option value="pro">Pro</option></select></div></div>
  <label for="uses">Personas que pueden canjear cada código</label><input id="uses" type="number" min="1" max="1000" value="1">
  <label for="note">Nota (opcional: para quién es)</label><input id="note" maxlength="80"><button id="mk">Crear códigos</button><div class="codes" id="codes" hidden></div><button class="sec" id="copy" hidden>Copiar todos</button></div>
 <div class="card"><h2>Usuarios</h2><label for="who">Id de usuario, o un código (FA-XXXX-XXXX) para afectar a quienes lo canjearon</label><input id="who" autocomplete="off">
  <div class="row"><div><label for="plan2">Cambiar a plan</label><select id="plan2"><option value="">— no cambiar —</option><option value="free">Gratis</option><option value="plus">Plus</option><option value="pro">Pro</option></select></div><div><label for="blk">Estado</label><select id="blk"><option value="">— no cambiar —</option><option value="1">Bloquear</option><option value="0">Desbloquear</option></select></div></div>
  <button id="upd">Aplicar</button><p class="mu" id="umsg"></p></div>
</div>
<script>
const $=id=>document.getElementById(id);let T=sessionStorage.getItem('fa-admin')||'';
async function api(m,p,b){const r=await fetch(p,{method:m,headers:{'content-type':'application/json',authorization:'Bearer '+T},body:b?JSON.stringify(b):undefined});let j=null;try{j=await r.json()}catch{}return{s:r.status,j}}
function cell(tr,t,h){const c=document.createElement(h?'th':'td');c.textContent=t;tr.appendChild(c)}
async function load(){const{s,j}=await api('GET','/v1/admin/usage?days=7');if(s!==200){$('lerr').textContent='Token incorrecto.';return false}
 $('login').hidden=true;$('app').hidden=false;const k=$('kpis');k.replaceChildren();
 for(const[t,v]of[['Respuestas',j.total.answers],['Pedidos al modelo',j.total.calls],['Costo (USD)',j.total.cost.toFixed(4)],['USD por respuesta',j.total.costPerAnswer==null?'—':j.total.costPerAnswer.toFixed(5)],['Cuentas',j.users],['Nivel de Gemini',j.tier==='free'?'Gratuito':'De pago'],['Sin cupo en Gemini (429)',j.stats.gemini429],['Rechazos por capacidad',j.stats.capacityRejects],['Quieren Plus',j.interest.plus||0],['Quieren Pro',j.interest.pro||0]]){const d=document.createElement('div');const a=document.createElement('div');a.className='big';a.textContent=v;const b=document.createElement('div');b.className='mu';b.textContent=t;d.append(a,b);k.appendChild(d)}
 const tb=$('byday');tb.replaceChildren();const h=document.createElement('tr');for(const x of['Día','Modelo','Pedidos','Entrada','Salida','Razonam.','USD'])cell(h,x,1);tb.appendChild(h);
 for(const r of j.byDay){const tr=document.createElement('tr');for(const x of[r.day,r.model,r.calls,r.input,r.output,r.thoughts,r.cost.toFixed(4)])cell(tr,x);tb.appendChild(tr)}
 $('top').textContent=j.topUsers.length?'Mayor gasto: '+j.topUsers.map(u=>u.user_id.slice(0,8)+' ('+u.calls+' pedidos, USD '+u.cost.toFixed(4)+')').join(' · '):'Todavía no hay uso.';return true}
$('go').onclick=async()=>{T=$('tok').value.trim();sessionStorage.setItem('fa-admin',T);if(await load())loadBeta()};
$('p-go').onclick=async()=>{const q=new URLSearchParams({utilization:$('p-util').value/100,daysActive:$('p-days').value,playFee:$('p-fee').value/100,tax:$('p-tax').value/100,margin:$('p-margin').value/100});
 const{s,j}=await api('GET','/v1/admin/pricing?'+q);const o=$('p-out');o.replaceChildren();if(s!==200){o.textContent='Error '+s;return}
 const usd=(n,d=2)=>'USD '+n.toFixed(d);
 for(const e of j.plans){const h=document.createElement('h2');h.style.marginTop='14px';h.textContent=e.plan.toUpperCase()+' · '+e.model;o.appendChild(h);
  const p=document.createElement('p');p.className='mu';p.textContent='Costo por respuesta: '+usd(e.costPerAnswer,4)+' ('+(e.source==='measured'?'medido en este servidor':'estimado')+') · uso moderado: '+Math.round(e.answersAvg)+' respuestas/mes = '+usd(e.costAvg)+' · peor caso: '+e.answersMax+' = '+usd(e.costMax);o.appendChild(p);
  const p2=document.createElement('p');p2.textContent='Precio mínimo (equilibrio): '+usd(e.breakEven)+' · recomendado: '+usd(e.recommended)+' · mínimo aguantando el peor caso: '+usd(e.breakEvenWorst);o.appendChild(p2);
  const tb=document.createElement('table');const h2=document.createElement('tr');for(const x of['Precio','Te queda','Margen (uso moderado)','Margen (peor caso)'])cell(h2,x,1);tb.appendChild(h2);
  for(const r of e.rows){const tr=document.createElement('tr');for(const x of[usd(r.price),usd(r.net),(r.marginAvg*100).toFixed(0)+'%',(r.marginWorst*100).toFixed(0)+'%'])cell(tr,x);tb.appendChild(tr)}o.appendChild(tb)}
 const n=document.createElement('p');n.className='mu';n.textContent=j.note;o.appendChild(n)};
$('refresh').onclick=load;
$('mk').onclick=async()=>{const{s,j}=await api('POST','/v1/admin/invites',{count:+$('cnt').value,plan:$('plan').value,uses:+$('uses').value,note:$('note').value});const c=$('codes');if(s!==200){c.hidden=false;c.textContent='Error '+s;return}
 c.hidden=false;c.textContent=j.codes.join('\\n');$('copy').hidden=false;$('copy').onclick=()=>navigator.clipboard.writeText(j.codes.join('\\n'))};
$('upd').onclick=async()=>{const w=$('who').value.trim();if(!w)return;const b={};if(/^FA-/i.test(w))b.code=w.toUpperCase();else b.userId=w;if($('plan2').value)b.plan=$('plan2').value;if($('blk').value!=='')b.disabled=$('blk').value==='1';
 const{s,j}=await api('POST','/v1/admin/users',b);$('umsg').textContent=s===200?'Listo: '+j.updated+' usuario(s) modificado(s).':'Error '+s}

const FEAT={cartera:'Mi cartera',calculadora:'Calculadora de escenarios',alertas:'Avisos en el celular',cuentas:'Conectar mis cuentas',ejecucion:'Operar desde la app',recomendaciones:'Recomendaciones personalizadas',tiempo_real:'Precios en tiempo real'};
const EVN={app_open:'Abrió la app',screen:'Cambió de pantalla',asset_open:'Abrió un activo',search:'Buscó',search_miss:'Búsqueda sin resultado',chart_range:'Cambió el período del gráfico',chart_kind:'Cambió línea/velas',chart_tool:'Usó una herramienta del gráfico',stress_view:'Vio el termómetro',move_view:'Vio el movimiento esperado',plan_open:'Abrió Mi plan',plan_saved:'Guardó Mi plan',plan_removed:'Borró Mi plan',watch:'Agregó/quitó un favorito',ai_send:'Le preguntó al asistente',ai_done:'El asistente respondió',ai_error:'Error del asistente',ai_rate:'Calificó una respuesta',quota_block:'Chocó con el tope diario',upsell:'Aviso de planes',fakedoor:'Lista de funciones futuras',setting:'Cambió un ajuste',feedback_sent:'Envió un comentario',intro_step:'Paso de la introducción',tour_slide:'Diapositiva del recorrido',error:'Error de la app'};
function mk(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e}
function pct(p){if(!p||p.rate==null)return '— (sin base: '+(p?p.n:0)+')';return (p.rate*100).toFixed(0)+' % ('+p.k+' de '+p.n+'; entre '+(p.lo*100).toFixed(0)+' y '+(p.hi*100).toFixed(0)+' %)'}
function tbl(parent,head,rows){const t=mk('table');const h=mk('tr');for(const x of head)h.appendChild(mk('th',x));t.appendChild(h);for(const r of rows){const tr=mk('tr');for(const x of r)tr.appendChild(mk('td',x==null?'—':String(x)));t.appendChild(tr)}const w=mk('div');w.style.overflow='auto';w.appendChild(t);parent.appendChild(w)}
function sec(parent,title,note){parent.appendChild(mk('h2',title)).style.marginTop='18px';if(note)parent.appendChild(mk('p',note,'mu'))}
function kv(parent,rows){tbl(parent,['Dato','Valor'],rows)}
function num(x,d){return x==null?'—':(+x).toFixed(d==null?1:d)}
function fmtDate(ts){return new Date(ts).toISOString().slice(0,16).replace('T',' ')}
function renderBeta(m){const o=$('b-out');o.replaceChildren();
 for(const w of m.warnings)o.appendChild(mk('p','⚠ '+w,'err'));
 sec(o,'Usuarios');kv(o,[['Registrados',m.users.registered],['Con datos (aceptaron las estadísticas y usaron la app)',m.users.withData],['Aceptaron / no aceptaron / sin responder',m.users.consentYes+' / '+m.users.consentNo+' / '+m.users.undecided],['Activos hoy',m.active.dauToday],['Activos en 7 días',m.active.wau],['Activos en 30 días',m.active.mau],['Activos hoy ÷ activos en 7 días',m.active.stickiness==null?'—':(m.active.stickiness*100).toFixed(0)+' %'],['Días activos por persona (mediana)',num(m.intensity.activeDaysMedian)],['Con 3 o más días activos',pct(m.intensity.usersWith3PlusDays)]]);
 sec(o,'¿Vuelven?','Día 1: volvió al día siguiente. Día 7: volvió exactamente al día 7. Semana 2: volvió algún día entre el 7 y el 13. Solo cuentan quienes ya cumplieron ese plazo.');
 kv(o,[['Día 1',pct(m.retention.d1)],['Día 7',pct(m.retention.d7)],['Semana 2',pct(m.retention.w2)]]);
 tbl(o,['Cohorte (día del primer uso)','Personas','Día 1','Día 7','Semana 2'],m.retention.cohorts.map(c=>[c.day,c.size,c.d1,c.d7,c.w2]));
 sec(o,'Asistente de IA');const a=m.ai;
 kv(o,[['Usaron el asistente',pct(a.users)],['Consultas',a.sends],['Consultas por persona y día activo',num(a.perUserPerActiveDay,2)],['Usaron la IA el primer día',pct(a.usedAiOnFirstDay)],['Personas con 1 / 2–4 / 5–9 / 10+ consultas',a.usage.once+' / '+a.usage.few+' / '+a.usage.some+' / '+a.usage.heavy],['Cómo empezaron la consulta',JSON.stringify(a.sources)],['Respuestas completadas sobre consultas enviadas',pct(a.completed)],['Errores',a.errorCount+' '+JSON.stringify(a.errors)],['Chocaron con el tope diario/mensual',a.quotaBlocks+' veces, '+a.quotaBlockUsers+' personas'],['Tiempo de respuesta (mediana / p90)',a.latencyMs?(a.latencyMs.median/1000).toFixed(1)+' s / '+(a.latencyMs.p90/1000).toFixed(1)+' s':'—'],['Consultas a herramientas por respuesta',num(a.avgSteps)],['Cifras verificadas / quitadas por no tener respaldo',a.verifier.figuresChecked+' / '+a.verifier.figuresUnverified],['Respuestas que necesitaron corrección',pct(a.verifier.fixedShare)],['Útil (👍) / no útil (👎)',a.rating.up+' / '+a.rating.down+' · útil: '+pct(a.rating.helpful)],['Motivos del 👎',JSON.stringify(a.rating.reasons)]]);
 tbl(o,['Herramienta','Usos','Personas'],a.tools.map(t=>[t.name,t.uses,t.users]));
 sec(o,'Tiempo de respuesta por nivel','Mediana y p90 de lo que tarda cada respuesta completa (incluye las consultas a herramientas). Si el nivel Avanzado tarda mucho más que el Rápido, el razonamiento o el límite de espera necesitan ajuste.');
 tbl(o,['Nivel','Mediana','p90','Respuestas'],[['Rápido',a.latencyByTier.rapido],['Avanzado',a.latencyByTier.avanzado],['Profundo',a.latencyByTier.profundo]].map(r=>[r[0],r[1]?(r[1].median/1000).toFixed(1)+' s':'—',r[1]?(r[1].p90/1000).toFixed(1)+' s':'—',r[1]?r[1].n:0]));
 sec(o,'Nivel que respondió','Pedidos a Gemini por nivel de FinAgent AI. En los planes de pago el nivel esperado es Avanzado: si contesta el Rápido, el nivel del plan estaba saturado o no disponible.');
 tbl(o,['Nivel','Pedidos','% del total'],[['Rápido',a.tiers.calls.rapido],['Avanzado',a.tiers.calls.avanzado],['Profundo',a.tiers.calls.profundo],['Otro / desconocido',a.tiers.calls.otro]].map(r=>[r[0],r[1],a.tiers.total?(r[1]*100/a.tiers.total).toFixed(0)+' %':'—']));
 kv(o,[['Planes de pago: pedidos respondidos con el nivel Rápido (respaldo)',pct(a.tiers.paidFellBack)]]);
 if(a.unusedTools.length)o.appendChild(mk('p','Herramientas que nadie usó: '+a.unusedTools.join(', '),'mu'));
 sec(o,'Qué piden y qué les falta');
 tbl(o,['Activo','Tipo','Personas','Aperturas'],m.needs.topAssets.map(x=>[x.sym,x.group,x.users,x.opens]));
 sec(o,'Búsquedas sin resultado','Activos que la gente buscó y la app no encontró: son los que faltan cubrir.');
 tbl(o,['Búsqueda','Personas','Veces'],m.needs.searchMisses.map(x=>[x.q,x.users,x.searches]));
 sec(o,'Votos por funciones que todavía no existen','Un voto por persona y función. La base son todos los usuarios registrados, hayan aceptado o no las estadísticas.');
 tbl(o,['Función','Votos','Vieron la lista','% de registrados'],m.needs.features.map(f=>[FEAT[f.feature]||f.feature,f.votes,f.saw,pct(f)]));
 sec(o,'Herramientas del gráfico más activadas');tbl(o,['Herramienta','Personas'],m.needs.chartTools.map(x=>[x.tool,x.users]));
 sec(o,'Comentarios y recomendación');const n=m.feedback.nps;
 kv(o,[['Respuestas de recomendación (0 a 10)',n.n],['Puntaje NPS (promotores 9–10 menos detractores 0–6)',n.score==null?'—':n.score],['Promotores / pasivos / detractores',n.promoters+' / '+n.passives+' / '+n.detractors],['Promedio',num(n.mean)],['Comentarios por tipo',JSON.stringify(m.feedback.byKind)]]);
 tbl(o,['Fecha','Tipo','Nota','Versión','Persona','Texto'],m.feedback.latest.map(f=>[fmtDate(f.ts),f.kind,f.score,f.version,f.user,f.text]));
 sec(o,'Todo lo que hicieron (personas distintas y cantidad)');
 tbl(o,['Evento','Personas','% de los que tienen datos','Veces'],m.adoption.map(x=>[EVN[x.name]||x.name,x.users,pct(x),x.events]));
}
async function loadBeta(){const o=$('b-out');o.replaceChildren(mk('p','Cargando…','mu'));const{s,j}=await api('GET','/v1/admin/metrics?days='+$('b-days').value);if(s!==200){o.replaceChildren(mk('p','No pude cargar las métricas (error '+s+').','err'));return}renderBeta(j)}
$('b-go').onclick=loadBeta;$('b-days').onchange=loadBeta;
$('b-csv').onclick=async()=>{const r=await fetch('/v1/admin/events.csv?days=30',{headers:{authorization:'Bearer '+T}});if(!r.ok)return;const b=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='finagent-eventos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
if(T)load().then(ok=>{if(ok)loadBeta()});
</script></body></html>
`;
