const todayText = document.getElementById("todayText");

if (todayText) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const day = dayNames[now.getDay()];

  todayText.textContent = `${year}년 ${month}월 ${date}일 (${day})`;
}

// HANMAUM_MENU_ACCORDION_UNIFIED
document.addEventListener("DOMContentLoaded", function () {
  const groups = Array.from(document.querySelectorAll(".sidebar details.menu-group"));
  // 모든 하위 메뉴는 페이지 진입 시 접힌 상태로 통일
  groups.forEach(function (group) { group.open = false; });
  // 사용자가 하나를 열면 다른 하위 메뉴는 자동으로 접힘
  groups.forEach(function (group) {
    group.addEventListener("toggle", function () {
      if (!group.open) return;
      groups.forEach(function (other) {
        if (other !== group) other.open = false;
      });
    });
  });
});
