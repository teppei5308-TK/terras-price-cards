(function(root){
  'use strict';
  // GT-bot（Google Apps Script）経由で、決めたLINEグループ（社長が入っている）へ新商品相談を流す。
  // 日報と同じ返信方式：ここでは受付だけ→スタッフが受付番号「#P…」をLINEでグループに送る→GT-botがその投稿に返信して流す（通数ゼロ）。
  // 投稿キーはGT-bot側のスクリプトプロパティ PRODUCT_POST_KEY と同じ値。画面から見える値なので、GT-bot側で1日20件・重複なしに制限している。
  const ENDPOINT='https://script.google.com/macros/s/AKfycbxG0dfLIkD4fiRS3flTMpszF6c-LmHOJdo-WwKdOnYBHK3Xd1u5UKJq-QMa3i1TiBSZEA/exec';
  const KEY='tpc_0E3YXQfaGHwq425pgs_CCFcHfW3DkwLN';
  const MAX_PHOTOS=3,DECISIONS=['OK','直して','NG'];
  // LINEでは返事をボタンで受けるので、文面の「返信してください」の行は外す
  function lineText(text){return String(text).split('\n').filter(line=>!line.startsWith('社長へ：')).join('\n');}
  // card：商品名と売価から描いたカード画像（JPEGのデータURL）。GT-botが返事ボタンの上に載せる
  function payload(review,text,photos,card){
    return {action:'productConsult',key:KEY,payload:{id:review.id,kind:review.kind,proposer:review.proposer,text:lineText(text),candidates:review.candidates.map(c=>c.name),photos:photos.slice(0,MAX_PHOTOS).map(({view,data})=>({view,data})),...(card?{card}:{})}};
  }
  // LINEの「送り先を選ぶ」画面を開くリンク。本文に受付番号を入れる
  function shareUrl(review,receipt){
    if(!/^P\d{11}$/.test(String(receipt)))throw new Error('受付番号を受け取れませんでした。もう一度押してください。');
    return 'https://line.me/R/share?text='+encodeURIComponent('【新商品相談】'+review.kind+'\n#'+receipt);
  }
  // GT-botの返事を、相談履歴の decision / chosen / note の形にそろえる。知らない値は無視する。社長の返事は内容へのコメントが主で、名前の選択は任意
  function reply(item,candidateCount){
    if(!item||!DECISIONS.includes(item.decision))return null;
    const chosen=Number.isInteger(item.chosen)&&item.chosen>=0&&item.chosen<candidateCount?item.chosen:null;
    return {decision:item.decision,chosen:item.decision==='OK'?chosen:null,by:typeof item.by==='string'?item.by.slice(0,40):'',comment:typeof item.comment==='string'?item.comment.slice(0,500):''};
  }
  async function call(init,query=''){
    let response;
    try{response=await fetch(ENDPOINT+query,init);}catch{throw new Error('GT-botにつながりません。電波を確認して、もう一度押してください。');}
    let data;try{data=await response.json();}catch{throw new Error('GT-botの応答を読めませんでした。時間をおいてもう一度押してください。');}
    if(!data.ok)throw new Error(data.error||'LINEへの投稿に失敗しました。');
    return data;
  }
  // 本文はtext/plainで送る（Apps Scriptが受けられる形。ブラウザーの事前確認も起きない）
  const post=(review,text,photos,card)=>call({method:'POST',body:JSON.stringify(payload(review,text,photos,card))});
  const status=ids=>call({method:'GET'},'?action=pcStatus&key='+encodeURIComponent(KEY)+'&ids='+ids.map(encodeURIComponent).join(','));
  const api={ENDPOINT,MAX_PHOTOS,lineText,payload,shareUrl,reply,post,status};
  root.TerrasLinePost=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
