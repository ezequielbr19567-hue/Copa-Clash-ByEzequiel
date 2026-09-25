import { supabase, configured } from './supabase-client.js';
import { cupPhases, phaseInfo } from './cup.js';

import { defaults, normalizeSettings, applySettings, imageUrl } from './settings.js';
let siteSettings={...defaults};
let settingsError=false;

const root=document.querySelector('#adminRoot');
const escapeHtml=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
let data={players:[],teams:[],team_members:[],competitions:[],matches:[],games:[]};
let activeTab='overview';
let flash=null;

function notice(type,text){flash={type,text};renderDashboard();setTimeout(()=>{flash=null;const el=document.querySelector('#flash');if(el)el.remove()},4500)}

function configScreen(){
  root.innerHTML=`<section class="admin-login-page"><div class="login-card"><div class="lock">⚙️</div><span class="eyebrow">CONFIGURAÇÃO</span><h1>Conecte o Supabase</h1><p>Este site não usa Node.js. Você só precisa editar <b>js/config.js</b> no próprio GitHub e colar a URL e a chave pública do Supabase.</p><div class="notice info">Depois execute <b>supabase/schema.sql</b> no SQL Editor do Supabase e recarregue esta página.</div><a class="button secondary full" href="index.html">← Voltar ao site</a></div></section>`;
}

function loginScreen(message=''){
  root.innerHTML=`<section class="admin-login-page"><form id="loginForm" class="login-card"><div class="lock">🔐</div><span class="eyebrow">ÁREA RESTRITA</span><h1>Painel administrativo</h1><p>Entre para gerenciar o site.</p>${message?`<div class="notice error">${escapeHtml(message)}</div>`:''}<label class="field">E-mail<input id="email" type="email" required autocomplete="username" placeholder="admin@exemplo.com"></label><label class="field">Senha<input id="password" type="password" required autocomplete="current-password" placeholder="••••••••"></label><button class="button primary full" type="submit">Entrar</button><a class="button secondary full" style="margin-top:8px" href="index.html">Voltar ao site</a></form></section>`;
  document.querySelector('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;btn.textContent='Entrando…';const {error}=await supabase.auth.signInWithPassword({email:document.querySelector('#email').value,password:document.querySelector('#password').value});if(error){loginScreen('E-mail ou senha inválidos.');return;}await boot();});
}

async function loadData(){
  const qs=await Promise.all([
    supabase.from('players').select('*').order('name'),supabase.from('teams').select('*').order('name'),supabase.from('team_members').select('*'),supabase.from('competitions').select('*').order('created_at'),supabase.from('matches').select('*').order('created_at',{ascending:false}),supabase.from('match_games').select('*').order('game_number'),supabase.from('site_settings').select('settings').eq('id',1).maybeSingle()
  ]);
  const failed=qs.slice(0,6).find(q=>q.error);if(failed)throw failed.error;
  settingsError=Boolean(qs[6].error);
  siteSettings=normalizeSettings(qs[6].data?.settings);applySettings(siteSettings);
  data={players:qs[0].data||[],teams:qs[1].data||[],team_members:qs[2].data||[],competitions:qs[3].data||[],matches:qs[4].data||[],games:qs[5].data||[]};
}
const teamName=id=>data.teams.find(t=>t.id===id)?.name||'—';
const compName=id=>data.competitions.find(c=>c.id===id)?.name||'—';
const fmtDate=v=>v?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'Sem data';

async function refresh(msg){try{await loadData();renderDashboard();if(msg)notice('success',msg)}catch(err){notice('error',err.message||'Erro ao carregar os dados.')}}

function navButton(key,icon,label){return `<button data-tab="${key}" class="${activeTab===key?'active':''}">${icon} &nbsp;${label}</button>`}
function title(){return {appearance:'Aparência',overview:'Visão geral',players:'Jogadores',teams:'Duplas / participantes',competitions:'Competições',matches:'Partidas',results:'Resultados',logs:'Registro jogo a jogo'}[activeTab]}

function renderDashboard(){
  root.innerHTML=`<div class="admin-shell"><aside class="sidebar"><div class="sidebar-brand"><a class="brand" href="index.html"><span class="brand-mark small">♛</span><span><strong>${escapeHtml(siteSettings.site_name || "Admin")}</strong><small>ADMIN</small></span></a></div><nav class="admin-nav">${navButton('overview','▦','Visão geral')}${navButton('appearance','◐','Aparência')}${navButton('players','♙','Jogadores')}${navButton('teams','♟','Duplas')}${navButton('competitions','♛','Competições')}${navButton('matches','＋','Partidas')}${navButton('results','✓','Resultados')}${navButton('logs','≡','Registros')}</nav><button id="logout" class="logout">↪ &nbsp;Sair</button></aside><main class="admin-main"><div class="admin-top"><div><span class="eyebrow">PAINEL ADM</span><h1>${title()}</h1></div><a href="index.html" class="button secondary small">Ver site ↗</a></div>${flash?`<div id="flash" class="notice ${flash.type}">${escapeHtml(flash.text)}</div>`:''}<div id="tabContent">${tabContent()}</div></main></div>`;
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.tab;flash=null;renderDashboard()}));
  document.querySelector('#logout').addEventListener('click',async()=>{await supabase.auth.signOut();loginScreen()});
  bindTab();
}

function tabContent(){
  if(activeTab==='appearance')return appearanceHtml();
  if(activeTab==='overview')return overviewHtml();
  if(activeTab==='players')return playersHtml();
  if(activeTab==='teams')return teamsHtml();
  if(activeTab==='competitions')return competitionsHtml();
  if(activeTab==='matches')return matchesHtml();
  if(activeTab==='results')return resultsHtml();
  return logsHtml();
}

function overviewHtml(){
  const finished=data.matches.filter(m=>m.status==='FINISHED').length;
  return `<div class="stat-cards"><div class="stat-card"><span>Jogadores</span><b>${data.players.length}</b></div><div class="stat-card"><span>Participantes</span><b>${data.teams.length}</b></div><div class="stat-card"><span>Competições</span><b>${data.competitions.length}</b></div><div class="stat-card"><span>Finalizadas</span><b>${finished}</b></div></div><section class="admin-card"><h2>Como administrar</h2><p>Fluxo recomendado para evitar erros.</p><div class="admin-help"><b>1.</b> Cadastre os jogadores. Para o campeonato 1v1, deixe marcado “criar participante SOLO”.<br><b>2.</b> Em Duplas, monte as equipes de 2 jogadores para a Copa.<br><b>3.</b> Crie as competições: Campeonato = LEAGUE; Copa = CUP/2v2.<br><b>4.</b> Cadastre cada partida.<br><b>5.</b> Em Resultados, informe as coroas. A classificação do site calcula os pontos automaticamente.<br><br><b>Regra da liga:</b> vitória +3, empate +1 para cada, derrota 0 e quem perde por 0×3 recebe −1.</div></section>`;
}

function playersHtml(){return `<section class="admin-card"><h2>Novo jogador</h2><p>Cadastre uma pessoa. O participante SOLO pode ser criado automaticamente para a liga 1v1.</p><form id="playerForm" class="form-grid"><label class="field wide">Nome<input name="name" required maxlength="60" placeholder="Nome do jogador"></label><label class="field wide" style="flex-direction:row;align-items:center"><input name="solo" type="checkbox" checked style="width:auto"> Criar também participante SOLO com o mesmo nome</label><div class="form-actions"><button class="button primary">Adicionar jogador</button></div></form><div class="data-list">${data.players.length?data.players.map(p=>`<div class="data-row"><div><b>${escapeHtml(p.name)}</b><small>Jogador</small></div><div class="inline-actions"><button class="icon-btn red" data-delete-player="${p.id}" title="Excluir">Excluir</button></div></div>`).join(''):'<div class="empty">Nenhum jogador cadastrado.</div>'}</div></section>`}

function playerOptions(){return data.players.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
function memberNames(teamId){const ids=data.team_members.filter(m=>m.team_id===teamId).sort((a,b)=>a.position-b.position).map(m=>m.player_id);return ids.map(id=>data.players.find(p=>p.id===id)?.name).filter(Boolean).join(' + ')}
function teamsHtml(){return `<section class="admin-card"><h2>Nova dupla 2v2</h2><p>A Copa é obrigatoriamente formada por equipes DUO com dois jogadores.</p><form id="teamForm" class="form-grid"><label class="field wide">Nome da dupla<input name="name" required maxlength="60" placeholder="Nome da dupla"></label><label class="field">Jogador 1<select name="p1" required><option value="">Selecione…</option>${playerOptions()}</select></label><label class="field">Jogador 2<select name="p2" required><option value="">Selecione…</option>${playerOptions()}</select></label><div class="form-actions"><button class="button primary">Criar dupla</button></div></form><div class="data-list">${data.teams.length?data.teams.map(t=>`<div class="data-row"><div><b>${escapeHtml(t.name)}</b><small>${t.team_type==='DUO'?'2v2 · '+escapeHtml(memberNames(t.id)||'sem membros'):'SOLO'}</small></div><div class="inline-actions"><button class="icon-btn red" data-delete-team="${t.id}">Excluir</button></div></div>`).join(''):'<div class="empty">Nenhum participante cadastrado.</div>'}</div></section>`}

function competitionsHtml(){return `<section class="admin-card"><h2>Nova competição</h2><p>Na Copa, o modo 2v2 é obrigatório pelo próprio banco.</p><form id="competitionForm" class="form-grid"><label class="field wide">Nome<input name="name" required placeholder="Nome da competição"></label><label class="field">Formato<select id="kind" name="kind"><option value="LEAGUE">Campeonato / pontos corridos</option><option value="CUP">Copa / eliminação</option></select></label><label class="field">Modo<select id="mode" name="mode"><option value="SOLO">1v1</option><option value="DUO">2v2</option></select></label><label class="field">Temporada<input name="season" value="${new Date().getFullYear()}" required></label><label class="field" style="flex-direction:row;align-items:center"><input name="active" type="checkbox" checked style="width:auto"> Ativa</label><div class="form-actions"><button class="button primary">Criar competição</button></div></form><div class="data-list">${data.competitions.length?data.competitions.map(c=>`<div class="data-row"><div><b>${escapeHtml(c.name)}</b><small>${c.kind==='LEAGUE'?'Pontos corridos':'Eliminação'} · ${c.mode} · ${escapeHtml(c.season)}${c.active?' · ativa':''}</small></div><div class="inline-actions"><button class="icon-btn red" data-delete-comp="${c.id}">Excluir</button></div></div>`).join(''):'<div class="empty">Nenhuma competição.</div>'}</div></section>`}

function compOptions(){return data.competitions.map(c=>`<option value="${c.id}">${escapeHtml(c.name)} · ${c.mode}</option>`).join('')}
function teamOptions(mode){return data.teams.filter(t=>!mode||t.team_type===mode).map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
function matchesHtml(){return `<section class="admin-card"><h2>Nova partida</h2><p>Escolha a competição e a fase. Na Copa, cadastre os confrontos da próxima fase com os vencedores; o avanço é manual.</p><form id="matchForm" class="form-grid"><label class="field">Competição<select id="matchCompetition" name="competition" required><option value="">Selecione…</option>${compOptions()}</select></label><label class="field">Rodada / fase<input name="round" required maxlength="80" value="Rodada 1" list="cupPhases"><datalist id="cupPhases">${cupPhases.map(label=>`<option value="${label}"></option>`).join('')}</datalist></label><label class="field">Participante A<select id="partA" name="a" required><option value="">Selecione a competição…</option></select></label><label class="field">Participante B<select id="partB" name="b" required><option value="">Selecione a competição…</option></select></label><label class="field wide">Data e hora<input name="date" type="datetime-local"></label><div class="form-actions"><button class="button primary">Criar partida</button></div></form><div class="data-list">${data.matches.length?data.matches.map(m=>`<div class="data-row"><div><b>${escapeHtml(teamName(m.participant_a))} × ${escapeHtml(teamName(m.participant_b))}</b><small>${escapeHtml(compName(m.competition_id))} · ${escapeHtml(m.round_label)} · ${m.status==='FINISHED'?'finalizada':'agendada'} · ${fmtDate(m.scheduled_at)}</small></div><div class="inline-actions"><button class="icon-btn red" data-delete-match="${m.id}">Excluir</button></div></div>`).join(''):'<div class="empty">Nenhuma partida cadastrada.</div>'}</div></section>`}

function matchOptions(){return data.matches.map(m=>`<option value="${m.id}">${escapeHtml(m.round_label)}: ${escapeHtml(teamName(m.participant_a))} × ${escapeHtml(teamName(m.participant_b))}</option>`).join('')}
function resultsHtml(){return `<section class="admin-card"><h2>Lançar / corrigir resultado</h2><p>A classificação é recalculada automaticamente no site. Na Copa, empate final é bloqueado.</p><form id="resultForm" class="form-grid"><label class="field wide">Partida<select id="resultMatch" name="match" required><option value="">Selecione…</option>${matchOptions()}</select></label><label class="field"><span id="labelA">Coroas A</span><input id="crownsA" name="ca" type="number" min="0" max="3" value="0" required></label><label class="field"><span id="labelB">Coroas B</span><input id="crownsB" name="cb" type="number" min="0" max="3" value="0" required></label><label class="field wide">Observação<textarea id="resultNotes" name="notes" placeholder="Opcional"></textarea></label><div id="scoreHint" class="wide"></div><div class="form-actions"><button class="button primary">Salvar resultado</button></div></form></section>`}

function logsHtml(){return `<section class="admin-card"><h2>Registro jogo a jogo</h2><p>Opcional: registre as batalhas que formaram um confronto.</p><form id="logForm" class="form-grid"><label class="field wide">Partida<select id="logMatch" name="match" required><option value="">Selecione…</option>${matchOptions()}</select></label><label class="field">Número do jogo<input name="game" type="number" min="1" value="1" required></label><label class="field">Coroas A<input name="ca" type="number" min="0" max="3" value="0" required></label><label class="field">Coroas B<input name="cb" type="number" min="0" max="3" value="0" required></label><label class="field wide">Observação<textarea name="notes" placeholder="Ex.: vitória no overtime"></textarea></label><div class="form-actions"><button class="button primary">Salvar registro</button></div></form><div class="data-list">${data.games.length?data.games.map(g=>{const m=data.matches.find(x=>x.id===g.match_id);return `<div class="data-row"><div><b>Jogo ${g.game_number}: ${g.crowns_a} × ${g.crowns_b}</b><small>${m?escapeHtml(teamName(m.participant_a))+' × '+escapeHtml(teamName(m.participant_b)):'Partida'}${g.notes?' · '+escapeHtml(g.notes):''}</small></div><button class="icon-btn red" data-delete-game="${g.id}">Excluir</button></div>`}).join(''):'<div class="empty">Nenhum registro detalhado.</div>'}</div></section>`}

async function askDelete(table,id,label){if(!confirm(`Excluir ${label}? Essa ação não pode ser desfeita.`))return;const {error}=await supabase.from(table).delete().eq('id',id);if(error)notice('error',error.message);else await refresh('Excluído com sucesso.')}

function bindTab(){
  if(activeTab==='appearance'){
    const form=document.querySelector('#appearanceForm');
    form.addEventListener('input',()=>{
      document.querySelector('#previewName').textContent=form.elements.site_name.value || 'Arena';
      const preview=document.querySelector('#previewImage');
      preview.onerror=()=>{preview.onerror=null;preview.src=defaults.image_url};
      preview.src=imageUrl(form.elements.image_url.value);
    });
    form.addEventListener('submit',async e=>{
      e.preventDefault();const btn=e.submitter;btn.disabled=true;
      const status=document.querySelector('#settingsStatus');status.textContent='Salvando…';
      const fd=new FormData(form),values={};
      for(const key of Object.keys(defaults)) values[key]=typeof defaults[key]==='boolean'?fd.has(key):String(fd.get(key)||'').trim();
      values.image_url=values.image_url||defaults.image_url;
      if(values.image_url!==defaults.image_url && !/^https:\/\//i.test(values.image_url)){status.textContent='Use uma URL de imagem HTTPS.';btn.disabled=false;return;}
      const next=normalizeSettings(values);
      try{
        const {error}=await supabase.from('site_settings').upsert({id:1,settings:next},{onConflict:'id'});
        if(error)throw error;
        siteSettings=next;applySettings(next);status.textContent='Alterações salvas. O site já pode ser atualizado.';
      }catch(err){status.textContent='Não foi possível salvar. '+(err.message||'Tente novamente.');}
      finally{btn.disabled=false;}
    });
  }

  if(activeTab==='players'){
    document.querySelector('#playerForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target),name=fd.get('name').trim();e.submitter.disabled=true;const {data:p,error}=await supabase.from('players').insert({name}).select().single();if(error){notice('error',error.message);return;}if(fd.get('solo')){const {error:tErr}=await supabase.from('teams').insert({name,team_type:'SOLO'});if(tErr){notice('error','Jogador criado, mas o participante SOLO falhou: '+tErr.message);return;}}await refresh('Jogador criado.')});
    document.querySelectorAll('[data-delete-player]').forEach(b=>b.onclick=()=>askDelete('players',b.dataset.deletePlayer,'este jogador'));
  }
  if(activeTab==='teams'){
    document.querySelector('#teamForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target),p1=fd.get('p1'),p2=fd.get('p2');if(p1===p2){notice('error','Escolha dois jogadores diferentes.');return;}e.submitter.disabled=true;const {data:t,error}=await supabase.from('teams').insert({name:fd.get('name').trim(),team_type:'DUO'}).select().single();if(error){notice('error',error.message);return;}const {error:mErr}=await supabase.from('team_members').insert([{team_id:t.id,player_id:p1,position:1},{team_id:t.id,player_id:p2,position:2}]);if(mErr){await supabase.from('teams').delete().eq('id',t.id);notice('error',mErr.message);return;}await refresh('Dupla criada.')});
    document.querySelectorAll('[data-delete-team]').forEach(b=>b.onclick=()=>askDelete('teams',b.dataset.deleteTeam,'este participante/dupla'));
  }
  if(activeTab==='competitions'){
    const kind=document.querySelector('#kind'),mode=document.querySelector('#mode');kind.onchange=()=>{if(kind.value==='CUP'){mode.value='DUO';mode.disabled=true}else mode.disabled=false};
    document.querySelector('#competitionForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target),k=fd.get('kind'),m=k==='CUP'?'DUO':fd.get('mode');const {error}=await supabase.from('competitions').insert({name:fd.get('name').trim(),kind:k,mode:m,season:fd.get('season').trim(),active:Boolean(fd.get('active'))});if(error)notice('error',error.message);else await refresh('Competição criada.')});
    document.querySelectorAll('[data-delete-comp]').forEach(b=>b.onclick=()=>askDelete('competitions',b.dataset.deleteComp,'esta competição e suas partidas'));
  }
  if(activeTab==='matches'){
    const cSel=document.querySelector('#matchCompetition'),a=document.querySelector('#partA'),b=document.querySelector('#partB');const fill=()=>{const c=data.competitions.find(x=>x.id===cSel.value);const round=document.querySelector('[name=round]');round.value=c?.kind==='CUP'?'Oitavas de final':'Rodada 1';const opts=teamOptions(c?.mode);a.innerHTML='<option value="">Selecione…</option>'+opts;b.innerHTML='<option value="">Selecione…</option>'+opts};cSel.onchange=fill;
    document.querySelector('#matchForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target);if(fd.get('a')===fd.get('b')){notice('error','Os participantes precisam ser diferentes.');return;}const date=fd.get('date');const round=fd.get('round').trim();if(!round){notice('error','Informe a fase.');return;}const selected=data.competitions.find(c=>c.id===fd.get('competition'));const {error}=await supabase.from('matches').insert({competition_id:fd.get('competition'),round_label:selected?.kind==='CUP'?phaseInfo(round).label:round,participant_a:fd.get('a'),participant_b:fd.get('b'),scheduled_at:date?new Date(date).toISOString():null,status:'SCHEDULED'});if(error)notice('error',error.message);else await refresh('Partida criada.')});
    document.querySelectorAll('[data-delete-match]').forEach(b=>b.onclick=()=>askDelete('matches',b.dataset.deleteMatch,'esta partida'));
  }
  if(activeTab==='results'){
    const sel=document.querySelector('#resultMatch'),ca=document.querySelector('#crownsA'),cb=document.querySelector('#crownsB'),notes=document.querySelector('#resultNotes'),la=document.querySelector('#labelA'),lb=document.querySelector('#labelB'),hint=document.querySelector('#scoreHint');
    const sync=()=>{const m=data.matches.find(x=>x.id===sel.value);if(!m)return;ca.value=m.crowns_a??0;cb.value=m.crowns_b??0;notes.value=m.notes||'';la.textContent=teamName(m.participant_a)+' — coroas';lb.textContent=teamName(m.participant_b)+' — coroas';scoreHint.innerHTML='';};sel.onchange=sync;
    const hintScore=()=>{const m=data.matches.find(x=>x.id===sel.value);if(!m)return;const c=data.competitions.find(x=>x.id===m.competition_id),aN=Number(ca.value),bN=Number(cb.value);if(c?.kind==='CUP'&&aN===bN)hint.innerHTML='<div class="notice error">Copa eliminatória não pode terminar empatada.</div>';else if(c?.kind==='LEAGUE'&&((aN===0&&bN===3)||(aN===3&&bN===0)))hint.innerHTML='<div class="notice info">Derrota por 0×3: o perdedor receberá −1 ponto na classificação.</div>';else hint.innerHTML='';};ca.oninput=hintScore;cb.oninput=hintScore;
    document.querySelector('#resultForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target),m=data.matches.find(x=>x.id===fd.get('match')),c=data.competitions.find(x=>x.id===m?.competition_id),aN=Number(fd.get('ca')),bN=Number(fd.get('cb'));if(c?.kind==='CUP'&&aN===bN){notice('error','Na Copa precisa existir um vencedor.');return;}const {error}=await supabase.from('matches').update({crowns_a:aN,crowns_b:bN,notes:fd.get('notes').trim(),status:'FINISHED'}).eq('id',fd.get('match'));if(error)notice('error',error.message);else await refresh('Resultado salvo. A classificação foi atualizada.')});
  }
  if(activeTab==='logs'){
    document.querySelector('#logForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target);const payload={match_id:fd.get('match'),game_number:Number(fd.get('game')),crowns_a:Number(fd.get('ca')),crowns_b:Number(fd.get('cb')),notes:fd.get('notes').trim()};const {error}=await supabase.from('match_games').upsert(payload,{onConflict:'match_id,game_number'});if(error)notice('error',error.message);else await refresh('Registro salvo.')});
    document.querySelectorAll('[data-delete-game]').forEach(b=>b.onclick=()=>askDelete('match_games',b.dataset.deleteGame,'este registro'));
  }
}

async function boot(){
  if(!configured){configScreen();return;}
  root.innerHTML='<div class="loader">Verificando acesso…</div>';
  const {data:{session}}=await supabase.auth.getSession();if(!session){loginScreen();return;}
  const {data:isAdmin,error}=await supabase.rpc('is_admin');if(error||!isAdmin){root.innerHTML=`<section class="admin-login-page"><div class="login-card"><div class="lock">⛔</div><h1>Sem permissão</h1><p>Esta conta existe, mas não está marcada como administradora em <code>public.profiles</code>.</p><button id="leave" class="button secondary full">Sair</button></div></section>`;document.querySelector('#leave').onclick=async()=>{await supabase.auth.signOut();loginScreen()};return;}
  try{await loadData();renderDashboard()}catch(err){root.innerHTML=`<section class="admin-login-page"><div class="login-card"><h1>Erro ao carregar</h1><div class="notice error">${escapeHtml(err.message)}</div><a class="button secondary full" href="index.html">Voltar</a></div></section>`}
}

boot().catch(err=>{root.innerHTML='<div class="empty">Não foi possível conectar. Atualize a página para tentar novamente.</div>';console.error(err)}).finally(()=>{clearTimeout(window.loadingTimeout);window.finishLoading()});

function appearanceHtml(){
  const fields=[['site_name','Nome do site',60],['hero_title','Título do destaque',100],['hero_description','Descrição opcional',300],['league_title','Título da classificação',40],['cup_title','Título da Copa',40],['matches_title','Título das partidas',40],['footer_text','Rodapé opcional',160],['loading_text','Texto de carregamento',60],['cta_label','Botão do destaque',40],['participants_label','Rótulo de participantes',40],['scheduled_label','Rótulo de agendadas',40],['finished_label','Rótulo de finalizadas',40],['empty_league','Classificação vazia',100],['empty_cup','Copa vazia',100],['empty_matches','Partidas vazias',100],['rules_text','Legenda da classificação',200]];
  return '<section class="admin-card"><h2>Identidade do site</h2>'+
    (settingsError?'<div class="notice error">A configuração não foi carregada. Confira a conexão e execute supabase/site-settings.sql no Supabase, caso ainda não tenha aplicado a atualização.</div>':'')+
    '<div class="settings-preview"><img id="previewImage" src="'+escapeHtml(siteSettings.image_url)+'" alt="Prévia da imagem"><strong id="previewName">'+escapeHtml(siteSettings.site_name)+'</strong></div><form id="appearanceForm" class="form-grid">'+
    fields.map(([key,label,max])=>'<label class="field '+(key==='hero_description'||key==='footer_text'?'wide':'')+'">'+label+'<input name="'+key+'" maxlength="'+max+'" value="'+escapeHtml(siteSettings[key])+'" '+(['site_name','league_title','cup_title','matches_title','loading_text'].includes(key)?'required':'')+'></label>').join('')+
    '<label class="field wide">Imagem do site (URL HTTPS)<input name="image_url" value="'+escapeHtml(siteSettings.image_url)+'"><span>Deixe vazio para usar a imagem original. Aplicada no topo, destaque, carregamento e ícone.</span></label><label class="field">Cor principal<input type="color" name="primary_color" value="'+escapeHtml(siteSettings.primary_color)+'"></label><label class="field">Cor de destaque<input type="color" name="accent_color" value="'+escapeHtml(siteSettings.accent_color)+'"></label><label class="field" style="flex-direction:row;align-items:center"><input type="checkbox" name="show_hero" '+(siteSettings.show_hero?'checked':'')+'> Mostrar destaque inicial</label><div class="form-actions"><button class="button primary" '+(settingsError?'disabled':'')+'>Salvar alterações</button><a class="button secondary" href="index.html" target="_blank" rel="noopener">Ver site ↗</a></div><p id="settingsStatus" class="settings-status wide" role="status"></p></form></section>';
}
