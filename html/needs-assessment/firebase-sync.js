import { auth, db } from '../../js/firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const ref = doc(db, 'portalSettings', 'needsAssessment');
window.needsIsAdmin = false;
let ready = false;
let saving = Promise.resolve();
const status = message => window.dispatchEvent(new CustomEvent('needs-settings-status', {detail:message}));

onAuthStateChanged(auth, async user => {
  ready = false;
  window.needsIsAdmin = false;
  window.dispatchEvent(new Event('needs-admin-auth'));
  if (!user) { status('로그인 후 관리자 설정을 불러올 수 있습니다.'); return; }
  try {
    const profile = await getDoc(doc(db, 'users', user.uid));
    window.needsIsAdmin = profile.exists() && profile.data().role === 'admin';
    window.dispatchEvent(new Event('needs-admin-auth'));
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().settings) {
      window.dispatchEvent(new CustomEvent('needs-settings-loaded', {detail:snap.data().settings}));
    } else {
      status('Firestore에 저장된 설정이 없습니다. 관리자는 기존 문구를 저장해 초기 설정을 등록할 수 있습니다.');
    }
    ready = true;
  } catch (err) {
    status('Firestore 설정 불러오기 실패: ' + err.message + ' (보안 규칙과 로그인 상태를 확인하세요)');
  }
});

window.addEventListener('needs-settings-save', event => {
  if (!ready || !auth.currentUser || !window.needsIsAdmin) {
    status('Firestore 연결이 준비되지 않아 저장하지 못했습니다. 새로고침 후 다시 시도하세요.');
    return;
  }
  const settings = event.detail;
  saving = saving.catch(() => {}).then(async () => {
    try {
      await setDoc(ref, {settings, updatedAt:serverTimestamp(), updatedBy:auth.currentUser.uid});
      status('관리자 문구가 Firestore에 저장되었습니다. 다른 직원도 새로고침하면 반영됩니다.');
    } catch (err) {
      status('Firestore 저장 실패: ' + err.message + ' (관리자 권한을 확인하세요)');
    }
  });
});
