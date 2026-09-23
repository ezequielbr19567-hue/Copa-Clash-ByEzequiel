const fs=require('fs'),path=require('path'),assert=require('assert');
const base=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(base,f),'utf8');
const html=read('index.html'),admin=read('js/admin.js'),app=read('js/app.js'),css=read('css/style.css'),client=read('js/supabase-client.js');

for(const id of ['grupos','mata-mata','partidas','groupsGrid','bracket','matchesList','participantCount','groupCount']){
  assert(html.includes(`id="${id}"`),`missing #${id}`);
}
assert(!/id="campeonato"|data-filter="LEAGUE"|>Classifica[cç][aã]o</i.test(html),'legacy league UI still present');
assert(!/Nova dupla 2v2|navButton\('teams'|Campeonato \/ pontos corridos/.test(admin),'legacy duo/league admin still present');
assert(/competition_entries/.test(app),'public app must load group entries');
assert(/\.eq\('kind','CUP'\)/.test(app),'public app should query only cups');
assert(/\.eq\('team_type','SOLO'\)/.test(app),'public app should query only solo participants');
assert(/\.in\('match_id',matchIds\)/.test(app),'public app should limit game logs to active cup matches');
assert(/syncAutomaticKnockout/.test(admin)&&/knockoutSeedPreview/.test(app),'admin must advance knockout automatically and public UI must show live seeding');
assert(/video_url/.test(admin)&&/renderVideo/.test(app)&&/media\.js\?v=4/.test(app),'match videos must be editable and rendered through the media helper');
assert(/victory_time_seconds/.test(admin)&&/formatVictoryTime/.test(app),'victory time tiebreak must be wired');
assert(/localStorage/.test(client)&&/clash-supabase-config-v1/.test(client),'Supabase connection must persist in browser storage');
assert(html.includes('js/config.js?v=4'),'config script should be cache-busted');
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'CSS braces mismatch');
console.log('PASS: persistent Supabase config, auto knockout, videos and mobile cup UI');
