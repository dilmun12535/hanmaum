const API_URL = "https://script.google.com/macros/s/AKfycbyxbQ7GeDm7pq9SkYDSgGkt7GiKic878En8-niDDFuRg7-lyxo5F3E7LE5qYpqi2_Z14g/exec";

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


function getCellDisplayValue(cell) {
  if (!cell) return "";

  // 엑셀에서 시간이 숫자(0.6944)로 저장되어도, 화면에 보이는 값(cell.w)이 있으면 그 값을 우선 사용합니다.
  if (cell.w !== undefined && cell.w !== null && String(cell.w).trim() !== "") {
    return cell.w;
  }

  if (cell.v !== undefined && cell.v !== null) return cell.v;
  return "";
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
      row[c] = getCellDisplayValue(cell);
    }

    rows.push(row);
  }

  const merges = sheet["!merges"] || [];

  merges.forEach((merge) => {
    const startAddress = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c });
    const startCell = sheet[startAddress];
    const value = getCellDisplayValue(startCell);

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

function normalizeTimeText(value) {
  if (value === undefined || value === null) return "";

  if (value instanceof Date) {
    const hour = String(value.getHours()).padStart(2, "0");
    const minute = String(value.getMinutes()).padStart(2, "0");
    return `${hour}:${minute}`;
  }

  if (typeof value === "number") {
    // 엑셀 시간이 0.5처럼 소수로 들어오는 경우 처리
    if (value > 0 && value < 1) {
      const totalMinutes = Math.round(value * 24 * 60);
      const hour = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
      const minute = String(totalMinutes % 60).padStart(2, "0");
      return `${hour}:${minute}`;
    }
  }

  const text = String(value || "").trim();
  const match = text.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})/);
  if (!match) return "";

  return `${String(match[1]).padStart(2, "0")}:${String(match[2]).padStart(2, "0")}`;
}

function extractLeaveTime(serviceTime, provTime) {
  // 제공시간이 있으면 제공시간을 우선 사용하고, 없으면 서비스시간을 사용합니다.
  // 예: "09:00 ~ 16:30", "09:00-16:30", "09시00분~16시30분" → "16:30"
  const rawSource = provTime || serviceTime || "";

  // 엑셀 시간이 0.6944 같은 숫자로 들어온 경우
  if (typeof rawSource === "number") {
    return normalizeTimeText(rawSource);
  }

  const source = String(rawSource || "").trim();
  if (!source) return "";

  // 엑셀 숫자 시간이 문자열로 들어온 경우
  if (/^0\.\d+$/.test(source)) {
    return normalizeTimeText(Number(source));
  }

  // 6:55 ~ 16:40 / 06시55분~16시40분 등 처리
  const matches = source.match(/\d{1,2}\s*(?::|시)\s*\d{1,2}/g) || [];
  if (matches.length >= 2) return normalizeTimeText(matches[matches.length - 1]);
  if (matches.length === 1) return normalizeTimeText(matches[0]);

  return "";
}

function extractLeaveTimeFromRow(row) {
  // 서비스시간 컬럼을 못 찾는 파일도 있어서, 해당 행 전체에서 "07:46~16:48" 같은 시간 범위를 다시 찾습니다.
  const values = (row || []).map((value) => String(value || "").trim()).filter(Boolean);

  for (const value of values) {
    const leaveTime = extractLeaveTime(value, "");
    if (leaveTime) return leaveTime;
  }

  return "";
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
  const provCol = findColumn(header, ["제공시간"]);

  if (dateCol === -1) return null;

  const attendanceDates = [];
  const leaveTimes = {};
  const attendanceTimeRows = {};

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const dateText = parseDate(row[dateCol]);

    if (!dateText) continue;
    if (!dateText.startsWith(monthValue)) continue;

    const serviceTime = timeCol >= 0 ? String(row[timeCol] || "").trim() : "";
    const provTime = provCol >= 0 ? String(row[provCol] || "").trim() : "";

    const normalizedServiceTime = normalizeText(serviceTime);
    const normalizedProvTime = normalizeText(provTime);

    if (!normalizedServiceTime || normalizedServiceTime.includes("일정없음") || normalizedServiceTime.includes("미이용")) continue;
    if (normalizedProvTime.includes("미이용") || normalizedProvTime.includes("일정없음")) continue;

    let leaveTime = extractLeaveTime(serviceTime, "");
    if (!leaveTime) leaveTime = extractLeaveTime(provTime, "");
    if (!leaveTime) leaveTime = extractLeaveTimeFromRow(row);

    attendanceDates.push(dateText);
    if (leaveTime) leaveTimes[dateText] = leaveTime;
    attendanceTimeRows[dateText] = {
      serviceTime,
      providedTime: provTime,
      leaveTime
    };
  }

  const uniqueDates = Array.from(new Set(attendanceDates)).sort();

  return {
    name,
    longTermNumber,
    grade,
    startDate,
    month: monthValue,
    dates: uniqueDates,
    count: uniqueDates.length,
    leaveTimes,
    attendanceTimeRows
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
        leaveTimes: item.leaveTimes || {},
        leaveTimesJson: JSON.stringify(item.leaveTimes || {}),
        attendanceTimeRows: item.attendanceTimeRows || {},
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
        count: Number(item.attendanceCount || 0),
        leaveTimes: item.leaveTimes || {},
        attendanceTimeRows: item.attendanceTimeRows || {}
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  } catch (error) {
    console.error("출석 조회 JSON 오류:", error);
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
      "2024-01-01", "2024-02-09", "2024-02-10", "2024-02-11", "2024-02-12", "2024-03-01",
      "2024-04-10", "2024-05-05", "2024-05-06", "2024-05-15", "2024-06-06", "2024-08-15",
      "2024-09-16", "2024-09-17", "2024-09-18", "2024-10-03", "2024-10-09", "2024-12-25"
    ],
    2025: [
      "2025-01-01", "2025-01-28", "2025-01-29", "2025-01-30", "2025-03-01", "2025-03-03",
      "2025-05-05", "2025-05-06", "2025-06-06", "2025-08-15", "2025-10-03", "2025-10-05",
      "2025-10-06", "2025-10-07", "2025-10-08", "2025-10-09", "2025-12-25"
    ],
    2026: [
      "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02",
      "2026-05-05", "2026-05-24", "2026-05-25", "2026-06-03", "2026-06-06", "2026-08-15",
      "2026-08-17", "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05",
      "2026-10-09", "2026-12-25"
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
          const leaveTime = item.leaveTimes ? item.leaveTimes[day] : "";
          return `<td class="attendance-day-cell ${colorClass}">${attended ? `○${leaveTime ? `<br><span class="leave-time-text">${leaveTime}</span>` : ""}` : ""}</td>`;
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
      line-height: 1.25;
    }

    .leave-time-text {
      display: inline-block;
      margin-top: 2px;
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
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

let attendanceUploadTimer = null;

function showAttendanceUploadStatus(message) {
  let box = document.getElementById("attendanceUploadStatusBox");

  if (!box) {
    box = document.createElement("div");
    box.id = "attendanceUploadStatusBox";
    box.style.position = "fixed";
    box.style.left = "50%";
    box.style.top = "50%";
    box.style.transform = "translate(-50%, -50%)";
    box.style.zIndex = "9999";
    box.style.background = "#ffffff";
    box.style.border = "1px solid #cbd5e1";
    box.style.borderRadius = "12px";
    box.style.boxShadow = "0 10px 30px rgba(0,0,0,0.18)";
    box.style.padding = "22px 26px";
    box.style.minWidth = "320px";
    box.style.textAlign = "center";
    box.style.fontSize = "14px";
    box.style.color = "#1e293b";
    box.innerHTML = `
      <div style="font-weight:800; font-size:16px; margin-bottom:10px;">출석 파일 업로드 중입니다</div>
      <div id="attendanceUploadStatusText" style="line-height:1.6;">${message}</div>
      <div id="attendanceUploadElapsed" style="margin-top:10px; color:#64748b; font-size:12px;">경과 시간 0초</div>
      <div style="margin-top:12px; color:#e11d48; font-size:12px;">창을 닫거나 새로고침하지 마세요.</div>
    `;
    document.body.appendChild(box);
  }

  const text = document.getElementById("attendanceUploadStatusText");
  if (text) text.innerHTML = message;

  const startTime = Date.now();
  clearInterval(attendanceUploadTimer);
  attendanceUploadTimer = setInterval(() => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const elapsed = document.getElementById("attendanceUploadElapsed");
    if (elapsed) {
      elapsed.textContent = `경과 시간 ${seconds}초 · 보통 10~60초 정도 걸릴 수 있습니다.`;
    }
  }, 1000);
}

function updateAttendanceUploadStatus(message) {
  const text = document.getElementById("attendanceUploadStatusText");
  if (text) text.innerHTML = message;
}

function hideAttendanceUploadStatus() {
  clearInterval(attendanceUploadTimer);
  attendanceUploadTimer = null;

  const box = document.getElementById("attendanceUploadStatusBox");
  if (box) box.remove();
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

  showAttendanceUploadStatus("파일을 준비하는 중입니다...<br>잠시만 기다려주세요.");

  const reader = new FileReader();

  reader.onload = async (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, {
        type: "array",
        cellDates: true
      });

      updateAttendanceUploadStatus("엑셀 파일을 읽는 중입니다...<br>잠시만 기다려주세요.");

      const items = parseAttendanceWorkbook(workbook, monthValue);

      const detectedLeaveCount = items.reduce((sum, item) => {
        return sum + Object.keys(item.leaveTimes || {}).length;
      }, 0);

      if (detectedLeaveCount === 0) {
        alert("출석일은 읽었지만 하원시간을 찾지 못했습니다. 파일의 서비스시간 위치를 확인해야 합니다.");
      }

      if (items.length === 0) {
        alert("선택한 월의 출석 내역을 찾지 못했습니다.");
        renderAttendance([]);
        return;
      }

      updateAttendanceUploadStatus("구글시트에 저장 중입니다...<br>데이터가 많으면 10~60초 정도 걸릴 수 있습니다.");

      await saveAttendanceMonth(monthValue, items, file.name);

      updateAttendanceUploadStatus("저장 완료 후 화면을 정리하는 중입니다...");

      renderAttendance(items);

      attendanceFileInput.value = "";
      hideAttendanceUploadStatus();

      alert("출석 내역이 구글시트에 업데이트 및 저장되었습니다.");
    } catch (error) {
      hideAttendanceUploadStatus();
      console.error("출석 등록 오류:", error);
      alert("출석 등록 중 오류가 발생했습니다.");
    }
  };

  reader.onerror = () => {
    hideAttendanceUploadStatus();
    alert("파일을 읽는 중 오류가 발생했습니다.");
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
