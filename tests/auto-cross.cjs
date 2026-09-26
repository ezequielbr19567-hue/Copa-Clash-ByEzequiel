const assert=require('assert'),fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright');
const base=path.resolve(__dirname,'..');
const competition={id:'cup',name:'Copa',kind:'CUP',mode:'SOLO',active:true,format_config:{groups:['1','2','3','4'],qualifiers_per_group:4,knockout_mode:'AUTO_CROSS'}};
const teams=[],groups=[];
for(let g=1;g<=4;g++){
 for(let n=1;n<=5;n++)teams.push({id:`g${g}p${n}`,name:`Participante ${g}${n}`,team_type:'SOLO'});
 for(let a=1;a<=5;a++)for(let b=a+1;b<=5;b++)groups.push({id:`group${g}-${a}-${b}`,competition_id:'cup',stage_type:'GROUP',group_label:String(g),round_label:'Rodada 1',participant_a:`g${g}p${a}`,participant_b:`g${g}p${b}`,status:'FINISHED',crowns_a:3,crowns_b:1});
}
(async()=>{
 const {buildKnockout,resultMatches}=await import('../js/knockout.js');
 let tree=buildKnockout(competition,[],teams);assert.deepEqual(tree.phases.map(p=>p.matches.length),[8,4,2,1]);assert(!tree.qualified);
 assert.deepEqual(tree.phases[0].matches.map(m=>[m.source_a,m.source_b]),[
 ['1º do grupo 4','4º do grupo 1'],['2º do grupo 4','3º do grupo 1'],['3º do grupo 4','2º do grupo 1'],['4º do grupo 4','1º do grupo 1'],
 ['1º do grupo 3','4º do grupo 2'],['2º do grupo 3','3º do grupo 2'],['3º do grupo 3','2º do grupo 2'],['4º do grupo 3','1º do grupo 2']]);
 assert.deepEqual(tree.phases[1].matches.map(m=>[m.source_a,m.source_b]),[['Vencedor do duelo 1','Vencedor do duelo 2'],['Vencedor do duelo 3','Vencedor do duelo 4'],['Vencedor do duelo 5','Vencedor do duelo 6'],['Vencedor do duelo 7','Vencedor do duelo 8']]);
 assert.deepEqual([tree.phases[3].matches[0].source_a,tree.phases[3].matches[0].source_b],['Vencedor do duelo 13','Vencedor do duelo 14']);
 const pending=groups.map((m,i)=>i?m:{...m,status:'SCHEDULED',crowns_a:null,crowns_b:null});
 assert(!buildKnockout(competition,pending,teams).qualified);
 let saved=[...groups];tree=buildKnockout(competition,saved,teams);assert(tree.qualified);
 assert.deepEqual(tree.phases[0].matches.map(m=>[m.participant_a,m.participant_b]),[['g4p1','g1p4'],['g4p2','g1p3'],['g4p3','g1p2'],['g4p4','g1p1'],['g3p1','g2p4'],['g3p2','g2p3'],['g3p3','g2p2'],['g3p4','g2p1']]);
 for(let r=0;r<4;r++){
  tree=buildKnockout(competition,saved,teams);
  for(const m of tree.phases[r].matches){assert(m.participant_a&&m.participant_b);saved.push({...m,id:'saved-'+m.bracket_key,status:'FINISHED',crowns_a:3,crowns_b:1});}
 }
 tree=buildKnockout(competition,saved,teams);assert.equal(tree.phases[3].matches[0].participant_a,'g4p1');assert.equal(tree.phases[3].matches[0].participant_b,'g3p1');assert.equal(tree.phases[3].matches[0].status,'FINISHED');
 const changed=saved.map(m=>m.bracket_key==='auto-cross:r1:m1'?{...m,crowns_a:0,crowns_b:3}:m);
 tree=buildKnockout(competition,changed,teams);assert(tree.phases[1].matches[0].stale);assert.equal(tree.phases[1].matches[0].crowns_a,null);assert.equal(tree.phases[3].matches[0].status,'SCHEDULED');
 const tied=saved.map(m=>m.bracket_key==='auto-cross:r1:m1'?{...m,crowns_a:2,crowns_b:2}:m);assert.equal(buildKnockout(competition,tied,teams).phases[1].matches[0].participant_a,null);
 console.log('PASS: exact image seeding, empty/pending/complete groups, full advance to final, corrections invalidate downstream scores, ties do not advance');
 const fixtures={teams,players:[],team_members:[],competitions:[competition],matches:groups,match_games:[]};
 const server=http.createServer((req,res)=>{const f=path.join(base,req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);fs.readFile(f,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png'})[path.extname(f)]||'text/plain');res.end(b);});});
 await new Promise(r=>server.listen(4176,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
  await page.route('**/js/supabase-client.js',route=>route.fulfill({contentType:'text/javascript',body:`export const configured=true;const fixtures=${JSON.stringify(fixtures)};window.__fixtures=fixtures;export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'admin'}}}})},rpc:async()=>({data:true}),from(table){let payload,id,mode;return {select(){return this},order(){return this},maybeSingle(){return this},eq(k,v){if(k==='id')id=v;return this},insert(p){payload=p;mode='insert';return this},update(p){payload=p;mode='update';return this},then(resolve,reject){if(payload){if(mode==='insert')fixtures[table].push({...payload,id:'new-'+fixtures[table].length});else Object.assign(fixtures[table].find(m=>m.id===id),payload);window.__write=payload;}return Promise.resolve({error:null,data:table==='site_settings'?{settings:{}}:fixtures[table]||[]}).then(resolve,reject)}}}};`}));
  await page.goto('http://127.0.0.1:4176');await page.waitForSelector('#pageLoader',{state:'detached'});assert.equal(await page.locator('.bracket-card').count(),15);await page.waitForFunction(()=>document.querySelectorAll('.bracket-connections path').length===7);
  const geometry=await page.evaluate(()=>{const rounds=[...document.querySelectorAll('.bracket-round')];return rounds.slice(1).flatMap((round,r)=>[...round.querySelectorAll('.bracket-card')].map((target,i)=>{const cards=rounds[r].querySelectorAll('.bracket-card'),a=cards[2*i].getBoundingClientRect(),b=cards[2*i+1].getBoundingClientRect(),c=target.getBoundingClientRect();return Math.abs((a.top+a.height/2+b.top+b.height/2)/2-(c.top+c.height/2));}));});assert(geometry.every(d=>d<2),JSON.stringify(geometry));
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);await page.selectOption('#cupPhase','3');assert.equal(await page.locator('.bracket-card').count(),1);await page.selectOption('#cupPhase','all');await page.locator('#bracket').evaluate(el=>el.scrollLeft=el.scrollWidth);assert(await page.locator('#bracket').evaluate(el=>el.scrollWidth<=el.clientWidth||el.scrollLeft>0));}
  await page.setViewportSize({width:1600,height:1100});await page.locator('#bracket').evaluate(el=>el.scrollLeft=0);await page.locator('#copa').screenshot({path:path.join(base,'test-artifacts/preview-knockout-tree.png')});
  await page.goto('http://127.0.0.1:4176/admin.html');await page.getByRole('button',{name:'Resultados',exact:false}).click();assert.equal(await page.locator('#resultMatch option').count(),49);
  for(const key of ['auto-cross:r1:m1','auto-cross:r1:m2']){await page.selectOption('#resultMatch',key);await page.locator('#crownsA').fill('3');await page.locator('#crownsB').fill('1');await page.getByRole('button',{name:'Salvar resultado'}).click();await page.getByText('Resultado salvo. Chaveamento atualizado.',{exact:true}).waitFor();}
  assert(await page.locator('#resultMatch option[value="auto-cross:r2:m1"]').count());
  const writes=await page.evaluate(()=>window.__fixtures.matches.filter(m=>m.stage_type==='KNOCKOUT'));assert.equal(writes.length,2);assert.equal(writes[0].participant_a,'g4p1');assert.equal(writes[0].participant_b,'g1p4');assert.deepEqual(errors,[]);
  console.log('PASS: 15 visible nodes, seven aligned feeder connections, responsive scroll, final filter, Admin saves virtual duels and unlocks quarterfinal');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
