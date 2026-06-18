const API_URL = "https://script.google.com/macros/s/AKfycbxFaEN0MkkWd_NnDif5LXlCVbIxqgllvGLoJturv0FlXtgX1FG0QTVQNArI5DyR5RTZaA/exec";

const attendanceMonthInput = document.getElementById("attendanceMonth");
const attendanceFileInput = document.getElementById("attendanceFile");
const registerAttendanceBtn = document.getElementById("registerAttendanceBtn");
const loadAttendanceBtn = document.getElementById("loadAttendanceBtn");
const clearAttendanceBtn = document.getElementById("clearAttendanceBtn");
const attendanceResultBody = document.getElementById("attendanceResultBody");
const attendanceTableHead = document.getElementById("attendanceTableHead");

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function excelDateToJSDate(serial) {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);

  const year = dateInfo.getFullYear();
  const month = String(dateInfo.getMonth() + 1).padStart(2, "0");
  const day = String(dateInfo.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  if (!value) return "";

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "number") {
    return excelDateToJSDate(value);
  }

  const text = String(value);
  const match = text.match(/(\d{4})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (!match) return "";

  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
}

function sheetToRowsWithMerges(sheet) {
  if (!sheet || !sheet["!ref"]) return [];

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const rows = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];

    for (let c = range.s.c; c <= range.e.c; c++) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[address];
      row[c] = cell ? cell.v : "";
    }

    rows.push(row);
  }

  const merges = sheet["!merges"] || [];

  merges.forEach((merge) => {
    const startAddress = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const startCell = sheet[startAddress];
    const value = startCell ? startCell.v : "";

    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        const rowIndex = r - range.s.r;
        rows[rowIndex][c] = value;
      }
    }
  });

  return rows;
}

function formatInfoDate(value) {
  if (typeof value === "number") {
    return excelDateToJSDate(value).replaceAll("-", ".");
  }

  return String(value || "").trim();
}

function isLabelText(value) {
  const text = normalizeText(value);

  const labels = [
    "수급자",
    "수급자명",
    "인정번호",
    "장기요양번호",
    "급여개시일",
    "등급",
    "생년월일성별",
    "생년월일",
    "본인부담률",
    "날짜",
    "서비스시간",
    "제공시간",
    "급여총액",
    "본인부담금"
  ];

  return labels.some((label) => text === normalizeText(label));
}

function findTopInfoValue(rows, labelKeyword) {
  const label = normalizeText(labelKeyword);
  const maxRow = Math.min(rows.length, 10);

  for (let r = 0; r < maxRow; r++) {
    const row = rows[r] || [];

    for (let c = 0; c < row.length; c++) {
      const cellText = normalizeText(row[c]);

      if (cellText === label || cellText.includes(label)) {
        for (let offset = 1; offset <= 16; offset++) {
          const value = row[c + offset];

          if (value === undefined || value === null) continue;

          const text = String(value).trim();

          if (!text) continue;
          if (isLabelText(text)) continue;

          return formatInfoDate(value);
        }
      }
    }
  }

  return "";
}

function findGradeValue(rows) {
  const maxRow = Math.min(rows.length, 10);
  const gradePattern = /^(?:[1-5]\s*등급|인지지원\s*등급|등급외)$/;

  for (let r = 0; r < maxRow; r++) {
    const row = rows[r] || [];

    for (let c = 0; c < row.length; c++) {
      const cellText = normalizeText(row[c]);

      if (cellText === "등급") {
        for (let offset = 1; offset <= 16; offset++) {
          const value = row[c + offset];
          const text = String(value || "").trim();
          const normalized = normalizeText(text);

          if (!text || isLabelText(text)) continue;
          if (gradePattern.test(normalized)) return text;
        }
      }
    }
  }

  for (let r = 0; r < maxRow; r++) {
    const row = rows[r] || [];

    for (let c = 0; c < row.length; c++) {
      const text = String(row[c] || "").trim();
      const normalized = normalizeText(text);

      if (gradePattern.test(normalized)) {
        return text;
      }
    }
  }

  return "";
}

function findAttendanceHeaderIndex(rows) {
  return rows.findIndex((row) => {
    const text = normalizeText(row.join(" "));
    return text.includes("날짜") && text.includes("서비스시간");
  });
}

function findColumn(header, keywords) {
  return header.findIndex((cell) => {
    const text = normalizeText(cell);
    return keywords.some((keyword) => text.includes(normalizeText(keyword)));
  });
}

function parseOneAttendanceSheet(sheet, monthValue) {
  const rows = sheetToRowsWithMerges(sheet);

  const name = findTopInfoValue(rows, "수급자");
  const longTermNumber = findTopInfoValue(rows, "인정번호");
  const grade = findGradeValue(rows);
  const startDate = findTopInfoValue(rows, "급여개시일");

  const headerIndex = findAttendanceHeaderIndex(rows);

  if (headerIndex === -1 || !name) return null;

  const header = rows[headerIndex] || [];
  const dateCol = findColumn(header, ["날짜"]);
  const timeCol = findColumn(header, ["서비스시간"]);

  if (dateCol === -1) return null;

  const attendanceDates = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const dateText = parseDate(row[dateCol]);

    if (!dateText) continue;
    if (!dateText.startsWith(monthValue)) continue;

    const serviceTime = timeCol >= 0 ? String(row[timeCol] || "").trim() : "";
    const normalizedServiceTime = normalizeText(serviceTime);

    if (!normalizedServiceTime || normalizedServiceTime.includes("일정없음")) continue;

    attendanceDates.push(dateText);
  }

  const uniqueDates = Array.from(new Set(attendanceDates)).sort();

  return {
    name,
    longTermNumber,
    grade,
    startDate,
    month: monthValue,
    dates: uniqueDates,
    count: uniqueDates.length
  };
}

function parseAttendanceWorkbook(workbook, monthValue) {
  const results = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const item = parseOneAttendanceSheet(sheet, monthValue);

    if (item && item.dates.length > 0) {
      results.push(item);
    }
  });

  return results.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function makePayloadUrl(payload) {
  return `${API_URL}?payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

async function saveAttendanceMonth(monthValue, items, fileName) {
  const loginUser =
    sessionStorage.getItem("loginUser") ||
    localStorage.getItem("loginUser") ||
    "알 수 없음";

  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "addAttendance",
      month: monthValue,
      replaceMonth: true,
      fileName,
      uploadedAt: new Date().toLocaleString("ko-KR"),
      uploadedBy: loginUser,
      loginUser,
      items: items.map((item) => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        month: monthValue,
        recipientName: item.name,
        longTermNumber: item.longTermNumber,
        certNumber: item.longTermNumber,
        grade: item.grade,
        serviceStartDate: item.startDate,
        attendanceDates: item.dates,
        attendanceCount: item.count,
        fileName
      }))
    })
  });
}

async function loadAttendanceMonth(monthValue) {
  const response = await fetch(
    makePayloadUrl({
      action: "listAttendance",
      month: monthValue
    }),
    {
      method: "GET",
      redirect: "follow"
    }
  );

  const text = await response.text();

  try {
    const data = JSON.parse(text);

    if (!Array.isArray(data)) {
      console.error("출석 조회 응답:", data);
      alert("출석 데이터 형식이 올바르지 않습니다.");
      return [];
    }

    return data
      .map((item) => ({
        name: item.recipientName || "",
        longTermNumber: item.longTermNumber || item.certNumber || "",
        grade: item.grade || "",
        startDate: item.serviceStartDate || "",
        month: item.month || monthValue,
        dates: Array.isArray(item.attendanceDates) ? item.attendanceDates : [],
        count: Number(item.attendanceCount || 0)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  } catch (error) {
    console.error("출석 조회 JSON 오류:", error);
    console.error("응답 원본:", text);
    alert("출석 데이터를 불러오지 못했습니다.");
    return [];
  }
}

async function deleteAttendanceMonth(monthValue) {
  await fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "deleteAttendance",
      month: monthValue
    })
  });
}

function getDaysInMonth(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const days = [];

  for (let day = 1; day <= lastDay; day++) {
    days.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  return days;
}

function getHolidayList(year) {
  const holidays = {
    2024: [
      "2024-01-01",
      "2024-02-09",
      "2024-02-10",
      "2024-02-11",
      "2024-02-12",
      "2024-03-01",
      "2024-04-10",
      "2024-05-05",
      "2024-05-06",
      "2024-05-15",
      "2024-06-06",
      "2024-08-15",
      "2024-09-16",
      "2024-09-17",
      "2024-09-18",
      "2024-10-03",
      "2024-10-09",
      "2024-12-25"
    ],
    2025: [
      "2025-01-01",
      "2025-01-28",
      "2025-01-29",
      "2025-01-30",
      "2025-03-01",
      "2025-03-03",
      "2025-05-05",
      "2025-05-06",
      "2025-06-06",
      "2025-08-15",
      "2025-10-03",
      "2025-10-05",
      "2025-10-06",
      "2025-10-07",
      "2025-10-08",
      "2025-10-09",
      "2025-12-25"
    ],
    2026: [
      "2026-01-01",
      "2026-02-16",
      "2026-02-17",
      "2026-02-18",
      "2026-03-01",
      "2026-03-02",
      "2026-05-05",
      "2026-05-24",
      "2026-05-25",
      "2026-06-03",
      "2026-06-06",
      "2026-08-15",
      "2026-08-17",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-10-03",
      "2026-10-05",
      "2026-10-09",
      "2026-12-25"
    ]
  };

  return holidays[year] || [];
}

function getDayColorClass(dateText) {
  const date = new Date(dateText);
  const weekday = date.getDay();
  const holidayList = getHolidayList(date.getFullYear());

  if (weekday === 0 || holidayList.includes(dateText)) return "attendance-day-red";
  if (weekday === 6) return "attendance-day-blue";
  return "";
}

function renderAttendanceHeader(monthValue) {
  const days = getDaysInMonth(monthValue);

  attendanceTableHead.innerHTML = `
    <tr>
      <th>수급자명</th>
      <th>인정번호</th>
      <th>등급</th>
      <th>급여개시일</th>
      <th>출석일수</th>
      ${days
        .map((day) => {
          const dayNum = Number(day.split("-")[2]);
          const colorClass = getDayColorClass(day);
          return `<th class="attendance-day-head ${colorClass}">${dayNum}</th>`;
        })
        .join("")}
    </tr>
  `;
}

function renderAttendance(items) {
  attendanceResultBody.innerHTML = "";

  const monthValue =
    attendanceMonthInput.value ||
    (items && items[0] ? items[0].month : "");

  const days = monthValue ? getDaysInMonth(monthValue) : [];

  if (monthValue) renderAttendanceHeader(monthValue);

  if (!items || items.length === 0) {
    attendanceResultBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="${5 + days.length}">저장된 출석 내역이 없습니다.</td>
      </tr>
    `;
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("tr");
    const dateSet = new Set(item.dates || []);

    row.innerHTML = `
      <td>${item.name || "-"}</td>
      <td>${item.longTermNumber || "-"}</td>
      <td>${item.grade || "-"}</td>
      <td>${item.startDate || "-"}</td>
      <td class="status-info">${item.count || (item.dates || []).length}일</td>
      ${days
        .map((day) => {
          const attended = dateSet.has(day);
          const colorClass = getDayColorClass(day);
          return `<td class="attendance-day-cell ${colorClass}">${attended ? "○" : ""}</td>`;
        })
        .join("")}
    `;

    attendanceResultBody.appendChild(row);
  });
}

function applyAttendanceStyle() {
  if (document.getElementById("attendanceStyle")) return;

  const style = document.createElement("style");
  style.id = "attendanceStyle";
  style.textContent = `
    .attendance-table {
      min-width: 1320px;
      table-layout: fixed;
    }

    .attendance-table th,
    .attendance-table td {
      vertical-align: middle;
      white-space: nowrap;
      text-align: center;
      padding: 10px 8px;
    }

    .attendance-table th:nth-child(1),
    .attendance-table td:nth-child(1) {
      min-width: 100px;
      width: 100px;
      text-align: left;
      position: sticky;
      left: 0;
      z-index: 4;
      background-color: #fff;
    }

    .attendance-table th:nth-child(1) {
      background-color: #eaf0fb;
      z-index: 6;
    }

    .attendance-table th:nth-child(2),
    .attendance-table td:nth-child(2) {
      min-width: 140px;
      width: 140px;
      text-align: left;
      position: sticky;
      left: 100px;
      z-index: 4;
      background-color: #fff;
    }

    .attendance-table th:nth-child(2) {
      background-color: #eaf0fb;
      z-index: 6;
    }

    .attendance-table th:nth-child(3),
    .attendance-table td:nth-child(3) {
      min-width: 70px;
      width: 70px;
    }

    .attendance-table th:nth-child(4),
    .attendance-table td:nth-child(4) {
      min-width: 105px;
      width: 105px;
    }

    .attendance-table th:nth-child(5),
    .attendance-table td:nth-child(5) {
      min-width: 80px;
      width: 80px;
    }

    .attendance-day-head,
    .attendance-day-cell {
      min-width: 34px;
      width: 34px;
      font-weight: 700;
    }

    .attendance-day-cell {
      color: #1f3c88;
      font-size: 15px;
    }

    .attendance-day-blue {
      color: #2563eb !important;
    }

    .attendance-day-red {
      color: #dc2626 !important;
    }
  `;

  document.head.appendChild(style);
}

registerAttendanceBtn.addEventListener("click", () => {
  applyAttendanceStyle();

  const monthValue = attendanceMonthInput.value;
  const file = attendanceFileInput.files[0];

  if (!monthValue) {
    alert("확인 월을 선택해주세요.");
    return;
  }

  if (!file) {
    alert("출석 파일을 업로드해주세요.");
    return;
  }

  const reader = new FileReader();

  reader.onload = async (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, {
        type: "array",
        cellDates: true
      });

      const items = parseAttendanceWorkbook(workbook, monthValue);

      if (items.length === 0) {
        alert("선택한 월의 출석 내역을 찾지 못했습니다.");
        renderAttendance([]);
        return;
      }

      await saveAttendanceMonth(monthValue, items, file.name);

      renderAttendance(items);

      attendanceFileInput.value = "";

      alert("출석 내역이 구글시트에 저장되었습니다.");
    } catch (error) {
      console.error("출석 등록 오류:", error);
      alert("출석 등록 중 오류가 발생했습니다.");
    }
  };

  reader.readAsArrayBuffer(file);
});

loadAttendanceBtn.addEventListener("click", async () => {
  applyAttendanceStyle();

  const monthValue = attendanceMonthInput.value;

  if (!monthValue) {
    alert("확인 월을 선택해주세요.");
    return;
  }

  const items = await loadAttendanceMonth(monthValue);
  renderAttendance(items);
});

clearAttendanceBtn.addEventListener("click", async () => {
  applyAttendanceStyle();

  const monthValue = attendanceMonthInput.value;

  if (!monthValue) {
    alert("삭제할 월을 선택해주세요.");
    return;
  }

  if (!confirm(`${monthValue} 출석 내역을 삭제할까요?`)) return;

  try {
    await deleteAttendanceMonth(monthValue);

    attendanceFileInput.value = "";
    renderAttendance([]);

    alert("삭제되었습니다.");
  } catch (error) {
    console.error("출석 삭제 오류:", error);
    alert("삭제 중 오류가 발생했습니다.");
  }
});
