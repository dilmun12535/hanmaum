/* 한마음 제공확인 Firestore 조회 어댑터 */
(function () {
  let modulesPromise;
  function modules() {
    if (!modulesPromise) modulesPromise = Promise.all([
      import('./firebase-config.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
    ]).then(([cfg, fs, authSdk]) => ({db: cfg.db, auth: cfg.auth, fs, authSdk}));
    return modulesPromise;
  }
  function parseJson(v) { if (typeof v !== 'string') return v; try {return JSON.parse(v);} catch {return v;} }
  function hydrate(data, id) {
    const out = {...data, firestoreId:id};
    ['rows','rowsJson','attendanceDates','dates','attendanceTimeRows'].forEach(k => {if(k in out) out[k]=parseJson(out[k]);});
    if (!Array.isArray(out.rows) && Array.isArray(out.rowsJson)) out.rows=out.rowsJson;
    if (!Array.isArray(out.dates) && Array.isArray(out.attendanceDates)) out.dates=out.attendanceDates;
    return out;
  }
  async function signedIn() {
    const {auth,authSdk}=await modules();
    if(auth.currentUser) return auth.currentUser;
    return new Promise((resolve,reject) => {
      const unsub=authSdk.onAuthStateChanged(auth,user=>{unsub();user?resolve(user):reject(new Error('로그인이 필요합니다.'));},reject);
    });
  }
  const cache=new Map();
  function cached(key,fn) {if(!cache.has(key)) cache.set(key,Promise.resolve().then(fn).catch(e=>{cache.delete(key);throw e;}));return cache.get(key);}
  function monthKey(v) {return String(v||'').slice(0,7);}
  function chunks(a,n=30){const out=[];for(let i=0;i<a.length;i+=n)out.push(a.slice(i,i+n));return out;}
  function uniq(a){return [...new Map(a.map(x=>[x.firestoreId||x.id||JSON.stringify(x),x])).values()];}
  async function all(collectionName){await signedIn();return cached('all:'+collectionName,async()=>{const {db,fs}=await modules();const snap=await fs.getDocs(fs.collection(db,collectionName));return snap.docs.map(d=>hydrate(d.data(),d.id));});}
  async function attendance(monthValue){await signedIn();const month=monthKey(monthValue);if(!month)return all('attendance');return cached('attendance:'+month,async()=>{const {db,fs}=await modules();const snap=await fs.getDocs(fs.query(fs.collection(db,'attendance'),fs.where('month','==',month)));return snap.docs.map(d=>hydrate(d.data(),d.id));});}
  async function recipientsForMonth(month){const rows=await attendance(month);return {numbers:[...new Set(rows.map(x=>String(x.longTermNumber||x.certNumber||'').trim()).filter(Boolean))],names:[...new Set(rows.map(x=>String(x.recipientName||x.name||'').trim()).filter(Boolean))]};}
  async function queryForRecipients(collectionName,numberFields,monthValue,nameFields=[]){
    await signedIn();const month=monthKey(monthValue);if(!month)return all(collectionName);
    return cached(collectionName+':recipients:'+month,async()=>{
      const targets=await recipientsForMonth(month);if(!targets.numbers.length&&!targets.names.length)return [];
      const {db,fs}=await modules();const found=[];
      for(const [values,fields] of [[targets.numbers,numberFields],[targets.names,nameFields]]){
        for(const part of chunks(values))for(const field of fields){const snap=await fs.getDocs(fs.query(fs.collection(db,collectionName),fs.where(field,'in',part)));snap.docs.forEach(d=>found.push(hydrate(d.data(),d.id)));}
      }
      return uniq(found);
    });
  }
  window.HanmaumFirestore={
    // 계획서는 작성 월과 조회 월이 달라도 적용될 수 있어 전체를 조회합니다.
    carePlans:()=>all('carePlans'),
    allCarePlans:()=>all('carePlans'),
    counsels:month=>queryForRecipients('counsels',['longTermNumber','certNumber'],month,['recipientName','name']),
    attendance,
    outings:async monthValue=>{await signedIn();const month=monthKey(monthValue);if(!month)return all('outings');return cached('outings:'+month,async()=>{const {db,fs}=await modules();const snap=await fs.getDocs(fs.query(fs.collection(db,'outings'),fs.where('month','==',month)));return snap.docs.map(d=>hydrate(d.data(),d.id));});},
    clearCache:()=>cache.clear()
  };
})();
