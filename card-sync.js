(function(root){
  'use strict';
  // どのPCで開いても同じ商品が出るように、GT-bot（Apps Script）の「プライスカード共有」シートとそろえる（v1.10.0）。
  // 開いたとき・保存したとき・削除したとき・画面に戻ったときに、手元の商品を全部送って全部受け取る。同じ商品は後から保存した方が残る（GT-bot側で判定）。
  // 削除は「削除の印」を送る（印はこのPCに残しておき、GT-botが受け取ったら消す）。A4の並び・チェック基準・基準写真はPCごとのまま。
  // 投稿キーは新商品相談と同じ（TerrasLinePost の KEY）。PINなし：上書き・削除の前の内容はGT-botの「プライスカード履歴」に残る。
  const DELETED_KEY='terras-sync-deleted',DEVICE_KEY='terras-sync-device',LAST_KEY='terras-sync-last';
  const MIN_INTERVAL_MS=60000;
  const store={
    get(k,fallback){try{const v=localStorage.getItem(k);return v==null?fallback:JSON.parse(v);}catch{return fallback;}},
    set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
  };
  // 送るもの：見本（sample）でない商品＋削除の印
  function payloadItems(products,deleted){
    const items=products.filter(p=>p&&p.id&&!p.sample).map(p=>({id:p.id,updatedAt:p.updatedAt||'2026-01-01T00:00:00.000Z',data:p}));
    for(const [id,at] of Object.entries(deleted||{}))if(!items.some(x=>x.id===id))items.push({id,updatedAt:at,deleted:true});
    return items;
  }
  // GT-botの返事を手元にあてる。手元の並び順を保ち、新しい商品は後ろに足す。
  // 送っている間に保存した商品は手元の方が新しいので、更新日時が新しい方を残す。送っている間に削除した商品（pending）は足さない。
  // GT-botに無い手元の商品（名前が空などで受け付けられなかったもの・見本）はそのまま残す。ただし共有に商品があるなら見本は外す
  const time=v=>{const t=Date.parse(v);return isFinite(t)?t:0;};
  function apply(local,serverItems,pending){
    const byId=new Map(serverItems.map(x=>[x.id,x]));
    const hasShared=serverItems.some(x=>!x.deleted);
    const out=[],seen=new Set();
    for(const p of local){
      const s=byId.get(p.id);seen.add(p.id);
      if(!s){if(!(p.sample&&hasShared))out.push(p);continue;}
      if(time(p.updatedAt)>time(s.updatedAt)){out.push(p);continue;}
      if(!s.deleted)out.push(s.data);
    }
    for(const s of serverItems)if(!seen.has(s.id)&&!s.deleted&&!(pending&&s.id in pending))out.push(s.data);
    return out;
  }
  function deviceName(){
    let d=store.get(DEVICE_KEY,'');
    if(!d){
      const ua=String(root.navigator?.userAgent||'');
      const kind=/iPad|Macintosh.*Mobile/.test(ua)?'iPad':/iPhone/.test(ua)?'iPhone':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Mac/.test(ua)?'Mac':'PC';
      d=kind+'-'+Math.random().toString(36).slice(2,6);store.set(DEVICE_KEY,d);
    }
    return d;
  }
  function markDeleted(id){const d=store.get(DELETED_KEY,{});d[id]=new Date().toISOString();store.set(DELETED_KEY,d);}
  async function request(products){
    const LP=root.TerrasLinePost;
    const deleted=store.get(DELETED_KEY,{});
    let response;
    try{response=await fetch(LP.ENDPOINT,{method:'POST',body:JSON.stringify({action:'cardsSync',key:LP.KEY,device:deviceName(),items:payloadItems(products,deleted)})});}
    catch{throw new Error('共有につながりません（このPCには保存済み）');}
    let data;try{data=await response.json();}catch{throw new Error('共有の応答を読めませんでした（このPCには保存済み）');}
    if(!data.ok)throw new Error(data.error||'共有できませんでした（このPCには保存済み）');
    return {data,deleted};
  }
  // 画面とのつなぎ：getProducts() で今の商品を渡し、onResult(products) で受け取る
  function create({getProducts,onResult,onStatus}){
    let running=null,again=false,lastAt=0;
    async function run(){
      if(running){again=true;return running;}
      running=(async()=>{
        do{
          again=false;onStatus?.({state:'syncing'});
          try{
            const {data,deleted}=await request(getProducts());
            // 送った削除の印はGT-botが受け取った（または不要だった）ので消す。送っている間に増えた印は残す
            const still=store.get(DELETED_KEY,{});for(const id of Object.keys(deleted))if(still[id]===deleted[id])delete still[id];store.set(DELETED_KEY,still);
            onResult(apply(getProducts(),data.items,still),data);
            lastAt=Date.now();store.set(LAST_KEY,new Date(lastAt).toISOString());
            onStatus?.({state:'ok',at:new Date(lastAt),saved:data.saved});
          }catch(err){onStatus?.({state:'error',message:err.message});again=false;}
        }while(again);
      })();
      try{await running;}finally{running=null;}
    }
    function maybe(){if(Date.now()-lastAt>=MIN_INTERVAL_MS)run();}
    return {run,maybe,markDeleted,lastSynced:()=>store.get(LAST_KEY,'')};
  }
  const api={payloadItems,apply,create,deviceName,markDeleted,DELETED_KEY};
  root.TerrasCardSync=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
