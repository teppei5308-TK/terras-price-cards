(function (root) {
  'use strict';
  const encoder = new TextEncoder();
  const START_PROMPT = "このフォルダーはTERRAS プライスカード v1.7.0の開発引き継ぎ一式です。\n最初にCLAUDE.mdとHANDOFF_README.mdを読み、コードとテストから現在の動作を確認してください。\n\n最新の仕様:\n・新商品相談の質問項目はすべて削除済み。真上・斜め45°・断面の最大3枚から、良いところ・直すとよいところ・次に試すことを表示します。写真1枚だけ、種類や材料が空でも相談できます。\n・種類と確認済み材料を入力した場合だけ、名前・説明文・デザインの3案も返します。写真から材料・味・アレルゲンを推測しません。\n・新商品や日々の写真は保存しません。ベーシックの基準写真だけ端末内とバックアップへ保存します。ベーシックの5項目採点は維持します。\n・カード印刷、過去カード、商品JSONの互換性、共有と社長の返事、旧チェック履歴を維持してください。\n・AIはGT-bot（Apps Script）経由のClaudeを使います。全員合計で1日30回・30秒間隔の制限を維持し、実APIの試験は行わないでください。APIキーと本番DBは同梱していません。\n\nまずREADMEのチェック・テスト・ビルドを実行し、ローカルで画面を確認してください。data/TERRAS-backup.jsonがあればアプリの「バックアップ・復元」から読み込める移行データです。なければ商品データを推測して作らないでください。\n確認後、現在の構成と起動方法を短く説明し、次の改修指示を待ってください。";
  function safePath(path) {
    return typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !path.includes(':') && !/[?#\x00-\x1f]/.test(path) && path.split('/').every(x => x && x !== '.' && x !== '..');
  }
  const crcTable = Uint32Array.from({length:256}, (_, n) => {
    for (let i=0;i<8;i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  // Standard ZIP STORE records. Browser and Node share this dependency-free writer.
  function zip(files) {
    if (files.length > 65535) throw new Error('ファイル数が多すぎます。');
    const parts=[], central=[], seen=new Set();
    let offset=0, centralSize=0;
    for (const file of files) {
      if (!safePath(file.path) || seen.has(file.path)) throw new Error('引き継ぎファイルのパスが不正です。');
      seen.add(file.path);
      const name=encoder.encode(file.path), bytes=typeof file.data==='string'?encoder.encode(file.data):file.data;
      if (!(bytes instanceof Uint8Array) || name.length>65535 || bytes.length>0xffffffff || offset+30+name.length+bytes.length>0xffffffff) throw new Error('引き継ぎファイルが大きすぎます。');
      const crc=crc32(bytes), local=new Uint8Array(30), l=new DataView(local.buffer);
      l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);
      l.setUint16(12,0x5c21,true);l.setUint32(14,crc,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);l.setUint16(26,name.length,true);
      parts.push(local,name,bytes);
      const header=new Uint8Array(46), c=new DataView(header.buffer);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);
      c.setUint16(14,0x5c21,true);c.setUint32(16,crc,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
      central.push(header,name);centralSize+=header.length+name.length;offset+=local.length+name.length+bytes.length;
    }
    const end=new Uint8Array(22), e=new DataView(end.buffer);
    e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    return new Blob([...parts,...central,end],{type:'application/zip'});
  }
  async function createPackage({backup=null,fetcher=root.fetch.bind(root),onProgress=()=>{}}={}) {
    const response=await fetcher('handoff-source.json',{cache:'no-store'});
    if (!response.ok) throw new Error('引き継ぎ用ソースを読み込めません。ページを再読み込みしてからお試しください。');
    const manifest=await response.json();
    if (manifest.format!=='terras-claude-source-v1' || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length>500) throw new Error('引き継ぎ用ソースの形式が異なります。');
    if (backup!==null) root.Terras.parseBackup(backup);
    const files=new Array(manifest.files.length);
    let next=0, completed=0;
    await Promise.all(Array.from({length:4},async()=>{
      while (next<manifest.files.length) {
        const index=next++, file=manifest.files[index];
        if (!safePath(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('引き継ぎ用ソースの一覧が不正です。');
        let data;
        if (typeof file.text==='string') data=encoder.encode(file.text);
        else if (typeof file.base64==='string') data=Uint8Array.from(atob(file.base64),x=>x.charCodeAt(0));
        else {
          if (!file.path.startsWith('public/') || file.asset!==file.path.slice(7) || !safePath(file.asset)) throw new Error('引き継ぎ素材のパスが不正です。');
          const asset=await fetcher(file.asset,{cache:'no-store'});
          if (!asset.ok) throw new Error('一部の素材を取得できません。通信を確認して、もう一度お試しください。');
          data=new Uint8Array(await asset.arrayBuffer());
        }
        const digest=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
        if (digest!==file.sha256) throw new Error('更新されたファイルがあります。ページを再読み込みしてからお試しください。');
        files[index]={path:file.path,data};onProgress(++completed,manifest.files.length);
      }
    }));
    files.push({path:'data/README.txt',data:backup===null?'このZIPには登録済み商品データを含みません。元のブラウザーで「Claudeへ引き継ぐ」からダウンロードすると、data/TERRAS-backup.jsonも同梱されます。':'TERRAS-backup.jsonはダウンロード時点の保存済み商品・印刷選択・設定です。未保存の編集は含みません。アプリの「バックアップ・復元」から読み込んでください。'});
    if (backup!==null) files.push({path:'data/TERRAS-backup.json',data:backup});
    files.push({path:'handoff-metadata.json',data:JSON.stringify({app:'TERRAS price cards',version:manifest.version,exportedAt:new Date().toISOString(),includesProductData:backup!==null,productCount:backup===null?null:JSON.parse(backup).products.length},null,2)});
    return zip(files);
  }
  root.TerrasHandoff={START_PROMPT,safePath,crc32,zip,createPackage};
  if (typeof module!=='undefined') module.exports=root.TerrasHandoff;
})(typeof window==='undefined'?globalThis:window);
