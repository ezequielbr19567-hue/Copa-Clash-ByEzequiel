function driveFileId(url) {
  const host=url.hostname.replace(/^www\./,'').toLowerCase();
  if (host !== 'drive.google.com' && host !== 'docs.google.com') return '';
  const parts=url.pathname.split('/').filter(Boolean);
  const fileIndex=parts.indexOf('file');
  if (fileIndex>=0 && parts[fileIndex+1]==='d' && parts[fileIndex+2]) return parts[fileIndex+2];
  const dIndex=parts.indexOf('d');
  if (dIndex>=0 && parts[dIndex+1]) return parts[dIndex+1];
  return url.searchParams.get('id') || '';
}

export function videoInfo(value) {
  if(!value) return null;
  try{
    const url=new URL(value); if(url.protocol!=='https:') return null;
    const host=url.hostname.replace(/^www\./,'').toLowerCase();
    const driveId=driveFileId(url);
    if(driveId) return {
      type:'embed',
      provider:'drive',
      src:`https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`,
      href:`https://drive.google.com/file/d/${encodeURIComponent(driveId)}/view`,
      label:'Google Drive'
    };
    if(host==='youtu.be'){
      const id=url.pathname.split('/').filter(Boolean)[0];
      if(id) return {type:'embed',provider:'youtube',src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,href:url.href,label:'YouTube'};
    }
    if(host==='youtube.com' || host==='m.youtube.com'){
      let id=url.searchParams.get('v');
      const parts=url.pathname.split('/').filter(Boolean);
      if(!id && ['shorts','embed','live'].includes(parts[0])) id=parts[1];
      if(id) return {type:'embed',provider:'youtube',src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,href:url.href,label:'YouTube'};
    }
    if(host==='vimeo.com' || host.endsWith('.vimeo.com')){
      const id=url.pathname.split('/').filter(Boolean).find(x=>/^\d+$/.test(x));
      if(id) return {type:'embed',provider:'vimeo',src:`https://player.vimeo.com/video/${id}`,href:url.href,label:'Vimeo'};
    }
    if(/\.(mp4|webm|ogg)(?:$|\?)/i.test(url.href)) return {type:'video',provider:'direct',src:url.href,href:url.href,label:'Vídeo'};
    return {type:'link',provider:'link',src:url.href,href:url.href,label:'Abrir vídeo'};
  }catch{return null;}
}
