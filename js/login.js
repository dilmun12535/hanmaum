import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const loginForm = document.getElementById("loginForm");
const loginIdInput = document.getElementById("loginId");
const loginPasswordInput = document.getElementById("loginPassword");
const loginMessage = document.getElementById("loginMessage");
const togglePassword = document.getElementById("togglePassword");
const loginButton = loginForm?.querySelector('button[type="submit"]');

if (togglePassword) {
  togglePassword.addEventListener("click", () => {
    const show = loginPasswordInput.type === "password";
    loginPasswordInput.type = show ? "text" : "password";
    togglePassword.textContent = show ? "숨김" : "보기";
  });
}

function showMessage(message, type = "error") {
  if (!loginMessage) return;
  loginMessage.textContent = message;
  loginMessage.className = `login-message ${type}`;
}

function saveLoginUser(user) {
  const name = user.displayName || user.email || "직원";
  sessionStorage.setItem("isLoggedIn", "true");
  sessionStorage.setItem("loginUser", name);
  localStorage.setItem("isLoggedIn", "true");
  localStorage.setItem("loginUser", name);
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    saveLoginUser(user);
    window.location.replace("html/care-plan-library.html");
  }
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = loginIdInput.value.trim();
  const password = loginPasswordInput.value;

  if (!email || !password) {
    showMessage("이메일과 비밀번호를 모두 입력해주세요.");
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "로그인 중...";
  showMessage("");

  try {
    await setPersistence(auth, browserLocalPersistence);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    saveLoginUser(credential.user);
    window.location.replace("html/care-plan-library.html");
  } catch (error) {
    console.error("Firebase login error:", error);
    showMessage("이메일 또는 비밀번호가 맞지 않습니다.");
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "로그인";
  }
});
