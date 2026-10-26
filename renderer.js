(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function cardHTML(p) {
    const entered=p.allergyStatus==='entered';
    const extras=entered?[...p.allergens.filter(x=>!['小麦','卵','乳'].includes(x)),p.allergyOther].filter(Boolean).join('・'):'アレルゲン\n未確認';
    const main=p[p.mainPrice]||'—', alternate=p.mainPrice==='beforeTax'?p.includingTax:p.beforeTax;
    return '<article class="price-card '+(p.theme==='white'?'white ':'')+'layout-'+(['classic','left','accent'].includes(p.layout)?p.layout:'classic')+' accent-'+(['none','olive','rust','gold'].includes(p.accent)?p.accent:'none')+'" style="--name-size:'+Number(p.nameSize)+'pt;--desc-size:'+Number(p.descriptionSize)+'pt" aria-label="'+escape(p.name||'未入力のカード')+'"><div class="card-name" data-measure="商品名">'+escape(p.name||'商品名')+'</div><div class="card-description" data-measure="説明">'+escape(p.description)+'</div><div class="card-bottom"><table class="allergen-table" aria-label="アレルゲン表示。空欄は不使用を意味しません"><tr><th>小麦</th><th>卵</th><th>乳</th><th>'+(entered?'記載分':'確認状態')+'</th></tr><tr>'+['小麦','卵','乳'].map(a=>'<td class="marker">'+(entered?(p.allergens.includes(a)?'◎':''):'?')+'</td>').join('')+'<td class="allergen-extra" data-measure="その他のアレルゲン">'+escape(extras||'')+'</td></tr></table><div class="card-tax" data-measure="補助価格">'+(alternate?'¥'+escape(alternate)+'（'+(p.mainPrice==='beforeTax'?'税込':'税抜')+'）':'')+'</div><div class="card-price" data-measure="価格"><span class="yen">¥</span>'+escape(main)+'<span class="tax-kind">'+(p.mainPrice==='beforeTax'?'税抜':'税込')+'</span></div></div></article>';
  }
  if(typeof module !== 'undefined') module.exports=cardHTML; else root.Terras.cardHTML=cardHTML;
})(typeof window === 'undefined' ? globalThis : window);
