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
$('go').onclick=async()=>{T=$('tok').value.trim();sessionStorage.setItem('fa-admin',T);await load()};
$('refresh').onclick=load;
$('mk').onclick=async()=>{const{s,j}=await api('POST','/v1/admin/invites',{count:+$('cnt').value,plan:$('plan').value,uses:+$('uses').value,note:$('note').value});const c=$('codes');if(s!==200){c.hidden=false;c.textContent='Error '+s;return}
 c.hidden=false;c.textContent=j.codes.join('\\n');$('copy').hidden=false;$('copy').onclick=()=>navigator.clipboard.writeText(j.codes.join('\\n'))};
$('upd').onclick=async()=>{const w=$('who').value.trim();if(!w)return;const b={};if(/^FA-/i.test(w))b.code=w.toUpperCase();else b.userId=w;if($('plan2').value)b.plan=$('plan2').value;if($('blk').value!=='')b.disabled=$('blk').value==='1';
 const{s,j}=await api('POST','/v1/admin/users',b);$('umsg').textContent=s===200?'Listo: '+j.updated+' usuario(s) modificado(s).':'Error '+s}
if(T)load();
</script></body></html>
`;
