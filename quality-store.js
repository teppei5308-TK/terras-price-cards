(function(){
  'use strict';
  const Q=window.TerrasQualityData;
  let current=Q.blank(),blocked=false;
  try{const raw=localStorage.getItem(Q.KEY);if(raw)current=Q.state(JSON.parse(raw));}catch{blocked=true;}
  function read(){if(blocked)throw new Error('チェックの保存データを読めません。元データを上書きせず停止しています。');return Q.clone(current);}
  function update(change){
    const next=Q.state(change(read()));
    try{localStorage.setItem(Q.KEY,JSON.stringify(next));}catch{throw new Error('端末に保存できません。JSONバックアップを保存し、空き容量を確認してください。');}
    current=next;window.dispatchEvent(new Event('terras-quality-change'));return Q.clone(next);
  }
  function add(type,record){return update(s=>{if(s[type].length>=Q.MAX_HISTORY)throw new Error('履歴は各200件までです。JSONでバックアップしてから履歴を整理してください。');s[type].unshift(record);return s;});}
  window.addEventListener('storage',event=>{if(event.key!==Q.KEY)return;try{current=event.newValue?Q.state(JSON.parse(event.newValue)):Q.blank();blocked=false;}catch{blocked=true;}window.dispatchEvent(new Event('terras-quality-change'));});
  window.TerrasQualityStore={read,update,importState(raw){const incoming=Q.state(raw);return update(s=>Q.merge(s,incoming));},addReview:r=>add('reviews',Q.review(r)),addBasic:r=>add('basics',Q.basic(r)),updateReview(record){return update(s=>{const i=s.reviews.findIndex(r=>r.id===record.id);if(i<0)throw new Error('この審査結果は未保存です。「審査履歴に保存」を押してください。');s.reviews[i]=Q.review(record);return s;});}};
})();
