(function (root) {
  'use strict';
  const SCHEMA = 1;
  const STORAGE_KEY = 'terras.pricecards.v1';
  const ALLERGENS = ['小麦', '卵', '乳', 'くるみ', '落花生', 'そば', 'えび', 'かに', 'アーモンド', '大豆', 'ごま'];
  const uid = () => globalThis.crypto?.randomUUID?.() || 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const blank = () => ({id: uid(), name: '', description: '', beforeTax: '', includingTax: '', mainPrice: 'beforeTax', allergyStatus: 'unknown', allergens: [], allergyOther: '', theme: 'black', nameSize: 17, descriptionSize: 9, events: [], provenance: null, updatedAt: new Date().toISOString()});
  function validate(p) {
    const errors = [];
    if (!p || typeof p !== 'object') return ['商品の形式が正しくありません。'];
    if (typeof p.id !== 'string' || !p.id || p.id.length > 100) errors.push('商品IDが正しくありません。');
    for (const key of ['name', 'description', 'beforeTax', 'includingTax', 'allergyOther']) if (typeof p[key] !== 'string') errors.push(key + 'の形式が正しくありません。');
    if (typeof p.name === 'string' && !p.name.trim()) errors.push('商品名を入力してください。');
    if ((p.name?.length || 0) > 500 || (p.description?.length || 0) > 5000 || (p.allergyOther?.length || 0) > 1000) errors.push('入力が長すぎます。内容を分けてください。');
    for (const k of ['beforeTax', 'includingTax']) if (p[k] !== '' && !/^\d{1,8}(\.\d{1,2})?$/.test(p[k])) errors.push((k === 'beforeTax' ? '税抜' : '税込') + '価格は半角数字で入力してください（最大8桁、小数2桁）。');
    if (!['beforeTax', 'includingTax'].includes(p.mainPrice)) errors.push('大きく表示する価格を選んでください。');
    else if (!p[p.mainPrice]) errors.push('大きく表示する価格を入力してください。');
    if (!['unknown', 'entered'].includes(p.allergyStatus)) errors.push('アレルゲン情報の状態が正しくありません。');
    if (!Array.isArray(p.allergens) || p.allergens.some(x => !ALLERGENS.includes(x)) || new Set(p.allergens).size !== p.allergens.length) errors.push('アレルゲン選択の形式が正しくありません。');
    if(p.layout!==undefined&&!['classic','left','accent'].includes(p.layout))errors.push('レイアウトが正しくありません。');
    if(p.accent!==undefined&&!['none','olive','rust','gold'].includes(p.accent))errors.push('アクセントが正しくありません。');
    if (!['black', 'white'].includes(p.theme)) errors.push('カードの配色が正しくありません。');
    if (![16,17,18].includes(Number(p.nameSize)) || ![8,9].includes(Number(p.descriptionSize))) errors.push('文字サイズが正しくありません。');
    if (p.events !== undefined && (!Array.isArray(p.events) || p.events.length>10 || p.events.some(e=>typeof e!=='string'||!e.trim()||e.length>40) || new Set(p.events).size!==p.events.length)) errors.push('季節・イベントは重複なしで10件まで、各40文字以内で入力してください。');
    return [...new Set(errors)];
  }
  function copy(p) { return {...JSON.parse(JSON.stringify(p)), id: uid(), name: p.name + '（複製）', updatedAt: new Date().toISOString()}; }
  function fromArchive(c) {
    return {...blank(), name: String(c.name_raw || ''), description: String(c.description_raw || ''), provenance: JSON.parse(JSON.stringify(c))};
  }
  function serialize(products, selection, settings, quality) {
    return JSON.stringify({app: 'TERRAS price cards', schemaVersion: SCHEMA, exportedAt: new Date().toISOString(), products, selection, settings, ...(quality===undefined?{}:{quality:qualityAPI().state(quality)})}, null, 2);
  }
  function qualityAPI() {return root.TerrasQualityData || (typeof require==='function'?require('./quality-data.js'):null);}
  function parseBackup(text) {
    if (typeof text !== 'string' || text.length > 20 * 1024 * 1024) throw new Error('JSONファイルは20MB以下にしてください。');
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('JSONを読み取れませんでした。バックアップファイルを選んでください。'); }
    if (data?.app !== 'TERRAS price cards' || data.schemaVersion !== SCHEMA || !Array.isArray(data.products) || data.products.length > 5000) throw new Error('対応するTERRASバックアップではありません。');
    const ids = new Set();
    for (const p of data.products) {
      const errors = validate(p);
      if (errors.length) throw new Error('商品「' + String(p?.name || '') + '」: ' + errors.join(' '));
      if (ids.has(p.id)) throw new Error('商品IDが重複しています。');
      ids.add(p.id);
    }
    if (!Array.isArray(data.selection) || data.selection.length > 6 || data.selection.some(id => !ids.has(id))) throw new Error('印刷する商品の選択が正しくありません。');
    if (!data.settings || ![1,0.95].includes(data.settings.scale) || typeof data.settings.cutMarks !== 'boolean') throw new Error('印刷設定が正しくありません。');
    if (Object.hasOwn(data,'quality')) data.quality=qualityAPI().state(data.quality);
    return data;
  }
  function mergeBackup(current, incoming) {
    const map = new Map(current.map(p => [p.id, p]));
    let count = 0;
    for (const p of incoming) {
      if (!map.has(p.id)) {map.set(p.id, p); count++;}
      else if (JSON.stringify(map.get(p.id)) !== JSON.stringify(p)) {
        // Reimporting the same changed record is idempotent.
        const same = [...map.values()].some(x => x.importedFromId === p.id && JSON.stringify({...x,id:p.id,importedFromId:undefined}) === JSON.stringify(p));
        if (!same) {const n = {...p, id:uid(), importedFromId:p.id}; map.set(n.id,n); count++;}
      }
    }
    return {products: [...map.values()], count};
  }
  function filterArchive(cards, query, sheet) {
    const q = String(query || '').normalize('NFKC').toLocaleLowerCase('ja');
    return cards.filter(c => (!sheet || c.sources.some(s => s.sheet_name === sheet)) && (!q || [c.name_raw,c.description_raw,...c.price_cells_raw.map(p=>p.raw),...c.sources.map(s=>s.sheet_name)].join(' ').normalize('NFKC').toLocaleLowerCase('ja').includes(q)));
  }
  function geometry(scale=1) { return {width:104*scale,height:66*scale,pageWidth:297,pageHeight:210,marginY:(210-198*scale)/2,marginX:(297-208*scale-6)/2}; }
  function parseEvents(text) {return [...new Set(String(text||'').split(/[、,\n]/).map(x=>x.trim()).filter(Boolean))];}
  function eventsForArchive(card, groups) {return groups.filter(g=>card.sources.some(s=>g.sheets.includes(s.sheet_name))).map(g=>g.label);}
  function seasonHistory(cards, group, query='') {return filterArchive(cards,query,'').filter(c=>c.sources.some(s=>group.sheets.includes(s.sheet_name)));}
  const api = {SCHEMA,STORAGE_KEY,ALLERGENS,uid,blank,validate,copy,fromArchive,serialize,parseBackup,mergeBackup,filterArchive,geometry,parseEvents,eventsForArchive,seasonHistory};
  root.Terras = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
