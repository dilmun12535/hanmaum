import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

function clearLegacyLogin() {
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
