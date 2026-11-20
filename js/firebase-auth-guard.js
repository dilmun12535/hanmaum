import "./auto-logout.js";
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";


// 공통 상단: 로고 클릭 및 30분 미사용 자동 로그아웃 카운트다운.
// auto-logout.js 와 동일한 마지막 활동 시각을 사용합니다.
const IDLE_ACTIVITY_KEY = 'hanmaum:lastUserActivity:v1';
const IDLE_LIMIT_MS = 30 * 60 * 1000;
function setupTopbarUtilities() {
  const logo = document.querySelector('.topbar .logo-area');
  if (logo && !logo.dataset.homeLinkReady) {
    logo.dataset.homeLinkReady = '1';
    logo.setAttribute('role', 'link');
    logo.setAttribute('tabindex', '0');
    logo.setAttribute('aria-label', '오늘의 업무로 이동');
    logo.title = '오늘의 업무로 이동';
    logo.style.cursor = 'pointer';
    const goHome = () => { window.location.href = './today-tasks.html'; };
    logo.addEventListener('click', goHome);
    logo.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); }
    });
  }
  const logout = document.querySelector('.topbar-right .logout-btn');
  if (!logout || document.getElementById('sessionTimeInfo')) return;
  const wrap = document.createElement('div');
  wrap.id = 'sessionTimeWrap';
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex-shrink:0;';
  logout.parentNode.insertBefore(wrap, logout);
  wrap.appendChild(logout);
  const info = document.createElement('div');
  info.id = 'sessionTimeInfo';
  info.setAttribute('aria-label', '미사용 자동 로그아웃까지 남은 시간');
  info.title = '마지막 활동 이후 30분 동안 사용하지 않으면 자동 로그아웃됩니다.';
  info.style.cssText = 'font-size:11px;color:#64748b;white-space:nowrap;text-align:center;line-height:1.4;font-variant-numeric:tabular-nums;';
  wrap.appendChild(info);
  const update = () => {
    const last = Number(localStorage.getItem(IDLE_ACTIVITY_KEY));
    const remain = last > 0 ? Math.max(0, IDLE_LIMIT_MS - (Date.now() - last)) : IDLE_LIMIT_MS;
    const seconds = Math.ceil(remain / 1000);
    info.textContent = `자동 로그아웃 ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    info.style.color = remain <= 5 * 60 * 1000 ? '#dc2626' : '#64748b';
  };
  update();
  window.setInterval(update, 1000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupTopbarUtilities);
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
