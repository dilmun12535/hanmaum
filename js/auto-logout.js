// 한마음 포털: 마지막 사용자 활동 이후 30분 경과 시 Firebase 로그아웃.
// 같은 브라우저의 여러 탭에서 활동 시간을 공유합니다.
import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
const LIMIT = 30 * 60 * 1000;
const KEY = 'hanmaum:lastUserActivity:v1';
const SESSION_KEY = 'hanmaum:idleSession:v1';
let active = false, busy = false, lastWrite = 0;
function lastActivity(){const v=Number(localStorage.getItem(KEY));return Number.isFinite(v)&&v>0?v:0;}
function markActivity(force=false){
  if(!active||busy)return;
  const now=Date.now();
  // 만료된 세션은 활동으로 연장하지 않음.
  if(lastActivity() && now-lastActivity()>=LIMIT){void expire();return;}
  if(force||now-lastWrite>=10000){localStorage.setItem(KEY,String(now));lastWrite=now;}
}
async function expire(){
  if(busy||!active)return;
  busy=true;active=false;
  try{await signOut(auth);}catch(e){console.error('자동 로그아웃 실패:',e)}
  finally{
    sessionStorage.removeItem('isLoggedIn');sessionStorage.removeItem('loginUser');sessionStorage.removeItem('loginPosition');
    localStorage.removeItem('isLoggedIn');localStorage.removeItem('loginUser');localStorage.removeItem('loginPosition');
    sessionStorage.setItem('hanmaum:idleLogoutNotice','30분 동안 사용하지 않아 자동 로그아웃되었습니다.');
    window.location.replace('../index.html');
  }
}
function check(){if(active&&lastActivity()&&Date.now()-lastActivity()>=LIMIT)void expire();}
for(const event of ['pointerdown','keydown','touchstart','scroll']){
  window.addEventListener(event,()=>markActivity(),{passive:true,capture:true});
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
window.addEventListener('focus',check);
window.addEventListener('storage',e=>{if(e.key===KEY)check();});
setInterval(check,15000);
onAuthStateChanged(auth,user=>{
  if(!user){active=false;return;}
  active=true;
  // 로그인 페이지에서 설정한 시각을 우선 사용. 오래된 값은 복구하지 않음.
  if(!lastActivity())markActivity(true);
  check();
});
