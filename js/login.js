const loginForm = document.getElementById("loginForm");
const loginIdInput = document.getElementById("loginId");
const loginPasswordInput = document.getElementById("loginPassword");
const loginMessage = document.getElementById("loginMessage");

const USERS = {
"김성욱": "1124",
"김정환": "0609",
"강민지": "0528"
};

loginForm.addEventListener("submit", (event) => {
event.preventDefault();

const id = loginIdInput.value.trim();
const password = loginPasswordInput.value.trim();

if (!id || !password) {
loginMessage.textContent = "아이디와 비밀번호를 모두 입력해주세요.";
loginMessage.className = "login-message error";
return;
}

if (USERS[id] && USERS[id] === password) {
sessionStorage.setItem("isLoggedIn", "true");
sessionStorage.setItem("loginUser", id);

```
loginMessage.textContent = "로그인되었습니다.";
loginMessage.className = "login-message success";

setTimeout(() => {
  window.location.href = "./html/care-plan-library.html";
}, 500);

return;
```

}

loginMessage.textContent = "아이디 또는 비밀번호가 맞지 않습니다.";
loginMessage.className = "login-message error";
});
