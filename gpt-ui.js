(function(){
  'use strict';
  const $=id=>document.getElementById(id),G=window.TerrasGPTData,P=window.TerrasPhoto,Q=window.TerrasQualityData,U=window.TerrasQualityUI;
  let original,onAdopt,controller=null,serial=0,busy=false,allowed=false,options=[],selected=-1,hasResult=false;
  const controls=['gpt-kind','gpt-materials','pc-price','pc-cost'];
  function notice(text){$('gpt-status').textContent=text;}
  function buttonLabel(){return '写真からアドバイスをもらう';}
  function setBusy(value){busy=value;$('gpt-generate').disabled=value||!allowed||P.isLoading();controls.forEach(id=>$(id).disabled=value);$('quality-proposer').disabled=value;$('quality-questions').querySelectorAll('input').forEach(x=>x.disabled=value);P.setBusy(value);$('gpt-generate').textContent=value?'アドバイスを作成中…':buttonLabel();$('gpt-stop').hidden=!value;}
  function resetResults(){hasResult=false;options=[];selected=-1;$('gpt-results').replaceChildren();$('quality-result').replaceChildren();$('gpt-comparison').hidden=true;$('gpt-adopt').disabled=true;$('gpt-reviewed').checked=false;}
  function stop(){if(controller){controller.abort();controller=null;}serial++;setBusy(false);}
  async function status(){
    allowed=false;$('gpt-generate').disabled=true;
    try{
      // AIはGT-bot（Apps Script）経由のClaude。全員合計で1日30回・30秒間隔
      const r=await fetch(window.TerrasLinePost.ENDPOINT+'?action=aiStatus',{cache:'no-store'});
      const s=await r.json();if(!s.ok)throw new Error();
      allowed=!!s.ready&&s.remaining>0;$('gpt-generate').disabled=!allowed||busy||P.isLoading();
      notice(!s.ready?'接続設定が未完了のため、生成は停止中です。':s.remaining>0?'AI相談は全員合計で1日'+s.maxCallsPerDay+'回・30秒間隔です（今日はあと'+s.remaining+'回）。':'今日のAI相談は上限の'+s.maxCallsPerDay+'回に達しました。明日またお試しください。');
    }catch{allowed=false;notice('AIの相談サーバーに接続できません。既存の登録・印刷は利用できます。');}
  }
  function render(){
    hasResult=true;$('gpt-comparison').hidden=false;
    $('gpt-name-section').hidden=!options.length;
    $('gpt-results').replaceChildren();
    options.forEach((candidate,index)=>{
      const article=document.createElement('article');article.className='gpt-option';
      const label=document.createElement('label');label.className='gpt-choice';
      const radio=document.createElement('input');radio.type='radio';radio.name='gpt-candidate';radio.value=String(index);radio.onchange=()=>{selected=index;$('gpt-reviewed').checked=false;$('gpt-adopt').disabled=true;};
      label.append(radio,document.createTextNode('案 '+(index+1)));article.append(label);
      const stage=document.createElement('div');stage.className='gpt-card-stage';stage.innerHTML=window.Terras.cardHTML({...original,...candidate});article.append(stage);
      const warning=document.createElement('p');warning.className='field-help';warning.textContent='価格・アレルゲンは現在の登録内容です。';article.append(warning);
      for(const field of ['name','description']){
        const l=document.createElement('label');l.textContent=field==='name'?'商品名（編集可）':'短い説明文（編集可）';
        const input=document.createElement(field==='name'?'input':'textarea');input.value=candidate[field];input.maxLength=field==='name'?500:1000;
        input.oninput=()=>{candidate[field]=input.value;stage.innerHTML=window.Terras.cardHTML({...original,...candidate});checkOverflow();if(selected===index){$('gpt-reviewed').checked=false;$('gpt-adopt').disabled=true;}};
        l.append(input);article.append(l);
      }
      const layoutLabel=document.createElement('label');layoutLabel.textContent='レイアウト';const layout=document.createElement('select');
      [['classic','元の中央配置'],['left','左揃え'],['accent','アクセント付き']].forEach(([value,text])=>{const o=new Option(text,value);layout.add(o);});layout.value=candidate.layout;
      layout.onchange=()=>{candidate.layout=layout.value;stage.innerHTML=window.Terras.cardHTML({...original,...candidate});checkOverflow();if(selected===index){$('gpt-reviewed').checked=false;$('gpt-adopt').disabled=true;}};layoutLabel.append(layout);article.append(layoutLabel);
      $('gpt-results').append(article);
      function checkOverflow(){requestAnimationFrame(()=>{const over=[...stage.querySelectorAll('[data-measure]')].filter(x=>x.scrollHeight>x.clientHeight+2||x.scrollWidth>x.clientWidth+2);warning.textContent=over.length?'はみ出し：'+over.map(x=>x.dataset.measure).join('・')+'。文章を短くしてください。':'価格・アレルゲンは現在の登録内容です。';warning.className=over.length?'warning':'field-help';});}
      checkOverflow();
    });
    $('gpt-comparison').scrollIntoView({block:'start'});
  }
  async function generate(){
    if(busy||$('gpt-generate').disabled)return;
    let input,context,photos;try{photos=P.readAll();input=G.input({request:'',kind:$('gpt-kind').value,materials:$('gpt-materials').value,taste:'',texture:'',count:3},{allowAdviceOnly:photos.length>0});context=U.context(photos.map(x=>x.view));}catch(e){notice(e.message);return;}
    resetResults();const token=++serial;controller=new AbortController();setBusy(true);notice('写真と入力内容からアドバイスを作っています。自動再試行はしません。');
    const timer=setTimeout(()=>controller?.abort(),90000);
    try{
      // text/plainで送る（Apps Scriptが受けられる形）
      const r=await fetch(window.TerrasLinePost.ENDPOINT,{method:'POST',signal:controller.signal,body:JSON.stringify({action:'priceCardAI',...input,count:3,photos,quality:{mode:'advice',criteria:context.criteria},requestId:crypto.randomUUID()})});
      const result=await r.json();if(token!==serial)return;
      if(!result.ok)throw new Error(result.error||'生成に失敗しました。');
      options=G.response({candidates:result.candidates},input.count);const check=Q.assessment(result.check,photos.map(x=>x.view),[],true);render();U.showResult({candidates:options,check,input,context,photos});
      notice('相談の結果ができました。内容をご確認ください。'+(typeof result.remaining==='number'?'（今日のAI相談はあと'+result.remaining+'回）':''));
    }catch(e){if(token===serial)notice(e.name==='AbortError'?'生成を取消・時間切れにしました。サーバー側で処理中なら費用・回数は発生します。':e.message);}
    finally{clearTimeout(timer);if(token===serial){controller=null;setBusy(false);}}
  }
  $('gpt-generate').onclick=generate;
  controls.forEach(id=>$(id).addEventListener('input',()=>{if(hasResult){resetResults();notice('入力を変更しました。候補を作り直してください。');}if(!busy)$('gpt-generate').textContent=buttonLabel();}));
  $('gpt-stop').onclick=()=>{stop();notice('取消しました。サーバーで処理が始まっている場合は費用・回数が発生します。再生成は30秒以上空けてください。');};
  $('gpt-close').onclick=()=>{$('gpt-dialog').close();};
  $('gpt-cancel').onclick=()=>{$('gpt-dialog').close();};
  $('gpt-back').onclick=()=>{$('gpt-inputs').scrollIntoView({block:'start'});$('gpt-kind').focus({preventScroll:true});};
  $('gpt-dialog').addEventListener('close',()=>{stop();P.clear();U.release();});
  $('gpt-reviewed').onchange=()=>{$('gpt-adopt').disabled=selected<0||!$('gpt-reviewed').checked;};
  $('gpt-adopt').onclick=()=>{if(selected<0||!$('gpt-reviewed').checked)return;try{onAdopt(G.candidate(options[selected]));$('gpt-dialog').close();}catch(e){notice(e.message);}};
  P.bind(()=>{if(hasResult)resetResults();setBusy(busy);});
  window.TerrasGPT={candidates(){return options;},open(product,adopt){stop();P.clear();U.reset();original=JSON.parse(JSON.stringify(product));onAdopt=adopt;resetResults();controls.forEach(id=>{$(id).value='';});window.TerrasQualityUI.costRate();$('gpt-generate').textContent=buttonLabel();$('gpt-dialog').showModal();$('gpt-dialog').scrollTop=0;status();}};
})();
