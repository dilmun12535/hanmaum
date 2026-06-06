const loginForm = document.getElementById("loginForm");
const loginIdInput = document.getElementById("loginId");
const loginPasswordInput = document.getElementById("loginPassword");
const loginMessage = document.getElementById("loginMessage");

const USERS = {
admin: "1234",
김성욱: "1124",
김정환: "0609",
강민지: "0528"
};

loginForm.addEventListener("submit", (event) => {
event.preventDefault();

const id = loginIdInput.value.trim();
const password = loginPasswordInput.value.trim();

console.log("입력 아이디:", id);
console.log("입력 비밀번호:", password);
console.log("저장 비밀번호:", USERS[id]);

if (USERS[id] === password) {
alert("로그인 성공");

```
sessionStorage.setItem("isLoggedIn", "true");
sessionStorage.setItem("loginUser", id);

location.href = "html/care-plan-library.html";
return;
```

}

alert("로그인 실패");

loginMessage.textContent = "아이디 또는 비밀번호가 맞지 않습니다.";
loginMessage.className = "login-message error";
});

const togglePassword = document.getElementById("togglePassword");

togglePassword.addEventListener("click", () => {
  if (loginPasswordInput.type === "password") {
    loginPasswordInput.type = "text";
    togglePassword.textContent = "🙈";
  } else {
    loginPasswordInput.type = "password";
    togglePassword.textContent = "👁";
  }
});
