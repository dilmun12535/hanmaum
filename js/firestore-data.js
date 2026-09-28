/* 제공확인 공통 Firestore 조회 어댑터 - 월별/대상자 한정 조회 */
(function () {
  let modulesPromise;
  function modules() {
    if (!modulesPromise) modulesPromise = Promise.all([
      import('./firebase-config.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
    ]).then(([cfg, fs, authSdk]) => ({ db: cfg.db, auth: cfg.auth, fs, authSdk }));
    return modulesPromise;
  }
  function parseMaybeJson(v) {
    if (Array.isArray(v) || (v && typeof v === 'object')) return v;
    if (typeof v !== 'string' || !v.trim()) return v;
    try { return JSON.parse(v); } catch { return v; }
  }
  function hydrate(data, id) {
    const out = { ...data, firestoreId: id };
    ['rows','rowsJson','attendanceDates','dates','attendanceTimeRows'].forEach(k => {
      if (k in out) out[k] = parseMaybeJson(out[k]);
    });
    if (!Array.isArray(out.rows) && Array.isArray(out.rowsJson)) out.rows = out.rowsJson;
    if (!Array.isArray(out.dates) && Array.isArray(out.attendanceDates)) out.dates = out.attendanceDates;
    return out;
  }
  async function waitForSignedIn() {
    const { auth, authSdk } = await modules();
    if (auth.currentUser) return auth.currentUser;
    return new Promise((resolve, reject) => {
      const unsubscribe = authSdk.onAuthStateChanged(auth, user => {
        unsubscribe();
        if (user) resolve(user); else reject(new Error('로그인이 필요합니다.'));
      }, reject);
    });
  }
  const cache = new Map();
  function cached(key, factory) {
    if (!cache.has(key)) cache.set(key, Promise.resolve().then(factory).catch(e => { cache.delete(key); throw e; }));
    return cache.get(key);
  }
  function monthKey(v) { return String(v || '').slice(0, 7); }
  function chunks(arr, size=30) { const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }
  function uniqDocs(rows) { const m=new Map(); rows.forEach(x=>m.set(x.firestoreId || x.id || JSON.stringify(x), x)); return [...m.values()]; }

  async function all(collectionName) {
    await waitForSignedIn();
    return cached('all:'+collectionName, async () => {
      const { db, fs } = await modules();
      const snap = await fs.getDocs(fs.collection(db, collectionName));
      return snap.docs.map(d => hydrate(d.data(), d.id));
    });
  }

  async function attendance(monthValue) {
    await waitForSignedIn();
    const month = monthKey(monthValue);
    if (!month) return all('attendance');
    return cached('attendance:'+month, async () => {
      const { db, fs } = await modules();
      const q = fs.query(fs.collection(db, 'attendance'), fs.where('month', '==', month));
      const snap = await fs.getDocs(q);
      return snap.docs.map(d => hydrate(d.data(), d.id));
    });
  }

  async function recipientsForMonth(month) {
    const rows = await attendance(month);
    return {
      numbers: [...new Set(rows.map(x => String(x.longTermNumber || x.certNumber || '').trim()).filter(Boolean))],
      names: [...new Set(rows.map(x => String(x.recipientName || x.name || '').trim()).filter(Boolean))]
    };
  }

  async function queryForRecipients(collectionName, numberFields, monthValue, nameFields=[]) {
    await waitForSignedIn();
    const month = monthKey(monthValue);
    if (!month) return all(collectionName);
    return cached(`${collectionName}:recipients:${month}`, async () => {
      const targets = await recipientsForMonth(month);
      if (!targets.numbers.length && !targets.names.length) return [];
      const { db, fs } = await modules();
      const found = [];

      // 인정번호가 있는 자료는 인정번호로 정확히 조회합니다.
      for (const part of chunks(targets.numbers, 30)) {
        for (const field of numberFields) {
          const q = fs.query(fs.collection(db, collectionName), fs.where(field, 'in', part));
          const snap = await fs.getDocs(q);
          snap.docs.forEach(d => found.push(hydrate(d.data(), d.id)));
        }
      }

      // 상담일지는 기존/신규 업로드 자료 중 인정번호가 저장되지 않은 문서가 있어
      // 출석자의 수급자명으로도 조회합니다. 전체 컬렉션을 읽지 않고 해당 월 출석자만 조회합니다.
      for (const part of chunks(targets.names, 30)) {
        for (const field of nameFields) {
          const q = fs.query(fs.collection(db, collectionName), fs.where(field, 'in', part));
          const snap = await fs.getDocs(q);
          snap.docs.forEach(d => found.push(hydrate(d.data(), d.id)));
        }
      }
      return uniqDocs(found);
    });
  }

  window.HanmaumFirestore = {
    // 확인 월 출석자에 해당하는 계획서/상담일지만 읽습니다.
    carePlans: (monthValue) => queryForRecipients('carePlans', ['longTermNumber'], monthValue),
    counsels: (monthValue) => queryForRecipients('counsels', ['longTermNumber','certNumber'], monthValue, ['recipientName','name']),
    attendance,
    clearCache: () => cache.clear()
  };
})();
