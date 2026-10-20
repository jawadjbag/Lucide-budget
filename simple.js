/* Lucide Budget – local, single screen, no API and no analytics. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const DB_NAME='lucide-simple-budget-v1';
const YEAR_MONTH=()=>{const x=new Date();return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')};
const euro=x=>new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(x);
const escapeText=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const randomID=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+String(Math.random());
const nonnegative=(x,max=10000000)=>{const n=Number(x);if(!Number.isFinite(n)||n<0||n>max)throw Error('Vérifie le montant saisi.');return n};
const toCents=x=>Math.round((x+Number.EPSILON)*100)/100;
const newBudget=()=>({schema:'lucide-personal-v1',salary:0,vouchers:0,reserve:0,bills:[],orders:{count:0,unit:0},restaurants:{count:0,unit:0},extras:[]});
let budget=newBudget(),db=null,cryptoKey=null,ephemeral=false,saveChain=Promise.resolve(),initialized=false,pendingUpdate=null;
function validate(x){
 if(!x||x.schema!=='lucide-personal-v1'||!Array.isArray(x.bills)||x.bills.length>500||!Array.isArray(x.extras)||x.extras.length>2000)throw Error('Budget non reconnu');
 const d=newBudget();d.salary=nonnegative(x.salary);d.vouchers=nonnegative(x.vouchers||0);d.reserve=nonnegative(x.reserve||0);
 d.bills=x.bills.map((b,i)=>{if(!b||typeof b.label!=='string'||b.label.length>120||!['month','quarter','year'].includes(b.period))throw Error('Ligne de charge incorrecte : '+i);return {id:String(b.id||randomID()).slice(0,120),label:b.label.trim(),amount:nonnegative(b.amount),period:b.period};});
 for(const type of ['orders','restaurants']){const o=x[type]||{};d[type]={count:nonnegative(o.count||0,100),unit:nonnegative(o.unit||0)}};
 d.extras=x.extras.map(e=>{if(!e||typeof e.label!=='string'||e.label.length>120||!['once','month','quarter','year'].includes(e.period))throw Error('Dépense incorrecte');return {id:String(e.id||randomID()).slice(0,120),label:e.label,amount:nonnegative(e.amount),period:e.period,month:typeof e.month==='string'?e.month.slice(0,7):YEAR_MONTH()}});
 return d;
}
function budgetFromLink(){
 const m=location.hash.match(/^#budget=([A-Za-z0-9_-]+)$/);
 if(!m)return null;
 try {
  const encoded=m[1].replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(encoded);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const raw=JSON.parse(new TextDecoder().decode(bytes));
  if(Array.isArray(raw)&&raw[0]===1){const [_,salary,vouchers,reserve,orderCount,orderPrice,restCount,restPrice,items]=raw;return validate({schema:'lucide-personal-v1',salary,vouchers,reserve,orders:{count:orderCount,unit:orderPrice},restaurants:{count:restCount,unit:restPrice},extras:[],bills:items.map(([label,amount,cycle],i)=>({id:'entry-'+(i+1),label,amount,period:({m:'month',q:'quarter',y:'year'})[cycle]}))});}
  return validate(raw);
 } catch(e){setTimeout(()=>alert('Le lien de configuration est invalide. Réessaie depuis la conversation.'),200);return null;}
 finally {history.replaceState(null,'',location.pathname+location.search);}
}
function request(store,mode,callback){return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode);const req=callback(tx.objectStore(store));if(req){req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}else{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)}})}
async function openPrivateStorage(){
 db=await new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('data'))req.result.createObjectStore('data')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
 cryptoKey=await request('data','readonly',store=>store.get('device-key'));
 if(!cryptoKey){cryptoKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await request('data','readwrite',store=>store.put(cryptoKey,'device-key'))}
}
async function loadPrivateData(){
 const sealed=await request('data','readonly',store=>store.get('budget'));
 if(!sealed)return null;
 const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(sealed.iv)},cryptoKey,new Uint8Array(sealed.cipher));
 return validate(JSON.parse(new TextDecoder().decode(clear)));
}
async function storePrivateData(snapshot){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const clear=new TextEncoder().encode(JSON.stringify(snapshot));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,clear);
 await request('data','readwrite',store=>store.put({iv:Array.from(iv),cipher:Array.from(new Uint8Array(cipher))},'budget'));
}
function save(){if(ephemeral||!db){notify('Stockage indisponible : modifications non sauvegardées');return}const snapshot=structuredClone(budget);saveChain=saveChain.then(()=>storePrivateData(snapshot)).catch(e=>{console.error(e);notify('Sauvegarde impossible : vérifie le stockage de Safari')})}
function notify(text){const el=$('#notice');el.textContent=text;el.classList.add('visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.classList.remove('visible'),4100)}
const monthly=x=>x.period==='year'?x.amount/12:x.period==='quarter'?x.amount/3:x.amount;
function totals(){const fixed=budget.bills.reduce((s,b)=>s+monthly(b),0),orders=budget.orders.count*budget.orders.unit,restaurants=budget.restaurants.count*budget.restaurants.unit;
 const extra=budget.extras.filter(e=>e.period!=='once'||e.month===YEAR_MONTH()).reduce((s,e)=>s+monthly(e),0);
 const spent=fixed+orders+restaurants+extra,remaining=budget.salary-spent,maxSaving=Math.max(0,remaining-budget.reserve);return{fixed,orders,restaurants,extra,spent,remaining,maxSaving};}
const block=(label,value,meta,cls='')=>`<article class="stat ${cls}"><div class="stat-label">${label}</div><strong>${value}</strong><small>${meta}</small></article>`;
function chart(t){const base=Math.max(budget.salary,t.spent,1),ratio=n=>Math.max(0,Math.min(100,n/base*100));const a=ratio(t.fixed),b=ratio(t.orders+t.restaurants),c=ratio(t.extra),d=Math.min(100,a+b+c);
 const gradient=`conic-gradient(#776bf4 0% ${a}%, #ffb477 ${a}% ${a+b}%, #f29ba1 ${a+b}% ${d}%, #e6f3ee ${d}% 100%)`;
 return `<div class="chart-area"><div class="donut" style="background:${gradient}" role="img" aria-label="Diagramme des frais du mois"><div class="donut-middle"><small>Il te reste</small><strong>${euro(t.remaining)}</strong></div></div><div class="legend">
 ${legendRow('Frais fixes',t.fixed,'purple')}${legendRow('Restos & commandes',t.orders+t.restaurants,'orange')}${legendRow('Autres frais',t.extra,'pink')}${legendRow('Reste',Math.max(0,t.remaining),'mint')}
 </div></div>`;
}
const legendRow=(n,v,c)=>`<div class="legend-row"><i class="dot ${c}"></i><span>${n}</span><strong>${euro(v)}</strong></div>`;
function render(){
 if(!initialized)return;
 const t=totals(),hasIncome=budget.salary>0;
 const extras=budget.extras.filter(e=>e.period!=='once'||e.month===YEAR_MONTH());
 $('#app').innerHTML=`
 ${pendingUpdate?`<section class="replace-banner"><span>✓ Budget reçu</span><h2>Mettre à jour ton budget ?</h2><p>Le salaire, les 13 charges fixes et les habitudes remplaceront les chiffres actuellement enregistrés dans cette application. Une copie de sécurité sera conservée localement.</p><button type="button" class="replace-action" data-action="apply-personal">✓ Remplacer mes chiffres maintenant</button><button type="button" class="keep-action" data-action="keep-personal">Garder mes chiffres actuels</button></section>`:''}
 <div class="headline"><div><p class="eyebrow">MON ARGENT · ${new Intl.DateTimeFormat('fr-BE',{month:'long',year:'numeric'}).format(new Date())}</p><h1>Mon budget</h1><p>Simple. Clair. Sans prise de tête.</p></div><button class="small-edit" data-action="income" aria-label="Modifier mon salaire">✎ Modifier</button></div>
 ${!hasIncome?`<section class="empty-banner"><strong>Ton salaire n'est pas encore enregistré</strong><p>Ajoute ton salaire pour calculer ton reste.</p><button data-action="income">Ajouter mon salaire</button></section>`:''}
 <section class="hero ${t.remaining<0?'negative':''}"><p>IL ME RESTE CE MOIS-CI</p><strong>${hasIncome?euro(t.remaining):'—'}</strong><small>${hasIncome?'Après tes frais et sorties prévus':'Aucun salaire renseigné'}</small><button class="add-button" data-action="add">＋ Ajouter un frais</button></section>
 <section class="stats">${block('Mon salaire',hasIncome?euro(budget.salary):'—','Revenu net mensuel')}${block('Mes dépenses',euro(t.spent),'Frais prévus par mois')}${block('Épargne possible',hasIncome?euro(t.maxSaving):'—','Plafond provisoire, avant dépenses oubliées','saving')}</section>
 <section class="panel"><div class="section-head"><div><h2>Où va mon argent ?</h2><p>Répartition mensuelle</p></div></div>${chart(t)}</section>
 <section class="panel"><div class="section-head"><div><h2>Mes habitudes</h2><p>Modifie les montants quand tu veux</p></div></div><div class="habit-grid">
 <button data-action="orders" class="habit"><span class="emoji">🛵</span><strong>Livraisons</strong><span>${euro(t.orders)} / mois</span><small>${budget.orders.count} commandes à ${euro(budget.orders.unit)}</small><b>✎</b></button>
 <button data-action="restaurants" class="habit"><span class="emoji">🍽️</span><strong>Restaurants</strong><span>${euro(t.restaurants)} / mois</span><small>${euro(budget.restaurants.unit)} par sortie</small><b>✎</b></button>
 </div></section>
 <section class="panel"><div class="section-head"><div><h2>Mes frais fixes</h2><p>${budget.bills.length} frais · ${euro(t.fixed)}/mois</p></div><button class="minor-button" data-action="add">＋ Ajouter</button></div>
 <div class="bill-list">${budget.bills.length?budget.bills.map(b=>`<button class="bill" data-action="edit-bill" data-id="${escapeText(b.id)}"><span><strong>${escapeText(b.label)}</strong><small>${b.period==='year'?'Annuel':b.period==='quarter'?'Trimestriel':'Mensuel'}</small></span><strong>${euro(monthly(b))}<small>/mois</small></strong><i>✎</i></button>`).join(''):'<p class="muted-empty">Aucun frais fixe. Tu peux en ajouter avec le bouton ci-dessus.</p>'}</div></section>
 ${extras.length?`<section class="panel"><div class="section-head"><div><h2>Autres frais</h2><p>${euro(t.extra)} ce mois-ci</p></div></div><div class="bill-list">${extras.map(e=>`<button class="bill" data-action="edit-extra" data-id="${escapeText(e.id)}"><span><strong>${escapeText(e.label)}</strong><small>${e.period==='once'?'Ponctuel':e.period==='year'?'Annuel':e.period==='quarter'?'Trimestriel':'Mensuel'}</small></span><strong>${euro(monthly(e))}<small>${e.period==='once'?'':'/mois'}</small></strong><i>✎</i></button>`).join('')}</div></section>`:''}
 <p class="footnote">Les ${euro(budget.vouchers)} de chèques-repas sont comptés à part. Le « reste » est une estimation, pas ton solde bancaire. Courses, carburant et imprévus non renseignés peuvent encore réduire l’épargne possible.</p>
 <div class="settings-line"><button data-action="income">Modifier mon salaire</button><button data-action="reserve">Définir ma réserve</button></div>`;
}
function field(label,name,value,extra=''){return `<label class="field"><span>${label}</span><input name="${name}" ${extra} value="${escapeText(value)}" required></label>`}
const amountField=(label,name,value)=>field(label,name,value,'type="number" min="0" max="10000000" step="0.01" inputmode="decimal"');
function frequency(selected='once'){return `<label class="field"><span>Fréquence</span><select name="period">${[['once','Une seule fois'],['month','Tous les mois'],['quarter','Tous les 3 mois'],['year','Chaque année']].map(([v,n])=>`<option value="${v}" ${v===selected?'selected':''}>${n}</option>`).join('')}</select></label>`}
function openEditor(title,content,type,id=''){$('#editorContent').innerHTML=`<div class="modal-header"><h2>${title}</h2><button class="close" data-close aria-label="Fermer">×</button></div><form data-type="${type}" data-id="${escapeText(id)}">${content}<button type="submit" class="submit">Enregistrer</button></form>`;$('#editor').showModal()}
function closeEditor(){$('#editor').close();$('#editorContent').innerHTML=''}
function edit(type,id=''){
 if(type==='add'){openEditor('Ajouter un frais',field('Nom du frais','label','','type="text" maxlength="100" placeholder="Ex. : Courses, assurance…"')+amountField('Montant en €','amount','')+frequency('once'),'add');return}
 if(type==='income'){openEditor('Mes revenus',amountField('Salaire net mensuel (€)','salary',budget.salary||'')+amountField('Chèques-repas par mois (€)','vouchers',budget.vouchers),'income');return}
 if(type==='reserve'){openEditor('Ma réserve',`<p class="modal-help">Le montant que tu souhaites garder pour les imprévus avant de calculer une épargne possible.</p>`+amountField('Réserve mensuelle (€)','reserve',budget.reserve),'reserve');return}
 if(type==='orders'||type==='restaurants'){
  const x=budget[type],isOrders=type==='orders';openEditor(isOrders?'Mes livraisons':'Mes restaurants',`<p class="modal-help">${isOrders?'Uber Eats, Deliveroo et Takeaway ensemble.':'Ta fréquence moyenne sur un mois.'}</p>`+amountField(isOrders?'Nombre total de commandes / mois':'Nombre de restaurants / mois','count',x.count)+amountField('Prix moyen en €','unit',x.unit),type);return;
 }
 if(type==='edit-bill'||type==='edit-extra'){
  const obj=(type==='edit-bill'?budget.bills:budget.extras).find(x=>x.id===id);if(!obj)return;
  openEditor('Modifier un frais',field('Nom du frais','label',obj.label,'type="text" maxlength="100"')+amountField('Montant en €','amount',obj.amount)+frequency(obj.period)+`<button class="remove" type="button" data-action="delete" data-kind="${type==='edit-bill'?'bill':'extra'}" data-id="${escapeText(id)}">Supprimer ce frais</button>`,'edit',id);
 }
}
function saveForm(form){
 const data=new FormData(form),type=form.dataset.type,id=form.dataset.id;
 const get=n=>nonnegative(data.get(n));
 if(type==='income'){budget.salary=get('salary');budget.vouchers=get('vouchers')}
 else if(type==='reserve'){budget.reserve=get('reserve')}
 else if(type==='orders'||type==='restaurants'){budget[type]={count:get('count'),unit:get('unit')}}
 else if(type==='add'||type==='edit'){
  const label=String(data.get('label')||'').trim(),amount=get('amount'),period=String(data.get('period'));
  if(!label||label.length>100||!['once','month','quarter','year'].includes(period)||amount<=0)throw Error('Renseigne un nom et un montant valide.');
  if(type==='edit'){
   const obj=[...budget.bills,...budget.extras].find(x=>x.id===id);if(!obj)return;
   const wasBill=budget.bills.some(x=>x.id===id),isBill=wasBill&&period!=='once';
   budget.bills=budget.bills.filter(x=>x.id!==id);budget.extras=budget.extras.filter(x=>x.id!==id);
   if(isBill)budget.bills.push({id,label,amount,period});else budget.extras.push({id,label,amount,period,month:YEAR_MONTH()});
  }else if(period==='once')budget.extras.push({id:randomID(),label,amount,period,month:YEAR_MONTH()});
  else budget.bills.push({id:randomID(),label,amount,period});
 }
 closeEditor();render();save();notify('Enregistré sur cet appareil');
}
async function init(){
 const incoming=budgetFromLink();
 try{
  await openPrivateStorage();
  const existing=await loadPrivateData();
  const hasExisting=!!(existing&&(existing.salary>0||existing.bills.length||existing.extras.length));
  if(incoming&&hasExisting){budget=existing;pendingUpdate=incoming;}
  else if(incoming){budget=incoming;await storePrivateData(budget)}
  else budget=existing||newBudget();
 }catch(err){
  console.error('Private storage:',err);
  ephemeral=true;
  budget=incoming||newBudget();
  pendingUpdate=null;
  notify('Stockage privé indisponible : tes modifications ne seront pas sauvegardées.');
 }
 initialized=true;render();
}
async function applyPendingUpdate(){
 if(!pendingUpdate)return;
 if(ephemeral||!db)throw Error('Stockage local indisponible. Aucun changement enregistré.');
 const previous=structuredClone(budget),next=structuredClone(pendingUpdate);
 await saveChain;
 if(previous.salary>0||previous.bills.length||previous.extras.length){
  // Sauvegarde chiffrée de la version précédente, récupérable en cas de problème.
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=new TextEncoder().encode(JSON.stringify(previous));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},cryptoKey,plain);
  await request('data','readwrite',store=>store.put({iv:Array.from(iv),cipher:Array.from(new Uint8Array(cipher)),saved:new Date().toISOString()},'backup-before-update'));
 }
 await storePrivateData(next);
 budget=next;pendingUpdate=null;render();notify('Budget remplacé et enregistré sur cet appareil.');
}
document.addEventListener('click',event=>{
 if(event.target.closest('[data-close]')){closeEditor();return}
 const button=event.target.closest('[data-action]');if(!button)return;
 const action=button.dataset.action;
 if(action==='apply-personal'){applyPendingUpdate().catch(err=>notify(err.message||'Impossible de modifier le budget'));return;}
 if(action==='keep-personal'){pendingUpdate=null;render();return;}
 if(action==='delete'){
  if(!confirm('Supprimer ce frais ?'))return;const id=button.dataset.id;
  budget.bills=budget.bills.filter(x=>x.id!==id);budget.extras=budget.extras.filter(x=>x.id!==id);closeEditor();render();save();return;
 }
 edit(action,button.dataset.id||'');
});
$('#editor').addEventListener('click',event=>{if(event.target===$('#editor'))closeEditor()});
document.addEventListener('submit',event=>{const form=event.target.closest('form[data-type]');if(!form)return;event.preventDefault();try{saveForm(form)}catch(err){notify(err.message||'Saisie incorrecte')}});
init();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();