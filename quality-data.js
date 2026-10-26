(function(root){
  'use strict';
  const P=root.TerrasPhotoData||(typeof require==='function'?require('./photo-data.js'):null);
  const G=root.TerrasGPTData||(typeof require==='function'?require('./gpt-data.js'):null);
  const KEY='terras.quality.v1',MAX_HISTORY=200,QUESTION_COUNT=0;
  const VIEWS=['top','angle','cut','tray'],VIEW_NAMES={top:'真上',angle:'斜め45°',cut:'断面',tray:'トレイに8〜10個'};
  const PHOTO_VIEWS=['top','angle','cut'];
  const BASICS={shokupan:{name:'365日食パン',points:'山の高さがそろう／側面が腰折れしていない／きめ・しっとり感／耳の薄さ'},croissant:{name:'クロワッサン',points:'層が外から見える／焼き色は濃い／断面がハニカム状／持つと軽い'},shiopan:{name:'塩パン',points:'巻き目がそろう／底がカリッと焼けている／塩の粒の量／バターが抜けて空洞になっていない'}};
  const DEFAULTS={questions:[],principles:[
    {no:1,title:'焼き色は攻める',rule:'濃いめのきつね色〜焦げ際。白っぽい・均一に薄いのはNG。'},
    {no:2,title:'中身と断面を見せる',rule:'具材やクリームが切り口から見える。断面写真がなければ写真では判定できない。'},
    {no:3,title:'色は生地の茶＋主役1色',rule:'差し色は素材そのものの色。3色以上はNG。着色料やカラースプレーの使用は写真から断定せず、入力された事実だけを参照。'},
    {no:4,title:'素材がそのままわかる',rule:'果物は切り口を上に、野菜は形がわかる大きさで。チョコペンの文字や顔、キャラ型、市販の飾りパーツはNG。ただし材料や製法は写真から断定しない。'},
    {no:5,title:'小ぶりで形がそろう',rule:'手のひらサイズを目安に、大きさや巻き目のばらつき、つぶれ・欠けを確認。トレイ写真で判定し、尺度がなければ実寸を推測しない。'},
    {no:6,title:'ツヤより質感',rule:'マットな焼き面、クープ、粉、粉糖で表情をつける。全面テカテカ、溶けてしみになった粉糖はNG。粉の種類は写真から断定しない。'},
    {no:7,title:'トレイ1枚で映える',rule:'並べたときに色と形のリズムが出る。トレイ写真がなければ写真では判定できない。'}]};
  const clone=x=>JSON.parse(JSON.stringify(x));
  function object(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}
  function text(x,max,required=false){if(typeof x!=='string'||x.length>max||(required&&!x.trim())||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(x))throw new Error('チェック記録の文字列が不正です。');return x.trim();}
  function criteria(raw,allowLegacy=false){
    if(!object(raw)||Object.keys(raw).some(k=>!['questions','principles'].includes(k))||!Array.isArray(raw.questions)||!(raw.questions.length===QUESTION_COUNT||(allowLegacy&&[2,5].includes(raw.questions.length)))||!Array.isArray(raw.principles)||raw.principles.length!==7)throw new Error('questionsは空配列、principlesは7原則を指定してください。');
    return {questions:raw.questions.map(x=>text(x,180,true)),principles:raw.principles.map((x,i)=>{
      if(!object(x)||x.no!==i+1||Object.keys(x).some(k=>!['no','title','rule'].includes(k)))throw new Error('原則の番号は1〜7の順です。');
      return {no:i+1,title:text(x.title,80,true),rule:text(x.rule,600,true)};
    })};
  }
  function answers(raw,required=false,count=QUESTION_COUNT){if(!Array.isArray(raw)||raw.length!==count||raw.some(x=>x!==true&&x!==false&&x!==null)||(required&&raw.some(x=>x===null)))throw new Error(count+'問すべてに「はい／いいえ」で回答してください。');return raw.slice();}
  function qualityInput(raw,views){
    if(!object(raw)||Object.keys(raw).some(k=>!['mode','criteria','answers'].includes(k)))throw new Error('相談の形式が異なります。');
    if(raw.mode==='advice'){
      if(Object.hasOwn(raw,'answers')&&(!Array.isArray(raw.answers)||raw.answers.length))throw new Error('写真相談に自己チェックの回答は不要です。');
      return {mode:'advice',criteria:criteria(raw.criteria),answers:[]};
    }
    if(Object.hasOwn(raw,'mode'))throw new Error('相談モードが異なります。');
    if(views.length&&!views.includes('top'))throw new Error('らしさチェックには真上の写真が必要です。');
    const c=criteria(raw.criteria,true);if(!c.questions.length)throw new Error('ページを再読み込みして写真相談を開いてください。');
    return {criteria:c,answers:answers(raw.answers,views.length>0,c.questions.length)};
  }
  function assessment(raw,views,staff=[],advisory=false){
    if(!views.length)return {principles:Array.from({length:7},(_,i)=>({no:i+1,mark:'写真では判定できない',reason:'写真がありません。',fix:'必要な角度の写真を追加してください。'})),overall:'判定なし'};
    if(!object(raw)||Object.keys(raw).some(k=>!['principles','overall'].includes(k))||!Array.isArray(raw.principles)||raw.principles.length!==7||!['社長に出せる','直してから','判定なし'].includes(raw.overall))throw new Error('写真チェックの応答形式が異なります。');
    const marks=['○','△','×','写真では判定できない'];
    const principles=raw.principles.map((p,i)=>{
      if(!object(p)||p.no!==i+1||!marks.includes(p.mark)||Object.keys(p).some(k=>!['no','mark','reason','fix'].includes(k)))throw new Error('写真チェックの原則が不正です。');
      const item={no:i+1,mark:p.mark,reason:text(p.reason,300,true),fix:text(p.fix,300,true)};
      const missing=(i===1&&!views.includes('cut'))? '断面':([4,6].includes(i)&&!views.includes('tray'))?'トレイ':null;
      return missing==='トレイ'?{no:i+1,mark:'写真では判定できない',reason:'並べた状態の比較は写真では判定しません。',fix:'実物を並べて、形と色のリズムを確認してください。'}:missing?{no:i+1,mark:'写真では判定できない',reason:missing+'写真がありません。',fix:missing+'写真を追加してください。'}:item;
    });
    const overall=advisory?'判定なし':principles.some(p=>p.mark==='×')||staff.includes(false)?'直してから':principles.every(p=>p.mark==='写真では判定できない')?'判定なし':'社長に出せる';
    return {principles,overall};
  }
  function blank(){return {schemaVersion:1,proposer:'',criteria:clone(DEFAULTS),baselines:{},reviews:[],basics:[]};}
  function review(raw){
    if(!object(raw))throw new Error('審査記録が不正です。');
    const views=raw.views;if(!Array.isArray(views)||views.some(x=>!VIEWS.includes(x))||new Set(views).size!==views.length)throw new Error('写真の種別が不正です。');
    const c=criteria(raw.criteria,true),a=answers(raw.answers,false,c.questions.length);
    const advisory=raw.mode==='advice';if(Object.hasOwn(raw,'mode')&&!advisory)throw new Error('相談記録の形式が異なります。');
    if(!Array.isArray(raw.candidates)||!(raw.candidates.length===3||(advisory&&raw.candidates.length===0))||!['pending','OK','直して','NG'].includes(raw.decision)||!(raw.chosen===null||[0,1,2].includes(raw.chosen))||(raw.chosen!==null&&!raw.candidates[raw.chosen]))throw new Error('社長への提案記録が不正です。');
    const at=text(raw.at,40,true);if(!Number.isFinite(Date.parse(at)))throw new Error('記録の日付が不正です。');
    return {id:text(raw.id,100,true),at,kind:text(raw.kind,80,true),proposer:text(raw.proposer,80),...(advisory?{mode:'advice'}:{}),answers:a,criteria:c,views:views.slice(),check:assessment(raw.check,views,a,advisory),candidates:raw.candidates.map(G.candidate),decision:raw.decision,chosen:raw.chosen,note:text(raw.note,500)};
  }
  function basic(raw){
    if(!object(raw)||!Object.hasOwn(BASICS,raw.product)||!Array.isArray(raw.scores)||raw.scores.length!==5||raw.scores.some(x=>![1,2,3].includes(x)))throw new Error('ベーシックの5項目を1〜3点で採点してください。');
    const total=raw.scores.reduce((a,b)=>a+b,0),cause=text(raw.cause,500,total<12),at=text(raw.at,40,true);
    if(!Number.isFinite(Date.parse(at)))throw new Error('記録の日付が不正です。');
    return {id:text(raw.id,100,true),at,product:raw.product,scores:raw.scores.slice(),total,cause};
  }
  function state(raw){
    if(!object(raw)||raw.schemaVersion!==1||!object(raw.baselines)||!Array.isArray(raw.reviews)||raw.reviews.length>MAX_HISTORY||!Array.isArray(raw.basics)||raw.basics.length>MAX_HISTORY||Object.keys(raw).some(k=>!['schemaVersion','proposer','criteria','baselines','reviews','basics'].includes(k)))throw new Error('チェック履歴の形式が異なります（各200件まで）。');
    const baselines={};for(const [k,v] of Object.entries(raw.baselines)){if(!Object.hasOwn(BASICS,k))throw new Error('基準写真の対象が異なります。');baselines[k]=P.sanitize(v);}
    // Active photo advice has no questionnaire; past reviews retain their original answers.
    const activeCriteria=criteria(raw.criteria,true);activeCriteria.questions=activeCriteria.questions.slice(0,QUESTION_COUNT);
    const out={schemaVersion:1,proposer:text(raw.proposer,80),criteria:activeCriteria,baselines,reviews:raw.reviews.map(review),basics:raw.basics.map(basic)};
    for(const records of [out.reviews,out.basics])if(new Set(records.map(x=>x.id)).size!==records.length)throw new Error('チェック履歴のIDが重複しています。');
    return out;
  }
  function merge(current,incoming){
    const a=state(current),b=state(incoming);
    const records=(old,next)=>{const map=new Map(old.map(x=>[x.id,x]));for(const x of next)if(!map.has(x.id))map.set(x.id,x);return [...map.values()].sort((x,y)=>y.at.localeCompare(x.at)).slice(0,MAX_HISTORY);};
    return state({...a,proposer:b.proposer||a.proposer,criteria:b.criteria,baselines:{...a.baselines,...b.baselines},reviews:records(a.reviews,b.reviews),basics:records(a.basics,b.basics)});
  }
  function shareText(record){
    const r=review(record),flags=r.check.principles.filter(x=>['×','△'].includes(x.mark)).map(x=>r.criteria.principles[x.no-1].title),unknown=r.check.principles.filter(x=>x.mark==='写真では判定できない').length;
    if(r.mode==='advice'){
      const a=photoAdvice(r.check,r.views);
      return ['【新商品相談】'+r.kind,'提案：'+(r.proposer||'未入力'),'写真からのアドバイス（参考）',...(a.good.length?['良いところ',...a.good.map(x=>'・'+x)]:[]),...(a.improve.length?['直すとよいところ',...a.improve.map(x=>'・'+x)]:[]),'次に試すこと：'+a.next,...(r.candidates.length?['名前案',...r.candidates.map((c,i)=>'ABC'[i]+' '+c.name)]:[]),'社長へ：OK／直して／NG'+(r.candidates.length?' と、名前A/B/C':'')+'で返信してください','写真から材料・味・アレルゲンは判断していません。'].join('\n');
    }
    return ['【新商品審査】'+r.kind,'提案：'+(r.proposer||'未入力'),r.answers.length+'問チェック '+r.answers.filter(x=>x===true).length+'/'+r.answers.length+(r.answers.length!==QUESTION_COUNT?'（旧基準）':'')+(r.answers.includes(null)?'（未回答あり）':''),'写真チェック '+r.check.overall+(flags.length?'（'+flags.join('・')+'）':'')+(unknown?'／未判定'+unknown+'項目':''),'名前案',...r.candidates.map((c,i)=>'ABC'[i]+' '+c.name),'社長へ：OK／直して／NG と、名前A/B/Cで返信してください','写真チェックは参考です。最終判断は社長。'].join('\n');
  }
  function photoAdvice(check,views){
    if(!views.length)return {good:[],improve:[],next:'写真を追加すると、見た目のアドバイスを作れます。'};
    const visible=check.principles.filter(p=>p.mark!=='写真では判定できない'),good=visible.filter(p=>p.mark==='○').map(p=>p.reason).slice(0,3),issues=visible.filter(p=>['×','△'].includes(p.mark)).sort((a,b)=>(a.mark==='×'?0:1)-(b.mark==='×'?0:1));
    return {good:[...new Set(good)],improve:[...new Set(issues.map(p=>p.fix))].slice(0,3),next:issues[0]?.fix||'実物の焼き色・断面・形も見ながら、仕上がりを確かめてみてください。'};
  }
  const api={KEY,MAX_HISTORY,QUESTION_COUNT,VIEWS,PHOTO_VIEWS,VIEW_NAMES,BASICS,DEFAULTS,clone,criteria,answers,qualityInput,assessment,photoAdvice,blank,review,basic,state,merge,shareText};
  root.TerrasQualityData=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
