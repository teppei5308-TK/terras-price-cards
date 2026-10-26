(function(){
  'use strict';
  const $=id=>document.getElementById(id),P=window.TerrasPhotoData,Q=window.TerrasQualityData;
  let photos={},loading=false,locked=false,serial=0,changed=()=>{};
  function render(){
    for(const view of Q.PHOTO_VIEWS){
      const data=photos[view],suffix=view==='top'?'':'-'+view;
      $('photo-preview'+suffix).hidden=!data;
      if(data)$('photo-preview-image'+suffix).src=data;else $('photo-preview-image'+suffix).removeAttribute('src');
      $('photo-remove'+suffix).hidden=!data;$('photo-remove'+suffix).disabled=locked;
      for(const id of ['photo-camera','photo-library','photo-camera-input','photo-library-input'])$(id+suffix).disabled=locked||loading;
    }
  }
  async function encode(file){
    if(file.size>P.maxSourceBytes)throw new Error('写真は10MB以下にしてください。');
    if(!file.size||!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type))throw new Error('JPEG・PNG・WebPの写真を選んでください。HEICは端末で読める場合に対応します。');
    const url=URL.createObjectURL(file),image=new Image();
    try{
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('写真の読込が時間切れになりました。')),15000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error('写真を読めませんでした。JPEGで選び直すか、撮り直してください。'));};image.src=url;});
      const width=image.naturalWidth,height=image.naturalHeight;
      if(!width||!height||width*height>40000000)throw new Error('写真が大きすぎます。小さくして選び直してください。');
      const ratio=Math.min(1,P.maxSide/Math.max(width,height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      const context=canvas.getContext('2d');if(!context)throw new Error('このブラウザーで写真を変換できません。');
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [.82,.65,.45]){const result=canvas.toDataURL('image/jpeg',quality);if(result.length<=22+Math.ceil(P.maxBytes/3)*4)return P.sanitize(result);}
      throw new Error('写真を十分に縮小できませんでした。別の写真を選んでください。');
    }finally{image.onload=null;image.onerror=null;image.src='';URL.revokeObjectURL(url);}
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
    const suffix=view==='top'?'':'-'+view;
    if(view!=='top'){
      const slot=document.createElement('section');slot.className='photo-slot';
      const heading=document.createElement('h4');heading.textContent=Q.VIEW_NAMES[view]+'（任意）';slot.append(heading);
      const actions=document.createElement('div');actions.className='photo-actions';
      for(const [kind,label] of [['camera','撮る'],['library','選ぶ'],['remove','外す']]){const button=document.createElement('button');button.type='button';button.id='photo-'+kind+suffix;button.textContent=label;button.setAttribute('aria-label',Q.VIEW_NAMES[view]+'の写真を'+label);actions.append(button);}
      slot.append(actions);
      for(const kind of ['camera','library']){const input=document.createElement('input');input.type='file';input.id='photo-'+kind+'-input'+suffix;input.accept='image/jpeg,image/png,image/webp,image/heic,image/heif';input.hidden=true;if(kind==='camera')input.setAttribute('capture','environment');slot.append(input);}
      const figure=document.createElement('figure');figure.id='photo-preview'+suffix;figure.hidden=true;const image=document.createElement('img');image.id='photo-preview-image'+suffix;image.alt=Q.VIEW_NAMES[view]+'の写真';figure.append(image);slot.append(figure);$('photo-extras').append(slot);
    }
    $('photo-camera'+suffix).onclick=()=>$('photo-camera-input'+suffix).click();$('photo-library'+suffix).onclick=()=>$('photo-library-input'+suffix).click();
    $('photo-camera-input'+suffix).onchange=e=>select(e,view);$('photo-library-input'+suffix).onchange=e=>select(e,view);
    $('photo-remove'+suffix).onclick=()=>{delete photos[view];render();changed();};
  }
  window.TerrasPhoto={encode,bind(fn){changed=fn;},read(){return photos.top||null;},readAll(){return Q.PHOTO_VIEWS.filter(view=>photos[view]).map(view=>({view,data:photos[view]}));},isLoading(){return loading;},clear,setBusy(value){locked=value;render();}};
  render();
})();
