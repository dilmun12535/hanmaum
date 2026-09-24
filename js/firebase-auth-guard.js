import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

function clearLegacyLogin() {
  sessionStorage.removeItem("isLoggedIn");
  sessionStorage.removeItem("loginUser");
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("loginUser");
}

function saveLoginUser(user) {
  const name = user.displayName || user.email || "직원";
  sessionStorage.setItem("isLoggedIn", "true");
  sessionStorage.setItem("loginUser", name);
  localStorage.setItem("isLoggedIn", "true");
  localStorage.setItem("loginUser", name);
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    clearLegacyLogin();
    window.location.replace("../index.html");
    return;
  }

  saveLoginUser(user);
  document.documentElement.dataset.firebaseAuth = "ready";
});

window.hanmaumLogout = async function () {
  try {
    await signOut(auth);
  } finally {
    clearLegacyLogin();
    window.location.replace("../index.html");
  }
};
