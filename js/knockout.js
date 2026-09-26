import { phaseInfo } from './cup.js';

export const knockoutRule = 'Metade superior: G4 × G1. Metade inferior: G3 × G2. Em cada metade: 1º × 4º, 2º × 3º, 3º × 2º e 4º × 1º. Vencedores de duelos vizinhos avançam juntos até a semifinal; as metades se encontram apenas na final. Desempate: pontos, vitórias, saldo, coroas a favor e nome.';
const scored = m => m.status==='FINISHED' && Number.isInteger(m.crowns_a) && Number.isInteger(m.crowns_b) && m.crowns_a>=0 && m.crowns_a<=3 && m.crowns_b>=0 && m.crowns_b<=3;
export function automaticCup(c){return c?.format_config?.knockout_mode==='AUTO_CROSS';}

export function groupRanking(matches, teams, config={}) {
  const ids=new Set(matches.flatMap(m=>[m.participant_a,m.participant_b]));
  const rows=new Map(teams.filter(t=>ids.has(t.id)).map(t=>[t.id,{id:t.id,name:t.name,pts:0,v:0,sg:0,cf:0}]));
  const points=(a,b)=>a>b?(config.points_win??3):a===b?(config.points_draw??1):a===0&&b===3?(config.points_loss_three_crowns??-1):(config.points_loss??0);
  for(const m of matches.filter(scored)){
    const a=rows.get(m.participant_a),b=rows.get(m.participant_b);if(!a||!b)continue;
    for(const [row,own,other] of [[a,m.crowns_a,m.crowns_b],[b,m.crowns_b,m.crowns_a]]){row.pts+=points(own,other);row.v+=Number(own>other);row.sg+=own-other;row.cf+=own;}
  }
  return [...rows.values()].sort((a,b)=>b.pts-a.pts||b.v-a.v||b.sg-a.sg||b.cf-a.cf||a.name.localeCompare(b.name,'pt-BR')||a.id.localeCompare(b.id));
}

export function buildKnockout(competition, matches, teams){
  if(!automaticCup(competition))return null;
  const config=competition.format_config, all=matches.filter(m=>m.competition_id===competition.id);
  const groups=(config.groups?.length?config.groups:[...new Set(all.filter(m=>m.stage_type==='GROUP').map(m=>m.group_label))]).map(String).sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  const q=Number(config.qualifiers_per_group??4),total=groups.length*q;
  if(groups.length<2||groups.length%2||new Set(groups).size!==groups.length||!Number.isInteger(q)||q<1||total<2||total>128||(total&(total-1)))return {phases:[],error:'O cruzamento exige pares de grupos e um total de 2, 4, 8, 16, 32, 64 ou 128 classificados.'};
  const tables=groups.map(group=>{
    const games=all.filter(m=>m.stage_type==='GROUP'&&String(m.group_label)===group);
    return {group,games,ranking:groupRanking(games,teams,config)};
  });
  // Do not qualify anyone while a configured group is missing or still playing.
  const qualified=tables.every(t=>t.games.length>0&&t.ranking.length>=q&&t.games.every(scored));
  const seeds=[];
  for(let i=0;i<tables.length/2;i++)for(let rank=0;rank<q;rank++){
    for(const [table,position] of [[tables[tables.length-1-i],rank],[tables[i],q-rank-1]])seeds.push({id:qualified?table.ranking[position].id:null,projection:table.ranking[position]?.id||null,label:`${position+1}º do grupo ${table.group}`});
  }
  const phases=[];let sources=seeds,round=0,duel=0;
  while(sources.length>1){
    const count=sources.length/2,label=count===1?'Final':count===2?'Semifinal':count===4?'Quartas de final':count===8?'Oitavas de final':`${count} avos de final`;
    const phase={...phaseInfo(label),matches:[]},next=[];
    for(let i=0;i<sources.length;i+=2){
      const a=sources[i],b=sources[i+1],key=`auto-cross:r${round+1}:m${i/2+1}`;
      const saved=all.find(m=>m.stage_type!=='GROUP'&&m.bracket_key===key) || all.find(m=>m.stage_type!=='GROUP'&&phaseInfo(m.round_label).key===phase.key&&a.id&&b.id&&((m.participant_a===a.id&&m.participant_b===b.id)||(m.participant_a===b.id&&m.participant_b===a.id)));
      const same=saved&&a.id&&b.id&&((saved.participant_a===a.id&&saved.participant_b===b.id)||(saved.participant_a===b.id&&saved.participant_b===a.id));
      const reverse=same&&saved.participant_a!==a.id;
      const node={id:saved?.id||key,competition_id:competition.id,round_label:label,stage_type:'KNOCKOUT',bracket_key:key,bracket_order:i/2+1,participant_a:a.id,participant_b:b.id,source_a:a.label,source_b:b.label,projection_a:!qualified?a.projection:null,projection_b:!qualified?b.projection:null,duel:++duel,notes:saved?.notes||'',virtual:!saved,stale:!!saved&&!same,status:same?saved.status:'SCHEDULED',crowns_a:same?(reverse?saved.crowns_b:saved.crowns_a):null,crowns_b:same?(reverse?saved.crowns_a:saved.crowns_b):null,scheduled_at:same?saved.scheduled_at:null};
      phase.matches.push(node);
      const winner=scored(node)&&node.crowns_a!==node.crowns_b?(node.crowns_a>node.crowns_b?a.id:b.id):null;
      next.push({id:winner,label:`Vencedor do duelo ${node.duel}`});
    }
    phases.push(phase);sources=next;round++;
  }
  return {phases,qualified,rule:knockoutRule};
}

export function resultMatches(data){
  const automatic=new Set(data.competitions.filter(automaticCup).map(c=>c.id));
  return [...data.matches.filter(m=>!automatic.has(m.competition_id)||m.stage_type==='GROUP'),...data.competitions.filter(automaticCup).flatMap(c=>buildKnockout(c,data.matches,data.teams).phases.flatMap(p=>p.matches).filter(m=>m.participant_a&&m.participant_b))];
}
