const loginForm = document.getElementById("loginForm");
const loginIdInput = document.getElementById("loginId");
const loginPasswordInput = document.getElementById("loginPassword");
const loginMessage = document.getElementById("loginMessage");
const togglePassword = document.getElementById("togglePassword");

const USERS = {
  admin: "1234",
  김성욱: "1124",
  김정환: "9155",
  강민지: "0528",
  고나예: "0910",
  천지연: "1116",
  강민주: "0307",
  박지영: "0322",
  주신일: "0903"
};

if (togglePassword) {
  togglePassword.addEventListener("click", () => {
    if (loginPasswordInput.type === "password") {
      loginPasswordInput.type = "text";
      togglePassword.textContent = "숨김";
    } else {
      loginPasswordInput.type = "password";
      togglePassword.textContent = "보기";
    }
  });
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const id = loginIdInput.value.trim();
  const password = loginPasswordInput.value.trim();

  if (!id || !password) {
    loginMessage.textContent = "아이디와 비밀번호를 모두 입력해주세요.";
    loginMessage.className = "login-message error";
    return;
  }

  if (USERS[id] === password) {
    sessionStorage.setItem("isLoggedIn", "true");
    sessionStorage.setItem("loginUser", id);

    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("loginUser", id);

    window.location.href = "html/care-plan-library.html";
    return;
  }

  loginMessage.textContent = "아이디 또는 비밀번호가 맞지 않습니다.";
  loginMessage.className = "login-message error";
});
