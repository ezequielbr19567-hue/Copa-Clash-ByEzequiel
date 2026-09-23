import { supabase, configured, connectionError } from './supabase-client.js?v=3';
import { groupKnockoutMatches, normalizeCupFormat, calculateGroupStandings, formatVictoryTime, knockoutSeedPreview, phaseInfo } from './cup.js?v=5';
import { videoInfo } from './media.js?v=4';
import { defaults, normalizeSettings, applySettings } from './settings.js?v=4';

let data = {teams:[],competitions:[],entries:[],matches:[],games:[]};
let currentFilter = 'ALL';
let appearance = { ...defaults };

const $ = q => document.querySelector(q);
const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const emptyState = label => `<div class="empty-state"><span class="empty-mark" aria-hidden="true">—</span><p>${escapeHtml(label)}</p></div>`;
const participant = id => data.teams.find(t=>t.id===id);
const participantName = id => participant(id)?.name || 'A definir';
const activeCup = () => data.competitions.find(c=>c.kind==='CUP'&&c.active) || data.competitions.find(c=>c.kind==='CUP') || null;
const cupMatches = () => { const cup=activeCup(); return cup ? data.matches.filter(m=>m.competition_id===cup.id) : []; };
const cupEntries = () => { const cup=activeCup(); return cup ? data.entries.filter(e=>e.competition_id===cup.id) : []; };

function groupStandings(groupLabel, format){
  return calculateGroupStandings({entries:cupEntries(),matches:cupMatches(),groupLabel,format,nameFor:participantName});
}

function renderGroups(){
  const cup=activeCup(), grid=$('#groupsGrid');
  if(!cup){grid.innerHTML=`<div class="empty groups-empty">${emptyState(appearance.empty_groups)}</div>`;$('#groupRule').textContent='';return;}
  const format=normalizeCupFormat(cup.format_config);
  const extraGroups=cupEntries().map(e=>e.group_label).filter(Boolean);
  const groups=[...new Set([...format.groups,...extraGroups])];
  $('#groupRule').innerHTML=`<span>${format.qualifiers_per_group} vagas por grupo</span><span>Vitória ${format.points_win} pts</span><span>Empate 1 pt para cada</span>`;
  if(!groups.length){grid.innerHTML=`<div class="empty groups-empty">${emptyState(appearance.empty_groups)}</div>`;return;}
  grid.innerHTML=groups.map(label=>{
    const rows=groupStandings(label,format);
    const body=rows.length?rows.map((r,i)=>`<tr class="${i<format.qualifiers_per_group?'qualifying':''}"><td><span class="group-rank">${i+1}</span></td><td><b>${escapeHtml(r.name)}</b></td><td>${r.j}</td><td>${r.sg>0?'+':''}${r.sg}</td><td>${r.time_complete?formatVictoryTime(r.win_time_seconds):'—'}</td><td><b class="pts">${r.pts}</b></td></tr>`).join(''):`<tr><td colspan="6" class="empty group-table-empty">Nenhum participante neste grupo.</td></tr>`;
    const mobile=rows.length?rows.map((r,i)=>`<div class="group-mobile-row ${i<format.qualifiers_per_group?'qualifying':''}"><span class="group-rank">${i+1}</span><div class="group-mobile-name"><b>${escapeHtml(r.name)}</b><small>J ${r.j} · SG ${r.sg>0?'+':''}${r.sg}${r.time_complete?` · ${formatVictoryTime(r.win_time_seconds)}`:''}</small></div><strong>${r.pts}<small>PTS</small></strong></div>`).join(''):`<div class="group-mobile-empty">Nenhum participante</div>`;
    return `<article class="group-card"><div class="group-card-head"><div><span>GRUPO</span><h3>${escapeHtml(label)}</h3></div><small>${format.qualifiers_per_group} vagas</small></div><div class="group-table-wrap"><table aria-label="Grupo ${escapeHtml(label)}"><thead><tr><th>#</th><th>Participante</th><th>J</th><th>SG</th><th>Tempo</th><th>PTS</th></tr></thead><tbody>${body}</tbody></table></div><div class="group-mobile-list" aria-label="Classificação do Grupo ${escapeHtml(label)}">${mobile}</div><div class="group-tiebreak">J = jogos · SG = saldo de coroas · Desempate: pontos, saldo e tempo<br>Derrota: ${format.points_loss} pt · Derrota por 3 coroas: ${format.points_loss_three_crowns} pt</div></article>`;
  }).join('');
}

function renderBracket(){
  const cup=activeCup();
  const allMatches=cupMatches();
  let phases=groupKnockoutMatches(allMatches);
  const el=$('#bracket'),tools=$('#cupTools'),select=$('#cupPhase');
  let liveProjection=false;

  if(cup){
    const format=normalizeCupFormat(cup.format_config);
    const preview=knockoutSeedPreview({entries:cupEntries(),matches:allMatches,format,nameFor:participantName});
    const knockoutStarted=allMatches.some(m=>(m.stage_type||'KNOCKOUT')==='KNOCKOUT'&&m.status==='FINISHED');
    if(preview.ready && !knockoutStarted){
      const existingByKey=new Map(allMatches.filter(m=>(m.stage_type||'KNOCKOUT')==='KNOCKOUT').map(m=>[m.bracket_key,m]));
      const previewMatches=preview.pairs.map((pair,i)=>{
        const key=`${preview.round_code}-${String(i+1).padStart(2,'0')}`;
        const existing=existingByKey.get(key)||{};
        return {...existing,id:existing.id||`projection-${key}`,stage_type:'KNOCKOUT',round_label:preview.round_label,bracket_key:key,bracket_order:i+1,participant_a:pair.participant_a,participant_b:pair.participant_b,status:existing.status||'SCHEDULED',seed_a:pair.seed_a,seed_b:pair.seed_b,projected:!preview.complete};
      });
      const info=phaseInfo(preview.round_label);
      const projectedPhase={...info,matches:previewMatches,projected:!preview.complete};
      const phaseIndex=phases.findIndex(p=>p.key===info.key);
      if(phaseIndex>=0) phases[phaseIndex]=projectedPhase; else phases=[projectedPhase,...phases];
      liveProjection=!preview.complete;
    }
  }

  tools.hidden=!phases.length;
  tools.classList.toggle('projection-active',liveProjection);
  if(!phases.length){el.innerHTML=`<div class="empty">${emptyState(appearance.empty_cup)}</div>`;return;}
  const previous=select.dataset.initialized ? select.value : null;
  select.dataset.initialized='true';
  select.innerHTML='<option value="all">Chave completa</option>'+phases.map((phase,i)=>`<option value="${i}">${escapeHtml(phase.label)}</option>`).join('');
  const hasPrevious=[...select.options].some(option=>option.value===previous);
  if(hasPrevious) select.value=previous;
  else if(matchMedia('(max-width: 700px)').matches){
    const current=phases.findIndex(phase=>phase.matches.some(m=>m.status!=='FINISHED'));
    select.value=String(current>=0?current:Math.max(0,phases.length-1));
  } else select.value='all';

  function seedLabel(seed){return seed?`G${escapeHtml(seed.group)} · ${seed.position}º`:''}
  function draw(){
    const visible=select.value==='all'?phases:[phases[Number(select.value)]];
    el.classList.toggle('single-phase',select.value!=='all');
    el.innerHTML=visible.map(phase=>`<section class="bracket-round ${phase.projected?'is-projection':''}" aria-label="${escapeHtml(phase.label)}"><h3><span class="round-title">${escapeHtml(phase.label)}</span><span>${phase.projected?'AO VIVO':phase.matches.length}</span></h3><div class="bracket-matches">${phase.matches.map(m=>{
      const finished=m.status==='FINISHED',aWin=finished&&m.crowns_a>m.crowns_b,bWin=finished&&m.crowns_b>m.crowns_a;
      const meta=m.projected?'PROJEÇÃO':finished?`FINALIZADA${m.victory_time_seconds?` · ${formatVictoryTime(m.victory_time_seconds)}`:''}`:'AGENDADA';
      return `<article class="bracket-card ${m.projected?'projected':''}"><div class="bracket-team ${aWin?'winner':''}"><span><b class="team-name">${escapeHtml(participantName(m.participant_a))}</b>${m.seed_a?`<i>${seedLabel(m.seed_a)}</i>`:''}</span><strong>${finished?m.crowns_a??'–':'–'}</strong></div><div class="bracket-team ${bWin?'winner':''}"><span><b class="team-name">${escapeHtml(participantName(m.participant_b))}</b>${m.seed_b?`<i>${seedLabel(m.seed_b)}</i>`:''}</span><strong>${finished?m.crowns_b??'–':'–'}</strong></div><small>${meta}</small></article>`;
    }).join('')}</div></section>`).join('');
    el.scrollLeft=0;
    const total=visible.reduce((sum,phase)=>sum+phase.matches.length,0);
    $('#cupSummary').textContent=liveProjection?'Projeção pela classificação atual':`${total} ${total===1?'jogo':'jogos'}`;
  }
  select.onchange=draw;draw();
}

function fmtDate(value){if(!value)return 'Data a definir';try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch{return 'Data inválida'}}

function renderVideo(value){
  const info=videoInfo(value); if(!info)return '';
  if(info.type==='embed'){
    const sandbox=info.provider==='drive'?' sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"':'';
    const external=info.href?`<a class="video-external" href="${escapeHtml(info.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(info.label)} ↗</a>`:'';
    return `<details class="match-video"><summary><span>▶ Assistir</span><small>${escapeHtml(info.label)}</small></summary><div class="video-frame"><iframe loading="lazy" src="${escapeHtml(info.src)}" title="Vídeo da partida" allow="autoplay; fullscreen; encrypted-media; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin"${sandbox} allowfullscreen></iframe></div>${external}</details>`;
  }
  if(info.type==='video') return `<details class="match-video"><summary><span>▶ Assistir</span><small>Vídeo</small></summary><div class="video-frame"><video controls playsinline preload="metadata" src="${escapeHtml(info.src)}"></video></div></details>`;
  return `<a class="match-video-link" href="${escapeHtml(info.src)}" target="_blank" rel="noopener noreferrer">▶ ${escapeHtml(info.label)}</a>`;
}

function renderMatches(){
  const list=$('#matchesList');
  let matches=[...cupMatches()].sort((a,b)=>new Date(b.scheduled_at||b.created_at||0)-new Date(a.scheduled_at||a.created_at||0));
  if(currentFilter==='FINISHED'||currentFilter==='SCHEDULED') matches=matches.filter(m=>m.status===currentFilter);
  if(currentFilter==='GROUP'||currentFilter==='KNOCKOUT') matches=matches.filter(m=>(m.stage_type||'KNOCKOUT')===currentFilter);
  $('#matchCount').textContent=`${matches.length} ${matches.length===1?'partida':'partidas'}`;
  if(!matches.length){list.innerHTML=`<div class="empty">${emptyState(appearance.empty_matches)}</div>`;return;}
  list.innerHTML=matches.map(m=>{
    const games=data.games.filter(g=>g.match_id===m.id).sort((a,b)=>a.game_number-b.game_number);
    const aWin=m.status==='FINISHED'&&m.crowns_a>m.crowns_b,bWin=m.status==='FINISHED'&&m.crowns_b>m.crowns_a;
    const stage=(m.stage_type||'KNOCKOUT')==='GROUP'?`Grupo ${m.group_label||'—'} · ${m.round_label}`:m.round_label;
    const gameHtml=games.length?`<details><summary>Detalhes jogo a jogo</summary><div class="game-log">${games.map(g=>`<div>Jogo ${g.game_number}: <b>${g.crowns_a} × ${g.crowns_b}</b>${g.notes?' · '+escapeHtml(g.notes):''}</div>`).join('')}</div></details>`:'';
    const time=m.status==='FINISHED'&&m.crowns_a!==m.crowns_b&&m.victory_time_seconds?` · ${formatVictoryTime(m.victory_time_seconds)}`:'';
    return `<article class="match-card"><div class="match-head"><span>${escapeHtml(stage)}</span><span class="status ${m.status==='FINISHED'?'finished':'scheduled'}">${m.status==='FINISHED'?'FINALIZADA':'AGENDADA'}</span></div><div class="match-main"><div class="match-row"><span class="${aWin?'winner-name':''}">${escapeHtml(participantName(m.participant_a))}</span><b>${m.crowns_a??'–'}</b></div><div class="match-row"><span class="${bWin?'winner-name':''}">${escapeHtml(participantName(m.participant_b))}</span><b>${m.crowns_b??'–'}</b></div></div><div class="match-meta">${escapeHtml(fmtDate(m.scheduled_at))}${time}${m.notes?' · '+escapeHtml(m.notes):''}</div>${renderVideo(m.video_url)}${gameHtml}</article>`;
  }).join('');
}

async function loadData(){
  applySettings(defaults);
  if(!configured || !supabase){
    $('#setupWarning').classList.remove('hidden');
    $('#setupWarning').textContent=connectionError?'Não foi possível carregar o cliente do Supabase.':'Conexão com o Supabase não configurada. Abra o Admin para salvar a conexão.';
    renderAll(); return;
  }
  let loaded=false;
  try{
    const head=await Promise.all([
      supabase.from('competitions').select('*').eq('kind','CUP').order('created_at'),
      supabase.from('site_settings').select('settings').eq('id',1).maybeSingle()
    ]);
    if(head[0].error)throw head[0].error;
    if(head[1].error)console.warn(head[1].error);
    appearance=normalizeSettings(head[1].data?.settings);applySettings(appearance);
    data.competitions=head[0].data||[];
    const cup=activeCup();
    if(cup){
      const detail=await Promise.all([
        supabase.from('teams').select('*').eq('team_type','SOLO').order('name'),
        supabase.from('competition_entries').select('*').eq('competition_id',cup.id),
        supabase.from('matches').select('*').eq('competition_id',cup.id).order('scheduled_at',{ascending:false,nullsFirst:false})
      ]);
      const detailFailed=detail.find(q=>q.error);if(detailFailed)throw detailFailed.error;
      data.teams=detail[0].data||[];data.entries=detail[1].data||[];data.matches=detail[2].data||[];
      const matchIds=data.matches.map(m=>m.id);
      if(matchIds.length){
        const games=await supabase.from('match_games').select('*').in('match_id',matchIds).order('game_number');
        if(games.error)throw games.error;data.games=games.data||[];
      }
    }
    loaded=true;
  }catch(err){
    console.error(err);$('#setupWarning').classList.remove('hidden');$('#setupWarning').textContent='Não foi possível carregar o campeonato. Verifique sua conexão e tente recarregar a página.';
  }
  if(loaded){$('#setupWarning').classList.add('hidden');$('#setupWarning').textContent='';}
  renderAll();
}
function renderAll(){
  const cup=activeCup(),format=cup?normalizeCupFormat(cup.format_config):null;
  const entries=cup?cupEntries():[];
  const matches=cupMatches();
  $('#activeCupName').textContent=cup?.name||appearance.cup_title;
  $('#participantCount').textContent=new Set(entries.map(e=>e.participant_id)).size;
  $('#groupCount').textContent=format ? new Set([...format.groups,...entries.map(e=>e.group_label).filter(Boolean)]).size : 0;
  $('#scheduledCount').textContent=matches.filter(m=>m.status==='SCHEDULED').length;
  $('#finishedCount').textContent=matches.filter(m=>m.status==='FINISHED').length;
  renderGroups();renderBracket();renderMatches();
  document.querySelector('main').setAttribute('aria-busy','false');clearTimeout(window.loadingTimeout);window.finishLoading();
}

document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.filter').forEach(x=>{x.classList.remove('active');x.setAttribute('aria-pressed','false')});
  btn.classList.add('active');btn.setAttribute('aria-pressed','true');currentFilter=btn.dataset.filter;renderMatches();
}));
const navLinks=[...document.querySelectorAll('.bottom-nav a, .desktop-nav a')];
function selectNav(id){navLinks.forEach(a=>{const active=a.hash==='#'+id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})}
navLinks.forEach(a=>a.addEventListener('click',()=>selectNav(a.hash.slice(1))));
const sections=[...document.querySelectorAll('main .section')];let navigationFrame=0;
function updateNavigation(){navigationFrame=0;let current=sections[0];for(const section of sections)if(section.getBoundingClientRect().top<=innerHeight*.35)current=section;if(current)selectNav(current.id)}
function scheduleNavigation(){if(!navigationFrame)navigationFrame=requestAnimationFrame(updateNavigation)}
addEventListener('scroll',scheduleNavigation,{passive:true});addEventListener('resize',scheduleNavigation,{passive:true});scheduleNavigation();
loadData().catch(err=>{console.error(err);$('#setupWarning').classList.remove('hidden');$('#setupWarning').textContent='Falha ao iniciar o site.';clearTimeout(window.loadingTimeout);window.finishLoading()});
