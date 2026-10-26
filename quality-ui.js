(function(){
  'use strict';
  const $=id=>document.getElementById(id),Q=window.TerrasQualityData,S=window.TerrasQualityStore,P=window.TerrasPhoto,L=window.TerrasLinePost;
  let current=null,currentPhotos=[],daily=null,basicSerial=0,photoBusy=false;
  const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  function read(){try{return S.read();}catch(e){$('quality-storage-status').textContent=e.message;return Q.blank();}}
  function notify(id,fn){try{return fn();}catch(e){$(id).textContent=e.message;return null;}}
  function renderQuestions(){
    $('quality-questions').replaceChildren();$('quality-self-summary').textContent='';
  }
  function context(views){
    const value=Q.qualityInput({mode:'advice',criteria:read().criteria},views);
    const proposer=$('quality-proposer').value.trim();if(proposer.length>80)throw new Error('提案者名は80文字以内です。');
    return {...value,proposer};
  }
  function photoFiles(photos){return photos.map(({view,data})=>{const binary=atob(data.split(',')[1]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new File([bytes],'TERRAS-'+view+'.jpg',{type:'image/jpeg'});});}
  function drawRecord(record,host,photos,live=false){
    host.replaceChildren();
    const title=node('h3',record.mode==='advice'?'写真からのアドバイス':'過去の写真チェック');host.append(title);
    host.append(node('p',record.kind+' / '+(record.proposer||'提案者未入力')+' / '+new Date(record.at).toLocaleString('ja-JP'),'field-help'));
    if(record.mode==='advice'){
      const advice=Q.photoAdvice(record.check,record.views),cards=node('div',undefined,'photo-advice-grid');
      for(const [heading,items,empty] of [['良いところ',advice.good,record.views.length?'写真では確認しきれませんでした。':'写真はまだありません。'],['直すとよいところ',advice.improve,record.views.length?'写真で見える範囲では、大きな修正点は確認できませんでした。':'写真を追加するとアドバイスできます。']]){
        const card=node('section',undefined,'photo-advice-card');card.append(node('h4',heading));
        if(items.length){const list=node('ul');items.forEach(item=>list.append(node('li',item)));card.append(list);}else card.append(node('p',empty,'field-help'));cards.append(card);
      }
      host.append(cards);const next=node('section',undefined,'photo-advice-next');next.append(node('h4','次に試すこと'),node('p',advice.next));host.append(next);
    }else{
    const staff=record.answers.includes(false),unknown=record.check.principles.filter(x=>x.mark==='写真では判定できない').length;
    host.append(node('p',record.check.overall,'quality-overall '+(record.check.overall==='直してから'?'needs-fix':'')));
    host.append(node('p',record.answers.length+'問チェック '+record.answers.filter(x=>x===true).length+'/'+record.answers.length+(record.answers.length!==Q.QUESTION_COUNT?'（旧基準）':'')+(record.answers.includes(null)?'（未回答あり）':''),'field-help'));
    if(staff)host.append(node('p','直してから出しましょう。スタッフの確認で「いいえ」があります。','warning'));
    if(unknown)host.append(node('p',unknown+'原則は写真では判定できません。未判定は合格を意味しません。','field-help'));
    const list=node('div',undefined,'quality-principles');
    for(const p of record.check.principles){const row=node('article',undefined,'quality-principle');row.append(node('strong',p.no+'. '+record.criteria.principles[p.no-1].title),node('span',p.mark,'quality-mark'),node('p',p.reason),node('p','直し方：'+p.fix,'field-help'));list.append(row);}host.append(list);
    }
    host.append(node('p','アドバイスは参考です。最終判断は社長。写真から材料・味・アレルゲン・実寸は判断していません。','field-help'));
    const names=node('div',undefined,'quality-name-summary');record.candidates.forEach((c,i)=>names.append(node('p','ABC'[i]+'　'+c.name)));host.append(names);
    const post=node('button','LINEで送る','primary'),open=node('a','LINEを開いてグループに送る','primary line-open'),share=node('button','自分でLINEに送る'),status=node('p',undefined,'quality-share-status');post.type='button';share.type='button';status.setAttribute('role','status');
    const fallback=node('details'),summary=node('summary','文面をコピー・写真を保存');fallback.append(summary);
    const copyText=node('textarea');copyText.rows=9;copyText.readOnly=true;copyText.setAttribute('aria-label','社長へ送る文面');fallback.append(copyText);
    const copy=node('button','文面をコピー');copy.type='button';fallback.append(copy);
    const download=node('div',undefined,'photo-actions');photos.forEach(({view,data})=>{const a=node('a',Q.VIEW_NAMES[view]+'を保存','quality-photo-save');a.href=data;a.download='TERRAS-'+view+'.jpg';download.append(a);});fallback.append(download);
    if(!photos.length)fallback.append(node('p','写真はこの記録に保存されていません。写真も送る場合は元の写真をLINEに添付してください。','field-help'));
    function latest(){
      if(live&&window.TerrasGPT?.candidates){record.candidates=window.TerrasGPT.candidates().map(window.TerrasGPTData.candidate);record.proposer=$('quality-proposer').value.trim();}
      return Q.review(record);
    }
    function message(){const text=Q.shareText(latest());copyText.value=text;return text;}
    message();
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(message());status.textContent='文面をコピーしました。LINEに貼り付けてください。';}catch{fallback.open=true;copyText.focus();copyText.select();status.textContent='文面を選択しました。手動でコピーしてください。';}};
    share.onclick=async()=>{
      try{
        const text=message(),files=photoFiles(photos);
        if(files.length&&navigator.share&&navigator.canShare?.({files})){await navigator.share({title:'TERRAS 新商品相談',text,files});status.textContent='共有シートの操作が終わりました。LINEへの送信結果をご確認ください。';}
        else{fallback.open=true;status.textContent='この端末では写真つき共有に対応していません。文面をコピーし、写真を保存してLINEで送ってください。';}
      }catch(e){status.textContent=e.name==='AbortError'?'共有を取り消しました。':e.message;fallback.open=true;}
    };
    // 相談の記録を先に端末へ保存してから投稿する（返事の読み込みに同じIDを使う）
    function keep(){const next={...latest(),decision:decision.value,chosen:choice.value===''?null:Number(choice.value),note:note.value};if(S.read().reviews.some(r=>r.id===next.id))S.updateReview(next);else S.addReview(next);Object.assign(record,next);return next;}
    // 日報と同じ返信方式：GT-botに受付→受付番号「#P…」をLINEでグループに送る→GT-botが返信で写真と名前案を流す（通数ゼロ）
    open.hidden=true;open.target='_blank';open.rel='noopener';
    post.onclick=async()=>{
      post.disabled=true;status.textContent='GT-botに受付しています…';
      try{const saved=keep(),result=await L.post(saved,message(),photos);open.href=L.shareUrl(saved,result.receipt);open.hidden=false;post.hidden=true;status.textContent='受付番号 #'+result.receipt+'。「LINEを開いてグループに送る」を押し、社長が入っているグループを選んで送ってください。GT-botが写真と名前案を流します。';}
      catch(e){status.textContent=e.message;post.disabled=false;}
    };
    const photoNote=node('p',(photos.length?'写真'+Math.min(photos.length,L.MAX_PHOTOS)+'枚と文面を':'文面を')+'GT-botに預けます。LINEで受付番号をグループに送ると、GT-botが返信で流します（LINEの通数はかかりません）。','field-help');
    host.append(post,open,photoNote,status,share,fallback);
    const reply=node('div',undefined,'quality-reply');reply.append(node('h4','社長の返事を記録'));
    const decisionLabel=node('label','返事'),decision=node('select');decision.setAttribute('aria-label','社長の返事');
    for(const [value,label] of [['pending','返事待ち'],['OK','OK'],['直して','直して'],['NG','NG']])decision.add(new Option(label,value));decision.value=record.decision;decisionLabel.append(decision);
    const choiceLabel=node('label','選んだ名前'),choice=node('select');choiceLabel.hidden=!record.candidates.length;choice.setAttribute('aria-label','社長が選んだ名前');choice.add(new Option('未選択',''));record.candidates.forEach((c,i)=>choice.add(new Option('ABC'[i]+' '+c.name,String(i))));choice.value=record.chosen===null?'':String(record.chosen);choiceLabel.append(choice);
    const noteLabel=node('label','返事・修正メモ'),note=node('textarea');note.rows=2;note.maxLength=500;note.value=record.note;noteLabel.append(note);
    const save=node('button','相談結果・返事を保存');save.type='button';const saved=node('p');saved.setAttribute('role','status');
    const load=node('button','LINEの返事を読み込む');load.type='button';
    load.onclick=async()=>{load.disabled=true;saved.textContent='読み込んでいます…';try{const data=await L.status([record.id]),item=data.items[record.id];if(!item){saved.textContent='まだLINEグループに投稿されていません。';return;}const r=L.reply(item,record.candidates.length);if(!r){saved.textContent='社長の返事はまだありません。';return;}decision.value=r.decision;choice.value=r.chosen===null?'':String(r.chosen);save.onclick();saved.textContent='LINEの返事（'+r.decision+(r.chosen===null?'':'・'+'ABC'[r.chosen]+'案')+(r.by?'・'+r.by:'')+'）を記録しました。';}catch(e){saved.textContent=e.message;}finally{load.disabled=false;}};
    save.onclick=()=>{try{const next={...latest(),decision:decision.value,chosen:choice.value===''?null:Number(choice.value),note:note.value};if(next.candidates.length&&next.decision==='OK'&&next.chosen===null)throw new Error('OKの場合は名前A/B/Cも選んでください。');const exists=S.read().reviews.some(r=>r.id===next.id);if(exists)S.updateReview(next);else S.addReview(next);Object.assign(record,next);saved.textContent='この端末の履歴に保存しました。';message();}catch(e){saved.textContent=e.message;}};
    reply.append(load,decisionLabel,choiceLabel,noteLabel,save,saved);host.append(reply);
  }
  function renderHistory(){
    const s=read(),host=$('quality-history');host.replaceChildren();
    if(!s.reviews.length){host.append(node('p','まだ相談の履歴はありません。アドバイスと社長の返事を、写真を含めず履歴に残します。','empty-state'));return;}
    for(const r of s.reviews){const row=node('article',undefined,'quality-history-row');row.append(node('strong',r.kind),node('p',new Date(r.at).toLocaleString('ja-JP')+' · '+(r.mode==='advice'?'写真からの相談':r.check.overall)+' · '+(r.decision==='pending'?'返事待ち':r.decision)+(r.chosen===null?'':' / 名前'+'ABC'[r.chosen]),'field-help'));const button=node('button','結果・社長の返事を開く');button.type='button';button.onclick=()=>{drawRecord(Q.clone(r),$('quality-history-record'),[]);$('quality-history-dialog').showModal();$('quality-history-dialog').scrollTop=0;};row.append(button);host.append(row);}
  }
  function showResult({candidates,check,input,context:ctx,photos}){
    current={id:crypto.randomUUID(),at:new Date().toISOString(),kind:input.kind||'写真からの相談',proposer:ctx.proposer,mode:'advice',answers:[],criteria:ctx.criteria,views:photos.map(x=>x.view),check,candidates:Q.clone(candidates),decision:'pending',chosen:null,note:''};currentPhotos=photos.slice();
    drawRecord(current,$('quality-result'),currentPhotos,true);
    notify('quality-storage-status',()=>{S.addReview(current);$('quality-storage-status').textContent='アドバイスを保存しました（写真は含みません）。';});
  }
  function reset(){current=null;currentPhotos=[];$('quality-result').replaceChildren();renderQuestions();$('quality-proposer').value=read().proposer;}
  let proposerTimer;
  $('quality-proposer').oninput=()=>{clearTimeout(proposerTimer);proposerTimer=setTimeout(()=>notify('gpt-status',()=>S.update(s=>({...s,proposer:$('quality-proposer').value.trim()}))),300);};
  function reference(){
    const key=$('basic-product').value,s=read(),data=s.baselines[key];$('basic-points').textContent=Q.BASICS[key].points;
    $('basic-reference-image').hidden=!data;$('basic-reference-empty').hidden=!!data;$('basic-reference-remove').hidden=!data;
    if(data)$('basic-reference-image').src=data;else $('basic-reference-image').removeAttribute('src');
  }
  function dailyImage(){const yes=!!daily;$('basic-daily-image').hidden=!yes;$('basic-daily-empty').hidden=yes;if(yes)$('basic-daily-image').src=daily;else $('basic-daily-image').removeAttribute('src');}
  function total(){const values=[...$('basic-score-fields').querySelectorAll('select')].map(x=>Number(x.value)),complete=values.every(x=>[1,2,3].includes(x)),sum=values.reduce((a,b)=>a+b,0);$('basic-total').textContent=complete?sum:'—';$('basic-verdict').textContent=complete?(sum<12?'原因を確認しましょう':'基準内'):'5項目を入力';$('basic-cause-required').hidden=!complete||sum>=12;$('basic-cause').required=complete&&sum<12;}
  ['焼き色','形・大きさ','香り','食感','味（塩・甘み）'].forEach((name,i)=>{const label=node('label',name),select=node('select');select.id='basic-score-'+i;select.add(new Option('点数を選ぶ',''));for(const [value,text] of [[1,'1 · 要改善'],[2,'2 · もう一歩'],[3,'3 · 良好']])select.add(new Option(text,String(value)));select.onchange=total;label.append(select);$('basic-score-fields').append(label);});
  $('basic-product').onchange=()=>{basicSerial++;daily=null;dailyImage();reference();renderBasicHistory();$('basic-status').textContent='';for(const el of $('basic-score-fields').querySelectorAll('select'))el.value='';$('basic-cause').value='';total();};
  async function chooseBasic(event,isReference){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const key=$('basic-product').value,token=++basicSerial;photoBusy=true;$('basic-save').disabled=true;$('basic-status').textContent='写真を準備しています…';
    try{const data=await P.encode(file);if(token!==basicSerial)return;if(isReference){S.update(s=>{s.baselines[key]=data;return s;});reference();$('basic-status').textContent='基準写真をこの端末に保存しました。';}else{daily=data;dailyImage();$('basic-status').textContent='今日の写真を表示しました。履歴には保存しません。';}}
    catch(e){if(token===basicSerial)$('basic-status').textContent=e.message;}
    finally{photoBusy=false;$('basic-save').disabled=false;}
  }
  $('basic-reference-input').onchange=e=>chooseBasic(e,true);$('basic-daily-input').onchange=e=>chooseBasic(e,false);
  $('basic-reference-remove').onclick=()=>notify('basic-status',()=>{S.update(s=>{delete s.baselines[$('basic-product').value];return s;});reference();$('basic-status').textContent='基準写真を外しました。';});
  function renderBasicHistory(){const host=$('basic-history'),key=$('basic-product').value;host.replaceChildren();const records=read().basics.filter(r=>r.product===key);if(!records.length)host.append(node('p','この商品の記録はまだありません。','empty-state'));for(const r of records){const row=node('article',undefined,'quality-history-row');row.append(node('strong',new Date(r.at).toLocaleString('ja-JP')+' · '+r.total+'/15'),node('p',r.scores.map((x,i)=>['焼き色','形','香り','食感','味'][i]+' '+x).join(' / '),'field-help'));if(r.cause)row.append(node('p',r.cause));host.append(row);}}
  $('basic-form').onsubmit=e=>{e.preventDefault();if(photoBusy)return;notify('basic-status',()=>{const key=$('basic-product').value;if(!read().baselines[key]||!daily)throw new Error('基準写真と今日の写真を用意してから記録してください。');const r=Q.basic({id:crypto.randomUUID(),at:new Date().toISOString(),product:key,scores:[...$('basic-score-fields').querySelectorAll('select')].map(x=>Number(x.value)),cause:$('basic-cause').value});S.addBasic(r);daily=null;dailyImage();$('basic-status').textContent=r.total+'/15点を記録しました。今日の写真は破棄しました。';});};
  $('quality-criteria-json').value=JSON.stringify(read().criteria,null,2);
  $('quality-criteria-save').onclick=()=>notify('quality-criteria-status',()=>{const next=Q.criteria(JSON.parse($('quality-criteria-json').value));S.update(s=>({...s,criteria:next}));renderQuestions();$('quality-criteria-status').textContent='基準をこの端末に保存しました。次の相談から適用します。過去の記録には当時の基準を保持します。';});
  $('quality-criteria-reset').onclick=()=>{$('quality-criteria-json').value=JSON.stringify(Q.DEFAULTS,null,2);$('quality-criteria-status').textContent='初期基準を表示しました。適用するには「基準を保存」を押してください。';};
  $('quality-history-clear').onclick=()=>{if(!confirm('審査履歴とベーシック履歴をすべて削除します。先にJSONバックアップを保存しましたか？'))return;notify('quality-criteria-status',()=>{S.update(s=>({...s,reviews:[],basics:[]}));$('quality-criteria-status').textContent='履歴を整理しました。基準文言と基準写真は保持しています。';});};
  window.addEventListener('terras-quality-change',()=>{renderHistory();renderBasicHistory();});
  window.addEventListener('hashchange',()=>{if(location.hash!=='#basics'){basicSerial++;daily=null;dailyImage();}});
  $('basic-date').textContent=new Date().toLocaleDateString('ja-JP');
  window.TerrasQualityUI={reset,context,showResult,release(){current=null;currentPhotos=[];},refresh(){renderQuestions();renderHistory();renderBasicHistory();reference();$('quality-criteria-json').value=JSON.stringify(read().criteria,null,2);}};
  // 返事待ちの相談に、LINEで社長が押した返事を取り込む（失敗しても画面はそのまま）
  async function syncReplies(){
    try{
      const pending=read().reviews.filter(r=>r.decision==='pending').slice(0,50);if(!pending.length)return;
      const data=await L.status(pending.map(r=>r.id));
      for(const r of pending){const got=L.reply(data.items[r.id],r.candidates.length);if(got)S.updateReview({...r,decision:got.decision,chosen:got.chosen});}
    }catch{/* 通信できないときは、次に開いたときに読み込む */}
  }
  reset();renderHistory();reference();renderBasicHistory();total();syncReplies();
})();
