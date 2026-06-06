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