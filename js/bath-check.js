function renderResults(results) {
  bathResultBody.innerHTML = "";

  if (!results || results.length === 0) {
    bathResultBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="11">확인할 데이터가 없습니다.</td>
      </tr>
    `;
    return;
  }

  results.forEach((item) => {
    const row = document.createElement("tr");
    const overallClass =
      item.overallResult === "정상"
        ? "status-ok"
        : "status-danger";

    row.innerHTML = `
      <td>${item.name}</td>
      <td>-</td>
      <td>${item.planDate || "-"}</td>
      <td>${item.counselText || "없음"}</td>
      <td>${item.requiredText || "없음"}</td>

      <td>
        ${buildWeekCell(item.weekRequired.week1, item.weeks.week1)}
      </td>

      <td>
        ${buildWeekCell(item.weekRequired.week2, item.weeks.week2)}
      </td>

      <td>
        ${buildWeekCell(item.weekRequired.week3, item.weeks.week3)}
      </td>

      <td>
        ${buildWeekCell(item.weekRequired.week4, item.weeks.week4)}
      </td>

      <td>
        ${buildWeekCell(item.weekRequired.week5, item.weeks.week5)}
      </td>

      <td class="${overallClass}">
        ${item.overallResult}
      </td>
    `;

    bathResultBody.appendChild(row);
  });
}
