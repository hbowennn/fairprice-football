const $ = id => document.getElementById(id);
const STORE_KEY = 'fairprice_players_v1';
let currentModel = null;
let lastMatchBaseline = null;

function n(id, fallback=0){ const v = Number($(id).value); return Number.isFinite(v) ? v : fallback; }
function fmt(v, dp=2){ return Number.isFinite(v) ? v.toFixed(dp) : '—'; }
function validOdds(v){ return Number.isFinite(v) && v > 1; }
function clamp(v,min,max){return Math.min(max,Math.max(min,v));}
function poissonPmf(k,lambda){ if(lambda<=0) return k===0?1:0; let p=Math.exp(-lambda); for(let i=1;i<=k;i++) p*=lambda/i; return p; }
function poissonCdf(k,lambda){ let s=0; for(let i=0;i<=k;i++)s+=poissonPmf(i,lambda); return clamp(s,0,1); }
function overProb(threshold,lambda){ return clamp(1-poissonCdf(threshold-1,lambda),0,1); }
function fair(p){ return p>0 ? 1/p : Infinity; }
function renderMetric(label,value,detail=''){return `<div class="metric"><div class="label">${label}</div><div class="value">${value}</div><div class="detail">${detail}</div></div>`;}
function impliedNoVig(odds){ const inv=odds.map(o=>1/o); const total=inv.reduce((a,b)=>a+b,0); return inv.map(p=>p/total); }

document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===btn));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('hidden',v.id!==`tab-${btn.dataset.tab}`));
}));
function calcMatch(){
 const odds=[n('homeOdds'),n('drawOdds'),n('awayOdds')], over=n('overOdds'), under=n('underOdds');
 if(!odds.every(validOdds)||!validOdds(over)||!validOdds(under)){ $('matchOutput').innerHTML='<p class="warning">Enter decimal odds greater than 1.00.</p>';return; }
 const probs=impliedNoVig(odds), goals=impliedNoVig([over,under]);
 lastMatchBaseline={home:probs[0],draw:probs[1],away:probs[2],over25:goals[0],under25:goals[1]};
 $('matchOutput').innerHTML =
 renderMetric('Home win',fmt(probs[0]*100,1)+'%','No-vig market estimate')+
 renderMetric('Draw',fmt(probs[1]*100,1)+'%','No-vig market estimate')+
 renderMetric('Away win',fmt(probs[2]*100,1)+'%','No-vig market estimate')+
 renderMetric('Over 2.5',fmt(goals[0]*100,1)+'%','No-vig market estimate')+
 renderMetric('Under 2.5',fmt(goals[1]*100,1)+'%','No-vig market estimate')+
 renderMetric('1X2 overround',fmt((odds.reduce((s,o)=>s+1/o,0)-1)*100,1)+'%','Before normalisation');
}
$('calcMatch').addEventListener('click',calcMatch);
calcMatch();

function readPlayer(){
 const minutes=clamp(n('minutes',80),1,120), sampleMinutes=Math.max(1,n('sampleMinutes',720));
 const goals=Math.max(0,n('goals')), shots=Math.max(0,n('shots')), sot=Math.max(0,n('sot'));
 const name=$('playerName').value.trim()||'Unnamed player';
 const apps=Math.max(1,n('apps',1)), starts=clamp(n('starts'),0,apps);
 // Rate projections scale observed per-minute rate to expected minutes.
 const scale=minutes/sampleMinutes;
 const lambdaGoals=goals*scale, lambdaShots=shots*scale, lambdaSot=Math.min(sot*scale, shots*scale);
 // penalty flag is displayed but deliberately does not invent a numeric boost.
 return {name,team:$('playerTeam').value.trim(),minutes,apps,starts,sampleMinutes,goals,shots,sot,penaltyRole:$('penaltyRole').value,
   lambdaGoals,lambdaShots,lambdaSot};
}
function playerMarkets(m){
 const pScore=overProb(1,m.lambdaGoals), p2Goals=overProb(2,m.lambdaGoals);
 const p2Shots=overProb(2,m.lambdaShots), p3Shots=overProb(3,m.lambdaShots);
 const p1Sot=overProb(1,m.lambdaSot), p2Sot=overProb(2,m.lambdaSot);
 return [
  ['Anytime goalscorer',pScore],['2+ goals',p2Goals],['2+ shots',p2Shots],['3+ shots',p3Shots],['1+ shot on target',p1Sot],['2+ shots on target',p2Sot]
 ];
}
function calculatePlayer(){
 const m=readPlayer();
 if(m.sot>m.shots){$('playerOutput').innerHTML='<p class="warning">Shots on target cannot exceed total shots. Check your inputs.</p>';return;}
 currentModel=m;
 const markets=playerMarkets(m);
 $('playerOutput').innerHTML=`
 <div class="grid3">
 ${renderMetric('Expected goals',fmt(m.lambdaGoals,2),'At expected minutes')}
 ${renderMetric('Expected shots',fmt(m.lambdaShots,2),'At expected minutes')}
 ${renderMetric('Expected shots on target',fmt(m.lambdaSot,2),'At expected minutes')}
 </div>
 <div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Player market</th><th>Probability</th><th>Fair odds</th></tr></thead><tbody>
 ${markets.map(([label,p])=>`<tr><td>${label}</td><td>${fmt(p*100,1)}%</td><td>${fmt(fair(p),2)}</td></tr>`).join('')}
 </tbody></table></div>
 <p class="sub" style="margin-bottom:0">Projection uses raw sample counts scaled by expected minutes. This is a starting benchmark, not a calibrated forecast; it can overfit short samples and does not include opponent, role, start probability or match-state effects.</p>`;
 renderSavedPlayers();
}
$('calculatePlayer').addEventListener('click',calculatePlayer);
$('resetPlayer').addEventListener('click',()=>{
 ['playerName','playerTeam','minutes','apps','starts','sampleMinutes','goals','shots','sot'].forEach(id=>$(id).value=({'playerName':'','playerTeam':'','minutes':'80','apps':'1','starts':'0','sampleMinutes':'90','goals':'0','shots':'0','sot':'0'}[id]));
 $('penaltyRole').value='no';calculatePlayer();
});
function getSaved(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||'[]')}catch{return[]}}
function setSaved(items){localStorage.setItem(STORE_KEY,JSON.stringify(items));}
function savePlayer(){
 const m=currentModel||readPlayer(); const items=getSaved().filter(p=>!(p.name===m.name&&p.team===m.team));items.unshift({...m,savedAt:new Date().toISOString()});setSaved(items.slice(0,100));renderSavedPlayers();
}
$('savePlayer').addEventListener('click',()=>{calculatePlayer();if(currentModel)savePlayer();});
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderSavedPlayers(){
 const items=getSaved();
 if(!items.length){$('savedPlayers').innerHTML='<div class="empty">No saved players yet.</div>';return;}
 $('savedPlayers').innerHTML=items.map((p,i)=>`<div class="source-row"><div><strong>${escapeHtml(p.name)}</strong><div class="sub">${escapeHtml(p.team||'')} · ${p.minutes} expected mins</div></div><div class="btnrow"><button class="smallbtn" data-load="${i}">Load</button><button class="smallbtn" data-delete="${i}">Delete</button></div></div>`).join('');
 $('savedPlayers').querySelectorAll('[data-load]').forEach(b=>b.addEventListener('click',()=>{const p=getSaved()[+b.dataset.load];for(const k of ['playerName','playerTeam','minutes','apps','starts','sampleMinutes','goals','shots','sot'])$(k).value=p[({playerName:'name',playerTeam:'team'})[k]||k]??'';$('penaltyRole').value=p.penaltyRole||'no';calculatePlayer();document.querySelector('[data-tab="player"]').click();}));
 $('savedPlayers').querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>{const items=getSaved();items.splice(+b.dataset.delete,1);setSaved(items);renderSavedPlayers();}));
}
$('exportPlayers').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(getSaved(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='fairprice-players.json';a.click();URL.revokeObjectURL(a.href);});
$('importPlayers').addEventListener('change',async e=>{try{const raw=JSON.parse(await e.target.files[0].text());if(!Array.isArray(raw))throw Error('Expected a JSON array');setSaved(raw.slice(0,100));renderSavedPlayers();}catch(err){alert('Could not import that JSON file.');}e.target.value='';});
renderSavedPlayers();calculatePlayer();

function comparePrice(){
 const market=$('marketType').value, m=currentModel||readPlayer(), pMap=Object.fromEntries(playerMarkets(m));
 const key={anytime:'Anytime goalscorer','twoGoals':'2+ goals',shots2:'2+ shots',shots3:'3+ shots',sot1:'1+ shot on target',sot2:'2+ shots on target'}[market];
 const p=pMap[key], odds=n('exchangeOdds'), comm=clamp(n('commission')/100,0,1), stake=Math.max(0,n('stake'));
 if(!validOdds(odds)||!Number.isFinite(p)){$('priceOutput').innerHTML='<p class="warning">Check the selected price and player inputs.</p>';return;}
 const fairOdds=fair(p), rawEV=p*(odds-1)-(1-p), commissionEV=p*(odds-1)*(1-comm)-(1-p);
 const netReturnWin=stake*(odds-1)*(1-comm), evStake=stake*commissionEV;
 const edge=(odds/fairOdds-1)*100;
 $('priceOutput').innerHTML=`<div class="grid2">
 ${renderMetric('Model probability',fmt(p*100,1)+'%',key)}
 ${renderMetric('Fair odds',fmt(fairOdds,2),'1 / model probability')}
 ${renderMetric('Exchange odds',fmt(odds,2),'Manually entered price')}
 ${renderMetric('Odds difference',fmt(edge,1)+'%',edge>=0?'Exchange above fair price':'Exchange below fair price')}
 ${renderMetric('Net win profit', '£'+fmt(netReturnWin,2),'On £'+fmt(stake,2)+' stake, if successful')}
 ${renderMetric('Model EV / stake','£'+fmt(evStake,2),`After ${fmt(comm*100,1)}% commission assumption`)}
 </div><p class="notice" style="margin-top:12px">Estimated expected value is highly sensitive to model calibration. A positive result is not evidence of an actual betting edge.</p>`;
}
$('comparePrice').addEventListener('click',comparePrice);

function backendBase(){return $('apiBase').value.trim().replace(/\/+$/,'');}
async function apiFetch(path,opts={}){
 const base=backendBase(); if(!base)throw Error('Enter your deployed backend URL first.');
 const res=await fetch(base+path,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});
 const data=await res.json().catch(()=>({detail:'Unexpected response from backend'}));
 if(!res.ok)throw Error(data.detail||`Backend error ${res.status}`);
 return data;
}
$('testApi').addEventListener('click',async()=>{
 try{const d=await apiFetch('/health');$('connectionStatus').textContent='BACKEND ONLINE';$('apiPill').textContent='Backend online';$('eventList').innerHTML=`<div class="notice">Backend reachable. Betfair credentials configured: ${d.betfair_configured?'yes':'no'}.</div>`;}
 catch(e){$('eventList').innerHTML=`<div class="notice warning">${escapeHtml(e.message)}</div>`;}
});
$('loadEvents').addEventListener('click',async()=>{
 try{const d=await apiFetch('/football/events?text='+encodeURIComponent($('eventSearch').value));$('eventList').innerHTML=(d.events||[]).map(ev=>`<div class="source-row"><div><strong>${escapeHtml(ev.name)}</strong><div class="sub">${escapeHtml(ev.competition||'Football')} · ${escapeHtml(ev.openDate||'')}</div></div><button class="smallbtn" data-event="${escapeHtml(ev.id)}">Markets</button></div>`).join('')||'<div class="empty">No matching events returned.</div>';
 $('eventList').querySelectorAll('[data-event]').forEach(b=>b.addEventListener('click',()=>loadMarkets(b.dataset.event)));
 }catch(e){$('eventList').innerHTML=`<div class="notice warning">${escapeHtml(e.message)}</div>`;}
});
async function loadMarkets(eventId){
 try{const d=await apiFetch('/football/markets?event_id='+encodeURIComponent(eventId));$('eventList').innerHTML=`<div class="notice">Markets returned for event ${escapeHtml(eventId)}. The service only returns catalogue/price data; it does not place bets.</div>`+(d.markets||[]).map(m=>`<div class="source-row"><div><strong>${escapeHtml(m.marketName||'Market')}</strong><div class="sub">${escapeHtml(m.marketType||'')} · ${escapeHtml(m.marketId||'')}</div></div><span class="sub">${m.runners?.length||0} runners</span></div>`).join('');}
 catch(e){$('eventList').innerHTML=`<div class="notice warning">${escapeHtml(e.message)}</div>`;}
}
$('refreshOdds').addEventListener('click',async()=>{
 try{
  const d=await apiFetch('/football/markets?text='+encodeURIComponent($('homeTeam').value+' '+$('awayTeam').value));
  $('lastUpdated').textContent='API refreshed '+new Date().toLocaleTimeString();
  $('connectionStatus').textContent='API CONNECTED';
  $('apiPill').textContent='Prices fetched';
  $('eventList').innerHTML=`<div class="notice">Fetched ${d.markets?.length||0} market(s). Select a fixture in Match centre → Load football events to inspect individual market details. Version 1 does not automatically map runner prices to the form fields yet.</div>`;
 }catch(e){$('eventList').innerHTML=`<div class="notice warning">Refresh failed: ${escapeHtml(e.message)}. Demo values have not been changed.</div>`;}
});
let refreshTimer=null;
function restartAutoRefresh(){
 if(refreshTimer)clearInterval(refreshTimer);
 // Refresh only while the page is visible, using a modest 60-second interval.
 refreshTimer=setInterval(()=>{if(document.visibilityState==='visible'&&backendBase())$('refreshOdds').click();},60000);
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')restartAutoRefresh();});
restartAutoRefresh();

if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
