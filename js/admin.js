import {
  supabase, configured, connectionError, currentConfig, connectionSource, saveSupabaseConfig
} from './supabase-client.js?v=3';
import {
  knockoutPhases, phaseInfo, normalizeCupFormat, defaultCupFormat,
  calculateGroupStandings, knockoutSeedPlan, knockoutSeedPreview, winnerOf, roundLabelForSize,
  roundCodeForSize, roundRobinSchedule, parseVictoryTime, formatVictoryTime
} from './cup.js?v=4';
import { defaults, normalizeSettings, applySettings, imageUrl } from './settings.js?v=4';

const root = document.querySelector('#adminRoot');
const escapeHtml = (v='') => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const pairKey = (a,b) => [String(a),String(b)].sort().join('|');
let data = { teams:[], competitions:[], entries:[], matches:[], games:[] };
let siteSettings = { ...defaults };
let settingsError = false;
let activeTab = 'overview';
let flash = null;
let selectedCupId = '';

const cups = () => data.competitions.filter(c=>c.kind==='CUP');
const activeCup = () => cups().find(c=>c.active) || cups()[0] || null;
const cupById = id => data.competitions.find(c=>c.id===id && c.kind==='CUP');
const participantName = id => data.teams.find(t=>t.id===id)?.name || '—';
const fmtDate = value => value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : 'Sem data';
const toLocalInput = value => {
  if (!value) return '';
  const d = new Date(value); if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
};
const cleanVideoUrl = value => {
  const raw=String(value||'').trim(); if(!raw) return null;
  try { const url=new URL(raw); return url.protocol==='https:' ? url.href : false; } catch { return false; }
};

function notice(type,text){
  flash={type,text}; renderDashboard();
  setTimeout(()=>{flash=null; document.querySelector('#flash')?.remove()},5000);
}

function connectionScreen(message='') {
  const savedUrl = currentConfig.SUPABASE_URL || '';
  root.innerHTML = `<section class="admin-login-page"><div class="login-card connection-card">
    <div class="lock">⚙️</div><span class="eyebrow">CONEXÃO</span><h1>Conectar ao Supabase</h1>
    <p>A conexão agora também fica salva neste navegador. Atualizar os arquivos do site não exige apagar nem recriar o banco.</p>
    ${message?`<div class="notice error">${escapeHtml(message)}</div>`:''}
    <form id="connectionForm">
      <label class="field">URL do projeto<input name="url" type="url" required autocomplete="off" value="${escapeHtml(savedUrl)}" placeholder="https://seu-projeto.supabase.co"></label>
      <label class="field">Chave pública / publishable<input name="key" type="password" required autocomplete="off" placeholder="sb_publishable_…"></label>
      <button class="button primary full" type="submit">Salvar conexão neste navegador</button>
    </form>
    <div class="notice info">O arquivo <b>js/config.js</b> continua sendo a configuração principal. Quando ele estiver válido, o site cria automaticamente uma cópia local como segurança contra atualização/cache.</div>
    <a class="button secondary full" href="index.html">← Voltar ao site</a>
  </div></section>`;
  document.querySelector('#connectionForm').addEventListener('submit',e=>{
    e.preventDefault();
    const fd=new FormData(e.target);
    try { saveSupabaseConfig(fd.get('url'),fd.get('key')); location.reload(); }
    catch(err){ connectionScreen(err.message || 'Não foi possível salvar a conexão.'); }
  });
}

function loginScreen(message='') {
  root.innerHTML = `<section class="admin-login-page"><form id="loginForm" class="login-card">
    <div class="lock">🔐</div><span class="eyebrow">ÁREA RESTRITA</span><h1>Painel administrativo</h1><p>Entre para gerenciar a Copa.</p>
    ${message?`<div class="notice error">${escapeHtml(message)}</div>`:''}
    <label class="field">E-mail<input id="email" type="email" required autocomplete="username" placeholder="admin@exemplo.com"></label>
    <label class="field">Senha<input id="password" type="password" required autocomplete="current-password" placeholder="••••••••"></label>
    <button class="button primary full" type="submit">Entrar</button><a class="button secondary full" style="margin-top:8px" href="index.html">Voltar ao site</a>
  </form></section>`;
  document.querySelector('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault(); const btn=e.submitter; btn.disabled=true; btn.textContent='Entrando…';
    const {error}=await supabase.auth.signInWithPassword({email:document.querySelector('#email').value,password:document.querySelector('#password').value});
    if(error){loginScreen('E-mail ou senha inválidos.');return} await boot();
  });
}

async function loadData(){
  const qs = await Promise.all([
    supabase.from('teams').select('*').order('name'),
    supabase.from('competitions').select('*').order('created_at'),
    supabase.from('competition_entries').select('*'),
    supabase.from('matches').select('*').order('created_at',{ascending:false}),
    supabase.from('match_games').select('*').order('game_number'),
    supabase.from('site_settings').select('settings').eq('id',1).maybeSingle()
  ]);
  const failed=qs.slice(0,5).find(q=>q.error); if(failed) throw failed.error;
  settingsError=Boolean(qs[5].error); siteSettings=normalizeSettings(qs[5].data?.settings); applySettings(siteSettings);
  data={
    teams:(qs[0].data||[]).filter(t=>t.team_type!=='DUO'),
    competitions:qs[1].data||[], entries:qs[2].data||[], matches:qs[3].data||[], games:qs[4].data||[]
  };
  if(!selectedCupId || !cupById(selectedCupId)) selectedCupId=activeCup()?.id||'';
}

async function refresh(msg){
  try {
    await loadData();
    const cup=activeCup();
    if(cup){ const synced=await syncAutomaticKnockout(cup.id); if(synced.changed) await loadData(); }
    renderDashboard(); if(msg) notice('success',msg);
  }
  catch(err){ notice('error',err.message||'Erro ao carregar os dados.'); }
}

function nameFor(id){ return participantName(id); }
function cupEntries(cupId){ return data.entries.filter(e=>e.competition_id===cupId); }
function cupMatches(cupId){ return data.matches.filter(m=>m.competition_id===cupId); }
function groupStandings(cup, group){
  return calculateGroupStandings({entries:cupEntries(cup.id),matches:cupMatches(cup.id),groupLabel:group,format:cup.format_config,nameFor});
}

async function syncAutomaticKnockout(cupId) {
  const cup=cupById(cupId); if(!cup) return {changed:false,reason:'Copa não encontrada.'};
  const format=normalizeCupFormat(cup.format_config);
  if(format.knockout_mode==='MANUAL') return {changed:false,reason:'Mata-mata manual.'};
  const plan=knockoutSeedPlan({entries:cupEntries(cup.id),matches:cupMatches(cup.id),format,nameFor});
  if(!plan.ready) return {changed:false,reason:plan.reason};

  let changed=false;
  let matches=cupMatches(cup.id);
  const initialPrefix=`${plan.round_code}-`;
  const anyKnockoutFinished=matches.some(m=>m.stage_type==='KNOCKOUT'&&m.status==='FINISHED');
  if(!anyKnockoutFinished){
    const expected=new Set(plan.pairs.map((_,i)=>`${plan.round_code}-${String(i+1).padStart(2,'0')}`));
    const stale=matches.filter(m=>m.stage_type==='KNOCKOUT'&&/^R\d+-\d+$/.test(String(m.bracket_key||''))&&!expected.has(m.bracket_key));
    if(stale.length){
      const {error}=await supabase.from('matches').delete().in('id',stale.map(m=>m.id));
      if(error) throw error; matches=matches.filter(m=>!stale.some(x=>x.id===m.id)); changed=true;
    }
  }
  const initialExisting=matches.filter(m=>m.stage_type==='KNOCKOUT' && String(m.bracket_key||'').startsWith(initialPrefix));
  const initialStarted=anyKnockoutFinished||initialExisting.some(m=>m.status==='FINISHED');

  if(!initialStarted){
    for(let i=0;i<plan.pairs.length;i++){
      const pair=plan.pairs[i];
      const payload={
        competition_id:cup.id,stage_type:'KNOCKOUT',group_label:null,round_label:plan.round_label,
        participant_a:pair.participant_a,participant_b:pair.participant_b,status:'SCHEDULED',
        bracket_key:`${plan.round_code}-${String(i+1).padStart(2,'0')}`,bracket_order:i+1
      };
      const existing=initialExisting.find(m=>m.bracket_key===payload.bracket_key);
      if(existing){
        if(existing.participant_a!==payload.participant_a || existing.participant_b!==payload.participant_b){
          const {error}=await supabase.from('matches').update({participant_a:payload.participant_a,participant_b:payload.participant_b,round_label:payload.round_label,bracket_order:payload.bracket_order}).eq('id',existing.id);
          if(error) throw error; changed=true;
        }
      } else {
        const {error}=await supabase.from('matches').insert(payload); if(error) throw error; changed=true;
      }
    }
  }

  if(changed){
    const {data:latest,error}=await supabase.from('matches').select('*').eq('competition_id',cup.id);
    if(error) throw error; matches=latest||[];
  }

  const autoSizes=matches.map(m=>String(m.bracket_key||'').match(/^R(\d+)-\d+$/)).filter(Boolean).map(x=>Number(x[1]));
  let size=anyKnockoutFinished&&autoSizes.length?Math.max(...autoSizes):plan.size;
  while(size>2){
    const currentPrefix=`${roundCodeForSize(size)}-`;
    const current=matches.filter(m=>m.stage_type==='KNOCKOUT' && String(m.bracket_key||'').startsWith(currentPrefix)).sort((a,b)=>(a.bracket_order||0)-(b.bracket_order||0));
    if(current.length < size/2) break;
    const nextSize=size/2, nextCode=roundCodeForSize(nextSize), nextLabel=roundLabelForSize(nextSize);
    for(let i=0;i<current.length;i+=2){
      const a=winnerOf(current[i]), b=winnerOf(current[i+1]); if(!a||!b) continue;
      const key=`${nextCode}-${String(i/2+1).padStart(2,'0')}`;
      const existing=matches.find(m=>m.competition_id===cup.id && m.bracket_key===key);
      if(existing){
        if(existing.status==='FINISHED') continue;
        if(existing.participant_a!==a || existing.participant_b!==b){
          const {error}=await supabase.from('matches').update({participant_a:a,participant_b:b,round_label:nextLabel,bracket_order:i/2+1}).eq('id',existing.id);
          if(error) throw error; changed=true; existing.participant_a=a; existing.participant_b=b;
        }
      } else {
        const payload={competition_id:cup.id,stage_type:'KNOCKOUT',group_label:null,round_label:nextLabel,participant_a:a,participant_b:b,status:'SCHEDULED',bracket_key:key,bracket_order:i/2+1};
        const {data:inserted,error}=await supabase.from('matches').insert(payload).select().single(); if(error) throw error;
        matches.push(inserted); changed=true;
      }
    }
    size=nextSize;
  }
  return {changed,reason:changed?'Mata-mata atualizado automaticamente.':'Mata-mata já está sincronizado.'};
}

async function generateGroupMatches(cup) {
  const entries=cupEntries(cup.id), existing=cupMatches(cup.id).filter(m=>m.stage_type==='GROUP');
  const inserts=[];
  const format=normalizeCupFormat(cup.format_config);
  for(const group of format.groups){
    const ids=entries.filter(e=>e.group_label===group).map(e=>e.participant_id).sort((a,b)=>participantName(a).localeCompare(participantName(b),'pt-BR'));
    const known=new Set(existing.filter(m=>m.group_label===group).map(m=>pairKey(m.participant_a,m.participant_b)));
    for(const game of roundRobinSchedule(ids)){
      const key=pairKey(game.participant_a,game.participant_b); if(known.has(key)) continue;
      known.add(key); inserts.push({competition_id:cup.id,stage_type:'GROUP',group_label:group,round_label:`Rodada ${game.round}`,participant_a:game.participant_a,participant_b:game.participant_b,status:'SCHEDULED'});
    }
  }
  if(!inserts.length) return 0;
  const {error}=await supabase.from('matches').insert(inserts); if(error) throw error;
  return inserts.length;
}

function navButton(key,icon,label){return `<button data-tab="${key}" class="${activeTab===key?'active':''}">${icon} &nbsp;${label}</button>`}
function title(){return {appearance:'Aparência',overview:'Visão geral',participants:'Participantes',cup:'Configurar Copa',groups:'Grupos',matches:'Partidas e vídeos',results:'Resultados',logs:'Registro jogo a jogo'}[activeTab]}

function renderDashboard(){
  root.innerHTML=`<div class="admin-shell"><aside class="sidebar"><div class="sidebar-brand"><a class="brand" href="index.html"><span class="brand-mark small">♛</span><span><strong>${escapeHtml(siteSettings.site_name||'Admin')}</strong><small>ADMIN</small></span></a></div><nav class="admin-nav">${navButton('overview','▦','Visão geral')}${navButton('appearance','◐','Aparência')}${navButton('participants','♙','Participantes')}${navButton('cup','♛','Copa')}${navButton('groups','⌗','Grupos')}${navButton('matches','＋','Partidas')}${navButton('results','✓','Resultados')}${navButton('logs','≡','Registros')}</nav><button id="logout" class="logout">↪ &nbsp;Sair</button></aside><main class="admin-main"><div class="admin-top"><div><span class="eyebrow">PAINEL DA COPA</span><h1>${title()}</h1></div><a href="index.html" class="button secondary small">Ver site ↗</a></div>${flash?`<div id="flash" class="notice ${flash.type}">${escapeHtml(flash.text)}</div>`:''}<div id="tabContent">${tabContent()}</div></main></div>`;
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.tab;flash=null;renderDashboard()}));
  document.querySelector('#logout').addEventListener('click',async()=>{await supabase.auth.signOut();loginScreen()}); bindTab();
}
function tabContent(){if(activeTab==='appearance')return appearanceHtml();if(activeTab==='overview')return overviewHtml();if(activeTab==='participants')return participantsHtml();if(activeTab==='cup')return cupHtml();if(activeTab==='groups')return groupsHtml();if(activeTab==='matches')return matchesHtml();if(activeTab==='results')return resultsHtml();return logsHtml()}

function overviewHtml(){
  const cup=activeCup(),matches=cup?cupMatches(cup.id):[],entries=cup?cupEntries(cup.id):[];
  let autoText='Crie/configure a Copa para ativar o mata-mata automático.';
  if(cup){const plan=knockoutSeedPlan({entries,matches,format:cup.format_config,nameFor});autoText=plan.ready?'Fase de grupos completa: a chave automática está pronta/sincronizada.':plan.reason;}
  return `<div class="stat-cards"><div class="stat-card"><span>Participantes</span><b>${data.teams.length}</b></div><div class="stat-card"><span>Na Copa ativa</span><b>${new Set(entries.map(e=>e.participant_id)).size}</b></div><div class="stat-card"><span>Partidas</span><b>${matches.length}</b></div><div class="stat-card"><span>Finalizadas</span><b>${matches.filter(m=>m.status==='FINISHED').length}</b></div></div><section class="admin-card"><h2>Fluxo automático da Copa</h2><div class="admin-help"><b>1.</b> Distribua os 20 participantes em 4 grupos.<br><b>2.</b> Gere os jogos dos grupos com um toque ou cadastre manualmente.<br><b>3.</b> Lance coroas e o tempo da vitória.<br><b>4.</b> Ao terminar todos os jogos, os 4 melhores de cada grupo entram automaticamente nas oitavas.<br><b>5.</b> Cada vencedor avança automaticamente para quartas, semifinal e final.<br><br><b>Status:</b> ${escapeHtml(autoText)}</div><p class="connection-source">Conexão Supabase: ${connectionSource==='browser'?'cópia persistente do navegador':'js/config.js'}.</p></section>`;
}

function participantsHtml(){return `<section class="admin-card"><h2>Novo participante</h2><p>Cadastre cada jogador como participante individual.</p><form id="participantForm" class="form-grid"><label class="field wide">Nome<input name="name" required maxlength="60" placeholder="Nome do participante"></label><div class="form-actions"><button class="button primary">Adicionar participante</button></div></form><div class="data-list">${data.teams.length?data.teams.map(t=>`<div class="data-row"><div><b>${escapeHtml(t.name)}</b><small>Participante individual</small></div><div class="inline-actions"><button class="icon-btn red" data-delete-participant="${t.id}">Excluir</button></div></div>`).join(''):'<div class="empty">Nenhum participante cadastrado.</div>'}</div></section>`}

function cupHtml(){
  const currentYear=new Date().getFullYear();
  const cards=cups().map(c=>{const f=normalizeCupFormat(c.format_config);return `<form class="admin-card cup-config-form" data-cup-form="${c.id}"><div class="data-row cup-config-title"><div><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.season)}${c.active?' · Copa ativa':''}</small></div><div class="inline-actions">${c.active?'<span class="active-pill">ATIVA</span>':`<button type="button" class="icon-btn" data-activate-cup="${c.id}">Tornar ativa</button>`}<button type="button" class="icon-btn red" data-delete-cup="${c.id}">Excluir</button></div></div><div class="form-grid"><label class="field">Nome<input name="name" required maxlength="80" value="${escapeHtml(c.name)}"></label><label class="field">Temporada<input name="season" required maxlength="20" value="${escapeHtml(c.season)}"></label><label class="field wide">Grupos<input name="groups" required value="${escapeHtml(f.groups.join(', '))}" placeholder="1, 2, 3, 4"><span>A ordem importa: o último grupo cruza com o primeiro; o penúltimo com o segundo.</span></label><label class="field">Classificados por grupo<input name="qualifiers" type="number" min="1" max="16" value="${f.qualifiers_per_group}" required></label><label class="field">Vitória<input name="win" type="number" min="-9" max="20" value="${f.points_win}" required></label><label class="field">Empate<input name="draw" type="number" min="-9" max="20" value="${f.points_draw}" required></label><label class="field">Derrota comum<input name="loss" type="number" min="-9" max="20" value="${f.points_loss}" required></label><label class="field">Derrota por 3 coroas<input name="loss3" type="number" min="-9" max="20" value="${f.points_loss_three_crowns}" required></label><div class="notice info wide">Desempate: <b>1º pontos</b> → <b>2º saldo de coroas (SG)</b> → <b>3º menor tempo total das vitórias</b>. Mata-mata automático por cruzamento de grupos.</div><div class="form-actions"><button class="button primary">Salvar formato</button></div></div></form>`}).join('');
  return `<section class="admin-card"><h2>Criar Copa</h2><p>O padrão já vem configurado para 4 grupos, 5 pessoas por grupo e 4 classificados.</p><form id="cupForm" class="form-grid"><label class="field">Nome<input name="name" required maxlength="80" placeholder="Copa da Turma"></label><label class="field">Temporada<input name="season" value="${currentYear}" required></label><label class="field wide">Grupos<input name="groups" value="${defaultCupFormat.groups.join(', ')}" required></label><label class="field">Classificados por grupo<input name="qualifiers" type="number" min="1" max="16" value="${defaultCupFormat.qualifiers_per_group}" required></label><label class="field checkbox-field"><input name="active" type="checkbox" checked> Tornar esta a Copa ativa</label><div class="form-actions"><button class="button primary">Criar Copa</button></div></form></section>${cards||'<section class="admin-card"><div class="empty">Nenhuma Copa cadastrada.</div></section>'}`;
}

function cupOptions(selected=''){return cups().map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${escapeHtml(c.name)}${c.active?' · ativa':''}</option>`).join('')}
function groupsHtml(){
  const cup=cupById(selectedCupId)||activeCup(); if(!cup)return `<section class="admin-card"><div class="empty">Crie uma Copa antes de configurar os grupos.</div></section>`;
  const f=normalizeCupFormat(cup.format_config), entries=cupEntries(cup.id), entryMap=new Map(entries.map(e=>[e.participant_id,e.group_label]));
  const cupGames=cupMatches(cup.id);
  const plan=knockoutSeedPlan({entries,matches:cupGames,format:f,nameFor});
  const preview=knockoutSeedPreview({entries,matches:cupGames,format:f,nameFor});
  const standingsHtml=f.groups.map(group=>{const rows=groupStandings(cup,group);return `<div class="mini-standing"><b>Grupo ${escapeHtml(group)}</b>${rows.map((r,i)=>`<span><strong>${i+1}.</strong> ${escapeHtml(r.name)} <small>${r.pts} pts · SG ${r.sg>0?'+':''}${r.sg} · ${r.time_complete?formatVictoryTime(r.win_time_seconds):'—'}</small></span>`).join('')||'<span>Sem participantes</span>'}</div>`}).join('');
  const crossings=[];
  for(let i=0;i<f.groups.length/2;i++){
    const high=f.groups[f.groups.length-1-i],low=f.groups[i];
    const ranks=Array.from({length:f.qualifiers_per_group},(_,rank)=>`${rank+1}º×${f.qualifiers_per_group-rank}º`).join(' · ');
    crossings.push(`<span>G${escapeHtml(high)} ↔ G${escapeHtml(low)} <b>${ranks}</b></span>`);
  }
  const status=plan.ready?'Chave oficial pronta para sincronizar.':preview.ready?'Projeção ao vivo ativa; a chave oficial fecha quando os grupos terminarem.':plan.reason;
  return `<section class="admin-card"><h2>Grupos</h2><label class="field">Copa<select id="groupCupSelect">${cupOptions(cup.id)}</select></label><div class="group-admin-toolbar"><span>${f.groups.length} grupos · ${f.qualifiers_per_group} vagas</span><div class="inline-actions"><button id="autoGroups" type="button" class="button secondary small">Distribuir</button><button id="generateGroupMatches" type="button" class="button secondary small">Gerar jogos</button></div></div><form id="groupsForm"><div class="data-list">${data.teams.length?data.teams.map(t=>`<div class="data-row group-assignment"><div><b>${escapeHtml(t.name)}</b></div><select name="participant-${t.id}" data-group-assignment="${t.id}"><option value="">Fora da Copa</option>${f.groups.map(g=>`<option value="${escapeHtml(g)}" ${entryMap.get(t.id)===g?'selected':''}>Grupo ${escapeHtml(g)}</option>`).join('')}</select></div>`).join(''):'<div class="empty">Cadastre participantes primeiro.</div>'}</div><div class="form-actions"><button class="button primary" ${data.teams.length?'':'disabled'}>Salvar grupos</button></div></form></section><section class="admin-card"><div class="admin-section-title"><div><span class="eyebrow">AUTOMÁTICO</span><h2>Mata-mata</h2></div><span class="active-pill">${preview.ready?'PROJEÇÃO ATIVA':'AGUARDANDO'}</span></div><div class="notice ${plan.ready?'success':'info'}">${escapeHtml(status)}</div><div class="crossing-rule compact-crossing">${crossings.join('')}</div><button id="syncKnockout" class="button primary full" type="button" ${plan.ready?'':'disabled'}>Sincronizar chave oficial</button><div class="mini-standings-grid">${standingsHtml}</div></section>`;
}

function entriesFor(cupId,group=''){const ids=data.entries.filter(e=>e.competition_id===cupId&&(!group||e.group_label===group)).map(e=>e.participant_id);return data.teams.filter(t=>ids.includes(t.id))}
function participantOptions(list){return list.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
function matchOptions(){const cup=cupById(selectedCupId)||activeCup();return data.matches.filter(m=>!cup||m.competition_id===cup.id).map(m=>`<option value="${m.id}">${(m.stage_type||'KNOCKOUT')==='GROUP'?`Grupo ${escapeHtml(m.group_label||'—')} · `:''}${escapeHtml(m.round_label)}: ${escapeHtml(participantName(m.participant_a))} × ${escapeHtml(participantName(m.participant_b))}</option>`).join('')}

function matchesHtml(){
  const cup=cupById(selectedCupId)||activeCup(), cupId=cup?.id||'', f=cup?normalizeCupFormat(cup.format_config):defaultCupFormat;
  const matches=cup?cupMatches(cup.id):[];
  return `<section class="admin-card"><h2>Nova partida</h2>${cup?`<form id="matchForm" class="form-grid"><label class="field">Copa<select id="matchCompetition" name="competition" required>${cupOptions(cupId)}</select></label><label class="field">Etapa<select id="stageType" name="stage"><option value="GROUP">Fase de grupos</option><option value="KNOCKOUT">Mata-mata manual</option></select></label><label class="field" id="groupField">Grupo<select id="matchGroup" name="group">${f.groups.map(g=>`<option value="${escapeHtml(g)}">Grupo ${escapeHtml(g)}</option>`).join('')}</select></label><label class="field">Rodada / fase<input id="roundInput" name="round" required maxlength="80" value="Rodada 1" list="cupPhases"><datalist id="cupPhases">${knockoutPhases.map(label=>`<option value="${label}"></option>`).join('')}</datalist></label><label class="field">Participante A<select id="partA" name="a" required></select></label><label class="field">Participante B<select id="partB" name="b" required></select></label><label class="field">Data e hora<input name="date" type="datetime-local"></label><label class="field wide">Vídeo da partida<input name="video" type="url" inputmode="url" placeholder="Cole o link do Google Drive, YouTube ou Vimeo"><span>Drive: use o link compartilhável do arquivo.</span></label><div class="form-actions"><button class="button primary">Criar partida</button></div></form>`:'<div class="empty">Crie uma Copa primeiro.</div>'}</section><section class="admin-card"><h2>Partidas cadastradas</h2><div class="admin-match-list">${matches.length?matches.map(m=>`<details class="admin-match-item"><summary><span><b>${escapeHtml(participantName(m.participant_a))} × ${escapeHtml(participantName(m.participant_b))}</b><small>${m.stage_type==='GROUP'?`Grupo ${escapeHtml(m.group_label||'—')} · `:''}${escapeHtml(m.round_label)} · ${m.status==='FINISHED'?'finalizada':'agendada'}</small></span><em>${m.video_url?'▶ vídeo':'Editar'}</em></summary><form class="match-meta-form" data-match-meta-form="${m.id}"><label class="field">Data e hora<input name="date" type="datetime-local" value="${escapeHtml(toLocalInput(m.scheduled_at))}"></label><label class="field wide">Vídeo<input name="video" type="url" inputmode="url" value="${escapeHtml(m.video_url||'')}" placeholder="https://…"></label><div class="form-actions split"><button class="button primary" type="submit">Salvar mídia/data</button><button class="button danger" type="button" data-delete-match="${m.id}">Excluir partida</button></div></form></details>`).join(''):'<div class="empty">Nenhuma partida cadastrada nesta Copa.</div>'}</div></section>`;
}

function resultsHtml(){return `<section class="admin-card"><h2>Lançar / corrigir resultado</h2><form id="resultForm" class="form-grid"><label class="field wide">Partida<select id="resultMatch" name="match" required><option value="">Selecione…</option>${matchOptions()}</select></label><label class="field"><span id="labelA">Coroas A</span><input id="crownsA" name="ca" type="number" min="0" max="3" value="0" required></label><label class="field"><span id="labelB">Coroas B</span><input id="crownsB" name="cb" type="number" min="0" max="3" value="0" required></label><label class="field">Tempo da vitória<input id="victoryTime" name="time" type="text" inputmode="numeric" placeholder="2:35"><span>Use mm:ss. Em empate, deixe vazio.</span></label><label class="field wide">Vídeo da partida<input id="resultVideo" name="video" type="url" inputmode="url" placeholder="Google Drive, YouTube ou Vimeo"></label><label class="field wide">Observação<textarea id="resultNotes" name="notes" placeholder="Opcional"></textarea></label><div id="scoreHint" class="wide"></div><div class="form-actions"><button class="button primary">Salvar resultado</button></div></form></section>`}

function logsHtml(){return `<section class="admin-card"><h2>Registro jogo a jogo</h2><p>Opcional: registre as batalhas que formaram um confronto.</p><form id="logForm" class="form-grid"><label class="field wide">Partida<select name="match" required><option value="">Selecione…</option>${matchOptions()}</select></label><label class="field">Número do jogo<input name="game" type="number" min="1" value="1" required></label><label class="field">Coroas A<input name="ca" type="number" min="0" max="3" value="0" required></label><label class="field">Coroas B<input name="cb" type="number" min="0" max="3" value="0" required></label><label class="field wide">Observação<textarea name="notes" placeholder="Ex.: vitória no overtime"></textarea></label><div class="form-actions"><button class="button primary">Salvar registro</button></div></form><div class="data-list">${data.games.length?data.games.map(g=>{const m=data.matches.find(x=>x.id===g.match_id);return `<div class="data-row"><div><b>Jogo ${g.game_number}: ${g.crowns_a} × ${g.crowns_b}</b><small>${m?escapeHtml(participantName(m.participant_a))+' × '+escapeHtml(participantName(m.participant_b)):'Partida'}${g.notes?' · '+escapeHtml(g.notes):''}</small></div><button class="icon-btn red" data-delete-game="${g.id}">Excluir</button></div>`}).join(''):'<div class="empty">Nenhum registro detalhado.</div>'}</div></section>`}

async function askDelete(table,id,label){if(!confirm(`Excluir ${label}? Essa ação não pode ser desfeita.`))return;const {error}=await supabase.from(table).delete().eq('id',id);if(error)notice('error',error.message);else await refresh('Excluído com sucesso.')}
function parseGroups(value){return [...new Set(String(value||'').split(',').map(x=>x.trim()).filter(Boolean))].slice(0,16)}

function appearanceHtml(){
  const fields=[['site_name','Nome do site',60],['hero_title','Título do destaque',100],['hero_description','Descrição opcional',300],['cup_title','Rótulo da Copa',40],['groups_title','Título da fase de grupos',50],['bracket_title','Título do mata-mata',50],['matches_title','Título das partidas',40],['footer_text','Rodapé opcional',160],['loading_text','Texto de carregamento',60],['cta_label','Botão do destaque',40],['participants_label','Rótulo de participantes',40],['groups_label','Rótulo de grupos',40],['scheduled_label','Rótulo de agendadas',40],['finished_label','Rótulo de finalizadas',40],['empty_groups','Mensagem de grupos vazios',120],['empty_cup','Mensagem de mata-mata vazio',120],['empty_matches','Mensagem de partidas vazias',120]];
  return '<section class="admin-card"><h2>Identidade do site</h2>'+(settingsError?'<div class="notice error">A configuração não foi carregada. Confira a tabela site_settings.</div>':'')+'<div class="settings-preview"><img id="previewImage" src="'+escapeHtml(siteSettings.image_url)+'" alt="Prévia da imagem"><strong id="previewName">'+escapeHtml(siteSettings.site_name)+'</strong></div><form id="appearanceForm" class="form-grid">'+fields.map(([key,label,max])=>'<label class="field '+(key==='hero_description'||key==='footer_text'||key.startsWith('empty_')?'wide':'')+'">'+label+'<input name="'+key+'" maxlength="'+max+'" value="'+escapeHtml(siteSettings[key])+'" '+(['site_name','cup_title','groups_title','bracket_title','matches_title','loading_text'].includes(key)?'required':'')+'></label>').join('')+'<label class="field wide">Imagem do site (URL HTTPS)<input name="image_url" value="'+escapeHtml(siteSettings.image_url)+'"><span>Deixe vazio para usar a imagem original.</span></label><label class="field">Cor principal<input type="color" name="primary_color" value="'+escapeHtml(siteSettings.primary_color)+'"></label><label class="field">Cor de destaque<input type="color" name="accent_color" value="'+escapeHtml(siteSettings.accent_color)+'"></label><label class="field checkbox-field"><input type="checkbox" name="show_hero" '+(siteSettings.show_hero?'checked':'')+'> Mostrar destaque inicial</label><div class="form-actions"><button class="button primary" '+(settingsError?'disabled':'')+'>Salvar alterações</button><a class="button secondary" href="index.html" target="_blank" rel="noopener">Ver site ↗</a></div><p id="settingsStatus" class="settings-status wide" role="status"></p></form></section>';
}

function bindTab(){
  if(activeTab==='appearance'){
    const form=document.querySelector('#appearanceForm');
    form.addEventListener('input',()=>{document.querySelector('#previewName').textContent=form.elements.site_name.value||'Arena';const preview=document.querySelector('#previewImage');preview.onerror=()=>{preview.onerror=null;preview.src=defaults.image_url};preview.src=imageUrl(form.elements.image_url.value)});
    form.addEventListener('submit',async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;const status=document.querySelector('#settingsStatus');status.textContent='Salvando…';const fd=new FormData(form),values={};for(const key of Object.keys(defaults))values[key]=typeof defaults[key]==='boolean'?fd.has(key):String(fd.get(key)||'').trim();values.image_url=values.image_url||defaults.image_url;if(values.image_url!==defaults.image_url&&!/^https:\/\//i.test(values.image_url)){status.textContent='Use uma URL de imagem HTTPS.';btn.disabled=false;return}const next=normalizeSettings(values);try{const {error}=await supabase.from('site_settings').upsert({id:1,settings:next},{onConflict:'id'});if(error)throw error;siteSettings=next;applySettings(next);status.textContent='Alterações salvas.'}catch(err){status.textContent='Não foi possível salvar. '+(err.message||'Tente novamente.')}finally{btn.disabled=false}});return;
  }
  if(activeTab==='participants'){
    document.querySelector('#participantForm').addEventListener('submit',async e=>{e.preventDefault();const name=new FormData(e.target).get('name').trim();e.submitter.disabled=true;const {error}=await supabase.from('teams').insert({name,team_type:'SOLO'});if(error)notice('error',error.message);else await refresh('Participante criado.')});
    document.querySelectorAll('[data-delete-participant]').forEach(b=>b.onclick=()=>askDelete('teams',b.dataset.deleteParticipant,'este participante'));return;
  }
  if(activeTab==='cup'){
    document.querySelector('#cupForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target),groups=parseGroups(fd.get('groups'));if(!groups.length){notice('error','Informe pelo menos um grupo.');return}const active=fd.has('active');if(active)await supabase.from('competitions').update({active:false}).eq('kind','CUP');const payload={name:fd.get('name').trim(),kind:'CUP',mode:'SOLO',season:fd.get('season').trim(),active,format_config:{...defaultCupFormat,groups,qualifiers_per_group:Number(fd.get('qualifiers'))}};const {error}=await supabase.from('competitions').insert(payload);if(error)notice('error',error.message);else await refresh('Copa criada.')});
    document.querySelectorAll('[data-cup-form]').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form),groups=parseGroups(fd.get('groups'));if(!groups.length){notice('error','Informe pelo menos um grupo.');return}const format={groups,qualifiers_per_group:Number(fd.get('qualifiers')),points_win:Number(fd.get('win')),points_draw:Number(fd.get('draw')),points_loss:Number(fd.get('loss')),points_loss_three_crowns:Number(fd.get('loss3')),knockout_mode:'AUTO_CROSS'};const {error}=await supabase.from('competitions').update({name:fd.get('name').trim(),season:fd.get('season').trim(),format_config:format}).eq('id',form.dataset.cupForm);if(error)notice('error',error.message);else await refresh('Formato da Copa salvo.') }));
    document.querySelectorAll('[data-activate-cup]').forEach(b=>b.onclick=async()=>{await supabase.from('competitions').update({active:false}).eq('kind','CUP');const {error}=await supabase.from('competitions').update({active:true}).eq('id',b.dataset.activateCup);if(error)notice('error',error.message);else{selectedCupId=b.dataset.activateCup;await refresh('Copa ativa atualizada.')}});
    document.querySelectorAll('[data-delete-cup]').forEach(b=>b.onclick=()=>askDelete('competitions',b.dataset.deleteCup,'esta Copa e todas as suas partidas'));return;
  }
  if(activeTab==='groups'){
    const select=document.querySelector('#groupCupSelect'); if(select)select.onchange=()=>{selectedCupId=select.value;renderDashboard()};
    const assignments=[...document.querySelectorAll('[data-group-assignment]')]; const auto=document.querySelector('#autoGroups');
    if(auto)auto.onclick=()=>{const f=normalizeCupFormat(cupById(selectedCupId)?.format_config);assignments.forEach((s,i)=>s.value=f.groups[i%f.groups.length]||'')};
    const form=document.querySelector('#groupsForm'); if(form)form.addEventListener('submit',async e=>{e.preventDefault();const cup=cupById(selectedCupId)||activeCup();if(!cup)return;const existing=new Map(data.entries.filter(x=>x.competition_id===cup.id).map(x=>[x.participant_id,x]));for(const sel of assignments){const participant_id=sel.dataset.groupAssignment,group_label=sel.value,old=existing.get(participant_id);if(group_label){const {error}=await supabase.from('competition_entries').upsert({competition_id:cup.id,participant_id,group_label},{onConflict:'competition_id,participant_id'});if(error){notice('error',error.message);return}}else if(old){const {error}=await supabase.from('competition_entries').delete().eq('competition_id',cup.id).eq('participant_id',participant_id);if(error){notice('error',error.message);return}}}await refresh('Distribuição dos grupos salva.')});
    document.querySelector('#generateGroupMatches')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;try{const cup=cupById(selectedCupId)||activeCup();const count=await generateGroupMatches(cup);await refresh(count?`${count} partidas dos grupos foram criadas.`:'Todos os confrontos dos grupos já existem.')}catch(err){notice('error',err.message)} });
    document.querySelector('#syncKnockout')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;try{const result=await syncAutomaticKnockout(selectedCupId);await loadData();renderDashboard();notice('success',result.reason)}catch(err){notice('error',err.message)}});return;
  }
  if(activeTab==='matches'){
    const form=document.querySelector('#matchForm');
    if(form){
      const cSel=document.querySelector('#matchCompetition'),stage=document.querySelector('#stageType'),group=document.querySelector('#matchGroup'),groupField=document.querySelector('#groupField'),round=document.querySelector('#roundInput'),a=document.querySelector('#partA'),b=document.querySelector('#partB');
      const sync=()=>{const cup=cupById(cSel.value),f=normalizeCupFormat(cup?.format_config);if(cup){selectedCupId=cup.id;group.innerHTML=f.groups.map(g=>`<option value="${escapeHtml(g)}">Grupo ${escapeHtml(g)}</option>`).join('')}const isGroup=stage.value==='GROUP';groupField.hidden=!isGroup;round.value=isGroup?'Rodada 1':'Oitavas de final';const list=entriesFor(cSel.value,isGroup?group.value:'');const opts='<option value="">Selecione…</option>'+participantOptions(list);a.innerHTML=opts;b.innerHTML=opts};
      cSel.onchange=sync;stage.onchange=sync;group.onchange=sync;sync();
      form.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form);if(fd.get('a')===fd.get('b')){notice('error','Os participantes precisam ser diferentes.');return}const roundLabel=String(fd.get('round')).trim();if(!roundLabel){notice('error','Informe a rodada ou fase.');return}const stageType=fd.get('stage');if(stageType==='GROUP'){const duplicate=cupMatches(fd.get('competition')).some(m=>m.stage_type==='GROUP'&&m.group_label===fd.get('group')&&pairKey(m.participant_a,m.participant_b)===pairKey(fd.get('a'),fd.get('b')));if(duplicate){notice('error','Esse confronto já existe neste grupo.');return}}const videoUrl=cleanVideoUrl(fd.get('video'));if(videoUrl===false){notice('error','Use um link de vídeo HTTPS válido.');return}const payload={competition_id:fd.get('competition'),stage_type:stageType,group_label:stageType==='GROUP'?fd.get('group'):null,round_label:stageType==='KNOCKOUT'?phaseInfo(roundLabel).label:roundLabel,participant_a:fd.get('a'),participant_b:fd.get('b'),scheduled_at:fd.get('date')?new Date(fd.get('date')).toISOString():null,status:'SCHEDULED',video_url:videoUrl};const {error}=await supabase.from('matches').insert(payload);if(error)notice('error',error.message);else await refresh('Partida criada.')});
    }
    document.querySelectorAll('[data-match-meta-form]').forEach(meta=>meta.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(meta);const videoUrl=cleanVideoUrl(fd.get('video'));if(videoUrl===false){notice('error','Use um link de vídeo HTTPS válido.');return}const payload={scheduled_at:fd.get('date')?new Date(fd.get('date')).toISOString():null,video_url:videoUrl};const {error}=await supabase.from('matches').update(payload).eq('id',meta.dataset.matchMetaForm);if(error)notice('error',error.message);else await refresh('Partida atualizada.') }));
    document.querySelectorAll('[data-delete-match]').forEach(b=>b.onclick=()=>askDelete('matches',b.dataset.deleteMatch,'esta partida'));return;
  }
  if(activeTab==='results'){
    const sel=document.querySelector('#resultMatch'),ca=document.querySelector('#crownsA'),cb=document.querySelector('#crownsB'),time=document.querySelector('#victoryTime'),video=document.querySelector('#resultVideo'),notes=document.querySelector('#resultNotes'),la=document.querySelector('#labelA'),lb=document.querySelector('#labelB'),hint=document.querySelector('#scoreHint');
    const sync=()=>{const m=data.matches.find(x=>x.id===sel.value);if(!m)return;ca.value=m.crowns_a??0;cb.value=m.crowns_b??0;time.value=formatVictoryTime(m.victory_time_seconds).replace('—','');video.value=m.video_url||'';notes.value=m.notes||'';la.textContent=participantName(m.participant_a)+' — coroas';lb.textContent=participantName(m.participant_b)+' — coroas';hint.innerHTML=''}; sel.onchange=sync;
    const hintScore=()=>{const m=data.matches.find(x=>x.id===sel.value);if(m&&(m.stage_type||'KNOCKOUT')==='KNOCKOUT'&&Number(ca.value)===Number(cb.value))hint.innerHTML='<div class="notice error">Mata-mata não pode terminar empatado.</div>';else hint.innerHTML=''};ca.oninput=hintScore;cb.oninput=hintScore;
    document.querySelector('#resultForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target),m=data.matches.find(x=>x.id===fd.get('match')),aN=Number(fd.get('ca')),bN=Number(fd.get('cb'));if(!m){notice('error','Selecione uma partida.');return}if((m.stage_type||'KNOCKOUT')==='KNOCKOUT'&&aN===bN){notice('error','No mata-mata precisa existir um vencedor.');return}const decisive=aN!==bN;const seconds=decisive?parseVictoryTime(fd.get('time')):null;if(decisive&&!seconds){notice('error','Informe o tempo da vitória em mm:ss, por exemplo 2:35.');return}const videoUrl=cleanVideoUrl(fd.get('video'));if(videoUrl===false){notice('error','Use um link de vídeo HTTPS válido.');return}const payload={crowns_a:aN,crowns_b:bN,victory_time_seconds:seconds,video_url:videoUrl,notes:String(fd.get('notes')||'').trim(),status:'FINISHED'};const {error}=await supabase.from('matches').update(payload).eq('id',m.id);if(error){notice('error',error.message);return}try{await loadData();const synced=await syncAutomaticKnockout(m.competition_id);if(synced.changed)await loadData();renderDashboard();notice('success',synced.changed?'Resultado salvo e mata-mata avançado automaticamente.':'Resultado salvo.')}catch(err){notice('error','Resultado salvo, mas houve erro ao sincronizar o mata-mata: '+(err.message||err))}});return;
  }
  if(activeTab==='logs'){
    document.querySelector('#logForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target),payload={match_id:fd.get('match'),game_number:Number(fd.get('game')),crowns_a:Number(fd.get('ca')),crowns_b:Number(fd.get('cb')),notes:String(fd.get('notes')||'').trim()};const {error}=await supabase.from('match_games').upsert(payload,{onConflict:'match_id,game_number'});if(error)notice('error',error.message);else await refresh('Registro salvo.')});document.querySelectorAll('[data-delete-game]').forEach(b=>b.onclick=()=>askDelete('match_games',b.dataset.deleteGame,'este registro'));
  }
}

async function boot(){
  if(!configured){connectionScreen();return}
  if(!supabase){connectionScreen(connectionError?.message || 'A configuração existe, mas o cliente do Supabase não foi carregado. Confira sua conexão com a internet.');return}
  root.innerHTML='<div class="loader">Verificando acesso…</div>';
  const {data:{session}}=await supabase.auth.getSession(); if(!session){loginScreen();return}
  const {data:isAdmin,error}=await supabase.rpc('is_admin');
  if(error||!isAdmin){root.innerHTML=`<section class="admin-login-page"><div class="login-card"><div class="lock">⛔</div><h1>Sem permissão</h1><p>Esta conta existe, mas não está marcada como administradora.</p><button id="leave" class="button secondary full">Sair</button></div></section>`;document.querySelector('#leave').onclick=async()=>{await supabase.auth.signOut();loginScreen()};return}
  try{
    await loadData();
    const cup=activeCup(); if(cup){const sync=await syncAutomaticKnockout(cup.id);if(sync.changed)await loadData()}
    renderDashboard();
  }catch(err){root.innerHTML=`<section class="admin-login-page"><div class="login-card"><h1>Atualização do banco necessária</h1><div class="notice error">${escapeHtml(err.message)}</div><p>Não apague seu Supabase. Execute <b>supabase/copa-v3-migration.sql</b> uma única vez no SQL Editor e atualize esta página.</p><a class="button secondary full" href="index.html">Voltar</a></div></section>`}
}

boot().catch(err=>{root.innerHTML='<div class="empty">Não foi possível conectar. Atualize a página para tentar novamente.</div>';console.error(err)}).finally(()=>{clearTimeout(window.loadingTimeout);window.finishLoading()});
