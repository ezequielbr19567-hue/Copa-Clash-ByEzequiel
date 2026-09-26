const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const base=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.join(base,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);fs.readFile(file,(err,body)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png'})[path.extname(file)]||'text/plain');res.end(body);});});
const teams=Array.from({length:32},(_,i)=>({id:'t'+i,name:'Dupla '+String(i+1).padStart(2,'0'),team_type:'DUO'}));
const matches=[];
for(const [roundIndex,label] of ['16 avos de final','Oitavas de final','Quartas de final','Semifinal','Final'].entries()){
  const count=16/2**roundIndex;
  for(let i=0;i<count;i++) matches.push({id:`r${roundIndex}-${i}`,competition_id:'cup',round_label:label,participant_a:teams[i*2**(roundIndex+1)].id,participant_b:teams[i*2**(roundIndex+1)+2**roundIndex].id,status:roundIndex<2?'FINISHED':'SCHEDULED',crowns_a:roundIndex<2?3:null,crowns_b:roundIndex<2?1:null,scheduled_at:null,created_at:`2026-09-${String(10+roundIndex).padStart(2,'0')}T${String(i).padStart(2,'0')}:00:00Z`});
}
const fixtures={teams,players:[],team_members:[],competitions:[{id:'cup',name:'Copa',kind:'CUP',mode:'DUO',active:true}],matches:[...matches].reverse(),match_games:[]};
(async()=>{
 await new Promise(r=>server.listen(4174,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/js/supabase-client.js',route=>route.fulfill({contentType:'text/javascript',body:`export const configured=true;const fixtures=${JSON.stringify(fixtures)};export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'admin'}}}})},rpc:async()=>({data:true}),from(table){let payload;const query={select(){return this},order(){return this},eq(){return this},maybeSingle(){return this},insert(value){payload=value;return this},update(value){payload=value;return this},then(resolve,reject){if(payload){window.__write={table,payload};return Promise.resolve({error:null}).then(resolve,reject)}return Promise.resolve({data:table==='site_settings'?{settings:{}}:fixtures[table]||[],error:null}).then(resolve,reject)}};return query}};`}));
  await page.goto('http://127.0.0.1:4174');await page.waitForSelector('#pageLoader',{state:'detached'});
  assert.equal(await page.locator('.bracket-round').count(),5);assert.equal(await page.locator('.bracket-card').count(),31);
  assert.deepEqual(await page.locator('#cupPhase option').allTextContents(),['Todas as fases','16 avos de final','Oitavas de final','Quartas de final','Semifinal','Final']);
  assert.deepEqual(await page.locator('.bracket-round').evaluateAll(rounds=>rounds.map(r=>r.querySelectorAll('.bracket-card').length)),[16,8,4,2,1]);
  assert.equal(await page.locator('.bracket-team.winner').count(),24);
  const grouped=await page.evaluate(async()=>{const {groupCupMatches}=await import('/js/cup.js');return groupCupMatches([{id:'1',round_label:' Semifinais '},{id:'2',round_label:'SEMIFINAL'},{id:'3',round_label:'Final'},{id:'4',round_label:'Quartas'},{id:'5',round_label:'Fase 10'},{id:'6',round_label:'Fase 2'},{id:'7',round_label:'__proto__'},{id:'8',round_label:'Disputa de 3º lugar'}]).map(p=>[p.label,p.matches.length]);});
  assert.deepEqual(grouped,[['Fase 2',1],['Fase 10',1],['__proto__',1],['Quartas de final',1],['Semifinal',2],['Final',1],['Disputa de 3º lugar',1]]);
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'cup overflow '+width);
   await page.selectOption('#cupPhase','4');assert.equal(await page.locator('.bracket-card').count(),1);assert.equal(await page.locator('.bracket-round').getAttribute('aria-label'),'Final');
   await page.selectOption('#cupPhase','all');assert.equal(await page.locator('.bracket-card').count(),31);
   await page.locator('#bracket').evaluate(el=>el.scrollLeft=el.scrollWidth);assert(await page.locator('#bracket').evaluate(el=>el.scrollLeft>0),'last round reachable '+width);
  }
  await page.setViewportSize({width:390,height:844});await page.selectOption('#cupPhase','2');await page.locator('#copa').screenshot({path:path.join(base,'test-artifacts/preview-cup-mobile.png')});
  await page.setViewportSize({width:1440,height:1000});await page.selectOption('#cupPhase','all');await page.locator('#bracket').evaluate(el=>el.scrollLeft=el.scrollWidth);await page.locator('#copa').screenshot({path:path.join(base,'test-artifacts/preview-cup-desktop.png')});
  console.log('PASS: 32 teams, 31 matches, five ordered phases, winners, aliases, numeric phases, safe grouping, filters and scroll at 320/390/768/1440');
  await page.goto('http://127.0.0.1:4174/admin.html');await page.getByRole('button',{name:'Partidas',exact:false}).click();await page.selectOption('#matchCompetition','cup');
  assert.equal(await page.locator('[name=round]').inputValue(),'Oitavas de final');assert.equal(await page.locator('#cupPhases option').count(),7);
  await page.locator('[name=round]').fill('semifinais');await page.selectOption('#partA','t0');await page.selectOption('#partB','t4');await page.getByRole('button',{name:'Criar partida',exact:true}).click();
  await page.waitForFunction(()=>window.__write?.table==='matches');assert.equal(await page.evaluate(()=>window.__write.payload.round_label),'Semifinal');
  await page.getByRole('button',{name:'Resultados',exact:false}).click();await page.selectOption('#resultMatch','r4-0');await page.locator('#crownsA').fill('2');await page.locator('#crownsB').fill('2');
  await page.evaluate(()=>window.__write=null);await page.getByRole('button',{name:'Salvar resultado'}).click();assert(await page.getByText('Na Copa precisa existir um vencedor.',{exact:true}).isVisible());assert.equal(await page.evaluate(()=>window.__write),null);
  assert.deepEqual(errors,[]);console.log('PASS: Admin phase presets, canonical phase save and tied cup result rejected (mock backend)');
  // The pre-tournament and champion presentations must reflect actual results.
  async function loadScenario(scenario){
   await page.route('**/js/supabase-client.js',route=>route.fulfill({contentType:'text/javascript',body:'export const configured=true;const fixtures='+JSON.stringify(scenario)+';export const supabase={from(table){return {select(){return this},order(){return this},eq(){return this},maybeSingle(){return this},then(resolve,reject){return Promise.resolve({data:table==="site_settings"?{settings:{}}:fixtures[table]||[],error:null}).then(resolve,reject)}}}};'}));
   await page.goto('http://127.0.0.1:4174');await page.waitForSelector('#pageLoader',{state:'detached'});
  }
  await loadScenario({...fixtures,competitions:[...fixtures.competitions,{id:'league',kind:'LEAGUE',active:true,mode:'DUO'}],matches:[{id:'l1',competition_id:'league',status:'FINISHED'},{id:'l2',competition_id:'league',status:'SCHEDULED'}]});

  assert.equal(await page.locator('#cupProgress progress').getAttribute('value'),'1');
  assert.equal(await page.locator('#cupProgress progress').getAttribute('max'),'2');
  assert(await page.locator('.cup-waiting').isVisible());
  assert(await page.locator('#cupTools').isHidden());
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'waiting overflow '+width);}
  await page.locator('#copa').screenshot({path:path.join(base,'test-artifacts/preview-cup-waiting.png')});
  await loadScenario({...fixtures,matches:[{...matches.find(m=>m.round_label==='Final'),status:'FINISHED',crowns_a:3,crowns_b:1}]});

  assert.equal(await page.locator('.final-destination strong').textContent(),'Dupla 01');
  await page.locator('.cup-phase-nav button').click();
  assert.equal(await page.locator('#cupPhase').inputValue(),'0');
  assert.equal(await page.locator('.cup-phase-nav button').getAttribute('aria-pressed'),'true');
  assert(await page.locator('#cupScrollHint').isHidden());
  assert.deepEqual(errors,[]);
  console.log('PASS: pending qualification, progress, empty state widths, champion and phase shortcuts');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
