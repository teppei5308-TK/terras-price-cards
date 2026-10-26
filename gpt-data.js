(function(root){
  'use strict';
  const layouts=['classic','left','accent'],accents=['none','olive','rust','gold'];
  const fields={request:500,kind:80,materials:300,taste:100,texture:100};
  function input(raw,{allowAdviceOnly=false}={}){
    if(!raw||typeof raw!=='object')throw new Error('入力の形式が正しくありません。');
    const out={};
    for(const [k,max] of Object.entries(fields)){
      if(typeof raw[k]!=='string'||raw[k].trim().length>max)throw new Error('入力が長すぎるか、形式が異なります。');
      out[k]=raw[k].trim();
    }
    if((!out.kind||!out.materials)&&!allowAdviceOnly)throw new Error('名前も作る場合は、確認済みのパンの種類と材料を入力してください。写真だけの相談もできます。');
    if(![3,4,5,6].includes(raw.count))throw new Error('候補数は3〜6案です。');
    return {...out,count:allowAdviceOnly&&(!out.kind||!out.materials)?0:raw.count};
  }
  function candidate(c){
    const keys=['name','description','theme','layout','accent','nameSize','descriptionSize'];
    if(!c||typeof c!=='object'||Object.keys(c).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(c,k)))throw new Error('候補の形式が正しくありません。');
    if(typeof c.name!=='string'||!c.name.trim()||c.name.length>500||typeof c.description!=='string'||c.description.length>1000)throw new Error('候補の文章が長すぎるか空です。');
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(c.name+c.description))throw new Error('候補に不正な文字があります。');
    if(!['black','white'].includes(c.theme)||!layouts.includes(c.layout)||!accents.includes(c.accent)||![16,17,18].includes(c.nameSize)||![8,9].includes(c.descriptionSize))throw new Error('対応していないデザインです。');
    return Object.fromEntries(keys.map(k=>[k,c[k]]));
  }
  function response(raw,count){
    if(!raw||Object.keys(raw).some(k=>k!=='candidates')||!Array.isArray(raw.candidates)||raw.candidates.length!==count)throw new Error('候補数または応答の形式が正しくありません。');
    return raw.candidates.map(candidate);
  }
  function adopt(product,c){return {...product,...candidate(c)};}
  const api={layouts,accents,input,candidate,response,adopt};
  root.TerrasGPTData=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
