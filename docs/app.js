const $=id=>document.getElementById(id);
const num=id=>Number($(id).value);
const validOdds=ids=>ids.every(id=>Number.isFinite(num(id))&&num(id)>1);
const fact=n=>{let r=1;for(let i=2;i<=n;i++)r*=i;return r};
const pois=(k,l)=>Math.exp(-l)*Math.pow(l,k)/fact(k);
const pAtLeast=(k,l)=>1-Array.from({length:k},(_,i)=>pois(i,l)).reduce((a,b)=>a+b,0);
let currentModel=null, currentPlayer=null, players=[];
function readOdds(){if(!validOdds(['h','d','a','over','under']))throw Error('Please enter valid decimal odds greater than 1.00 in all five fields.');let raw=[1/num('h'),1/num('d'),1/num('a')],sum=raw.reduce((a,b)=>a+b,0);return {p:raw.map(x=>x/sum),over:(1/num('over'))/((1/num('over'))+(1/num('under'))),under:(1/num('under'))/((1/num('over'))+(1/num('under')))}}
function outcome(lh,la){let ph=Array.from({length:11},(_,i)=>pois(i,lh)),pa=Array.from({length:11},(_,i)=>pois(i,la));let h=0,d=0,a=0,o=0;for(let i=0;i<11;i++)for(let j=0;j<11;j++){let p=ph[i]*pa[j];if(i>j)h+=p;else if(i===j)d+=p;else a+=p;if(i+j>=3)o+=p}return [h,d,a,o]}
function fitModel(m){let best=null;for(let lh=.2;lh<=4.001;lh+=.025)for(let la=.2;la<=4.001;la+=.025){let q=outcome(lh,la),err=(q[0]-m.p[0])**2+(q[1]-m.p[1])**2+(q[2]-m.p[2])**2+(q[3]-m.over)**2;if(!best||err<best.err)best={lh,la,q,err}}return best}
function odds(p){return p>0?1/p:Infinity}
function fmt(p){return (100*p).toFixed(1)+'%'}
function moneyOdds(o){return Number.isFinite(o)?o.toFixed(2):'—'}
function calculateMatch(){try{let m=readOdds();currentModel=fitModel(m);let names=[$('homeTeam').value||'Home team',$('awayTeam').value||'Away team'];$('matchOutput').innerHTML=`<div class="result"><b>No-vig 1X2 probabilities</b><p>${names[0]} ${fmt(m.p[0])} · Draw ${fmt(m.p[1])} · ${names[1]} ${fmt(m.p[2])}</p></div><div class="result"><b>Modelled expected goals</b><p>${names[0]}: <span class="out">${currentModel.lh.toFixed(2)}</span> · ${names[1]}: <span class="out">${currentModel.la.toFixed(2)}</span></p><p>Total: ${(currentModel.lh+currentModel.la).toFixed(2)} goals</p></div><div class="result"><b>Model probabilities vs market</b><p>Home ${fmt(currentModel.q[0])} · Draw ${fmt(currentModel.q[1])} · Away ${fmt(currentModel.q[2])}</p><p>Over 2.5 model ${fmt(currentModel.q[3])}; entered market no-vig ${fmt(m.over)}</p></div><p class="small">Fit error: ${currentModel.err.toFixed(4)}. This is a simple best-fit estimate; the three market constraints cannot always be matched exactly by two Poisson goal rates.</p>`;return true}catch(e){$('matchOutput').textContent=e.message;return false}}
function pricePlayer(){if(!currentModel&&!calculateMatch())return null;let mins=Math.max(0,Math.min(120,num('mins')||0)),start=Math.max(0,Math.min(100,num('start')||0))/100,side=$('side').value,teamLambda=side==='home'?currentModel.lh:currentModel.la;let g90=Math.max(0,num('g90')||0),s90=Math.max(0,num('s90')||0),sot90=Math.max(0,num('sot90')||0);let exposure=mins/90*start;let rawGoal=g90*exposure;let lambda=rawGoal*(teamLambda/Math.max(.05,2.0));let pScore=1-Math.exp(-lambda);let shotMean=s90*exposure,sotMean=sot90*exposure;let pShot=pAtLeast(1,shotMean),pSot=pAtLeast(1,sotMean);let so=num('scoreOdds'),sho=num('shotOdds');currentPlayer={name:$('pname').value||'Player',side,mins,start:start*100,g90,s90,sot90,pScore,scoreFair:odds(pScore),pShot,shotFair:odds(pShot),pSot,sotFair:odds(pSot),scoreOdds:so,shotOdds:sho};let value=(p,o)=>Number.isFinite(o)&&o>1?` · EV ${((p*o-1)*100).toFixed(1)}%`:'';
$('playerOutput').innerHTML=`<div class="result"><b>${currentPlayer.name}</b><p>Estimated anytime scorer probability: <span class="out">${fmt(pScore)}</span> · Fair odds <span class="out">${moneyOdds(odds(pScore))}</span>${value(pScore,so)}</p><p>1+ shot: <span class="out">${fmt(pShot)}</span> · Fair odds ${moneyOdds(odds(pShot))}${value(pShot,sho)}</p><p>1+ shot on target: <span class="out">${fmt(pSot)}</span> · Fair odds ${moneyOdds(odds(pSot))}</p><p class="small">Expected goals used: ${lambda.toFixed(3)}. The scorer rate is scaled by team goal environment versus a fixed 2.0-goal reference; use as a starting estimate only.</p></div>`;return currentPlayer}
$('modelBtn').onclick=calculateMatch;$('playerBtn').onclick=pricePlayer;
$('addBtn').onclick=()=>{if(!currentPlayer&&!pricePlayer())return;if(!currentPlayer)return;players.push({...currentPlayer});renderPlayers()};
function renderPlayers(){$('savedPlayers').innerHTML=players.length?'<h3>Saved in this page session</h3>'+players.map(p=>`<div class="result"><b>${escapeHtml(p.name)}</b> — scorer fair odds ${moneyOdds(p.scoreFair)}, 1+ shot ${moneyOdds(p.shotFair)}</div>`).join(''):''}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('clearBtn').onclick=()=>{players=[];renderPlayers()};
$('fixturesBtn').onclick=async()=>{let token=$('fdToken').value.trim();if(!token){$('dataOutput').textContent='Paste your football-data.org token first. It stays in this browser only.';return}localStorage.setItem('fdToken',token);$('dataOutput').textContent='Loading fixtures…';try{let r=await fetch('https://api.football-data.org/v4/competitions/'+encodeURIComponent($('competition').value)+'/matches?status=SCHEDULED',{headers:{'X-Auth-Token':token}});let j=await r.json();if(!r.ok)throw Error(j.message||`HTTP ${r.status}`);let rows=(j.matches||[]).slice(0,12);$('dataOutput').innerHTML=rows.length?rows.map(x=>`${new Date(x.utcDate).toLocaleString()} — ${escapeHtml(x.homeTeam.name)} v ${escapeHtml(x.awayTeam.name)}`).join('<br>'):'No scheduled fixtures returned for this competition.'}catch(e){$('dataOutput').textContent='Could not load fixtures: '+e.message+' (check token and free-tier competition access).'}}
$('fdToken').value=localStorage.getItem('fdToken')||'';
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
calculateMatch();
// API-Football squad loader. The secret API key stays on the Render backend.
let squadRows=[];
const esc=escapeHtml;
function backendBase(){return ($('backendUrl').value.trim()||'').replace(/\/$/,'')}
function fairFromRate(rate, mins, start, teamLambda, isGoal){const exposure=Math.max(0,mins)/90*Math.max(0,Math.min(100,start))/100;let mean=Math.max(0,rate)*exposure;if(isGoal)mean*=teamLambda/2;return mean>0?1/Math.max(1e-9,1-Math.exp(-mean)):Infinity}
function renderSquadGrid(){
 const wrap=$('playerGridWrap');
 if(!squadRows.length){wrap.innerHTML='';return}
 wrap.innerHTML=`<div class="table-scroll"><table class="player-table"><thead><tr><th>Player / team</th><th>Pos.</th><th>Min</th><th>Start %</th><th>G/90</th><th>Shots/90</th><th>SOT/90</th><th>Scorer fair</th><th>1+ shot</th><th>1+ SOT</th></tr></thead><tbody>${squadRows.map((p,i)=>`<tr><td><b>${esc(p.name||'Unknown')}</b><br><span class="small">${esc(p.teamName)} · ${esc(p.position||'—')}</span></td><td>${esc(p.position||'—')}</td><td><input aria-label="Expected minutes" type="number" min="0" max="120" value="${Math.round(p.minutesExpected)}" data-i="${i}" data-f="minutesExpected"></td><td><input aria-label="Starting chance" type="number" min="0" max="100" value="${Math.round(p.startExpected)}" data-i="${i}" data-f="startExpected"></td><td>${p.goals_per90.toFixed(2)}</td><td>${p.shots_per90.toFixed(2)}</td><td>${p.sot_per90.toFixed(2)}</td><td class="scorer"></td><td class="shot"></td><td class="sot"></td></tr>`).join('')}</tbody></table></div><p class="small">Rates use the selected season’s available stats. Minutes and starting probability are editable. Missing stats may appear as zero if the API plan or competition doesn’t provide them.</p>`;
 wrap.querySelectorAll('input[data-i]').forEach(inp=>inp.addEventListener('change',()=>{const p=squadRows[Number(inp.dataset.i)];p[inp.dataset.f]=Math.max(0,Math.min(inp.dataset.f==='minutesExpected'?120:100,Number(inp.value)||0));updateGridPrices()}));
 updateGridPrices();
}
function updateGridPrices(){
 const wrap=$('playerGridWrap'); if(!wrap.querySelector('tbody'))return;
 const rows=[...wrap.querySelectorAll('tbody tr')];
 rows.forEach((tr,i)=>{const p=squadRows[i];const lambda=p.side==='home'?(currentModel?.lh||1.3):(currentModel?.la||1.1);const exp=p.minutesExpected/90*p.startExpected/100;const goalMean=Math.max(0,p.goals_per90*exp*lambda/2);const pGoal=1-Math.exp(-goalMean);const pShot=1-Math.exp(-Math.max(0,p.shots_per90*exp));const pSot=1-Math.exp(-Math.max(0,p.sot_per90*exp));tr.querySelector('.scorer').textContent=pGoal>0?(1/pGoal).toFixed(2):'—';tr.querySelector('.shot').textContent=pShot>0?(1/pShot).toFixed(2):'—';tr.querySelector('.sot').textContent=pSot>0?(1/pSot).toFixed(2):'—';});
}
async function loadOneTeam(teamName,side,base,season){
 const sr=await fetch(`${base}/api/teams/search?query=${encodeURIComponent(teamName)}`);const sj=await sr.json();if(!sr.ok)throw Error(sj.detail||`Team search failed for ${teamName}`);
 const teams=sj.teams||[];if(!teams.length)throw Error(`No team match found for “${teamName}”. Try a more specific team name.`);
 const normalized=teamName.toLowerCase().replace(/[^a-z0-9]/g,'');const team=teams.find(t=>(t.name||'').toLowerCase().replace(/[^a-z0-9]/g,'')===normalized)||teams[0];
 const pr=await fetch(`${base}/api/teams/${team.id}/players?season=${season}`);const pj=await pr.json();if(!pr.ok)throw Error(pj.detail||`Player data failed for ${team.name}`);
 return (pj.players||[]).map(p=>({...p,teamName:team.name,side,minutesExpected:p.minutes>0?Math.min(90,Math.round((p.minutes/Math.max(1,p.appearances))/90*90)):60,startExpected:p.start_rate==null?50:p.start_rate}));
}
$('loadSquadsBtn').onclick=async()=>{
 const base=backendBase(),home=$('homeTeam').value.trim(),away=$('awayTeam').value.trim(),season=$('statsSeason').value;
 if(!base||!/^https:\/\//i.test(base)){ $('squadStatus').textContent='Enter your Render service URL starting with https://';return; }
 if(!home||!away){$('squadStatus').textContent='Enter both home and away team names in section 1 first.';return;}
 localStorage.setItem('fpBackendUrl',base);$('squadStatus').textContent='Searching teams and loading player stats. This can take a little while on the first request…';$('loadSquadsBtn').disabled=true;
 try{const h=await loadOneTeam(home,'home',base,season);const a=await loadOneTeam(away,'away',base,season);squadRows=[...h,...a];$('squadStatus').textContent=`Loaded ${h.length} players for ${h[0]?.teamName||home} and ${a.length} for ${a[0]?.teamName||away}. Review team matches and edit expected minutes/start chance before using prices.`;if(!currentModel)calculateMatch();renderSquadGrid();}catch(e){$('squadStatus').textContent='Could not load players: '+e.message;}finally{$('loadSquadsBtn').disabled=false;}
};
$('modelBtn').addEventListener('click',()=>{setTimeout(updateGridPrices,0)});
$('homeTeam').addEventListener('change',()=>{if(squadRows.length)$('squadStatus').textContent='Team name changed. Load both teams again to refresh player data.'});
$('awayTeam').addEventListener('change',()=>{if(squadRows.length)$('squadStatus').textContent='Team name changed. Load both teams again to refresh player data.'});
$('backendUrl').value=localStorage.getItem('fpBackendUrl')||'';
