// Phase names remain compatible with existing round_label records.
export const cupPhases = ['32 avos de final', '16 avos de final', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final', 'Disputa de 3º lugar'];

export function phaseInfo(label) {
  const clean = String(label ?? '').trim().replace(/\s+/g, ' ');
  const key = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/^(disputa (de|do) )?(3[ºo°.]?|terceiro) lugar$/.test(key)) return { key:'third', label:cupPhases[6], order:1001 };
  if (/^(grande )?fina(l|is)$/.test(key)) return { key:'final', label:cupPhases[5], order:1000 };
  if (/^semi[- ]?fina(l|is)$/.test(key)) return { key:'semi', label:cupPhases[4], order:999 };
  if (/^quartas?( de fina(l|is))?$/.test(key)) return { key:'quarter', label:cupPhases[3], order:998 };
  if (/^oitavas?( de fina(l|is))?$/.test(key)) return { key:'eighth', label:cupPhases[2], order:997 };
  const fraction = key.match(/^(32|16|8|4|2)\s*(?:avos?(?: de final)?|\/\s*(?:final|finais))$/);
  if (fraction) {
    const size = Number(fraction[1]);
    const names = { 2:'Semifinal', 4:'Quartas de final', 8:'Oitavas de final', 16:cupPhases[1], 32:cupPhases[0] };
    const keys = { 2:'semi', 4:'quarter', 8:'eighth', 16:'sixteenth', 32:'thirtysecond' };
    return { key:keys[size], label:names[size], order:1000-Math.log2(size) };
  }
  const numbered = key.match(/^(?:fase|rodada)\s+(\d+)$/);
  return { key:key || 'undefined', label:clean || 'A definir', order:numbered ? Math.min(Number(numbered[1]), 900) : 950 };
}

export function groupCupMatches(matches) {
  const groups = new Map();
  for (const match of matches) {
    const phase = phaseInfo(match.round_label);
    if (!groups.has(phase.key)) groups.set(phase.key, { ...phase, matches:[] });
    groups.get(phase.key).matches.push(match);
  }
  return [...groups.values()].sort((a,b)=>a.order-b.order || a.label.localeCompare(b.label,'pt-BR',{numeric:true})).map(group=>({
    ...group,
    // Creation order is stable when match dates or scores change.
    matches:group.matches.sort((a,b)=>String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id),'pt-BR',{numeric:true}))
  }));
}
