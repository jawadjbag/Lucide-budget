/* Lucide Budget — offline, local-first, no external scripts, no analytics.
 * Encrypted at rest via AES-GCM and PBKDF2; IndexedDB stores ciphertext only.
 */
(() => {
'use strict';
const $=(q,root=document)=>root.querySelector(q), $$=(q,root=document)=>Array.from(root.querySelectorAll(q));
const STORAGE_DB='lucide-encrypted-finances-v1', STORE='vault';
const CATEGORIES=['Logement','Courses','Restaurants','Transport','Shopping','Abonnements','Santé','Loisirs','Divers','Virement interne'];
const BUDGET_CATS=['Courses','Restaurants','Transport','Shopping','Abonnements','Santé','Loisirs','Divers'];
const CATICONS={Logement:'⌂',Courses:'▧',Restaurants:'♨',Transport:'↗',Shopping:'◈',Abonnements:'◇',Santé:'✚',Loisirs:'✳',Divers:'☷','Virement interne':'⇄',Revenus:'↗'};
const ROUTES={overview:'Vue d’ensemble',transactions:'Transactions',bills:'Factures & abonnements',cuts:'Plan d’économies',budgets:'Mes budgets',settings:'Paramètres'};
const DEFAULT_BUDGETS={Courses:400,Restaurants:180,Transport:180,Shopping:120,Abonnements:100,Santé:80,Loisirs:100,Divers:100};
const state={route:'overview',source:'demo',data:null,key:null,salt:null,db:null,month:'',filterCat:'',filterQuery:'',importInfo:null,cutPct:25,storageStatus:'',saving:false};
let saveQueue=Promise.resolve(), toastTimer=null;
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(x)||0);
const shortMoney=x=>new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(x)||0);
const moneyAbs=x=>money(Math.abs(x));
const nowIso=()=>new Date().toISOString().slice(0,10);
const monthId=d=>String(d).slice(0,7);
const dateForMonth=(mon,day)=>{const [y,m]=mon.split('-').map(Number);const max=new Date(y,m,0).getDate();return mon+'-'+String(Math.min(day,max)).padStart(2,'0')};
const previousMonth=(m,delta)=>{const [y,mo]=m.split('-').map(Number);const d=new Date(y,mo-1+delta,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const monthLabel=m=>new Intl.DateTimeFormat('fr-BE',{month:'long',year:'numeric'}).format(new Date(m+'-15T12:00:00'));
const dateLabel=d=>new Intl.DateTimeFormat('fr-BE',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(d+'T12:00:00'));
const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():('t-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join(''));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const truncate=(s,max)=>String(s).length>max?String(s).slice(0,max-1)+'…':String(s);
const isTransfer=t=>t.category==='Virement interne';
const isExpense=t=>t.amount<0&&!isTransfer(t);
const isIncome=t=>t.amount>0&&!isTransfer(t);
function emptyData(){return {version:1,currency:'EUR',created:new Date().toISOString(),transactions:[],bills:[],budgets:{...DEFAULT_BUDGETS},goal:500,note:'',cutDone:[]};}
function buildDemo(){
 const d=emptyData();d.goal=850;
 const monthly=[
  ['Salaire',3220,'Revenus',3],['Mission freelance',420,'Revenus',8],['Loyer',-980,'Logement',4],
  ['Courses Delhaize',-168,'Courses',5],['Courses Colruyt',-126,'Courses',18],['Courses Carrefour',-91,'Courses',25],
  ['Restaurant vendredi',-78,'Restaurants',7],['Takeaway',-52,'Restaurants',12],['Sortie restaurant',-89,'Restaurants',22],
  ['Abonnement salle de sport',-39,'Abonnements',2],['Netflix',-17.99,'Abonnements',9],
  ['Spotify',-10.99,'Abonnements',13],['Cloud storage',-8.99,'Abonnements',16],
  ['Internet et mobile',-68,'Abonnements',14],['Transports et carburant',-145,'Transport',17],
  ['Shopping vêtements',-132,'Shopping',19],['Achats en ligne',-76,'Shopping',23],
  ['Cinéma',-36,'Loisirs',20],['Pharmacie',-24,'Santé',11],['Assurance habitation',-25,'Logement',15],
  ['Électricité',-93,'Logement',6]
 ];
 for(let i=-5;i<=0;i++){
  const m=previousMonth(monthId(nowIso()),i),factor=i===0?1:1+((i+5)%3-1)*.07;
  for(let j=0;j<monthly.length;j++){
   const [name,amount,cat,day]=monthly[j];
   if(i===0 && day>new Date().getDate())continue;
   const amountRounded=amount<0?Math.round(amount*factor*100)/100:amount;
   d.transactions.push({id:uid(),date:dateForMonth(m,day),name,amount:amountRounded,category:cat,source:'Démo'});
  }
 }
 d.bills=[
 {id:uid(),name:'Netflix',amount:17.99,cycle:'month',category:'Abonnements',essential:false},
 {id:uid(),name:'Spotify',amount:10.99,cycle:'month',category:'Abonnements',essential:false},
 {id:uid(),name:'Cloud storage',amount:8.99,cycle:'month',category:'Abonnements',essential:false},
 {id:uid(),name:'Salle de sport',amount:39,cycle:'month',category:'Abonnements',essential:false},
 {id:uid(),name:'Internet et mobile',amount:68,cycle:'month',category:'Abonnements',essential:true},
 {id:uid(),name:'Assurance habitation',amount:300,cycle:'year',category:'Logement',essential:true},
 {id:uid(),name:'Loyer',amount:980,cycle:'month',category:'Logement',essential:true}
 ];
 return d;
}
const validMoney=x=>Number.isFinite(x)?Math.round(x*100)/100:0;
function monthlyBills(){return state.data.bills.reduce((s,b)=>s+monthlyEquivalent(b),0);}
function monthlyEquivalent(b){const n=Number(b.amount)||0;return b.cycle==='year'?n/12:b.cycle==='quarter'?n/3:n;}
function monthTransactions(month=state.month){return state.data.transactions.filter(t=>monthId(t.date)===month);}
function totalCat(month=state.month){const cat={};for(const t of monthTransactions(month).filter(isExpense))cat[t.category]=(cat[t.category]||0)+Math.abs(t.amount);return cat;}
function snapshot(month=state.month){const ts=monthTransactions(month);let income=0,spend=0;for(const t of ts){if(isIncome(t))income+=t.amount;if(isExpense(t))spend+=-t.amount;}return {income,spend,net:income-spend,rate:income>0?(income-spend)/income*100:0,count:ts.length};}
function recentMonths(){return Array.from({length:6},(_,i)=>previousMonth(state.month,i-5));}
function byDateDesc(t){return [...t].sort((a,b)=>b.date.localeCompare(a.date));}
function billCycleLabel(c){return {month:'Mensuel',quarter:'Trimestriel',year:'Annuel'}[c]||'Mensuel';}
function availableMonths(){const cur=monthId(nowIso());const earliest=state.data.transactions.reduce((m,t)=> t.date.slice(0,7)<m?t.date.slice(0,7):m,cur);return {earliest,latest:cur};}
function toast(msg){const node=$('#toast');node.textContent=msg;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),3300);}
function sectionTitle(title,desc,action=''){return `<div class="panel-header"><div><h2 class="panel-title">${title}</h2><p class="panel-desc">${desc}</p></div>${action}</div>`;}
function noData(title,desc,glyph='◌'){return `<div class="empty"><span>${glyph}</span><strong>${title}</strong><p>${desc}</p></div>`;}
function miniBadge(txt,style=''){return `<span class="badge ${style}">${txt}</span>`;}
function demoBanner(){return `<div class="demo-banner"><span>✳</span><div><strong>Mode démonstration — aucun chiffre n'est réel</strong><p>Ces montants fictifs te montrent ce que l'application pourra analyser. Crée ton coffre chiffré pour commencer avec tes propres données.</p></div><button class="btn primary small" data-action="create-vault">Créer mon coffre privé →</button></div>`;}
function monthSwitch(){return `<div class="month-switch"><button data-action="month-prev" aria-label="Mois précédent">‹</button><strong>${escapeHtml(monthLabel(state.month))}</strong><button data-action="month-next" aria-label="Mois suivant" ${state.month>=monthId(nowIso())?'disabled':''}>›</button></div>`;}
function pageHead(kicker,title,description,buttons=''){return `<div class="heading-row"><div><p class="eyebrow">${kicker}</p><h1 class="page-title">${title}</h1><p class="subtitle">${description}</p></div><div class="heading-actions">${buttons}</div></div>`;}
function statsCard(label,value,note,icon,cls=''){return `<div class="stat-card"><div class="stat-top"><span class="label">${label}</span><span class="stat-ico ${cls}">${icon}</span></div><strong class="stat-value mono ${cls==='red'?'metric-negative':cls==='green'?'metric-positive':''}">${value}</strong><p class="stat-desc">${note}</p></div>`;}
function barChart(){const mons=recentMonths(), max=Math.max(1,...mons.flatMap(m=>{const s=snapshot(m);return [s.income,s.spend]}));const width=650,height=204,top=20,bottom=28, usable=height-top-bottom;const cell=width/mons.length;
 let grid='';for(let i=0;i<=4;i++){let y=top+(usable/4)*i;grid+=`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#edf0f5" stroke-dasharray="3 6"/>`;}
 let bars='';for(let i=0;i<mons.length;i++){const m=mons[i],s=snapshot(m),x=i*cell+cell*.23,w=cell*.24;const hi=s.income/max*usable,he=s.spend/max*usable;bars+=`<rect x="${x.toFixed(1)}" y="${(top+usable-hi).toFixed(1)}" width="${w.toFixed(1)}" height="${hi.toFixed(1)}" rx="5" fill="#625ae8"/><rect x="${(x+w+5).toFixed(1)}" y="${(top+usable-he).toFixed(1)}" width="${w.toFixed(1)}" height="${he.toFixed(1)}" rx="5" fill="#41bf9c"/><text x="${(i*cell+cell*.5).toFixed(1)}" y="${height-3}" fill="#9ba2b0" font-size="11" text-anchor="middle">${new Intl.DateTimeFormat('fr-BE',{month:'short'}).format(new Date(m+'-15T12:00:00'))}</text>`;}
 return `<div class="chart-wrap"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Évolution des revenus et dépenses sur six mois">${grid}${bars}</svg><div class="chart-legend"><span><i class="legend-dot"></i> Revenus</span><span><i class="legend-dot green"></i> Dépenses</span></div></div>`;}
function categoryRows(maxRows=6){const cat=Object.entries(totalCat()).sort((a,b)=>b[1]-a[1]).slice(0,maxRows);if(!cat.length)return noData('Pas encore de dépenses','Ajoute ou importe des transactions pour obtenir la répartition.','◉');const top=cat[0][1];return cat.map(([name,value])=>`<div class="category-row"><span class="cat-glyph">${CATICONS[name]||'☷'}</span><div class="category-details"><strong>${escapeHtml(name)}</strong><div class="progress"><span style="width:${(value/top*100).toFixed(1)}%"></span></div></div><span class="category-amount mono">${money(value)}</span></div>`).join('');}
function transactionRows(rows,withButtons=false){if(!rows.length)return noData('Aucune transaction','Tu peux saisir une opération ou importer un relevé.','⇄');return rows.map(t=>`<div class="transaction-row"><div class="cat-glyph">${CATICONS[t.category]||'☷'}</div><div class="transaction-main"><strong>${escapeHtml(t.name)}</strong><small>${dateLabel(t.date)} · ${escapeHtml(t.category)}${t.source?' · '+escapeHtml(t.source):''}</small></div><div class="transaction-amount mono ${isIncome(t)?'metric-positive':''}">${t.amount>0?'+':''}${money(t.amount)}</div>${withButtons?`<button type="button" class="transaction-action" data-action="edit-transaction" data-id="${t.id}" aria-label="Modifier">✎</button>`:''}</div>`).join('');}
function renderOverview(){const s=snapshot(),cats=Object.entries(totalCat()).sort((a,b)=>b[1]-a[1]);const topCat=cats[0];const yearNet=recentMonths().reduce((z,m)=>z+snapshot(m).net,0);
 return `${pageHead('TON ARGENT','Ton argent, simplement.','Tout ce qui entre, tout ce qui sort. Sans tableaux compliqués.',`${monthSwitch()}<button class="btn primary" data-action="new-transaction">＋ Transaction</button>`)}
 ${state.source==='demo'?demoBanner():''}
 ${state.month===monthId(nowIso())?`<div class="notice"><span>ⓘ</span><div><strong>Mois en cours</strong><p>Le résultat est provisoire : les revenus ou factures de fin de mois ne sont pas encore comptabilisés.</p></div></div>`:''}
 <div class="simple-actions" aria-label="Actions rapides">
 <button class="simple-tile featured" data-action="bulk-bills"><span class="simple-tile-icon">＋</span><strong>Tout ajouter d’un coup</strong><small>Mes factures, abonnements et domiciliations</small><span class="simple-tile-arrow">→</span></button>
 <button class="simple-tile" data-action="open-import"><span class="simple-tile-icon">↥</span><strong>Importer mes dépenses</strong><small>Depuis un relevé bancaire CSV ou XML</small><span class="simple-tile-arrow">→</span></button>
 <button class="simple-tile" data-route="bills"><span class="simple-tile-icon">▤</span><strong>Mes charges fixes</strong><small>Ce que je paie chaque mois</small><span class="simple-tile-arrow">→</span></button>
 <button class="simple-tile" data-route="cuts"><span class="simple-tile-icon">✂</span><strong>Où économiser ?</strong><small>Les dépenses que je peux réduire</small><span class="simple-tile-arrow">→</span></button>
 </div>
 <div class="stat-grid">${statsCard('Revenus encaissés',money(s.income),'Transactions positives','↗')}${statsCard('Dépenses réelles',money(s.spend),'Transactions négatives hors virements','↘','red')}${statsCard('Solde du mois',money(s.net),'Revenus moins dépenses',s.net>=0?'✳':'!',s.net>=0?'green':'red')}${statsCard('Taux d’épargne',s.income?`${s.rate.toFixed(1).replace('.',',')} %`:'—',`Objectif : ${money(state.data.goal)}/mois`,'◉',s.net>=0?'green':'amber')}</div>
 <details class="advanced-overview"><summary>Voir mon analyse détaillée <span>⌄</span></summary><div class="dash-grid"><section class="panel">${sectionTitle('Vue sur six mois','Revenus et dépenses mensuels, chiffres réels du tableau de bord')}
 <div class="panel-body">${barChart()}</div></section><section class="panel">${sectionTitle('Où part ton argent ?','Catégories les plus coûteuses en '+monthLabel(state.month))}<div class="panel-body">${categoryRows()}</div></section>
 <section class="panel">${sectionTitle('Dernières opérations','Les mouvements enregistrés pour ce mois',`<button class="btn small" data-route="transactions">Tout voir ↗</button>`)}<div class="panel-body">${transactionRows(byDateDesc(monthTransactions()).slice(0,6))}</div></section>
 <section class="panel">${sectionTitle('Ton radar d’économies','Des pistes, jamais des coupes automatiques',`<button class="btn small soft" data-route="cuts">Analyser ↗</button>`)}<div class="panel-body">${overviewInsights(s,topCat,yearNet)}</div></section></div></details>`;
}
function overviewInsights(s,topCat,yearNet){let data=[];if(topCat)data.push({icon:'◈',title:`Premier poste : ${topCat[0]}`,detail:`${money(topCat[1])} dépensés ce mois. Vérifie sa nécessité avant de couper.`});
 if(s.income>0)data.push({icon:'◎',title:s.net>=state.data.goal?'Objectif mensuel atteint':'Objectif à surveiller',detail:`${money(Math.max(0,state.data.goal-s.net))} manquants pour atteindre ${money(state.data.goal)} ce mois, à ce stade.`});
 const nonEssential=state.data.bills.filter(b=>!b.essential);if(nonEssential.length)data.push({icon:'✂',title:`${nonEssential.length} abonnement(s) à revoir`,detail:`${money(nonEssential.reduce((z,b)=>z+monthlyEquivalent(b),0))}/mois inscrits comme facultatifs. À vérifier avant suppression.`});
 if(!data.length)return noData('Tes informations viendront ici','Ajoute tes dépenses et factures pour lancer l’analyse.','✦');return data.map(x=>`<div class="transaction-row"><div class="cat-glyph">${x.icon}</div><div class="transaction-main"><strong>${escapeHtml(x.title)}</strong><small style="white-space:normal">${escapeHtml(x.detail)}</small></div></div>`).join('');}
function renderTransactions(){const query=state.filterQuery.toLocaleLowerCase('fr').trim();const rows=byDateDesc(monthTransactions()).filter(t=>(!state.filterCat||t.category===state.filterCat)&&(!query||(t.name+' '+t.category+' '+t.source).toLocaleLowerCase('fr').includes(query)));
 const options='<option value="">Toutes les catégories</option>'+CATEGORIES.concat('Revenus').map(c=>`<option value="${escapeHtml(c)}" ${state.filterCat===c?'selected':''}>${escapeHtml(c)}</option>`).join('');
 return `${pageHead('HISTORIQUE','Toutes tes transactions','Catégorise les paiements et vérifie ce que tu dépenses réellement.',`${monthSwitch()}<button class="btn" data-action="open-import">↥ Import bancaire</button><button class="btn primary" data-action="new-transaction">＋ Ajouter</button>`)}${state.source==='demo'?demoBanner():''}
 <div class="filters"><input id="transactionSearch" type="search" placeholder="Rechercher un commerçant…" value="${escapeHtml(state.filterQuery)}" aria-label="Rechercher une transaction"/><select id="transactionCat" aria-label="Filtrer par catégorie">${options}</select><span class="badge">${rows.length} opérations</span></div>
 <div class="panel"><div class="panel-body" id="transactionsList">${transactionRows(rows,true)}</div></div><p class="hint">Les virements internes sont exclus du calcul des revenus et dépenses pour éviter les doubles comptes.</p>`;
}
function renderBills(){const bills=[...state.data.bills].sort((a,b)=>monthlyEquivalent(b)-monthlyEquivalent(a));const total=monthlyBills(), nonessential=bills.filter(b=>!b.essential),potential=nonessential.reduce((a,b)=>a+monthlyEquivalent(b),0);
 return `${pageHead('CHARGES RÉCURRENTES','Factures & abonnements','Anticipe tes charges fixes et identifie ce qui mérite d’être renégocié.',`<button class="btn primary" data-action="bulk-bills">＋ Ajouter toute ma liste</button><button class="btn" data-action="new-bill">Ajouter une charge</button>`)}${state.source==='demo'?demoBanner():''}
 <div class="bill-grid"><div class="bill-stat"><span>Charges récurrentes / mois</span><strong class="mono">${money(total)}</strong></div><div class="bill-stat"><span>Coût annuel estimé</span><strong class="mono">${money(total*12)}</strong></div><div class="bill-stat"><span>Charges facultatives / mois</span><strong class="mono metric-positive">${money(potential)}</strong></div></div>
 <div class="panel">${sectionTitle('Tes engagements','Le mensuel équivalent permet de comparer les abonnements annuels et trimestriels')}
 <div class="table-scroll"><table class="data-table"><thead><tr><th>Charge</th><th>Fréquence</th><th>Type</th><th class="right">Par mois</th><th class="right">Action</th></tr></thead><tbody>${bills.length?bills.map(b=>`<tr><td><strong>${escapeHtml(b.name)}</strong><div class="muted" style="font-size:10px">${escapeHtml(b.category)}</div></td><td>${billCycleLabel(b.cycle)}</td><td>${miniBadge(b.essential?'Essentiel':'À vérifier',b.essential?'':'warning')}</td><td class="right mono strong">${money(monthlyEquivalent(b))}</td><td class="right"><button class="btn small" data-action="edit-bill" data-id="${b.id}">Modifier</button></td></tr>`).join(''):`<tr><td colspan="5">${noData('Aucune charge récurrente','Ajoute ton loyer, abonnements, assurances, etc.','▤')}</td></tr>`}</tbody></table></div></div>
 <div class="notice warning top-gap"><span>ⓘ</span><div><strong>Pas de double comptage</strong><p>Les charges servent aux prévisions et à l’analyse. Elles ne sont pas ajoutées une seconde fois aux dépenses bancaires, qui restent calculées à partir des transactions enregistrées.</p></div></div>`;
}
function suggestedCuts(){const by=totalCat(),pct=state.cutPct/100,suggestions=[];
 for(const [cat,rate,icon,desc] of [['Restaurants',pct,'♨','Fixe un budget de sorties plus réaliste et surveille la fréquence.'],['Shopping',pct,'◈','Retarde les achats non urgents de 48 heures.'],['Loisirs',pct,'✳','Privilégie les activités les plus importantes pour toi.']]){
  const expense=by[cat]||0;if(expense>0)suggestions.push({key:'variable-'+cat,title:`Réduire ${cat.toLowerCase()}`,amount:expense*rate,detail:`Simulation : ${Math.round(pct*100)} % de ${money(expense)} de dépenses enregistrées en ${monthLabel(state.month)}. ${desc}`,icon});
 }
 for(const b of state.data.bills.filter(x=>!x.essential&&monthlyEquivalent(x)>0))suggestions.push({key:'bill-'+b.id,title:`Réexaminer : ${b.name}`,amount:monthlyEquivalent(b),detail:'Charge déclarée facultative : à résilier uniquement après vérification de son usage et de ses conditions.',icon:'◇'});
 return suggestions.sort((a,b)=>b.amount-a.amount);
}
function renderCuts(){const all=suggestedCuts(),selected=all.filter(c=>!state.data.cutDone.includes(c.key)),savings=selected.reduce((s,x)=>s+x.amount,0);
 return `${pageHead('DIAGNOSTIC','Où faire des cuts ?','Des économies possibles, sans confondre essentiels et dépenses facultatives.',`${monthSwitch()}<button class="btn" data-route="bills">Gérer mes abonnements ↗</button>`)}${state.source==='demo'?demoBanner():''}
 <div class="range-grid"><div class="panel"><div class="panel-body"><div class="range-head"><h3>Réduction des dépenses variables</h3><span class="range-number">${state.cutPct} %</span></div><p class="hint">Appliquée uniquement aux restaurants, au shopping et aux loisirs de ce mois.</p><div class="range-control"><label for="cutRange">Taux de réduction envisagé</label><input id="cutRange" type="range" min="5" max="50" step="5" value="${state.cutPct}"/></div></div></div>
 <div class="forecast-card"><div><small>Économies potentielles / mois</small><strong class="mono">${money(savings)}</strong><p>Projection illustrative : ${money(savings*12)} sur 12 mois si ces économies se répètent.</p></div><div class="forecast-art">↗</div></div></div>
 <div class="panel top-gap">${sectionTitle('Recommandations prioritaires',`${all.length} pistes repérées • décoche celles que tu ne souhaites pas retenir`)}<div class="panel-body">${all.length?all.map(c=>`<div class="cut-card"><div class="cut-icon">${c.icon}</div><div class="info"><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.detail)}</p><label style="display:inline-flex;align-items:center;gap:7px;font-size:11px;margin-top:12px;color:#6b7285"><input type="checkbox" data-cut-key="${escapeHtml(c.key)}" ${state.data.cutDone.includes(c.key)?'':'checked'}/> Inclure dans mon scénario</label></div><div class="cut-value"><strong class="mono">${money(c.amount)}</strong><small>/ mois</small></div></div>`).join(''):noData('Aucune opportunité calculable','Ajoute tes dépenses variables et tes abonnements pour obtenir des pistes.','✂')}</div></div>
 <div class="notice warning top-gap"><span>!</span><div><strong>Ce n’est pas un montant de gaspillage prouvé</strong><p>Ces pistes sont estimées à partir des informations saisies. Elles ne prouvent pas qu’une dépense est inutile. Le scénario peut être affecté par les achats exceptionnels, les mois incomplets et les charges récurrentes déjà présentes dans les transactions.</p></div></div>`;
}
function renderBudgets(){const cats=BUDGET_CATS;const spends=totalCat(),goals=state.data.budgets,s=snapshot();
 return `${pageHead('PLANIFICATION','Tes budgets mensuels','Fixe des plafonds réalistes et garde ton objectif d’épargne sous les yeux.',`${monthSwitch()}<button class="btn primary" data-action="edit-budgets">⚙ Modifier les budgets</button>`)}${state.source==='demo'?demoBanner():''}
 <div class="forecast-card" style="margin-bottom:17px"><div><small>Ton objectif d’épargne mensuel</small><strong class="mono">${money(state.data.goal)}</strong><p>Solde observé : ${money(s.net)} · ${s.net>=state.data.goal?'Objectif atteint à ce stade':'Objectif non atteint pour le moment'}</p></div><div class="forecast-art">◎</div></div>
 <div class="panel">${sectionTitle('Plafonds par catégorie',`Dépenses du mois de ${monthLabel(state.month)} comparées à tes budgets`)}<div class="panel-body"><div class="budget-grid">${cats.map(cat=>{const spent=spends[cat]||0,budget=goals[cat]||0,rate=budget?spent/budget*100:0;return `<div class="budget-row ${spent>budget&&budget>0?'over':''}"><div class="budget-row-top"><strong>${CATICONS[cat]||'☷'} &nbsp;${escapeHtml(cat)}</strong><span class="mono">${money(spent)} / ${money(budget)}</span></div><div class="progress"><span style="width:${Math.min(rate,100)}%"></span></div><p class="hint">${budget>0?(spent>budget?`${money(spent-budget)} au-dessus du budget`:`${money(budget-spent)} encore disponibles`):'Aucun plafond défini'}</p></div>`}).join('')}</div></div></div>`;
}
function settingsInfo(){return `<div class="panel"><div class="panel-body"><h3 style="margin:0">Comment fonctionne la confidentialité ?</h3><ul class="help-list"><li>Les données réelles sont chiffrées avec AES-GCM (clé dérivée par PBKDF2, SHA-256, 310 000 itérations).</li><li>IndexedDB stocke uniquement une enveloppe chiffrée, jamais tes transactions en clair.</li><li>Le mot de passe reste en mémoire le temps de la session. Fermer ou actualiser la PWA reverrouille le coffre.</li><li>Les imports CSV et XML sont analysés sur cet appareil, sans transfert à un serveur.</li><li>Sans sauvegarde chiffrée, une suppression des données du navigateur peut effacer tes finances. Mot de passe perdu = données irrécupérables.</li><li>HTTPS ou localhost est nécessaire pour initialiser le coffre. Aucun compte bancaire n'est connecté.</li></ul></div></div>`;}
function renderSettings(){return `${pageHead('CONFIDENTIALITÉ','Ton coffre privé','Aucune donnée financière envoyée à un serveur : tu gardes la main sur tout.',state.source==='vault'?`<button class="btn" data-action="lock">⌁ Verrouiller</button>`:'')}${state.source==='demo'?demoBanner():''}
 <div class="settings-grid"><section class="panel">${sectionTitle('Sauvegarde et transfert','Pour ne pas perdre tes informations lors d’un changement de téléphone')}<div class="panel-body"><p class="hint">L’export contient seulement des données chiffrées. Tu pourras le restaurer dans cette PWA avec ton mot de passe actuel.</p><div class="button-group top-gap">${state.source==='vault'?`<button class="btn primary" data-action="export-vault">↓ Sauvegarder .lucide</button>`:`<button class="btn" data-action="create-vault">Créer un coffre d’abord</button>`}<button class="btn" data-action="import-backup">↥ Restaurer une sauvegarde</button></div></div></section>
 <section class="panel">${sectionTitle('Sécurité','Gestion du coffre et de son mot de passe')}<div class="panel-body"><p class="hint">${state.source==='vault'?'Un coffre chiffré est actif sur cet appareil.':'Tu navigues avec des données fictives. Aucun document personnel n’est conservé.'}</p><div class="button-group top-gap">${state.source==='vault'?`<button class="btn" data-action="change-password">Changer le mot de passe</button><button class="btn danger" data-action="delete-vault">Effacer le coffre</button>`:`<button class="btn primary" data-action="create-vault">Créer un coffre privé</button>`}</div></div></section>
 <section class="panel">${sectionTitle('Import bancaire local','Formats pris en charge : CSV et CAMT.053 XML')}<div class="panel-body"><p class="hint">Les relevés PDF ne sont pas analysés automatiquement dans cette version. Exporte plutôt un CSV ou un fichier CAMT.053 depuis ta banque.</p><button class="btn soft" data-action="open-import">↥ Importer un relevé</button></div></section>
 <section class="panel">${sectionTitle('Application','PWA installable, même sans Internet')}<div class="panel-body"><p class="hint">Ouvre la PWA sur une adresse HTTPS, puis sur iPhone : Safari → Partager → Ajouter à l’écran d’accueil. La synchronisation entre appareils n’est pas activée : utilise une sauvegarde chiffrée pour changer d’appareil.</p><span class="badge positive">Aucun tracker · aucun compte externe</span></div></section></div><div class="top-gap">${settingsInfo()}</div>`;
}
function openModal(title,body){$('#modalContent').innerHTML=`<div class="modal-head"><h2>${title}</h2><button class="modal-close" type="button" data-action="close-modal" aria-label="Fermer">×</button></div><div class="modal-body">${body}</div>`;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){if($('#modal').open)$('#modal').close();$('#modalContent').innerHTML='';}
function actionButtons(label='Enregistrer'){return `<div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button type="submit" class="btn primary">${label}</button></div>`;}
function inputField(label,name,value='',type='text',required=false,placeholder=''){return `<div class="form-field"><label for="f_${name}">${label}</label><input id="f_${name}" name="${name}" type="${type}" ${required?'required':''} value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${type==='number'?'step="0.01"':''}/></div>`;}
function optionList(values,chosen){return values.map(([v,label])=>`<option value="${escapeHtml(v)}" ${v===chosen?'selected':''}>${escapeHtml(label)}</option>`).join('');}
function selectField(label,name,options,chosen){return `<div class="form-field"><label for="f_${name}">${label}</label><select name="${name}" id="f_${name}">${optionList(options,chosen)}</select></div>`;}
function showTransaction(id){if(state.source!=='vault'){toast('Crée ton coffre privé pour ajouter tes vraies données');openCreateVault();return;}const old=state.data.transactions.find(x=>x.id===id),d=old||{date:nowIso(),name:'',amount:'',category:'Divers'};
 const opts=[['Revenus','Revenus'],...CATEGORIES.map(c=>[c,c])];
 openModal(old?'Modifier une transaction':'Nouvelle transaction',`<form data-form="transaction" data-id="${id||''}"><div class="two-col">${inputField('Date','date',d.date,'date',true)}${inputField('Montant (€)','amount',d.amount,'number',true,'Ex. : -25.50')}</div><p class="hint">Montant positif = revenu. Montant négatif = dépense. Pour un virement entre tes comptes, choisis « Virement interne ».</p>${inputField('Libellé / commerçant','name',d.name,'text',true,'Ex. : Courses du samedi')}${selectField('Catégorie','category',opts,d.category)}${actionButtons(old?'Enregistrer les modifications':'Ajouter la transaction')}</form>${old?`<button type="button" class="btn danger small" data-action="delete-transaction" data-id="${old.id}">Supprimer cette opération</button>`:''}`);
}
function showBill(id){if(state.source!=='vault'){openCreateVault();return;}const old=state.data.bills.find(x=>x.id===id),d=old||{name:'',amount:'',cycle:'month',essential:false,category:'Abonnements'};
 openModal(old?'Modifier la charge':'Nouvelle charge récurrente',`<form data-form="bill" data-id="${id||''}">${inputField('Nom de la charge','name',d.name,'text',true,'Ex. : Forfait mobile')}<div class="two-col">${inputField('Montant de la facture (€)','amount',d.amount,'number',true)}${selectField('Fréquence','cycle',[['month','Chaque mois'],['quarter','Chaque trimestre'],['year','Chaque année']],d.cycle)}</div>${selectField('Catégorie','category',CATEGORIES.map(c=>[c,c]),d.category)}${selectField('Nature de la charge','essential',[['yes','Essentielle / difficile à supprimer'],['no','Facultative / à vérifier']],d.essential?'yes':'no')}<p class="hint">Ce réglage sert à suggérer des économies, pas à affirmer qu’une dépense est inutile.</p>${actionButtons()}</form>${old?`<button type="button" class="btn danger small" data-action="delete-bill" data-id="${old.id}">Supprimer la charge</button>`:''}`);
}
function showBudgets(){const d=state.data;openModal('Mes budgets et objectif',`<form data-form="budgets">${inputField('Objectif d’épargne / mois (€)','goal',d.goal,'number',true)}<div class="mapping-grid">${BUDGET_CATS.map(c=>inputField(c+' (€)','b_'+c,d.budgets[c]||0,'number',true)).join('')}</div>${actionButtons()}</form>`);}
function openCreateVault(){if(state.source==='vault'){toast('Un coffre est déjà déverrouillé');return;}if(!crypto?.subtle){openModal('Connexion sécurisée nécessaire',`<p class="hint">Le chiffrement nécessite HTTPS ou localhost. Ouvre cette PWA sur une adresse sécurisée pour créer ton coffre privé.</p><button class="btn" data-action="close-modal">Fermer</button>`);return;}
 openModal('Créer mon coffre chiffré',`<p class="hint">Cette opération crée un espace de données RÉEL, vide et indépendant de la démonstration. Rien n’est envoyé sur Internet.</p><div class="security-list">🔒 AES-GCM 256 bits · mot de passe non enregistré · sauvegarde chiffrée exportable. <strong>Si tu perds ton mot de passe, il n’y a aucune récupération possible.</strong></div>
 <form data-form="create-vault">${inputField('Mot de passe principal (12 caractères minimum)','password','','password',true,'Phrase secrète longue et unique')}${inputField('Confirmer le mot de passe','confirmation','','password',true,'Répéter la phrase')}${actionButtons('Créer mon espace privé')}</form>`);
}
function lockScreen(){return `<div class="lock-screen"><div class="lock-card"><div class="lock-logo">♙</div><p class="eyebrow">ESPACE PERSONNEL PROTÉGÉ</p><h1>Reprends le contrôle de ton argent.</h1><p>Tes données sont chiffrées sur cet appareil. Renseigne ton mot de passe pour y accéder.</p><form data-form="unlock">${inputField('Mot de passe principal','password','','password',true,'Ta phrase secrète')}${actionButtons('Déverrouiller le coffre')}</form><div class="security-list">🔐 Aucun envoi de mot de passe ou de relevé bancaire. Une fois déverrouillé, toutes les analyses sont réalisées localement.</div><div class="lock-actions"><button class="btn small" data-action="import-backup">↥ Restaurer une sauvegarde</button><button class="btn small soft" data-action="demo-mode">Voir la démonstration</button></div></div></div>`;}
function render(){ $$('.nav-button,.bottom-nav button').forEach(button=>button.classList.toggle('active',button.dataset.route===state.route));$('#crumbCurrent').textContent=ROUTES[state.route]||'Vue d’ensemble';if(state.source==='locked'){$('#app').innerHTML=lockScreen();return;}
 const views={overview:renderOverview,transactions:renderTransactions,bills:renderBills,cuts:renderCuts,budgets:renderBudgets,settings:renderSettings};$('#app').innerHTML=(views[state.route]||renderOverview)();$('#app').setAttribute('aria-label',ROUTES[state.route]);
}
function route(name){if(!ROUTES[name])return;state.route=name;state.filterQuery='';state.filterCat='';render();window.scrollTo({top:0,behavior:'smooth'});}
function safeClone(v){return JSON.parse(JSON.stringify(v));}
function validateData(data){if(!data||data.version!==1||!Array.isArray(data.transactions)||!Array.isArray(data.bills)||typeof data.budgets!=='object'||!Number.isFinite(Number(data.goal))||data.transactions.length>300000||data.bills.length>20000)throw Error('Sauvegarde incorrecte ou version non prise en charge');
 for(const t of data.transactions){if(!t||typeof t.id!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||typeof t.name!=='string'||!Number.isFinite(Number(t.amount)))throw Error('Données de transaction invalides');}
 for(const b of data.bills){if(!b||typeof b.name!=='string'||!Number.isFinite(Number(b.amount))||Number(b.amount)<0)throw Error('Données de charge invalides');}
 if(!Array.isArray(data.cutDone))data.cutDone=[];return data;
}
function openDb(){return new Promise((res,rej)=>{const req=indexedDB.open(STORAGE_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE)};req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);req.onblocked=()=>rej(Error('Base locale bloquée par un autre onglet'));});}
function idbGet(db,key){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(key);req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
function idbSet(db,key,value){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||Error('Écriture interrompue'));});}
function idbDelete(db,key){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
const bytes64=b=>{let str='';const size=8192;for(let i=0;i<b.length;i+=size)str+=String.fromCharCode(...b.subarray(i,i+size));return btoa(str)};const from64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function derive(password,salt){const root=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},root,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encrypt(data,key,salt){const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=new TextEncoder().encode(JSON.stringify(data));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes);return {format:'lucide-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations:310000,algorithm:'AES-256-GCM',salt:bytes64(salt),iv:bytes64(iv),ciphertext:bytes64(new Uint8Array(ciphertext)),updated:new Date().toISOString()};}
async function decrypt(envelope,password){if(!envelope||envelope.format!=='lucide-encrypted'||envelope.version!==1||envelope.iterations!==310000)throw Error('Format de coffre non reconnu');if(envelope.ciphertext.length>80000000)throw Error('Coffre trop volumineux');const salt=from64(envelope.salt),key=await derive(password,salt);let bytes;try{bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(envelope.iv)},key,from64(envelope.ciphertext));}catch(_){throw Error('Mot de passe incorrect ou sauvegarde corrompue');}return {data:validateData(JSON.parse(new TextDecoder().decode(bytes))),key,salt};}
async function setupVault(password){const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(password,salt),d=emptyData();const env=await encrypt(d,key,salt);await idbSet(state.db,'finances',env);state.key=key;state.salt=salt;state.data=d;state.source='vault';state.month=monthId(nowIso());render();toast('Coffre chiffré créé. Tes données réelles sont vides.');}
async function unlockVault(password){const env=await idbGet(state.db,'finances');if(!env)throw Error('Aucun coffre détecté sur cet appareil');const unlocked=await decrypt(env,password);state.key=unlocked.key;state.salt=unlocked.salt;state.data=unlocked.data;state.source='vault';state.month=monthId(nowIso());render();toast('Coffre déverrouillé');}
function queueSave(){if(state.source!=='vault')return;const snapshot=safeClone(state.data),key=state.key,salt=state.salt,db=state.db;state.saving=true;
 saveQueue=saveQueue.catch(()=>{}).then(async()=>{const env=await encrypt(snapshot,key,salt);await idbSet(db,'finances',env);state.saving=false;}).catch(err=>{state.saving=false;toast('⚠ Sauvegarde impossible : '+err.message)});}
function updateData(){queueSave();render();}
function downloadBlob(content,filename,mime){const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
async function exportVault(){if(state.source!=='vault'){toast('Ouvre ton coffre pour sauvegarder');return;}await saveQueue;const env=await idbGet(state.db,'finances');if(!env)throw Error('Sauvegarde introuvable');downloadBlob(JSON.stringify(env,null,2),`lucide-sauvegarde-${nowIso()}.lucide`,'application/json');toast('Sauvegarde chiffrée exportée');}
async function changePassword(oldPass,newPass){const env=await idbGet(state.db,'finances');const checked=await decrypt(env,oldPass);const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(newPass,salt);await saveQueue;const newEnv=await encrypt(state.data,key,salt);await idbSet(state.db,'finances',newEnv);state.key=key;state.salt=salt;toast('Mot de passe modifié. Pense à refaire une sauvegarde.');}
function showChangePassword(){openModal('Changer le mot de passe',`<form data-form="change-password">${inputField('Mot de passe actuel','oldPassword','','password',true)}${inputField('Nouveau mot de passe (12 caractères minimum)','password','','password',true)}${inputField('Confirmer le nouveau','confirmation','','password',true)}<p class="hint">Tes anciens fichiers de sauvegarde garderont leur ancien mot de passe.</p>${actionButtons('Modifier le mot de passe')}</form>`);}
async function restoreBackupFile(file,password){if(file.size>60*1024*1024)throw Error('Fichier trop volumineux');const env=JSON.parse(await file.text());const unlocked=await decrypt(env,password);if(!confirm('Remplacer le coffre actuel de cet appareil par cette sauvegarde ? Cette action est irréversible sans sauvegarde de l’ancien coffre.'))return;await saveQueue;await idbSet(state.db,'finances',env);state.key=unlocked.key;state.salt=unlocked.salt;state.data=unlocked.data;state.source='vault';state.month=monthId(nowIso());closeModal();render();toast('Coffre chiffré restauré');}
function restoreBackupPrompt(){openModal('Restaurer une sauvegarde',`<p class="hint">Sélectionne ton fichier .lucide. Le mot de passe de cette sauvegarde est indispensable.</p><form data-form="restore">${inputField('Fichier de sauvegarde','backupFile','','file',true)}${inputField('Mot de passe de la sauvegarde','password','','password',true)}${actionButtons('Vérifier et restaurer')}</form>`);$('#f_backupFile').accept='.lucide,.json,application/json';}
async function startup(){state.month=monthId(nowIso());state.data=buildDemo();render();try{state.db=await openDb();const env=await idbGet(state.db,'finances');if(env){state.source='locked';state.data=null;render();}}catch(e){toast('Stockage local indisponible : seules les données fictives sont accessibles');}}
function detectCategory(name,amount){if(amount>0)return 'Revenus';const s=String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(/virement interne|transfert entre|eigen rekening|own account|sparen|spaarrekening/.test(s))return 'Virement interne';if(/loyer|huur|hypothe|energie|electric|gaz|eau|water|woning|assurance habitation/.test(s))return 'Logement';if(/delhaize|colruyt|carrefour|aldi|lidl|supermarch|supermarkt|okay |intermarche|proxy/.test(s))return 'Courses';if(/restaurant|snack|frituur|uber eats|deliveroo|takeaway|pizza|mcdonald|burger|kfc |starbucks|coffee|cafe |bar /.test(s))return 'Restaurants';if(/netflix|spotify|youtube premium|icloud|cloud storage|disney\+|prime video|abonnement|subscription|orange|proximus|telenet|basic fit|basic-fit/.test(s))return 'Abonnements';if(/essence|shell|totalenergies|q8|carburant|sncb|nmbs|metro|bus |parking|mobilite|train/.test(s))return 'Transport';if(/amazon|zalando|shein|zara|hm |h&m|ikea|shop|boutique|shopping|bol.com/.test(s))return 'Shopping';if(/pharma|medic|dent|hopital|ziekenhuis|apotheek/.test(s))return 'Santé';if(/cinema|cinem|concert|sport|loisir|game|theatre/.test(s))return 'Loisirs';return 'Divers';}
function parseCurrency(raw){if(typeof raw==='number')return validMoney(raw);let s=String(raw??'').trim().replace(/\u00a0/g,'').replace(/[€$£]|\bEUR\b/gi,'').replace(/\s/g,'');const negative=/^[-−]/.test(s)||/^\(.*\)$/.test(s);s=s.replace(/[()]/g,'').replace(/−/g,'-').replace(/[^\d,.\-+]/g,'');const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');if(comma>=0 && dot>=0){const sep=Math.max(comma,dot);s=s.slice(0,sep).replace(/[.,]/g,'')+'.'+s.slice(sep+1);}else if(comma>=0){if(s.length-comma-1===3 && !s.includes('.') && s.split(',').length===2)s=s.replace(',','');else s=s.replace(/\./g,'').replace(',','.');}else if(dot>=0 && s.length-dot-1===3 && s.split('.').length===2)s=s.replace('.','');const num=parseFloat(s);return Number.isFinite(num)?validMoney(negative?-Math.abs(num):num):NaN;}
function normalizeDate(raw){const v=String(raw||'').trim();if(/^\d{4}-\d{2}-\d{2}/.test(v))return v.slice(0,10);let m=v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;if(/^\d{5}$/.test(v)){const base=new Date(Date.UTC(1899,11,30));base.setUTCDate(base.getUTCDate()+Number(v));return base.toISOString().slice(0,10)}return '';}
function validDate(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const dt=new Date(d+'T12:00:00');return !Number.isNaN(dt.getTime())&&dt.toISOString().slice(0,10)===d;}
function autoDelimiter(content){const first=content.split(/\r?\n/)[0]||'';return [';',',','\t','|'].map(d=>({d,n:first.split(d).length-1})).sort((a,b)=>b.n-a.n)[0].d;}
function csvParse(content,delimiter){const records=[];let field='',row=[],quoted=false;content=content.replace(/^\ufeff/,'');for(let i=0;i<content.length;i++){const ch=content[i];if(ch==='"'){if(quoted&&content[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(field);field='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&content[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))records.push(row);field='';row=[];}else{field+=ch;}}row.push(field);if(row.some(x=>x.trim()))records.push(row);return records;}
function canon(s){return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function chooseCol(headers,names){const cs=headers.map(canon);for(const name of names){let i=cs.indexOf(canon(name));if(i>=0)return i;}for(const name of names){let i=cs.findIndex(h=>h.includes(canon(name)));if(i>=0)return i;}return -1;}
function guessColumns(headers){return {date:chooseCol(headers,['date','datum','date execution','date comptable','boekingsdatum','verrichtingsdatum','bookingdate','transactiondate','valutadatum']),description:chooseCol(headers,['communication','description','libelle','omschrijving','details','beneficiaire','begunstigde','counterparty','name','merchant','mededeling']),amount:chooseCol(headers,['montant','amount','bedrag','valeur','value','transactionamount']),debit:chooseCol(headers,['debit','debet','sortie','withdrawal','af','outflow']),credit:chooseCol(headers,['credit','inkomsten','entree','deposit','bij','inflow'])};}
async function readTextFile(file){const ab=await file.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(ab);}catch(_){return new TextDecoder('windows-1252').decode(ab);}}
function xmlAll(parent,local){return Array.from(parent.getElementsByTagName('*')).filter(n=>n.localName===local);}
function xmlFirst(parent,local){return xmlAll(parent,local)[0]||null;}
function xmlText(parent,local){return xmlFirst(parent,local)?.textContent?.trim()||'';}
function camtTransactions(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('Fichier XML illisible');const entries=xmlAll(doc,'Ntry'),result=[];
 for(const e of entries){const amount=parseCurrency(xmlText(e,'Amt')),sign=xmlText(e,'CdtDbtInd')==='DBIT'?-1:1;const dateNode=xmlFirst(e,'BookgDt')||xmlFirst(e,'ValDt');const rawDate=dateNode?xmlText(dateNode,'Dt')||xmlText(dateNode,'DtTm'):'';const date=normalizeDate(rawDate);const txdt=xmlFirst(e,'TxDtls');const note=txdt&&(xmlAll(txdt,'Ustrd').map(n=>n.textContent.trim()).join(' ').trim()||xmlText(txdt,'AddtlTxInf'))||xmlText(e,'AddtlNtryInf')||xmlText(e,'NtryRef')||'Opération bancaire';const name=truncate(note,300);if(!validDate(date)||!Number.isFinite(amount)||amount===0)continue;
 result.push({date,name,amount:Math.abs(amount)*sign,category:detectCategory(name,sign*amount)});
 }
 return result;
}

function showBulkBills(){
 if(state.source!=='vault'){openCreateVault();return;}
 const previous=state.bulkText||'';
 openModal('Ajouter toutes mes charges en une fois',`<p class="hint">Copie ta liste ici, une dépense par ligne. Pour les montants annuels, écris simplement <strong>/an</strong>. Sans précision, c’est <strong>/mois</strong>.</p>
 <form data-form="bulk-bills"><div class="form-field"><label for="bulkLines">Mes charges fixes et domiciliations</label><textarea id="bulkLines" name="lines" rows="11" required placeholder="Loyer : 750 €/mois&#10;Électricité : 85 €/mois&#10;Assurance voiture : 600 €/an&#10;Netflix : 15,99 €/mois">${escapeHtml(previous)}</textarea></div>
 <div class="security-list">🔒 La liste est traitée sur ton appareil. Tu vérifies tout avant l’enregistrement dans ton coffre chiffré. N’inclus aucun IBAN ni numéro de carte.</div>${actionButtons('Vérifier ma liste →')}</form>`);
}
function parseBulkBills(raw){
 const lines=String(raw).split(/\r?\n/).map(x=>x.trim()).filter(Boolean),found=[],errors=[];
 if(lines.length>500)throw Error('Maximum 500 charges par import.');
 for(let i=0;i<lines.length;i++){
  const line=lines[i].replace(/^[\-•*]\s*/,'').trim();
  const match=line.match(/^(.*?)\s*(?:[:|;=\-]\s*|\s+)(\d[\d \u00a0.,]*)\s*(?:€|euros?|EUR)?\s*(?:\/\s*|par\s+|\|\s*|\s+)?(mois|mensuel(?:le)?|ans?|annuel(?:le)?|ann[ée]e|trimestre|trimestriel(?:le)?)?\s*$/i);
  if(!match){errors.push(i+1);continue;}
  const name=match[1].trim(),amount=parseCurrency(match[2]),freq=(match[3]||'mois').toLowerCase();
  if(!name||name.length>120||!Number.isFinite(amount)||amount<=0||amount>1e7){errors.push(i+1);continue;}
  const plain=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(/\b(salaire|revenu|paie|remuneration)\b/.test(plain)){errors.push(i+1);continue;}
  const cycle=/^an|^ann/.test(freq)?'year':/^trim/.test(freq)?'quarter':'month';
  let category=detectCategory(name,-amount);
  if(category==='Divers'&&/assurance.*(auto|voiture)|leasing|credit voiture|credit auto|taxe auto/.test(plain))category='Transport';
  if(category==='Divers'&&/mutuelle|assurance sante/.test(plain))category='Santé';
  const optional=/netflix|spotify|disney|prime video|youtube premium|apple music|salle de sport|basic.fit|abonnement streaming|canal\+/.test(plain);
  found.push({name,amount,cycle,category,essential:!optional});
 }
 if(!found.length)throw Error('Aucune charge reconnue. Exemple : Loyer : 750 €/mois');
 if(errors.length)throw Error('Ligne(s) '+errors.slice(0,8).join(', ')+' à corriger. Format : Nom : 50 €/mois');
 return found;
}
function showBulkPreview(){
 const rows=state.bulkDraft||[];
 const sum=rows.reduce((a,b)=>a+monthlyEquivalent(b),0);
 const table=rows.map(b=>`<tr><td>${escapeHtml(b.name)}</td><td class="right">${money(b.amount)}</td><td>${billCycleLabel(b.cycle)}</td></tr>`).join('');
 openModal('Vérifie tes charges',`<p class="hint"><strong>${rows.length} lignes reconnues</strong> · ${money(sum)} de charges mensuelles estimées. Les charges déjà présentes seront mises à jour, pas doublées.</p><div class="import-preview"><table><thead><tr><th>Charge</th><th>Montant</th><th>Fréquence</th></tr></thead><tbody>${table}</tbody></table></div><p class="hint">Ces montants servent à prévoir tes frais. Ils ne seront pas comptés une deuxième fois dans tes opérations bancaires.</p><form data-form="bulk-confirm">${actionButtons('Enregistrer toutes les charges')}</form><button type="button" class="btn soft" data-action="bulk-bills">← Corriger ma liste</button>`);
}
function saveBulkBills(){
 if(state.source!=='vault'||!state.bulkDraft?.length)throw Error('Import indisponible');
 let created=0,updated=0,unchanged=0;
 for(const bill of state.bulkDraft){
  const existing=state.data.bills.find(x=>canon(x.name)===canon(bill.name)&&x.cycle===bill.cycle);
  if(existing){if(existing.amount===bill.amount){unchanged++;continue;}existing.amount=bill.amount;existing.category=bill.category;updated++;}
  else {state.data.bills.push({id:uid(),...bill});created++;}
 }
 state.bulkDraft=null;state.bulkText='';
 updateData();closeModal();route('bills');
 toast(`${created} ajoutée(s), ${updated} mise(s) à jour${unchanged?', '+unchanged+' déjà enregistrée(s)':''}`);
}

function importStart(){if(state.source!=='vault'){openCreateVault();return;}openModal('Importer un relevé bancaire',`<p class="hint">Ton fichier reste sur cet appareil. Les formats <strong>CSV</strong> et <strong>CAMT.053 XML</strong> sont pris en charge ; aucune connexion bancaire n’est requise.</p><form data-form="import-file">${inputField('Relevé bancaire','bankFile','','file',true)}<div class="security-list">🔒 Les relevés sont analysés exclusivement dans ton navigateur. L’aperçu te permettra de contrôler les colonnes et le sens des montants AVANT d’enregistrer.</div>${actionButtons('Analyser ce fichier')}</form>`);$('#f_bankFile').accept='.csv,.txt,.xml,.camt,text/csv,text/xml,application/xml';}
async function parseBankFile(file){if(file.size>18*1024*1024)throw Error('Fichier trop volumineux (maximum 18 Mo)');const text=await readTextFile(file);const xml=file.name.toLowerCase().match(/\.(xml|camt)$/)||text.trimStart().startsWith('<?xml');if(xml){const tx=camtTransactions(text);if(!tx.length)throw Error('Aucune opération CAMT.053 reconnue');state.importInfo={type:'xml',name:file.name,transactions:tx};renderImportPreview();return;}
 const sep=autoDelimiter(text),rows=csvParse(text,sep);if(rows.length<2)throw Error('Fichier CSV vide ou mal structuré');if(rows.length>35000)throw Error('Trop de lignes : exporte une période plus courte');const headers=rows.shift().map((v,i)=>v.trim()||'Colonne '+(i+1)),map=guessColumns(headers);state.importInfo={type:'csv',name:file.name,headers,rows,map,sep};renderImportPreview();}
function renderImportPreview(){const info=state.importInfo;if(!info)return;let sample='',mapping='';if(info.type==='csv'){
 const colChoice=(label,key)=>`<div class="form-field"><label>${label}</label><select name="col_${key}"><option value="-1">— Non utilisée —</option>${info.headers.map((h,i)=>`<option value="${i}" ${info.map[key]===i?'selected':''}>${escapeHtml(h)}</option>`).join('')}</select></div>`;
 mapping=`<div class="mapping-grid">${colChoice('Date','date')}${colChoice('Description','description')}${colChoice('Montant signé','amount')}${colChoice('Débit / sortie','debit')}${colChoice('Crédit / entrée','credit')}</div><div class="form-field"><label><input name="invert" type="checkbox" value="yes"/> Inverser les signes du montant signé (uniquement si ton export code les dépenses en positif)</label></div>`;
 sample=`<div class="import-preview"><table><thead><tr>${info.headers.map(h=>`<th>${escapeHtml(truncate(h,50))}</th>`).join('')}</tr></thead><tbody>${info.rows.slice(0,5).map(row=>`<tr>${info.headers.map((_,i)=>`<td>${escapeHtml(truncate(row[i]||'',75))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 }else sample=`<div class="import-preview"><table><thead><tr><th>Date</th><th>Libellé</th><th>Montant</th></tr></thead><tbody>${info.transactions.slice(0,5).map(t=>`<tr><td>${t.date}</td><td>${escapeHtml(t.name)}</td><td>${money(t.amount)}</td></tr>`).join('')}</tbody></table></div>`;
 openModal('Vérifier avant l’import',`<p class="hint">${escapeHtml(info.name)} · ${info.type==='xml'?info.transactions.length:info.rows.length} lignes détectées.</p><div class="import-panel"><p>APERÇU DES PREMIÈRES LIGNES</p>${sample}</div><form data-form="import-confirm">${mapping}<div class="security-list">Important : contrôle le sens des montants. Les dépenses doivent apparaître en négatif, les revenus en positif. Les doublons exacts seront ignorés.</div>${actionButtons('Importer les transactions')}</form>`);
}
function bankMappedTransactions(info,form){if(info.type==='xml')return info.transactions;const map={};for(const field of ['date','description','amount','debit','credit'])map[field]=Number(form['col_'+field]);if(map.date<0||map.description<0||(map.amount<0&&(map.debit<0||map.credit<0)))throw Error('Sélectionne une date, une description et un montant (ou débit + crédit)');const inverted=!!form.invert;const result=[];for(const row of info.rows){const date=normalizeDate(row[map.date]||'');if(!validDate(date))continue;const name=truncate((row[map.description]||'Opération bancaire').trim(),320);let amount=NaN;
 if(map.amount>=0&&String(row[map.amount]||'').trim()){amount=parseCurrency(row[map.amount]);if(inverted)amount=-amount;}
 else {const db=parseCurrency(row[map.debit]||0),cr=parseCurrency(row[map.credit]||0);amount=Math.abs(cr)-Math.abs(db);}
 if(!Number.isFinite(amount)||!amount)continue;result.push({date,name,amount,category:detectCategory(name,amount)});
 }return result;}
function hashSync(str){let a=2166136261;for(let i=0;i<str.length;i++){a^=str.charCodeAt(i);a=Math.imul(a,16777619);}return (a>>>0).toString(16);}
function fingerprintTransactions(rows){const occurs=new Map();return rows.map(r=>{const key=[r.date,r.name.toLocaleLowerCase('fr').replace(/\s+/g,' ').trim(),r.amount].join('|');const seq=occurs.get(key)||0;occurs.set(key,seq+1);return {...r,fingerprint:hashSync(key+'|'+seq)};});}
function importBankRows(imported){const existing=new Set(state.data.transactions.map(t=>t.fingerprint).filter(Boolean));const normalized=fingerprintTransactions(imported);let count=0,dup=0;for(const raw of normalized){if(existing.has(raw.fingerprint)){dup++;continue;}const t={...raw,id:uid(),source:'Import bancaire'};state.data.transactions.push(t);existing.add(raw.fingerprint);count++;}if(!count)throw Error('Aucune nouvelle transaction : les lignes sont vides, invalides ou déjà importées');updateData();state.importInfo=null;closeModal();toast(`${count} transaction(s) importée(s)${dup?', '+dup+' doublon(s) ignoré(s)':''}`);}
async function handleSubmit(event){const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();const kind=form.dataset.form,id=form.dataset.id||'',button=form.querySelector('[type="submit"]');if(button)button.disabled=true;
 try{
  if(kind==='create-vault'){const pass=form.elements.password.value,confirmPass=form.elements.confirmation.value;if(pass.length<12)throw Error('Utilise une phrase secrète d’au moins 12 caractères');if(pass!==confirmPass)throw Error('Les deux mots de passe ne correspondent pas');if(!state.db)throw Error('Le stockage local privé est indisponible');if(await idbGet(state.db,'finances'))throw Error('Un coffre existe déjà : déverrouille-le');await setupVault(pass);closeModal();}
  if(kind==='unlock'){await unlockVault(form.elements.password.value);closeModal();}
  if(kind==='transaction'){const amount=Number(form.elements.amount.value),date=form.elements.date.value,name=form.elements.name.value.trim(),category=form.elements.category.value;if(!validDate(date))throw Error('Date invalide');if(!name||!Number.isFinite(amount)||amount===0)throw Error('Ajoute un libellé et un montant non nul');const prior=state.data.transactions.find(x=>x.id===id);const tx={id:prior?.id||uid(),date,name,category,amount:validMoney(amount),source:prior?.source||'Manuel',...(prior?.fingerprint?{fingerprint:prior.fingerprint}:{})};if(prior)Object.assign(prior,tx);else state.data.transactions.push(tx);updateData();closeModal();toast('Transaction enregistrée');}
  if(kind==='bulk-bills'){state.bulkText=form.elements.lines.value;state.bulkDraft=parseBulkBills(state.bulkText);showBulkPreview();}
   if(kind==='bulk-confirm'){saveBulkBills();}
   if(kind==='bill'){const amount=Number(form.elements.amount.value),name=form.elements.name.value.trim();if(!name||!Number.isFinite(amount)||amount<=0)throw Error('Montant de charge incorrect');const prior=state.data.bills.find(x=>x.id===id);const bill={id:prior?.id||uid(),name,amount:validMoney(amount),cycle:form.elements.cycle.value,category:form.elements.category.value,essential:form.elements.essential.value==='yes'};if(prior)Object.assign(prior,bill);else state.data.bills.push(bill);updateData();closeModal();toast('Charge enregistrée');}
  if(kind==='budgets'){const goal=Number(form.elements.goal.value);if(!Number.isFinite(goal)||goal<0)throw Error('Objectif invalide');state.data.goal=validMoney(goal);for(const c of BUDGET_CATS){const val=Number(form.elements['b_'+c].value);if(!Number.isFinite(val)||val<0)throw Error('Budget invalide pour '+c);state.data.budgets[c]=validMoney(val);}updateData();closeModal();toast('Budgets mis à jour');}
  if(kind==='import-file'){const file=form.elements.bankFile.files[0];if(!file)throw Error('Sélectionne un fichier CSV ou XML');await parseBankFile(file);}
  if(kind==='import-confirm'){if(!state.importInfo)throw Error('Aucun fichier prêt');const formObj={};for(const [k,v] of new FormData(form).entries())formObj[k]=v;const entries=bankMappedTransactions(state.importInfo,formObj);if(!entries.length)throw Error('Aucune transaction valide. Contrôle le format de la date et les colonnes.');if(entries.length>10000&&!confirm(`Importer ${entries.length} transactions ?`))return;importBankRows(entries);}
  if(kind==='restore'){const file=form.elements.backupFile.files[0];if(!file)throw Error('Choisis une sauvegarde');await restoreBackupFile(file,form.elements.password.value);}
  if(kind==='change-password'){const pass=form.elements.password.value;if(pass.length<12||pass!==form.elements.confirmation.value)throw Error('Vérifie le nouveau mot de passe (au moins 12 caractères)');await changePassword(form.elements.oldPassword.value,pass);closeModal();}
 }catch(err){toast('⚠ '+(err.message||'Opération impossible'));}finally{if(button)button.disabled=false;}
}
async function handleClick(event){const routeTarget=event.target.closest('[data-route]');if(routeTarget){route(routeTarget.dataset.route);return;}const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action,id=button.dataset.id;
 try{
 if(action==='close-modal'){closeModal();return;}
 if(action==='month-prev'){state.month=previousMonth(state.month,-1);render();return;}
 if(action==='month-next'){state.month=previousMonth(state.month,1);render();return;}
 if(action==='create-vault'){openCreateVault();return;}
 if(action==='new-transaction'){showTransaction();return;}
 if(action==='edit-transaction'){showTransaction(id);return;}
 if(action==='new-bill'){showBill();return;}
  if(action==='bulk-bills'){showBulkBills();return;}
 if(action==='edit-bill'){showBill(id);return;}
 if(action==='edit-budgets'){if(state.source==='vault')showBudgets();else openCreateVault();return;}
 if(action==='open-import'){importStart();return;}
 if(action==='export-vault'){await exportVault();return;}
 if(action==='import-backup'){restoreBackupPrompt();return;}
 if(action==='change-password'){showChangePassword();return;}
 if(action==='lock'){await saveQueue;state.key=null;state.salt=null;state.data=null;state.source='locked';state.route='overview';render();toast('Coffre verrouillé');return;}
 if(action==='demo-mode'){state.source='demo';state.key=null;state.salt=null;state.data=buildDemo();state.month=monthId(nowIso());state.route='overview';render();return;}
 if(action==='delete-transaction'){if(!confirm('Supprimer définitivement cette transaction ?'))return;state.data.transactions=state.data.transactions.filter(x=>x.id!==id);updateData();closeModal();toast('Transaction supprimée');return;}
 if(action==='delete-bill'){if(!confirm('Supprimer définitivement cette charge ?'))return;state.data.bills=state.data.bills.filter(x=>x.id!==id);updateData();closeModal();toast('Charge supprimée');return;}
 if(action==='delete-vault'){const typed=prompt('Cette action efface toutes les finances stockées sur cet appareil. Tape exactement SUPPRIMER pour confirmer.');if(typed!=='SUPPRIMER')return;await saveQueue;await idbDelete(state.db,'finances');state.key=null;state.salt=null;state.data=buildDemo();state.source='demo';state.route='overview';render();toast('Coffre local effacé définitivement');return;}
 }catch(err){toast('⚠ '+(err.message||'Action impossible'));}
}
function handleChange(event){const el=event.target;if(el.matches('[data-cut-key]')){if(state.source!=='vault'){toast('Ce scénario est fictif. Crée ton coffre pour enregistrer tes choix.');return;}const key=el.dataset.cutKey;state.data.cutDone=state.data.cutDone.filter(x=>x!==key);if(!el.checked)state.data.cutDone.push(key);updateData();}}
function handleInput(event){const el=event.target;if(el.id==='cutRange'){state.cutPct=Number(el.value);renderCutsInPlace();}if(el.id==='transactionSearch'){state.filterQuery=el.value;const cursor=el.selectionStart;const name=el.value;const rows=byDateDesc(monthTransactions()).filter(t=>(!state.filterCat||t.category===state.filterCat)&&(!name.trim()||(t.name+' '+t.category+' '+t.source).toLocaleLowerCase('fr').includes(name.trim().toLocaleLowerCase('fr'))));const list=$('#transactionsList');if(list)list.innerHTML=transactionRows(rows,true);}}
function renderCutsInPlace(){if(state.route!=='cuts')return;const focus=document.activeElement;$('#app').innerHTML=renderCuts();$('#cutRange')?.focus({preventScroll:true});}
function handleSelect(event){if(event.target.id==='transactionCat'){state.filterCat=event.target.value;render();}}
document.addEventListener('click',handleClick);document.addEventListener('submit',handleSubmit);document.addEventListener('input',handleInput);document.addEventListener('change',event=>{handleSelect(event);handleChange(event);});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal();});
startup();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
// Local-only test access. Disabled in production unless ?__test=1 on localhost.
if(location.hostname==='localhost'&&new URLSearchParams(location.search).has('__test'))window.__lucideTest={parseCurrency,normalizeDate,csvParse,autoDelimiter,guessColumns,bankMappedTransactions,detectCategory,camtTransactions,suggestedCuts,emptyData,snapshot,encrypt,decrypt,derive,readTextFile,fp:fingerprintTransactions,getState:()=>state};
})();
