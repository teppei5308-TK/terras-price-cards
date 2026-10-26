(function(root){
  'use strict';
  function nameFacts(input){
    return {kind:String(input.kind||'').trim(),materials:[...new Set(String(input.materials||'').split(/[、,\n]/).map(x=>x.trim()).filter(Boolean))],taste:String(input.taste||'').trim(),texture:String(input.texture||'').trim()};
  }
  function nameCandidates(input,iteration=0){
    const f=nameFacts(input),errors=[];
    if(!f.kind)errors.push('パンの種類を入力してください。');
    if(!f.materials.length)errors.push('主な材料を具体的に入力してください。気まぐれパンも内容が必要です。');
    if(f.kind.length>80||f.materials.join('、').length>300||f.taste.length>100||f.texture.length>100)errors.push('入力が長すぎます。種類80文字、材料300文字、味と食感は各100文字までです。');
    if(errors.length)return {facts:f,errors,candidates:[]};
    const i=f.materials.join('と'),k=f.kind,t=f.taste,x=f.texture;
    const names=[i+'の'+k+(t?' 〜'+t+'〜':'')+(x?'（'+x+'）':''),[x,t,i+'の'+k].filter(Boolean).join(' '),k+'（'+[i,t,x].filter(Boolean).join('・')+'）',i+'の'+k,[i,k].join(' '),k+'（'+i+'）'];
    if(t)names.push(t+'・'+i+'の'+k,i+'と'+t+'の'+k,k+'（'+i+'・'+t+'）');
    if(x)names.push(x+' '+i+'の'+k,i+'の'+x+' '+k,k+'（'+i+'・'+x+'）');
    if(t&&x)names.push([x,t,i+'の'+k].join(' '),k+'（'+[i,t,x].join('・')+'）');
    const unique=[...new Set(names)],start=Math.abs(Math.trunc(iteration))%unique.length;
    return {facts:f,errors:[],candidates:unique.slice(start).concat(unique.slice(0,start))};
  }
  const api={nameFacts,nameCandidates};
  if(typeof module!=='undefined')module.exports=api;else Object.assign(root.Terras,api);
})(typeof window==='undefined'?globalThis:window);
