(function(){
  'use strict';
  const $=id=>document.getElementById(id),P=window.TerrasPhotoData,Q=window.TerrasQualityData;
  let photos={},loading=false,locked=false,serial=0,changed=()=>{};
  function render(){
    for(const view of Q.PHOTO_VIEWS){
      const data=photos[view],suffix=view===Q.PHOTO_VIEWS[0]?'':'-'+view;
      $('photo-preview'+suffix).hidden=!data;
      if(data)$('photo-preview-image'+suffix).src=data;else $('photo-preview-image'+suffix).removeAttribute('src');
      $('photo-remove'+suffix).hidden=!data;$('photo-remove'+suffix).disabled=locked;
      for(const id of ['photo-camera','photo-library','photo-camera-input','photo-library-input'])$(id+suffix).disabled=locked||loading;
    }
  }
  // Androidのカメラ写真に合わせる（v1.11.2）：5000万画素・10MB超の写真があり、撮った写真の種類が空のことがある。
  // 種類は「画像以外と分かるもの」だけ断り、読めるかどうかは実際に読んで判断する。読み込みは縮小しながら行い、メモリを使いすぎない。
  const KNOWN=/^image\/(jpeg|png|webp|heic|heif)$/i,PHOTO_NAME=/\.(jpe?g|png|webp|heic|heif)$/i;
  function checkFile(file){
    if(!file||!file.size)throw new Error('写真を読めませんでした。もう一度撮るか、選び直してください。');
    if(file.size>P.maxSourceBytes)throw new Error('写真は40MB以下にしてください。');
    const type=String(file.type||'').toLowerCase();
    if(type&&!type.startsWith('image/')&&!(type==='application/octet-stream'&&PHOTO_NAME.test(file.name||'')))throw new Error('写真（JPEG・PNG・WebP）を選んでください。');
    if(type==='image/svg+xml'||type==='image/gif')throw new Error('写真（JPEG・PNG・WebP）を選んでください。');
  }
  async function decode(file){
    // 縮小しながら読む（Chrome/Android）。幅だけ指定すると高さは比率のまま。だめなら従来の読み方
    if(typeof createImageBitmap==='function'){
      try{const bitmap=await createImageBitmap(file,{resizeWidth:P.maxSide*2,resizeQuality:'high',imageOrientation:'from-image'});return {source:bitmap,width:bitmap.width,height:bitmap.height,done:()=>bitmap.close?.()};}catch{}
    }
    const url=URL.createObjectURL(file),image=new Image();
    try{
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('写真の読込が時間切れになりました。')),20000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error(KNOWN.test(file.type)||!file.type?'写真を読めませんでした。撮り直すか、JPEGで選び直してください。':'この形式の写真は読めません。JPEGで選び直してください。'));};image.src=url;});
    }catch(error){image.onload=null;image.onerror=null;image.src='';URL.revokeObjectURL(url);throw error;}
    return {source:image,width:image.naturalWidth,height:image.naturalHeight,done:()=>{image.onload=null;image.onerror=null;image.src='';URL.revokeObjectURL(url);}};
  }
  async function encode(file){
    checkFile(file);
    const img=await decode(file);
    try{
      const {width,height}=img;
      if(!width||!height)throw new Error('写真を読めませんでした。撮り直してください。');
      const ratio=Math.min(1,P.maxSide/Math.max(width,height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      const context=canvas.getContext('2d');if(!context)throw new Error('このブラウザーで写真を変換できません。');
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img.source,0,0,canvas.width,canvas.height);
      for(const quality of [.82,.65,.45]){const result=canvas.toDataURL('image/jpeg',quality);if(result.length<=22+Math.ceil(P.maxBytes/3)*4)return P.sanitize(result);}
      throw new Error('写真を十分に縮小できませんでした。別の写真を選んでください。');
    }finally{img.done();}
  }
  async function select(event,view){
    const file=event.target.files?.[0];event.target.value='';if(!file||locked)return;
    const token=++serial;loading=true;$('photo-status').textContent='写真を準備しています…';render();changed();
    try{const next=await encode(file);if(token!==serial)return;photos[view]=next;$('photo-status').textContent=Q.VIEW_NAMES[view]+'の写真を準備しました。まだ送信していません。';}
    catch(error){if(token===serial)$('photo-status').textContent=error.message;}
    finally{if(token===serial){loading=false;render();changed();}}
  }
  function clear(){serial++;photos={};loading=false;$('photo-status').textContent='';render();changed();}
  for(const view of Q.PHOTO_VIEWS){
    const suffix=view===Q.PHOTO_VIEWS[0]?'':'-'+view;
    if(view!==Q.PHOTO_VIEWS[0]){
      const slot=document.createElement('section');slot.className='photo-slot';
      const heading=document.createElement('h4');heading.textContent=Q.VIEW_NAMES[view]+'（任意）';slot.append(heading);
      const actions=document.createElement('div');actions.className='photo-actions';
      for(const [kind,label] of [['camera','撮る'],['library','選ぶ'],['remove','外す']]){const button=document.createElement('button');button.type='button';button.id='photo-'+kind+suffix;button.textContent=label;button.setAttribute('aria-label',Q.VIEW_NAMES[view]+'の写真を'+label);actions.append(button);}
      slot.append(actions);
      for(const kind of ['camera','library']){const input=document.createElement('input');input.type='file';input.id='photo-'+kind+'-input'+suffix;input.accept='image/*';input.hidden=true;if(kind==='camera')input.setAttribute('capture','environment');slot.append(input);}
      const figure=document.createElement('figure');figure.id='photo-preview'+suffix;figure.hidden=true;const image=document.createElement('img');image.id='photo-preview-image'+suffix;image.alt=Q.VIEW_NAMES[view]+'の写真';figure.append(image);slot.append(figure);$('photo-extras').append(slot);
    }
    $('photo-camera'+suffix).onclick=()=>$('photo-camera-input'+suffix).click();$('photo-library'+suffix).onclick=()=>$('photo-library-input'+suffix).click();
    $('photo-camera-input'+suffix).onchange=e=>select(e,view);$('photo-library-input'+suffix).onchange=e=>select(e,view);
    $('photo-remove'+suffix).onclick=()=>{delete photos[view];render();changed();};
  }
  window.TerrasPhoto={encode,bind(fn){changed=fn;},read(){return photos[Q.PHOTO_VIEWS[0]]||null;},readAll(){return Q.PHOTO_VIEWS.filter(view=>photos[view]).map(view=>({view,data:photos[view]}));},isLoading(){return loading;},clear,setBusy(value){locked=value;render();}};
  // LINEの中のブラウザー（特にAndroid）はカメラが開かないことがある → いつものブラウザーで開く案内（LINEは openExternalBrowser=1 で外のブラウザーに渡す）
  if(/\bLine\//i.test(navigator.userAgent||'')){
    const note=document.createElement('p');note.className='photo-line-note';
    const link=document.createElement('a');const url=new URL(location.href);url.searchParams.set('openExternalBrowser','1');link.href=url.toString();link.textContent='Chrome（いつものブラウザー）で開く';
    note.append('LINEの中で開いています。写真を撮れないときは、',link,'を押してください。');
    document.querySelector('.photo-input')?.prepend(note);
  }
  render();
})();
