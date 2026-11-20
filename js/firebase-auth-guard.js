import "./auto-logout.js";
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";


// 공통 상단: 로고 이동 및 접속 시간 표시
const LOGIN_AT_KEY = 'hanmaum:loginStartedAt:v1';
function formatClock(timestamp) {
  return new Date(timestamp).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit', hour12:false});
}
function formatElapsed(milliseconds) {
  const minutes = Math.floor(Math.max(0,milliseconds)/60000);
  const hours = Math.floor(minutes/60);
  return hours ? `${hours}시간 ${minutes%60}분` : `${minutes}분`;
}
function setupTopbarUtilities() {
  const logo = document.querySelector('.topbar .logo-area');
  if (logo && !logo.dataset.homeLinkReady) {
    logo.dataset.homeLinkReady='1';
    logo.setAttribute('role','link');
    logo.setAttribute('tabindex','0');
    logo.setAttribute('aria-label','오늘의 업무로 이동');
    logo.title='오늘의 업무로 이동';
    logo.style.cursor='pointer';
    const goHome=()=>{window.location.href='./today-tasks.html';};
    logo.addEventListener('click',goHome);
    logo.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goHome();}});
  }
  const right=document.querySelector('.topbar-right');
  const logout=right?.querySelector('.logout-btn');
  if(!logout||document.getElementById('sessionTimeInfo'))return;
  const wrap=document.createElement('div');
  wrap.id='sessionTimeWrap';
  wrap.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex-shrink:0;';
  logout.parentNode.insertBefore(wrap,logout);
  wrap.appendChild(logout);
  const info=document.createElement('div');
  info.id='sessionTimeInfo';
  info.setAttribute('aria-label','로그인 시간과 접속 경과 시간');
  info.style.cssText='font-size:11px;color:#64748b;white-space:nowrap;text-align:center;line-height:1.4;';
  wrap.appendChild(info);
  const update=()=>{
    const started=Number(sessionStorage.getItem(LOGIN_AT_KEY));
    info.textContent=started>0?`접속 ${formatClock(started)} · ${formatElapsed(Date.now()-started)} 경과`:'접속 시간 확인 중';
  };
  update();
  window.setInterval(update,30000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupTopbarUtilities);
else setupTopbarUtilities();

function clearLegacyLogin() {
  sessionStorage.removeItem(LOGIN_AT_KEY);
  sessionStorage.removeItem("isLoggedIn");
  sessionStorage.removeItem("loginUser");
  sessionStorage.removeItem("loginPosition");
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("loginUser");
  localStorage.removeItem("loginPosition");
}

function saveLoginUser(name, position) {
  sessionStorage.setItem("isLoggedIn", "true");
  sessionStorage.setItem("loginUser", name);
  sessionStorage.setItem("loginPosition", position || "직원");
  localStorage.setItem("isLoggedIn", "true");
  localStorage.setItem("loginUser", name);
  localStorage.setItem("loginPosition", position || "직원");
}

function showEmployee(position, name) {
  document.querySelectorAll(".user-badge").forEach((el) => {
    el.textContent = `${position || "직원"} ${name || ""} 님`.replace(/\s+/g, " ").trim();
    el.title = "현재 로그인한 직원";
  });
}

async function loadEmployeeProfile(user) {
  let name = user.displayName || "";
  let position = "직원";

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      const data = snap.data();
      name = data.name || name || user.email || "직원";
      position = data.position || "직원";
    } else {
      name = name || user.email || "직원";
    }
  } catch (error) {
    console.error("직원 정보 불러오기 실패:", error);
    name = name || user.email || "직원";
  }

  saveLoginUser(name, position);
  showEmployee(position, name);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    clearLegacyLogin();
    window.location.replace("../index.html");
    return;
  }

  if (!Number(sessionStorage.getItem(LOGIN_AT_KEY))) sessionStorage.setItem(LOGIN_AT_KEY,String(Date.now()));
  setupTopbarUtilities();
  await loadEmployeeProfile(user);
  document.documentElement.dataset.firebaseAuth = "ready";
});

window.hanmaumLogout = async function () {
  if (!window.confirm("로그아웃하시겠습니까?")) return;
  try {
    await signOut(auth);
  } finally {
    clearLegacyLogin();
    window.location.replace("../index.html");
  }
};
