import { supabase, configured } from './supabase-client.js';
import { groupCupMatches } from './cup.js';

import { defaults, normalizeSettings, applySettings } from './settings.js';

let data = {players:[],teams:[],team_members:[],competitions:[],matches:[],games:[]};
let currentGroup = null;
let currentFilter = 'ALL';
let appearance = { ...defaults };

const $ = (q) => document.querySelector(q);
const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const emptyState = (label) => `<div class="empty-state"><span class="empty-mark" aria-hidden="true">—</span><p>${escapeHtml(label)}</p></div>`;
const team = id => data.teams.find(t=>t.id===id);
const comp = id => data.competitions.find(c=>c.id===id);
const teamName = id => team(id)?.name || 'A definir';

function pointsFor(cFor,cAgainst){
  if(cFor===cAgainst) return 1;
  if(cFor>cAgainst) return 3;
  if(cFor===0 && cAgainst===3) return -1;
  return 0;
}

const isGroupMatch = m => m.stage_type==='GROUP' || (!m.stage_type && comp(m.competition_id)?.kind==='LEAGUE');
const isKnockoutMatch = m => m.stage_type ? m.stage_type!=='GROUP' : comp(m.competition_id)?.kind==='CUP';
function classificationCompetition(){
  return data.competitions.find(c=>c.active && data.matches.some(m=>m.competition_id===c.id && isGroupMatch(m))) || data.competitions.find(c=>c.kind==='LEAGUE'&&c.active) || data.competitions.find(c=>data.matches.some(m=>m.competition_id===c.id && isGroupMatch(m))) || data.competitions.find(c=>c.kind==='LEAGUE');
}
function standings(){
  const league = classificationCompetition();
  if(!league) return [];
  const classificationMatches=data.matches.filter(m=>m.competition_id===league.id && isGroupMatch(m) && (currentGroup===null || String(m.group_label)===currentGroup));
  const participantIds=new Set(classificationMatches.flatMap(m=>[m.participant_a,m.participant_b]));
  const eligible = data.teams.filter(t=>currentGroup!==null?participantIds.has(t.id):t.team_type===league.mode);
  const rows = new Map(eligible.map(t=>[t.id,{id:t.id,name:t.name,j:0,v:0,e:0,d:0,cf:0,cs:0,sg:0,tresZero:0,pts:0}]));
  classificationMatches.filter(m=>m.status==='FINISHED' && m.crowns_a!=null && m.crowns_b!=null).forEach(m=>{
    const a=rows.get(m.participant_a),b=rows.get(m.participant_b); if(!a||!b)return;
    a.j++;b.j++;a.cf+=m.crowns_a;a.cs+=m.crowns_b;b.cf+=m.crowns_b;b.cs+=m.crowns_a;
    if(m.crowns_a===m.crowns_b){a.e++;b.e++;}else if(m.crowns_a>m.crowns_b){a.v++;b.d++;if(m.crowns_a===3&&m.crowns_b===0)b.tresZero++;}else{b.v++;a.d++;if(m.crowns_b===3&&m.crowns_a===0)a.tresZero++;}
    a.pts+=pointsFor(m.crowns_a,m.crowns_b);b.pts+=pointsFor(m.crowns_b,m.crowns_a);
  });
  return [...rows.values()].map(r=>({...r,sg:r.cf-r.cs})).sort((a,b)=>b.pts-a.pts||b.v-a.v||b.sg-a.sg||b.cf-a.cf||a.name.localeCompare(b.name,'pt-BR'));
}

function renderStandings(){
  const league=classificationCompetition();
  const groups=[...new Set(data.matches.filter(m=>m.competition_id===league?.id && isGroupMatch(m) && m.group_label!=null).map(m=>String(m.group_label)))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  if(!groups.includes(currentGroup)) currentGroup=groups[0]??null;
  const groupNav=$('#standingsGroups');
  groupNav.hidden=!groups.length;
  groupNav.innerHTML=groups.map(group=>'<button type="button" data-group="'+escapeHtml(group)+'" aria-pressed="'+(group===currentGroup)+'">Grupo '+escapeHtml(group)+'</button>').join('');
  groupNav.onclick=event=>{const button=event.target.closest('button[data-group]');if(button){currentGroup=button.dataset.group;renderStandings();[...groupNav.querySelectorAll('button')].find(b=>b.dataset.group===currentGroup)?.focus({preventScroll:true});}};
  const rows=standings(), body=$('#standingsBody');
  if(!rows.length){body.innerHTML=`<tr><td colspan="${$('#standingsTable').classList.contains('expanded')?11:5}" class="empty">${emptyState(appearance.empty_league)}</td></tr>`;return;}
  body.innerHTML=rows.map((r,i)=>`<tr class="${i<4?'qualified':''}"><td><span class="rank">${i+1}</span></td><td><b>${escapeHtml(r.name)}</b></td><td>${r.j}</td><td>${r.v}</td><td>${r.e}</td><td>${r.d}</td><td>${r.cf}</td><td>${r.cs}</td><td>${r.sg>0?'+':''}${r.sg}</td><td>${r.tresZero}</td><td><b class="pts">${r.pts}</b></td></tr>`).join('');
}

function renderBracket(){
  const cup=data.competitions.find(c=>c.kind==='CUP'&&c.active)||data.competitions.find(c=>c.kind==='CUP');
  const league=classificationCompetition();
  const leagueMatches=data.matches.filter(m=>league && m.competition_id===league.id && isGroupMatch(m));
  const pending=leagueMatches.filter(m=>m.status!=='FINISHED').length;
  const complete=leagueMatches.length-pending;
  const el=$('#bracket'), tools=$('#cupTools'), select=$('#cupPhase'), nav=$('#cupPhaseNav');
  const phases=groupCupMatches(data.matches.filter(m=>cup && m.competition_id===cup.id && isKnockoutMatch(m)));
  const final=phases.find(p=>p.key==='final');
  const decider=final?.matches.length===1?final.matches[0]:null;
  const champion=decider?.status==='FINISHED' && decider.crowns_a!=null && decider.crowns_b!=null && decider.crowns_a!==decider.crowns_b ? team(decider.crowns_a>decider.crowns_b?decider.participant_a:decider.participant_b) : null;
  const progress=$('#cupProgress');
  progress.hidden=!leagueMatches.length || !!champion;
  progress.innerHTML='<div><span>Classificação '+(pending?'em andamento':'concluída')+'</span><strong>'+complete+' / '+leagueMatches.length+' partidas</strong></div><progress max="'+Math.max(1,leagueMatches.length)+'" value="'+complete+'" aria-label="Partidas concluídas na classificação"></progress>';
  tools.hidden=nav.hidden=!phases.length;
  $('#cupScrollHint').hidden=phases.length<2;
  if(!phases.length){
    el.classList.remove('single-phase');
    nav.innerHTML='';
    el.innerHTML='<div class="cup-waiting"><span class="waiting-badge">Aguardando confrontos</span></div>';
    return;
  }
  const previous=select.value;
  select.innerHTML='<option value="all">Todas as fases</option>'+phases.map((phase,i)=>'<option value="'+i+'">'+escapeHtml(phase.label)+'</option>').join('');
  select.value=[...select.options].some(option=>option.value===previous)?previous:'all';
  function draw(){
    const visible=select.value==='all'?phases:[phases[Number(select.value)]];
    nav.innerHTML=phases.map((phase,i)=>'<button type="button" data-phase="'+i+'" aria-pressed="'+(select.value===String(i))+'"><span>'+String(i+1).padStart(2,'0')+'</span>'+escapeHtml(phase.label)+(phase.key==='final'?' <span aria-hidden="true">✦</span>':'')+'</button>').join('');
    el.classList.toggle('single-phase',select.value!=='all');
    $('#cupScrollHint').hidden=visible.length<2;
    el.innerHTML=visible.map(phase=>'<section class="bracket-round '+(phase.key==='final'?'final-round':'')+'" aria-label="'+escapeHtml(phase.label)+'"><h3>'+escapeHtml(phase.label)+'<span>'+phase.matches.length+'</span></h3><div class="bracket-matches">'+phase.matches.map((m,i)=>{
      const finished=m.status==='FINISHED', valid=finished&&m.crowns_a!=null&&m.crowns_b!=null,aWin=valid&&m.crowns_a>m.crowns_b,bWin=valid&&m.crowns_b>m.crowns_a;
      const row=(id,score,win)=>'<div class="bracket-team '+(win?'winner':'')+'"><span class="team-monogram" aria-hidden="true">'+escapeHtml(team(id)?.name?.trim().slice(0,2).toUpperCase()||'?')+'</span><span class="bracket-name">'+escapeHtml(teamName(id))+(win?'<em>Vencedor</em>':'')+'</span><b>'+escapeHtml(finished?score??'–':'–')+'</b></div>';
      return '<article class="bracket-card"><div class="duel-heading"><span>'+(phase.key==='final'?'✦ GRANDE FINAL':'DUELO '+String(i+1).padStart(2,'0'))+'</span><span class="duel-status '+(finished?'is-finished':'')+'">'+(finished?'Encerrado':'A disputar')+'</span></div>'+row(m.participant_a,m.crowns_a,aWin)+row(m.participant_b,m.crowns_b,bWin)+'<small>'+escapeHtml(finished?'Resultado final':fmtDate(m.scheduled_at))+'</small></article>';
    }).join('')+'</div>'+(phase.key==='final'?'<div class="final-destination"><span aria-hidden="true">✦</span><strong>'+escapeHtml(champion?champion.name:'Final')+'</strong><span>'+(champion?'Campeão da Copa':'')+'</span></div>':'')+'</section>').join('');
    el.scrollLeft=0;
    $('#cupSummary').textContent=visible.reduce((sum,p)=>sum+p.matches.filter(m=>m.status==='FINISHED').length,0)+' de '+visible.reduce((sum,p)=>sum+p.matches.length,0)+' duelos encerrados';
  }
  nav.onclick=event=>{const button=event.target.closest('button[data-phase]');if(button){select.value=button.dataset.phase;draw();nav.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});}};
  select.onchange=draw;
  draw();
}

function fmtDate(value){if(!value)return 'Data a definir';try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch{return 'Data inválida'}}

function renderMatches(){
  const list=$('#matchesList');
  let matches=[...data.matches].sort((a,b)=>new Date(b.scheduled_at||0)-new Date(a.scheduled_at||0));
  if(currentFilter==='FINISHED'||currentFilter==='SCHEDULED') matches=matches.filter(m=>m.status===currentFilter);
  if(currentFilter==='LEAGUE'||currentFilter==='CUP') matches=matches.filter(currentFilter==='LEAGUE'?isGroupMatch:isKnockoutMatch);
  $('#matchCount').textContent = `${matches.length} ${matches.length === 1 ? 'partida' : 'partidas'}`;
  if(!matches.length){list.innerHTML=`<div class="empty">${emptyState(appearance.empty_matches)}</div>`;return;}
  list.innerHTML=matches.map(m=>{
    const c=comp(m.competition_id), games=data.games.filter(g=>g.match_id===m.id).sort((a,b)=>a.game_number-b.game_number);
    const aWin=m.status==='FINISHED'&&m.crowns_a>m.crowns_b,bWin=m.status==='FINISHED'&&m.crowns_b>m.crowns_a;
    const gameHtml=games.length?`<div class="game-log">${games.map(g=>`<div>Jogo ${g.game_number}: <b>${g.crowns_a} × ${g.crowns_b}</b>${g.notes?' · '+escapeHtml(g.notes):''}</div>`).join('')}</div>`:'';
    return `<article class="match-card"><div class="match-head"><span>${escapeHtml(c?.name||'Competição')} · ${m.group_label!=null?'Grupo '+escapeHtml(m.group_label)+' · ':''}${escapeHtml(m.round_label)}</span><span class="status ${m.status==='FINISHED'?'finished':'scheduled'}">${m.status==='FINISHED'?'FINALIZADA':'AGENDADA'}</span></div><div class="match-main"><div class="match-row"><span class="${aWin?'winner-name':''}">${escapeHtml(teamName(m.participant_a))}</span><b>${m.crowns_a??'–'}</b></div><div class="match-row"><span class="${bWin?'winner-name':''}">${escapeHtml(teamName(m.participant_b))}</span><b>${m.crowns_b??'–'}</b></div></div><div class="match-meta">${escapeHtml(fmtDate(m.scheduled_at))}${m.notes?' · '+escapeHtml(m.notes):''}</div>${gameHtml ? `<details><summary>Detalhes da partida</summary>${gameHtml}</details>` : ''}</article>`;
  }).join('');
}

async function loadData(){
  applySettings(defaults);
  if(!configured){renderAll();return;}
  let loaded = false;
  try{
    const queries=await Promise.all([
      supabase.from('teams').select('*').order('name'),
      supabase.from('competitions').select('*').order('created_at'),
      supabase.from('matches').select('*').order('scheduled_at',{ascending:false,nullsFirst:false}),
      supabase.from('match_games').select('*').order('game_number'),
      supabase.from('site_settings').select('settings').eq('id',1).maybeSingle()
    ]);
    const failed=queries.slice(0,4).find(q=>q.error); if(failed) throw failed.error;
    if (queries[4].error) console.warn(queries[4].error);
    appearance = normalizeSettings(queries[4].data?.settings);
    applySettings(appearance);
    loaded = true;
    data={players:[],teams:queries[0].data||[],team_members:[],competitions:queries[1].data||[],matches:queries[2].data||[],games:queries[3].data||[]};
  }catch(err){
    console.error(err);$('#setupWarning').classList.remove('hidden');$('#setupWarning').textContent='Não foi possível carregar os dados. Atualize a página para tentar novamente.';
  }
  if(loaded){$('#setupWarning').classList.add('hidden');$('#setupWarning').textContent='';}
  renderAll();
}

function renderAll(){
  $('#teamCount').textContent=data.teams.length;
  $('#scheduledCount').textContent=data.matches.filter(m=>m.status==='SCHEDULED').length;
  $('#finishedCount').textContent=data.matches.filter(m=>m.status==='FINISHED').length;
  renderStandings();renderBracket();renderMatches();clearTimeout(window.loadingTimeout);window.finishLoading()}


document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.filter').forEach(x=>{x.classList.remove('active');x.setAttribute('aria-pressed','false')});
  btn.classList.add('active');btn.setAttribute('aria-pressed','true');currentFilter=btn.dataset.filter;renderMatches();
}));
$('#tableToggle').addEventListener('click',e=>{
  const expanded=$('#standingsTable').classList.toggle('expanded');
  const emptyCell=$('#standingsBody .empty');
  if(emptyCell) emptyCell.colSpan=expanded?11:5;
  e.currentTarget.setAttribute('aria-expanded',String(expanded));e.currentTarget.textContent=expanded?'Resumir −':'Detalhes +';
});
const navLinks=[...document.querySelectorAll('.bottom-nav a, .desktop-nav a')];
function selectNav(id){navLinks.forEach(a=>{const active=a.hash==='#'+id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})}
navLinks.forEach(a=>a.addEventListener('click',()=>selectNav(a.hash.slice(1))));
const sections=[...document.querySelectorAll('main .section')];
let navigationFrame=0;
function updateNavigation(){
  navigationFrame=0;
  let current=sections[0];
  for(const section of sections) if(section.getBoundingClientRect().top<=innerHeight*.35) current=section;
  if(current) selectNav(current.id);
}
function scheduleNavigation(){if(!navigationFrame) navigationFrame=requestAnimationFrame(updateNavigation)}
addEventListener('scroll',scheduleNavigation,{passive:true});
addEventListener('resize',scheduleNavigation);
updateNavigation();
loadData();
