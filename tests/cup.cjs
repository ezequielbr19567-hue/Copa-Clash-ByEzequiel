const assert=require('assert');
(async()=>{
  const {
    normalizeCupFormat,phaseInfo,groupKnockoutMatches,defaultCupFormat,
    calculateGroupStandings,knockoutSeedPlan,knockoutSeedPreview,roundRobinSchedule,parseVictoryTime,formatVictoryTime
  }=await import('../js/cup.js');

  assert.deepEqual(normalizeCupFormat({groups:['1','2','1',''],qualifiers_per_group:4,points_win:3,points_draw:0,points_loss:0,points_loss_three_crowns:-1}),{
    groups:['1','2'],qualifiers_per_group:4,points_win:3,points_draw:1,points_loss:0,points_loss_three_crowns:-1,knockout_mode:'AUTO_CROSS'
  });
  assert.deepEqual(normalizeCupFormat(null),defaultCupFormat);
  assert.equal(phaseInfo('semifinais').label,'Semifinal');
  assert.equal(phaseInfo('Fase 10').order,10);
  assert.equal(parseVictoryTime('2:35'),155);
  assert.equal(formatVictoryTime(155),'2:35');

  const phases=groupKnockoutMatches([
    {id:'g1',stage_type:'GROUP',round_label:'Rodada 1'},
    {id:'q1',stage_type:'KNOCKOUT',round_label:'Quartas',bracket_order:2},
    {id:'q0',stage_type:'KNOCKOUT',round_label:'Quartas',bracket_order:1},
    {id:'s1',stage_type:'KNOCKOUT',round_label:'Semifinais'},
    {id:'f1',stage_type:'KNOCKOUT',round_label:'Final'}
  ]);
  assert.deepEqual(phases.map(p=>p.label),['Quartas de final','Semifinal','Final']);
  assert.deepEqual(phases[0].matches.map(m=>m.id),['q0','q1']);

  const schedule=roundRobinSchedule(['a','b','c','d','e']);
  assert.equal(schedule.length,10,'5 participants must produce 10 group matches');
  assert.equal(new Set(schedule.map(m=>[m.participant_a,m.participant_b].sort().join('|'))).size,10);

  const entries=[]; const matches=[]; const names={};
  for(const group of ['1','2','3','4']){
    const ids=[];
    for(let i=1;i<=5;i++){
      const id=`${group}-${i}`; ids.push(id); names[id]=`G${group} P${i}`;
      entries.push({competition_id:'cup',participant_id:id,group_label:group});
    }
    for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++){
      matches.push({competition_id:'cup',stage_type:'GROUP',group_label:group,status:'FINISHED',participant_a:ids[i],participant_b:ids[j],crowns_a:1,crowns_b:0,victory_time_seconds:100+i});
    }
  }
  const format={...defaultCupFormat};
  const st=calculateGroupStandings({entries,matches,groupLabel:'1',format,nameFor:id=>names[id]});
  assert.deepEqual(st.slice(0,5).map(r=>r.id),['1-1','1-2','1-3','1-4','1-5']);
  assert.equal(st[0].pts,12);
  assert.equal(st[4].pts,0);

  const threeCrown=[
    ...entries.filter(e=>e.group_label==='1').slice(0,2),
  ];
  const penalty=calculateGroupStandings({
    entries:threeCrown,
    matches:[{stage_type:'GROUP',group_label:'1',status:'FINISHED',participant_a:'1-1',participant_b:'1-2',crowns_a:3,crowns_b:0,victory_time_seconds:90}],
    groupLabel:'1',format,nameFor:id=>names[id]
  });
  assert.equal(penalty.find(r=>r.id==='1-2').pts,-1,'0x3 loss must be -1 point');

  for (const score of [0,1,2,3]) {
    const draw = calculateGroupStandings({entries:threeCrown, groupLabel:'1', format:{...format,points_draw:0},
      matches:[{stage_type:'GROUP',group_label:'1',status:'FINISHED',participant_a:'1-1',participant_b:'1-2',crowns_a:score,crowns_b:score}]});
    assert.deepEqual(draw.map(r=>[r.pts,r.e,r.j,r.sg]),[[1,1,1,0],[1,1,1,0]],'Both players earn one point with legacy zero-point config');
  }
  const incompleteMatches=matches.filter((_,i)=>i%10!==0);
  const preview=knockoutSeedPreview({entries,matches:incompleteMatches,format,nameFor:id=>names[id]});
  assert.equal(preview.ready,true,'live bracket projection should work before every group match is finished');
  assert.equal(preview.complete,false);
  assert.equal(knockoutSeedPlan({entries,matches:incompleteMatches,format,nameFor:id=>names[id]}).ready,false,'official bracket must wait for completed groups');

  const plan=knockoutSeedPlan({entries,matches,format,nameFor:id=>names[id]});
  assert.equal(plan.ready,true);
  assert.equal(plan.size,16);
  assert.equal(plan.round_label,'Oitavas de final');
  assert.deepEqual(plan.pairs.slice(0,4).map(p=>[p.participant_a,p.participant_b]),[
    ['4-1','1-4'],['4-2','1-3'],['4-3','1-2'],['4-4','1-1']
  ]);
  assert.deepEqual(plan.pairs.slice(4,8).map(p=>[p.participant_a,p.participant_b]),[
    ['3-1','2-4'],['3-2','2-3'],['3-3','2-2'],['3-4','2-1']
  ]);
  console.log('PASS: scoring, time tiebreak, group schedule and automatic knockout seeding');
})().catch(err=>{console.error(err);process.exitCode=1});
