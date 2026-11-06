(function(root){
  'use strict';
  // 似た名前の商品を見つける（v1.11.0）。同じ商品を何度も作ってしまうのを防ぐための目安で、保存は止めない。
  // そろえ方：全角半角・大文字小文字・カタカナとひらがな・記号・空白・「限定」「新作」「（複製）」などの飾りを無視する。
  // 似ている：そろえた名前が同じ／片方がもう片方を含む（短い方が長い方の6割以上）／2文字ずつの重なりが6割以上。
  // 漢字とかなの違い（塩パン・しおパン）は読みが分からないため見つけられない。
  const DECOR=['期間限定','季節限定','数量限定','店舗限定','限定','新作','新商品','複製','new'];
  function norm(name){
    let s=String(name||'').normalize('NFKC').toLowerCase();
    s=s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
    for(const w of DECOR)s=s.split(w).join('');
    return s.replace(/[\s・ー〜~\-_()（）［］\[\]【】「」『』〈〉<>!！?？★☆♪♡、。,.:：;；'"’”/／|＋+&＆*＊#＃]/g,'');
  }
  function bigrams(s){const a=[];for(let i=0;i<s.length-1;i++)a.push(s.slice(i,i+2));return a;}
  function dice(a,b){
    const x=bigrams(a),y=bigrams(b);if(!x.length||!y.length)return 0;
    const pool=new Map();for(const g of y)pool.set(g,(pool.get(g)||0)+1);
    let hit=0;for(const g of x){const n=pool.get(g);if(n){hit++;pool.set(g,n-1);}}
    return 2*hit/(x.length+y.length);
  }
  // 'same'（同じ名前）・'similar'（似ている）・null
  function compare(a,b){
    const x=norm(a),y=norm(b);if(!x||!y)return null;
    if(x===y)return 'same';
    const [s,l]=x.length<=y.length?[x,y]:[y,x];
    if(s.length>=3&&l.includes(s)&&s.length/l.length>=0.6)return 'similar';
    if(Math.min(x.length,y.length)>=3&&dice(x,y)>=0.6)return 'similar';
    return null;
  }
  // name に似た商品（自分 excludeId と見本は除く）。同じ名前を先に
  function findSimilar(name,products,excludeId){
    const out=[];
    for(const p of products||[]){
      if(!p||p.id===excludeId||p.sample)continue;
      const kind=compare(name,p.name);if(kind)out.push({product:p,kind});
    }
    return out.sort((a,b)=>(a.kind==='same'?0:1)-(b.kind==='same'?0:1));
  }
  // 商品一覧の中の似た名前のまとまり（2件以上）。一覧の並び順を保つ
  function groups(products){
    const list=(products||[]).filter(p=>p&&!p.sample),parent=list.map((_,i)=>i);
    const find=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i;};
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)if(compare(list[i].name,list[j].name))parent[find(i)]=find(j);
    const by=new Map();list.forEach((p,i)=>{const r=find(i);if(!by.has(r))by.set(r,[]);by.get(r).push(p);});
    return [...by.values()].filter(g=>g.length>1);
  }
  const api={norm,compare,findSimilar,groups};
  root.TerrasDupCheck=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
