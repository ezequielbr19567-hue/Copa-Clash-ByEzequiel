export const knockoutPhases = ['16 avos de final', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final', 'Disputa de 3º lugar'];

export const defaultCupFormat = {
  groups: ['1', '2', '3', '4'],
  qualifiers_per_group: 4,
  points_win: 3,
  points_draw: 1,
  points_loss: 0,
  points_loss_three_crowns: -1,
  knockout_mode: 'AUTO_CROSS'
};

const safeInt = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeCupFormat(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const groups = Array.isArray(raw.groups)
    ? raw.groups.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, 16)
    : defaultCupFormat.groups;
  const uniqueGroups = [...new Set(groups)];
  return {
    groups: uniqueGroups.length ? uniqueGroups : [...defaultCupFormat.groups],
    qualifiers_per_group: safeInt(raw.qualifiers_per_group, defaultCupFormat.qualifiers_per_group, 1, 16),
    points_win: safeInt(raw.points_win, defaultCupFormat.points_win, -9, 20),
    points_draw: 1, // Regra do campeonato: um ponto para ambos, inclusive configurações antigas.
    points_loss: safeInt(raw.points_loss, defaultCupFormat.points_loss, -9, 20),
    points_loss_three_crowns: safeInt(raw.points_loss_three_crowns, defaultCupFormat.points_loss_three_crowns, -9, 20),
    knockout_mode: raw.knockout_mode === 'MANUAL' ? 'MANUAL' : 'AUTO_CROSS'
  };
}

export function phaseInfo(label) {
  const clean = String(label ?? '').trim().replace(/\s+/g, ' ');
  const key = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/^(disputa (de|do) )?(3[ºo°.]?|terceiro) lugar$/.test(key)) return { key:'third', label:'Disputa de 3º lugar', order:1001 };
  if (/^(grande )?fina(l|is)$/.test(key)) return { key:'final', label:'Final', order:1000 };
  if (/^semi[- ]?fina(l|is)$/.test(key)) return { key:'semi', label:'Semifinal', order:999 };
  if (/^quartas?( de fina(l|is))?$/.test(key)) return { key:'quarter', label:'Quartas de final', order:998 };
  if (/^oitavas?( de fina(l|is))?$/.test(key)) return { key:'eighth', label:'Oitavas de final', order:997 };
  const fraction = key.match(/^(32|16|8|4|2)\s*(?:avos?(?: de final)?|\/\s*(?:final|finais))$/);
  if (fraction) {
    const size = Number(fraction[1]);
    const names = { 2:'Semifinal', 4:'Quartas de final', 8:'Oitavas de final', 16:'16 avos de final', 32:'32 avos de final' };
    const keys = { 2:'semi', 4:'quarter', 8:'eighth', 16:'sixteenth', 32:'thirtysecond' };
    return { key:keys[size], label:names[size], order:1000-Math.log2(size) };
  }
  const numbered = key.match(/^(?:fase|rodada)\s+(\d+)$/);
  return { key:key || 'undefined', label:clean || 'A definir', order:numbered ? Math.min(Number(numbered[1]), 900) : 950 };
}

export function groupKnockoutMatches(matches) {
  const groups = new Map();
  for (const match of matches.filter(m => (m.stage_type || 'KNOCKOUT') === 'KNOCKOUT')) {
    const phase = phaseInfo(match.round_label);
    if (!groups.has(phase.key)) groups.set(phase.key, { ...phase, matches:[] });
    groups.get(phase.key).matches.push(match);
  }
  return [...groups.values()]
    .sort((a,b)=>a.order-b.order || a.label.localeCompare(b.label,'pt-BR',{numeric:true}))
    .map(group=>({
      ...group,
      matches:group.matches.sort((a,b)=>(Number(a.bracket_order)||9999)-(Number(b.bracket_order)||9999) || String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id),'pt-BR',{numeric:true}))
    }));
}

export function formatVictoryTime(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '—';
  const total = Math.round(value);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2,'0')}`;
}

export function parseVictoryTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    return seconds > 0 && seconds <= 60 * 60 ? seconds : null;
  }
  const match = raw.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds > 0 && seconds <= 60 * 60 ? seconds : null;
}

function rowTimeScore(row) {
  if (!row.v || row.timed_wins !== row.v) return Number.POSITIVE_INFINITY;
  return row.win_time_seconds;
}

export function calculateGroupStandings({ entries = [], matches = [], groupLabel, format, nameFor = id => String(id) }) {
  const f = normalizeCupFormat(format);
  const ids = entries.filter(e => e.group_label === groupLabel).map(e => e.participant_id);
  const rows = new Map(ids.map(id => [id, {
    id, name:nameFor(id), j:0, v:0, e:0, d:0, cf:0, cs:0, sg:0, pts:0,
    win_time_seconds:0, timed_wins:0, time_complete:false
  }]));

  matches
    .filter(m => (m.stage_type || 'KNOCKOUT') === 'GROUP' && m.group_label === groupLabel && m.status === 'FINISHED' && m.crowns_a != null && m.crowns_b != null)
    .forEach(m => {
      const a = rows.get(m.participant_a), b = rows.get(m.participant_b);
      if (!a || !b) return;
      const ca = Number(m.crowns_a), cb = Number(m.crowns_b);
      a.j++; b.j++; a.cf += ca; a.cs += cb; b.cf += cb; b.cs += ca;
      if (ca === cb) {
        a.e++; b.e++; a.pts += f.points_draw; b.pts += f.points_draw;
        return;
      }
      const winner = ca > cb ? a : b;
      const loser = ca > cb ? b : a;
      winner.v++; loser.d++; winner.pts += f.points_win;
      loser.pts += Math.abs(ca - cb) === 3 ? f.points_loss_three_crowns : f.points_loss;
      const time = Number(m.victory_time_seconds);
      if (Number.isFinite(time) && time > 0) {
        winner.win_time_seconds += time;
        winner.timed_wins++;
      }
    });

  const result = [...rows.values()].map(row => ({
    ...row,
    sg:row.cf-row.cs,
    time_complete:row.v > 0 && row.timed_wins === row.v
  }));
  result.sort((a,b) => b.pts-a.pts || b.sg-a.sg || rowTimeScore(a)-rowTimeScore(b) || a.name.localeCompare(b.name,'pt-BR',{numeric:true,sensitivity:'base'}));
  return result;
}

const pairKey = (a,b) => [String(a),String(b)].sort().join('|');

export function groupIsComplete({ entries = [], matches = [], groupLabel }) {
  const ids = entries.filter(e => e.group_label === groupLabel).map(e => e.participant_id);
  if (ids.length < 2) return false;
  const expected = new Set();
  for (let i=0;i<ids.length;i++) for (let j=i+1;j<ids.length;j++) expected.add(pairKey(ids[i],ids[j]));
  const finished = new Set(
    matches
      .filter(m => (m.stage_type || 'KNOCKOUT') === 'GROUP' && m.group_label === groupLabel && m.status === 'FINISHED')
      .map(m => pairKey(m.participant_a,m.participant_b))
  );
  return [...expected].every(key => finished.has(key));
}

export function roundLabelForSize(size) {
  return ({32:'16 avos de final',16:'Oitavas de final',8:'Quartas de final',4:'Semifinal',2:'Final'})[Number(size)] || `Mata-mata ${size}`;
}

export function roundCodeForSize(size) { return `R${Number(size)}`; }

export function knockoutSeedPreview({ entries = [], matches = [], format, nameFor = id => String(id) }) {
  const f = normalizeCupFormat(format);
  const groups = f.groups;
  const total = groups.length * f.qualifiers_per_group;
  if (groups.length < 2 || groups.length % 2 !== 0) return { ready:false, complete:false, reason:'A chave automática precisa de uma quantidade par de grupos.', pairs:[] };
  if (total < 2 || (total & (total - 1)) !== 0) return { ready:false, complete:false, reason:'O total de classificados precisa formar uma chave de 2, 4, 8, 16 ou 32 participantes.', pairs:[] };

  const standings = new Map();
  const pendingGroups = [];
  for (const group of groups) {
    const rows = calculateGroupStandings({ entries, matches, groupLabel:group, format:f, nameFor });
    if (rows.length < f.qualifiers_per_group) return { ready:false, complete:false, reason:`O Grupo ${group} ainda não tem participantes suficientes.`, pairs:[], standings };
    standings.set(group, rows);
    if (!groupIsComplete({ entries, matches, groupLabel:group })) pendingGroups.push(group);
  }

  const pairs = [];
  for (let pairIndex=0; pairIndex<groups.length/2; pairIndex++) {
    const highGroup = groups[groups.length - 1 - pairIndex];
    const lowGroup = groups[pairIndex];
    const highRows = standings.get(highGroup);
    const lowRows = standings.get(lowGroup);
    for (let rank=0; rank<f.qualifiers_per_group; rank++) {
      const a = highRows[rank];
      const b = lowRows[f.qualifiers_per_group - 1 - rank];
      pairs.push({
        participant_a:a.id,
        participant_b:b.id,
        seed_a:{group:highGroup,position:rank+1},
        seed_b:{group:lowGroup,position:f.qualifiers_per_group-rank}
      });
    }
  }
  return {
    ready:true,
    complete:pendingGroups.length===0,
    pending_groups:pendingGroups,
    reason:pendingGroups.length ? `Classificação em andamento: Grupo ${pendingGroups[0]} ainda tem partidas pendentes.` : '',
    pairs, standings, size:total, round_label:roundLabelForSize(total), round_code:roundCodeForSize(total)
  };
}

export function knockoutSeedPlan(args) {
  const preview = knockoutSeedPreview(args);
  if (!preview.ready) return preview;
  if (!preview.complete) return { ...preview, ready:false };
  return { ...preview, ready:true, reason:'' };
}

export function winnerOf(match) {
  if (!match || match.status !== 'FINISHED' || match.crowns_a == null || match.crowns_b == null || Number(match.crowns_a) === Number(match.crowns_b)) return null;
  return Number(match.crowns_a) > Number(match.crowns_b) ? match.participant_a : match.participant_b;
}

export function roundRobinSchedule(participantIds = []) {
  const ids = [...participantIds];
  if (ids.length < 2) return [];
  if (ids.length % 2) ids.push(null);
  const rounds = [];
  const n = ids.length;
  let rotation = [...ids];
  for (let round=0; round<n-1; round++) {
    const games = [];
    for (let i=0;i<n/2;i++) {
      const a = rotation[i], b = rotation[n-1-i];
      if (a && b) games.push({ participant_a:a, participant_b:b, round:round+1 });
    }
    rounds.push(...games);
    rotation = [rotation[0], rotation[n-1], ...rotation.slice(1,n-1)];
  }
  return rounds;
}

// Alias mantido para compatibilidade com integrações antigas.
export const groupCupMatches = groupKnockoutMatches;
