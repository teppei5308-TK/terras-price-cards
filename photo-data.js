(function(root){
  'use strict';
  const maxBytes=150000,maxSide=512,maxSourceBytes=10*1024*1024,maxRequestBytes=206000,maxMultiRequestBytes=830000;
  function sanitize(url){
    const prefix='data:image/jpeg;base64,';
    if(typeof url!=='string'||!url.startsWith(prefix)||url.length>prefix.length+Math.ceil(maxBytes/3)*4)throw new Error('写真は縮小済みのJPEGにしてください。');
    const base64=url.slice(prefix.length);
    if(base64.length%4||!base64||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new Error('写真の形式を確認できません。');
    let binary;try{binary=atob(base64);}catch{throw new Error('写真の形式を確認できません。');}
    if(btoa(binary)!==base64||binary.length>maxBytes)throw new Error('写真のサイズまたは形式を確認してください。');
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    if(bytes[0]!==255||bytes[1]!==216)throw new Error('JPEG写真を読み直してください。');
    const parts=[bytes.slice(0,2)];let offset=2,frame=false,scan=false;
    while(offset<bytes.length){
      const start=offset;if(bytes[offset++]!==255)throw new Error('写真が壊れています。');
      const marker=bytes[offset++];
      if(marker===218){
        if(!frame||offset+2>bytes.length)throw new Error('写真の寸法を確認できません。');
        const length=bytes[offset]*256+bytes[offset+1];
        if(length<6||offset+length>bytes.length)throw new Error('写真が壊れています。');
        offset+=length;
        while(offset<bytes.length){
          if(bytes[offset++]!==255)continue;
          const next=bytes[offset++];if(next===0||(next>=208&&next<=215))continue;
          if(next!==217||offset!==bytes.length)throw new Error('対応していないJPEG写真です。');
          scan=true;break;
        }
        if(!scan)throw new Error('写真が途中で切れています。');
        parts.push(bytes.slice(start));break;
      }
      if(offset+2>bytes.length)throw new Error('写真が壊れています。');
      const length=bytes[offset]*256+bytes[offset+1];
      if(length<2||offset+length>bytes.length)throw new Error('写真が壊れています。');
      if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){
        if(marker!==192||frame||length<11||bytes[offset+2]!==8)throw new Error('写真を選び直してください。');
        const height=bytes[offset+3]*256+bytes[offset+4],width=bytes[offset+5]*256+bytes[offset+6];
        if(!height||!width||height>maxSide||width>maxSide)throw new Error('写真は512px以内に縮小してください。');
        frame=true;
      }
      if(!((marker>=224&&marker<=239)||marker===254))parts.push(bytes.slice(start,offset+length));
      offset+=length;
    }
    if(!frame||!scan)throw new Error('写真を読み直してください。');
    const clean=new Uint8Array(parts.reduce((n,x)=>n+x.length,0));let at=0;
    for(const part of parts){clean.set(part,at);at+=part.length;}
    return prefix+btoa(Array.from(clean,c=>String.fromCharCode(c)).join(''));
  }
  const api={maxBytes,maxSide,maxSourceBytes,maxRequestBytes,maxMultiRequestBytes,sanitize};
  root.TerrasPhotoData=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
