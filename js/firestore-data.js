/* 제공확인 공통 Firestore 조회 어댑터 */
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
        if (user) resolve(user);
        else reject(new Error('로그인이 필요합니다.'));
      }, reject);
    });
  }
  async function all(collectionName) {
    await waitForSignedIn();
    const { db, fs } = await modules();
    const snap = await fs.getDocs(fs.collection(db, collectionName));
    return snap.docs.map(d => hydrate(d.data(), d.id));
  }
  async function attendance(monthValue) {
    const rows = await all('attendance');
    if (!monthValue) return rows;
    return rows.filter(x => String(x.month || x.attendanceMonth || '').slice(0,7) === String(monthValue).slice(0,7));
  }
  window.HanmaumFirestore = {
    carePlans: () => all('carePlans'),
    counsels: () => all('counsels'),
    attendance
  };
})();
