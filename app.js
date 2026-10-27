(function () {
  'use strict';
  const T = window.Terras, A = window.TERRAS_ARCHIVE, S = window.TERRAS_SEASONS;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function fullBackup(){return T.serialize(products,selection,settings,window.TerrasQualityStore.read());}
  let products = [], selection = [], settings = {scale:1,cutMarks:true};
  let draft, dirty=false, loadedId=null, storageBlocked=false, archiveLimit=24, toastTimer, printing=false;
  let confirmResolve;
  let seasonGroup='ハロウィン', seasonLimit=24, historyCard=null, historyGroup=null;
  let namingIteration=0, namingOptions=[], namingUndo=null, gptUndo=null;
  function confirmAction(title, message, yes='続ける') {
    if (confirmResolve) return Promise.resolve(false);
    $('confirm-title').textContent=title; $('confirm-text').textContent=message; $('confirm-yes').textContent=yes;
    $('confirm-dialog').showModal();
    return new Promise(resolve => {confirmResolve=resolve;});
  }
  function closeConfirm(value) { $('confirm-dialog').close(); const fn=confirmResolve; confirmResolve=null; fn?.(value); }
  $('confirm-yes').onclick=()=>closeConfirm(true); $('confirm-no').onclick=()=>closeConfirm(false);
  $('confirm-dialog').addEventListener('cancel',e=>{e.preventDefault();closeConfirm(false);});
  function toast(message) {clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},4000);}
  function persist() {
    if (storageBlocked) {toast('保存できません。JSONバックアップを保存してください。');return false;}
    try {localStorage.setItem(T.STORAGE_KEY,T.serialize(products,selection,settings));$('storage-status').textContent='このブラウザーに保存済み';return true;}
    catch {storageBlocked=true;$('storage-status').textContent='保存不可：JSONでバックアップ';toast('ブラウザーに保存できません。データを失わないようJSONを書き出してください。');return false;}
  }
  function load() {
    let raw;
    try {raw=localStorage.getItem(T.STORAGE_KEY);} catch {storageBlocked=true;}
    if (raw) {
      try {const data=T.parseBackup(raw);products=data.products;selection=data.selection;settings=data.settings;}
      catch {storageBlocked=true;$('storage-status').textContent='保存データの読み取りエラー';toast('保存データの形式が異なります。元データを上書きせず停止しました。');}
    } else if (!storageBlocked) {
      const p={...T.blank(),name:'ハーフバゲット',description:'小さく一つずつ焼き上げたバゲットです。',beforeTax:'190',provenance:{type:'user_instruction',note:'ユーザー確認：税抜190円。大きなパンのカット半分ではなく、小さく個別に焼成。税込価格・アレルゲンは未確認。'}};
      products=[p];selection=[p.id];persist();
    }
    if (storageBlocked) $('storage-status').textContent='保存不可：JSONでバックアップ';
  }
  function setDirty(value) {dirty=value;$('dirty-label').textContent=value?'未保存の変更':(loadedId?'保存済み':'未保存');}
  function readForm() {
    const f=$('product-form');
    return {...draft,events:T.parseEvents(f.elements.events.value),name:f.elements.name.value,description:f.elements.description.value,beforeTax:f.elements.beforeTax.value,includingTax:f.elements.includingTax.value,mainPrice:f.elements.mainPrice.value,allergyStatus:f.elements.allergyStatus.value,allergens:[...f.querySelectorAll('[name="allergen"]:checked')].map(x=>x.value),allergyOther:f.elements.allergyOther.value,theme:f.elements.theme.value,layout:f.elements.layout.value,accent:f.elements.accent.value,nameSize:Number(f.elements.nameSize.value),descriptionSize:Number(f.elements.descriptionSize.value)};
  }
  function provenanceHTML(p) {
    if (!p) return '';
    if (p.type==='user_instruction') return '<details class="source-block"><summary>登録の根拠</summary><p>'+escape(p.note)+'</p></details>';
    if (!Array.isArray(p.price_cells_raw)||!Array.isArray(p.allergen_cells)||!Array.isArray(p.sources)) return '<details class="source-block"><summary>参照情報の原文</summary><pre>'+escape(JSON.stringify(p,null,2))+'</pre></details>';
    return '<details class="source-block"><summary>コピー元の履歴・原文を見る（要確認）</summary>'+rawCardHTML(p)+'</details>';
  }
  function loadEditor(p, saved=false) {
    namingUndo=null;$('naming-undo').hidden=true;gptUndo=null;$('gpt-undo').hidden=true;
    draft=JSON.parse(JSON.stringify(p));loadedId=saved?p.id:null;
    const f=$('product-form');
    for (const k of ['name','description','beforeTax','includingTax','mainPrice','allergyOther','theme','nameSize','descriptionSize']) f.elements[k].value=p[k];
    f.elements.allergyStatus.value=p.allergyStatus;
    f.elements.layout.value=p.layout||'classic';f.elements.accent.value=p.accent||'none';
    f.elements.events.value=(p.events||[]).join('、');
    f.querySelectorAll('[name="allergen"]').forEach(x=>{x.checked=p.allergens.includes(x.value);});
    $('editor-heading').textContent=saved?'商品を編集':'新しい商品';$('provenance-panel').innerHTML=provenanceHTML(p.provenance);
    $('delete-product').disabled=!saved;$('duplicate-product').disabled=!saved;$('form-errors').innerHTML='';setDirty(false);renderEditor();renderProducts();
  }
  async function switchEditor(p,saved) {
    if(dirty && !await confirmAction('未保存の変更があります','別の商品を開くと、保存していない変更は失われます。','変更を破棄して開く')) return;
    loadEditor(p,saved);location.hash='products';
  }
  function renderProducts() {
    const q=$('product-search').value.normalize('NFKC').toLowerCase();
    const matches=products.filter(p=>(p.name+' '+p.description+' '+(p.events||[]).join(' ')).normalize('NFKC').toLowerCase().includes(q));
    $('product-count').textContent=products.length;$('list-total').textContent=products.length+' 件';
    $('product-list').innerHTML=matches.length?matches.map(p=>'<div class="product-row '+(p.id===loadedId?'active':'')+'"><button class="product-open" data-open="'+escape(p.id)+'"><strong>'+escape(p.name)+'</strong><small>'+escape(p.beforeTax?'¥'+p.beforeTax+' 税抜':'¥'+p.includingTax+' 税込')+' · '+(p.allergyStatus==='unknown'?'アレルゲン未確認':'表示内容入力済み')+'</small></button><button class="mini-add" data-add="'+escape(p.id)+'" aria-label="'+escape(p.name)+'をA4に追加">＋</button></div>').join(''):'<div class="empty-state">'+(q?'一致する商品がありません。':'まだ商品がありません。<br>新しい商品を登録しましょう。')+'</div>';
    $('print-product-select').innerHTML=products.map(p=>'<option value="'+escape(p.id)+'">'+escape(p.name)+'</option>').join('');
    $('add-print-product').disabled=!products.length;
    $('event-suggestions').innerHTML=allSeasonGroups().map(g=>'<option value="'+escape(g.label)+'"></option>').join('');
  }
  const cardHTML=T.cardHTML;
  function overflow(card) {
    const problems=[]; if(!card) return problems;
    card.querySelectorAll('[data-measure]').forEach(el=>{
      el.classList.remove('overflow-outline');
      let bad=el.scrollHeight>el.clientHeight+2 || el.scrollWidth>el.clientWidth+2;
      if(el.classList.contains('card-price')||el.classList.contains('card-tax')) {
        const a=el.getBoundingClientRect(),b=card.querySelector('.allergen-table').getBoundingClientRect();
        bad=bad || a.left < b.right+4;
      }
      if(bad){problems.push(el.dataset.measure);el.classList.add('overflow-outline');}
    });
    const table=card.querySelector('.allergen-table');
    if(table.getBoundingClientRect().height>card.getBoundingClientRect().height*18.5/66+2){problems.push('アレルゲン表');table.classList.add('overflow-outline');}
    return problems;
  }
  function warningsHTML(p,overs) {
    const a=[];
    if (!p.name.trim()) a.push('商品名が未入力です。');
    if (!p[p.mainPrice]) a.push('表示する価格が未入力です。');
    if (!p.description.trim()) a.push('説明が空欄です。必要に応じて入力してください。');
    if(p.allergyStatus==='unknown') a.push('アレルゲンは未確認です。カードにも「未確認」と表示します。');
    if(p.allergyStatus==='entered' && !p.allergens.length && !p.allergyOther.trim()) a.push('入力済みのアレルゲン表示が空です。不使用を意味しません。');
    if(overs.length) a.unshift('はみ出し：'+overs.join('・')+'。文字を短くするか、文字サイズを調整してください。');
    return a.map(x=>'<div class="warning">'+escape(x)+'</div>').join('');
  }
  function renderEditor() {
    const p=readForm();$('editor-preview').innerHTML=cardHTML(p);
    const unknown=p.allergyStatus==='unknown';$('allergen-options').classList.toggle('inactive',unknown);
    $('allergen-options').querySelectorAll('input').forEach(x=>{x.disabled=unknown;});$('allergyOther').disabled=unknown;
    requestAnimationFrame(()=>{$('preview-warnings').innerHTML=warningsHTML(p,overflow($('editor-preview').querySelector('.price-card')));});
  }
  function saveProduct(add=false) {
    const p=readForm(),errors=T.validate(p);
    $('form-errors').innerHTML=errors.length?'<div class="error">'+errors.map(escape).join('<br>')+'</div>':'';
    if(errors.length){$('form-errors').scrollIntoView({block:'nearest'});return false;}
    p.name=p.name.trim();p.updatedAt=new Date().toISOString();
    const i=products.findIndex(x=>x.id===p.id); if(i<0) products.push(p); else products[i]=p;
    draft=p;loadedId=p.id;setDirty(false);$('editor-heading').textContent='商品を編集';$('delete-product').disabled=false;$('duplicate-product').disabled=false;
    namingUndo=null;$('naming-undo').hidden=true;gptUndo=null;$('gpt-undo').hidden=true;
    const ok=persist();renderProducts();if(add) addSelection(p.id);else toast(ok?'商品を保存しました。':'この画面に保持しました。JSONバックアップが必要です。');renderPrint();return true;
  }
  function addSelection(id) {
    if(selection.length>=6){toast('A4に並べられるカードは6枚までです。');return;}
    if(!products.some(p=>p.id===id)) return;
    selection.push(id);persist();renderPrint();toast('A4に追加しました（'+selection.length+' / 6）。');
  }
  function marksHTML() {return ['',' right',' bottom',' right bottom'].map(c=>'<i class="cut-mark h'+c+'"></i><i class="cut-mark v'+c+'"></i>').join('');}
  function renderPrint() {
    $('selection-count').textContent=selection.length;$('print-count').textContent=selection.length+' / 6';
    $('print-button').disabled=!selection.length;$('print-scale').value=String(settings.scale);$('cut-marks').checked=settings.cutMarks;
    const g=T.geometry(settings.scale),sheet=$('print-sheet');
    sheet.style.cssText='--card-w:'+g.width+'mm;--card-h:'+g.height+'mm;--card-scale:'+settings.scale+';--margin-y:'+g.marginY+'mm;--margin-x:'+g.marginX+'mm';
    $('geometry-note').textContent='1枚 '+g.width.toFixed(1)+' × '+g.height.toFixed(1)+' mm / 上下余白 '+g.marginY.toFixed(2)+' mm。'+(settings.scale===1?'原寸です。':'95%縮小を明示して適用中。');
    $('selected-list').innerHTML=selection.length?selection.map((id,i)=>'<div class="selected-item"><span class="subtle">'+(i+1)+'</span><span class="selected-name">'+escape(products.find(p=>p.id===id)?.name||'削除済み')+'</span><button data-print-move="'+i+'" data-dir="-1" '+(i===0?'disabled':'')+' aria-label="'+(i+1)+'枚目を前へ">↑</button><button data-print-move="'+i+'" data-dir="1" '+(i===selection.length-1?'disabled':'')+' aria-label="'+(i+1)+'枚目を後へ">↓</button><button data-print-repeat="'+i+'" aria-label="'+(i+1)+'枚目をもう1枚追加">＋</button><button data-print-remove="'+i+'" aria-label="'+(i+1)+'枚目を外す">×</button></div>').join(''):'<div class="empty-state">印刷するカードを追加してください。</div>';
    $('print-grid').innerHTML=Array.from({length:6},(_,i)=>{const p=products.find(x=>x.id===selection[i]);return '<div class="print-slot '+(p?'':'empty')+'">'+(p?cardHTML(p)+(settings.cutMarks?marksHTML():''):String(i+1))+'</div>';}).join('');
    requestAnimationFrame(checkPrint);
  }
  function checkPrint() {
    const issues=[];
    $('print-grid').querySelectorAll('.price-card').forEach((card,i)=>{const o=overflow(card);if(o.length)issues.push((i+1)+'枚目：'+o.join('・')+'がはみ出しています。');});
    const unknown=selection.filter(id=>products.find(p=>p.id===id)?.allergyStatus==='unknown').length;
    $('print-warnings').innerHTML=issues.map(x=>'<div class="error">'+escape(x)+'</div>').join('')+(unknown?'<div class="warning">'+unknown+'枚にアレルゲン未確認の表示があります。</div>':'');
    return issues;
  }
  function rawCardHTML(c) {
    return '<p><b>価格の原文（税区分・端数は未検証）</b><br>'+c.price_cells_raw.map(p=>escape(p.cell)+': '+escape(p.raw===null?'（空欄）':p.raw)).join('<br>')+'</p><p><b>表示候補の原文（アレルゲンとは限りません）</b><br>'+c.allergen_cells.map(a=>[a.label,a.marker,a.extra].filter(Boolean).map(x=>escape(x.cell)+': '+escape(x.raw===null?'（空欄）':x.raw)).join(' / ')).join('<br>')+'</p><p><b>出典</b><br>'+c.sources.map(s=>escape(s.sheet_name)+' / '+escape(s.card_data_range)+' / '+escape(s.name_cell)).join('<br>')+'</p>';
  }
  function renderArchive(reset=false) {
    if(!A){$('archive-results').innerHTML='<div class="error">履歴ファイルが見つかりません。archive.jsを同じフォルダーに置いてください。</div>';return;}
    if(reset)archiveLimit=24;
    const q=$('archive-search').value,sheet=$('archive-sheet').value,raw=$('archive-mode').value==='raw';
    if(!raw) {
      const matches=T.filterArchive(A.cards,q,sheet);
      $('archive-result-count').textContent=matches.length+' 種類 / 全1,146種類・1,439件の出現元（395タブ）。同名の異なる内容は別の履歴です。';
      $('archive-results').className='archive-card-list';
      $('archive-results').innerHTML=matches.slice(0,archiveLimit).map(c=>'<article class="archive-item"><span class="pill">過去データ・未確認</span><h3>'+escape(c.name_raw||'（商品名なし）')+'</h3><p>'+escape(c.description_raw||'（説明なし）')+'</p><details><summary>価格・表示内容・出典の原文</summary>'+rawCardHTML(c)+'</details><button data-history-open="'+escape(c.id)+'">カードを開く</button> <button data-archive-copy="'+escape(c.id)+'">新しい商品へコピー →</button></article>').join('') || '<div class="archive-empty">一致するカードがありません。特殊書式や商品名のないセルは元タブ表示で確認できます。<br><button id="show-raw">元タブの全セルを見る →</button></div>';
      $('archive-more').hidden=matches.length<=archiveLimit;
    } else {
      const needle=q.normalize('NFKC').toLowerCase();
      const matches=A.sheets.filter(s=>(!sheet||s.name===sheet)&&(!needle||[s.name,...Object.values(s.cells).map(c=>c.value)].join(' ').normalize('NFKC').toLowerCase().includes(needle)));
      $('archive-result-count').textContent=matches.length+' タブ / 全395タブ。全ての非空セルを原文で保持（26タブの特殊書式を含む）。';
      $('archive-results').className='';
      $('archive-results').innerHTML=matches.slice(0,archiveLimit).map(s=>'<details class="archive-sheet-block" data-sheet-index="'+s.index+'"><summary>'+escape(s.name)+' <span class="subtle">'+Object.keys(s.cells).length+' セル'+(A.stats.unrecognized_sheets.includes(s.name)?' · 特殊書式':'')+'</span></summary><div class="raw-sheet-content"></div></details>').join('')||'<div class="archive-empty">一致する元タブがありません。</div>';
      $('archive-more').hidden=matches.length<=archiveLimit;
    }
  }
  function renderRawSheet(el) {
    if(!el.open||el.dataset.rendered)return; const s=A.sheets.find(x=>x.index===Number(el.dataset.sheetIndex)); if(!s)return;
    el.querySelector('.raw-sheet-content').innerHTML='<p class="raw-meta">出典：'+escape(A.source.filename)+' / '+escape(s.name)+'。ExcelシートIDはGoogleのgidとして使用しません。書式IDは原本に対応します。</p><table class="raw-table"><thead><tr><th>セル</th><th>原文</th><th>型 / 書式</th></tr></thead><tbody>'+Object.entries(s.cells).map(([cell,c])=>'<tr><th>'+escape(cell)+'</th><td>'+escape(c.value)+'</td><td>'+escape(c.type)+' / '+escape(c.style_id)+'</td></tr>').join('')+'</tbody></table><details><summary>結合・印刷設定を含む元タブのJSON</summary><pre>'+escape(JSON.stringify(s,null,2))+'</pre></details>';
    el.dataset.rendered='true';
  }
  function allSeasonGroups() {
    const groups=(S?.groups||[]).map(g=>({...g}));
    for(const p of products)for(const tag of p.events||[])if(!groups.some(g=>g.label===tag))groups.push({label:tag,icon:'♧',sheets:[],historyCount:0});
    return groups;
  }
  function sourcePreview(c,source) {return S?.previews[String(source.sheet_index)]?.cards[c.id+'@'+source.name_cell]||null;}
  function renderSeasons() {
    const groups=allSeasonGroups(),group=groups.find(g=>g.label===seasonGroup)||{label:seasonGroup,icon:'◌',sheets:[]};
    $('season-groups').innerHTML=groups.map(g=>'<button class="season-group '+(g.label===seasonGroup?'active':'')+'" data-season="'+escape(g.label)+'" aria-pressed="'+(g.label===seasonGroup)+'"><span class="season-icon">'+escape(g.icon)+'</span><strong>'+escape(g.label)+'</strong><small>過去 '+(g.historyCount||0)+'種類 · 登録 '+products.filter(p=>(p.events||[]).includes(g.label)).length+'件</small></button>').join('');
    $('season-title').textContent=group.label;
    $('season-source-note').textContent=group.sheets.length?'元タブ：'+group.sheets.join(' / '):'登録商品のイベントタグです。この名前の元タブは確認されていません。';
    const q=$('season-search').value.normalize('NFKC').toLowerCase();
    const current=products.filter(p=>(p.events||[]).includes(group.label)&&(!q||[p.name,p.description,p.beforeTax,p.includingTax].join(' ').normalize('NFKC').toLowerCase().includes(q)));
    const past=T.seasonHistory(A?.cards||[],group,$('season-search').value);
    $('season-current-count').textContent=current.length+' 件';$('season-history-count').textContent=past.length+' 種類';
    $('season-current').innerHTML=current.length?current.map(p=>'<article class="season-current-card"><span class="pill">登録商品</span><h3>'+escape(p.name)+'</h3><p>'+escape(p.description)+'</p><button data-season-edit="'+escape(p.id)+'">商品を編集 →</button><button data-season-add="'+escape(p.id)+'">A4に追加</button></article>').join(''):'<div class="season-empty">'+(q?'検索に一致する登録商品はありません。':'このイベントの登録商品はまだありません。「このイベントで登録」から作れます。')+'</div>';
    $('season-history').innerHTML=past.length?past.slice(0,seasonLimit).map(c=>{const source=c.sources.find(src=>group.sheets.includes(src.sheet_name)&&sourcePreview(c,src));const image=source&&sourcePreview(c,source);return '<article class="season-history-card"><button class="source-thumbnail" data-season-open="'+escape(c.id)+'" aria-label="'+escape(c.name_raw||'商品名なし')+'の過去カードを開く">'+(image?'<img loading="lazy" src="'+escape(image)+'" alt="元ブックの'+escape(c.name_raw||'商品名なし')+'のカードプレビュー">':'<span>'+escape(c.name_raw||'（商品名なし）')+'</span>')+'</button><div class="season-history-body"><span class="pill">過去データ・未確認</span><h3>'+escape(c.name_raw||'（商品名なし）')+'</h3><p>'+escape(source?.sheet_name||c.sources[0]?.sheet_name||'')+'</p><button data-season-open="'+escape(c.id)+'">カードを開く →</button></div></article>';}).join(''):'<div class="season-empty">'+(q?'検索に一致する過去カードはありません。検索語を変えてください。':'このイベントに対応する過去カードはありません。新しく登録した商品をタグでまとめられます。')+'</div>';
    $('season-more').hidden=past.length<=seasonLimit;
  }
  function openHistory(id,group=null) {
    const c=A.cards.find(x=>x.id===id);if(!c)return;historyCard=c;historyGroup=group;
    $('history-title').textContent=c.name_raw||'（商品名なし）';
    $('history-source-select').innerHTML=c.sources.map((src,i)=>'<option value="'+i+'">'+escape(src.sheet_name+' / '+src.card_data_range)+'</option>').join('');
    let chosen=c.sources.findIndex(src=>sourcePreview(c,src)&&(!group||(S.groups.find(g=>g.label===group)?.sheets||[]).includes(src.sheet_name)));
    if(chosen<0)chosen=0;$('history-source-select').value=String(chosen);
    $('history-raw').innerHTML=rawCardHTML(c);renderHistoryPreview();$('history-dialog').showModal();$('history-dialog').scrollTop=0;
  }
  function renderHistoryPreview() {
    const c=historyCard;if(!c)return;const src=c.sources[Number($('history-source-select').value)],image=sourcePreview(c,src);
    $('history-preview').innerHTML=image?'<img src="'+escape(image)+'" alt="'+escape(src.sheet_name+' / '+src.card_data_range)+'の元カード">':'<div class="history-text-preview"><h3>'+escape(c.name_raw||'（商品名なし）')+'</h3><p>'+escape(c.description_raw)+'</p><p>価格セルの原文</p>'+c.price_cells_raw.filter(p=>p.raw!==null).map(p=>'<div>'+escape(p.cell)+': '+escape(p.raw)+'</div>').join('')+'</div>';
    $('history-limits').textContent=image?S.limits:'この出典は画像プレビュー未作成のため、原文テキストを表示しています。価格やアレルゲンの原文と出典は下の詳細で確認できます。';
    const hasArt=(S.groups.find(g=>g.label==='ハロウィン')?.sheets||[]).includes(src.sheet_name);$('history-art').hidden=!hasArt;
    $('history-art-links').innerHTML=hasArt?S.originalImages.map((file,i)=>'<a href="'+escape(file)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+escape(file)+'" alt="元画像：'+['城','かぼちゃ','月','こうもり','おばけ'][i]+'"><span>'+['城','かぼちゃ','月','こうもり','おばけ'][i]+'</span></a>').join(''):'';
    const sheet=S.previews[String(src.sheet_index)]?.sheetPreview;$('history-sheet-link').hidden=!sheet;if(sheet)$('history-sheet-link').href=sheet;
  }
  function route() {
    const requested=location.hash.slice(1).split('/')[0];
    const name=['products','ideas','print','archive','seasons','basics'].includes(requested)?requested:(matchMedia('(max-width:560px)').matches?'ideas':'products');
    document.querySelectorAll('.view').forEach(x=>{x.hidden=x.id!=='view-'+name;});document.querySelectorAll('[data-nav]').forEach(x=>{const yes=x.dataset.nav===name;x.classList.toggle('active',yes);if(yes)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current');});
    if(name==='print')renderPrint();if(name==='archive')renderArchive();if(name==='products')renderEditor();if(name==='seasons'){try{const part=location.hash.slice(1).split('/')[1];if(part)seasonGroup=decodeURIComponent(part);}catch{}renderSeasons();}
  }
  $('allergen-options').innerHTML=T.ALLERGENS.map(x=>'<label><input type="checkbox" name="allergen" value="'+x+'">'+x+'</label>').join('');
  function setGPTFields(p){for(const k of ['name','description','theme','layout','accent','nameSize','descriptionSize'])$('product-form').elements[k].value=p[k]||({layout:'classic',accent:'none'}[k]||'');}
  $('gpt-open').onclick=()=>window.TerrasGPT.open(readForm(),candidate=>{gptUndo=readForm();const next=window.TerrasGPTData.adopt(readForm(),candidate);setGPTFields(next);$('gpt-undo').hidden=false;setDirty(true);renderEditor();toast('AI案を採用しました。確認してから保存してください。');});
  $('ideas-start').onclick=async()=>{
    if(dirty&&!await confirmAction('未保存の編集があります','新しい案を採用すると、編集中の商品から新しい商品へ切り替わります。先に保存する場合は戻ってください。','新しい案を考える'))return;
    const base=T.blank();window.TerrasGPT.open(base,candidate=>{loadEditor(window.TerrasGPTData.adopt(base,candidate),false);gptUndo=base;$('gpt-undo').hidden=false;setDirty(true);location.hash='products';toast('名前と説明文を新しい商品へ採用しました。価格などを確認して保存してください。');},'consult');
  };
  $('gpt-undo').onclick=()=>{if(!gptUndo)return;setGPTFields(gptUndo);gptUndo=null;$('gpt-undo').hidden=true;setDirty(true);renderEditor();};
  $('naming-open').onclick=()=>{
    namingIteration=0;namingOptions=[];$('naming-current').textContent=$('name').value||'（未入力）';
    for(const id of ['naming-kind','naming-materials','naming-taste','naming-texture'])$(id).value='';
    $('naming-errors').innerHTML='';$('naming-results').innerHTML='';$('naming-adopt').disabled=true;$('naming-dialog').showModal();$('naming-dialog').scrollTop=0;
  };
  for(const id of ['naming-kind','naming-materials','naming-taste','naming-texture'])$(id).oninput=()=>{namingOptions=[];namingIteration=0;$('naming-results').innerHTML='<p class="field-help">入力を更新しました。「候補を作る」で作り直してください。</p>';$('naming-adopt').disabled=true;};
  $('naming-generate').onclick=()=>{
    const result=T.nameCandidates({kind:$('naming-kind').value,materials:$('naming-materials').value,taste:$('naming-taste').value,texture:$('naming-texture').value},namingIteration++);
    namingOptions=result.candidates.slice(0,6);$('naming-adopt').disabled=true;
    $('naming-errors').innerHTML=result.errors.length?'<div class="error">'+result.errors.map(escape).join('<br>')+'</div>':'';
    $('naming-results').innerHTML=namingOptions.map((name,i)=>'<label class="name-candidate"><input type="radio" name="name-candidate" value="'+i+'" '+(name.length>500?'disabled':'')+'><span>'+escape(name)+'<small>'+name.length+'文字'+(name.length>500?' · 登録上限500文字を超えます。入力を短くしてください。':name.length>28?' · 長めの名前です。採用後にはみ出しを確認してください。':'')+'</small></span></label>').join('');
  };
  $('naming-results').onchange=()=>{$('naming-adopt').disabled=!$('naming-results').querySelector('input:checked');};
  $('naming-adopt').onclick=()=>{
    const selected=$('naming-results').querySelector('input:checked');if(!selected)return;
    const name=namingOptions[Number(selected.value)];if(!name||name.length>500)return;
    namingUndo=$('name').value;$('name').value=name;$('naming-undo').hidden=false;setDirty(true);renderEditor();$('naming-dialog').close();toast('候補を商品名に入れました。確認してから保存してください。');
  };
  $('naming-cancel').onclick=()=>{$('naming-dialog').close();};
  $('naming-undo').onclick=()=>{if(namingUndo===null)return;$('name').value=namingUndo;namingUndo=null;$('naming-undo').hidden=true;setDirty(true);renderEditor();toast('採用前の商品名に戻しました。');};
  $('season-groups').onclick=e=>{const b=e.target.closest('[data-season]');if(b){seasonGroup=b.dataset.season;seasonLimit=24;$('season-search').value='';location.hash='seasons/'+encodeURIComponent(seasonGroup);renderSeasons();}};
  $('season-search').oninput=()=>{seasonLimit=24;renderSeasons();};$('season-more').onclick=()=>{seasonLimit+=24;renderSeasons();};
  $('new-season-product').onclick=()=>{const p=T.blank();p.events=[seasonGroup];switchEditor(p,false);};
  $('season-current').onclick=e=>{const edit=e.target.closest('[data-season-edit]'),add=e.target.closest('[data-season-add]');if(edit)switchEditor(products.find(p=>p.id===edit.dataset.seasonEdit),true);if(add)addSelection(add.dataset.seasonAdd);};
  $('season-history').onclick=e=>{const b=e.target.closest('[data-season-open]');if(b)openHistory(b.dataset.seasonOpen,seasonGroup);};
  $('history-source-select').onchange=renderHistoryPreview;
  $('history-copy').onclick=()=>{if(!historyCard)return;const p=T.fromArchive(historyCard);p.events=historyGroup?[historyGroup]:T.eventsForArchive(historyCard,S.groups);$('history-dialog').close();switchEditor(p,false);};
  $('product-form').addEventListener('input',()=>{setDirty(true);renderEditor();});
  $('product-form').addEventListener('change',()=>{setDirty(true);renderEditor();});
  $('product-form').addEventListener('submit',e=>{e.preventDefault();saveProduct();});
  $('save-select').onclick=()=>{if(saveProduct(true))location.hash='print';};
  $('new-product').onclick=()=>switchEditor(T.blank(),false);
  $('duplicate-product').onclick=()=>{if(loadedId){const p=T.copy(readForm());switchEditor(p,false);}};
  $('delete-product').onclick=async()=>{
    if(!loadedId)return;
    const id=loadedId,p=products.find(x=>x.id===id);
    if(!await confirmAction('商品を削除','「'+p.name+'」を登録商品と印刷選択から外します。必要な場合は先にJSONでバックアップしてください。','削除する'))return;
    products=products.filter(x=>x.id!==id);selection=selection.filter(x=>x!==id);persist();loadEditor(products[0]||T.blank(),!!products.length);renderPrint();toast('商品を削除しました。');
  };
  $('product-search').oninput=renderProducts;
  $('product-list').onclick=e=>{const open=e.target.closest('[data-open]'),add=e.target.closest('[data-add]');if(open)switchEditor(products.find(p=>p.id===open.dataset.open),true);if(add)addSelection(add.dataset.add);};
  $('add-print-product').onclick=()=>addSelection($('print-product-select').value);
  $('selected-list').onclick=e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.printRepeat!==undefined){addSelection(selection[Number(b.dataset.printRepeat)]);return;}
    if(b.dataset.printRemove!==undefined)selection.splice(Number(b.dataset.printRemove),1);
    if(b.dataset.printMove!==undefined){const i=Number(b.dataset.printMove),j=i+Number(b.dataset.dir);if(j>=0&&j<selection.length)[selection[i],selection[j]]=[selection[j],selection[i]];}
    persist();renderPrint();
  };
  $('print-scale').onchange=()=>{settings.scale=Number($('print-scale').value);persist();renderPrint();};
  $('cut-marks').onchange=()=>{settings.cutMarks=$('cut-marks').checked;persist();renderPrint();};
  $('print-button').onclick=async()=>{
    if(printing||!selection.length)return;
    if(checkPrint().length){toast('はみ出している文字を調整してから印刷してください。');return;}
    printing=true;
    if(dirty && !await confirmAction('保存済みの内容を印刷します','編集画面に未保存の変更があります。今回の印刷には保存済みの商品が使われます。','保存済みを印刷')){printing=false;return;}
    window.print();setTimeout(()=>{printing=false;},800);
  };
  window.addEventListener('beforeprint',()=>{document.body.classList.add('printing');});
  window.addEventListener('afterprint',()=>{printing=false;document.body.classList.remove('printing');});
  $('backup-open').onclick=()=>{$('backup-dialog').showModal();};$('help-open').onclick=()=>{$('help-dialog').showModal();};
  $('handoff-prompt').value=window.TerrasHandoff.START_PROMPT;
  $('handoff-backup').onclick=()=>{$('handoff-dialog').close();$('backup-dialog').showModal();};
  $('handoff-open').onclick=()=>{
    $('handoff-product-count').textContent=products.length;$('handoff-dirty').hidden=!dirty;
    $('handoff-dialog').showModal();$('handoff-dialog').scrollTop=0;
  };
  $('handoff-download').onclick=async()=>{
    const button=$('handoff-download'),status=$('handoff-status');
    button.disabled=true;button.setAttribute('aria-busy','true');status.textContent='引き継ぎファイルを準備しています…';
    try{
      const backup=fullBackup();
      const blob=await window.TerrasHandoff.createPackage({backup,onProgress:(done,total)=>{status.textContent='ソースと素材をまとめています… '+done+' / '+total;}});
      const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='TERRAS-Claude-handoff-'+new Date().toLocaleDateString('sv-SE')+'.zip';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      status.textContent='ZIPを作成しました。ダウンロード先を確認し、Claudeに添付してください。';
    }catch(err){status.textContent=err.message||'作成できませんでした。通信を確認して、もう一度お試しください。';}
    finally{button.disabled=false;button.removeAttribute('aria-busy');}
  };
  $('handoff-copy').onclick=async()=>{
    try{await navigator.clipboard.writeText($('handoff-prompt').value);$('handoff-status').textContent='依頼文をコピーしました。Claudeに貼り付けてください。';}
    catch{$('handoff-prompt').focus();$('handoff-prompt').select();$('handoff-status').textContent='依頼文を選択しました。手動でコピーしてください。';}
  };
  document.querySelectorAll('[data-close]').forEach(x=>{x.onclick=()=>x.closest('dialog').close();});
  $('export-backup').onclick=()=>{
    try{const blob=new Blob([fullBackup()],{type:'application/json;charset=utf-8'});const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='TERRAS-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);$('import-result').textContent='JSONを書き出しました。商品・チェック履歴・基準写真が含まれます。ダウンロード先をご確認ください。';}catch(e){$('import-result').textContent=e.message;}
  };
  function importJSON(text) {
    try {const data=T.parseBackup(text);const merged=T.mergeBackup(products,data.products);if(data.quality){window.TerrasQualityStore.importState(data.quality);window.TerrasQualityUI.refresh();}products=merged.products;if(!selection.length){selection=data.selection.slice();settings=data.settings;}persist();renderProducts();renderPrint();$('import-result').textContent=merged.count+'件を追加しました。既存の商品を保持しています。'+(data.quality?' チェック基準・基準写真を復元し、履歴は重複なく追加しました。':'');}
    catch(err){$('import-result').textContent=err.message;}
  }
  $('import-text-button').onclick=()=>importJSON($('import-text').value);
  $('import-file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    if(file.size>20*1024*1024){$('import-result').textContent='JSONファイルは20MB以下にしてください。';return;}
    importJSON(await file.text());
    e.target.value='';
  };
  for(const id of ['archive-search','archive-sheet','archive-mode'])$(id).addEventListener(id==='archive-search'?'input':'change',()=>renderArchive(true));
  $('archive-more').onclick=()=>{archiveLimit+=24;renderArchive();};
  $('archive-results').addEventListener('toggle',e=>{if(e.target.matches('.archive-sheet-block'))renderRawSheet(e.target);},true);
  $('archive-results').onclick=async e=>{
    if(e.target.closest('#show-raw')){$('archive-mode').value='raw';renderArchive(true);}
    const open=e.target.closest('[data-history-open]');if(open){openHistory(open.dataset.historyOpen);return;}
    const b=e.target.closest('[data-archive-copy]');if(!b)return;const c=A.cards.find(x=>x.id===b.dataset.archiveCopy);if(c){const p=T.fromArchive(c);p.events=T.eventsForArchive(c,S?.groups||[]);await switchEditor(p,false);}
  };
  if(A)$('archive-sheet').innerHTML='<option value="">全395タブ</option>'+A.sheets.map(s=>'<option value="'+escape(s.name)+'">'+escape(s.name)+'</option>').join('');
  window.addEventListener('hashchange',route);
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  window.addEventListener('storage',e=>{if(e.key===T.STORAGE_KEY)toast('別のタブでデータが変更されました。この画面をバックアップしてから再読み込みしてください。');});
  load();loadEditor(products[0]||T.blank(),!!products.length);renderPrint();route();
  document.fonts?.ready.then(()=>{renderEditor();if(location.hash==='#print')renderPrint();});
})();
