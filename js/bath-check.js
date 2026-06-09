const CARE_PLAN_API_URL = "https://script.google.com/macros/s/AKfycbyNMzHSr7ITPwJbJJXef3v1W4YYyRCiJ8zwGqykx96aszNy_QleOD2DDUyzEimjZ4FHYQ/exec";

async function syncCarePlanLibraryFromGoogleSheet() {
  try {
    const response = await fetch(CARE_PLAN_API_URL, { method: "GET", redirect: "follow" });
    const text = await response.text();
    const plans = JSON.parse(text);
    localStorage.setItem("carePlanLibrary", JSON.stringify(plans));
    return plans;
  } catch (error) {
    console.error("급여제공계획서 동기화 오류:", error);
    return JSON.parse(localStorage.getItem("carePlanLibrary") || "[]");
  }
}

syncCarePlanLibraryFromGoogleSheet();

const checkMonthInput = document.getElementById("checkMonth");
const bathFileInput = document.getElementById("bathFile");
const checkBathBtn = document.getElementById("checkBathBtn");
const clearBathBtn = document.getElementById("clearBathBtn");
const bathResultBody = document.getElementById("bathResultBody");

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function getMonthEndDate(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function getWeekEndDates(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const firstDay = monthStart.getDay();
  const mondayOffset = (firstDay + 6) % 7;

  const firstMonday = new Date(monthStart);
  firstMonday.setDate(monthStart.getDate() - mondayOffset);

  const result = {};

  for (let i = 0; i < 5; i++) {
    const weekStart = new Date(firstMonday);
    weekStart.setDate(firstMonday.getDate() + (i * 7));

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 5);

    const targetDate = new Date(Math.min(weekEnd.getTime(), monthEnd.getTime()));

    result[`week${i + 1}`] =
      `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;
  }

  return result;
}

function getLatestPlansByRecipient(checkDate) {
  const library = JSON.parse(localStorage.getItem("carePlanLibrary") || "[]");

  const validPlans = library.filter((plan) => {
    return new Date(plan.writtenDate) <= new Date(checkDate);
  });

  const latestByName = {};

  validPlans.forEach((plan) => {
    const name = plan.recipientName;
    const current = latestByName[name];

    if (!current || new Date(plan.writtenDate) > new Date(current.writtenDate)) {
      latestByName[name] = plan;
    }
  });

  return latestByName;
}

function hasBathPlan(plan) {
  if (!plan || !plan.rows) return false;

  const text = normalizeText(JSON.stringify(plan.rows));
  return text.includes("몸씻기도움") || text.includes("B52");
}

function getLatestBathCounsel(name, targetDate) {
  const counselLibrary = JSON.parse(localStorage.getItem("counselLibrary") || "[]");
  const target = new Date(targetDate);

  const bathCounsels = counselLibrary
    .filter((item) => {
      const sameName = item.recipientName === name;
      const reflectionDate = new Date(item.reflectionDate);
      const category = item.category || "";
      const text = normalizeText(`${item.careContent} ${item.reason} ${item.changeType}`);

      const isBath =
        category === "목욕" ||
        text.includes("목욕") ||
        text.includes("몸씻기");

      return sameName && isBath && reflectionDate <= target;
    })
    .sort((a, b) => new Date(b.reflectionDate) - new Date(a.reflectionDate));

  return bathCounsels[0] || null;
}

function isRemoveCounsel(counsel) {
  if (!counsel) return false;

  const text = normalizeText(`${counsel.changeType} ${counsel.careContent} ${counsel.reason}`);

  return (
    text.includes("제외") ||
    text.includes("중단") ||
    text.includes("삭제") ||
    text.includes("미제공") ||
    text.includes("하지않")
  );
}

function isAddCounsel(counsel) {
  if (!counsel) return false;

  const text = normalizeText(`${counsel.changeType} ${counsel.careContent} ${counsel.reason}`);

  return (
    text.includes("추가") ||
    text.includes("시작") ||
    text.includes("제공") ||
    text.includes("반영")
  );
}

function isBathRequiredAtDate(plan, name, targetDate) {
  let required = hasBathPlan(plan);

  const counsel = getLatestBathCounsel(name, targetDate);

  if (counsel) {
    if (isRemoveCounsel(counsel)) {
      required = false;
    }

    if (isAddCounsel(counsel)) {
      required = true;
    }
  }

  return required;
}

function getCounselTextForMonth(name, monthEndDate) {
  const counsel = getLatestBathCounsel(name, monthEndDate);

  if (!counsel) {
    return "없음";
  }

  return `${counsel.reflectionDate} / ${counsel.changeType || "-"} / ${counsel.careContent || "-"}`;
}

function parseBathCell(value) {
  const text = String(value || "").trim();

  if (!text) return null;

  const cleanText = normalizeText(text);

  if (cleanText.includes("일정없음")) {
    return null;
  }

  if (cleanText.includes("목욕거부")) {
    return {
      hasRecord: true,
      label: "목욕거부"
    };
  }

  const hasTime = /\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2}/.test(text);
  const hasDate = /\d{4}[.-]\d{2}[.-]\d{2}/.test(text);

  if (hasTime || hasDate) {
    return {
      hasRecord: true,
      label: text.replace(/\n/g, " ")
    };
  }

  return null;
}

function findWeekColumns(rows, headerIndex, weekNumber) {
  const targetTexts = [`${weekNumber}주`, `${weekNumber}주차`];
  const columns = [];

  for (let r = Math.max(0, headerIndex - 5); r <= headerIndex + 5; r++) {
    const row = rows[r] || [];

    row.forEach((cell, colIndex) => {
      const text = normalizeText(cell);

      if (targetTexts.some((target) => text.includes(target))) {
        columns.push(colIndex);
      }
    });
  }

  if (columns.length > 0) {
    return {
      start: Math.min(...columns),
      end: Math.max(...columns)
    };
  }

  const fallbackCol = 6 + (weekNumber - 1);

  return {
    start: fallbackCol,
    end: fallbackCol
  };
}

function parseBathReport(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ""
  });

  const headerIndex = rows.findIndex((row) => {
    return row.some((cell) => normalizeText(cell).includes("수급자명"));
  });

  if (headerIndex === -1) {
    alert("목욕 리포트에서 수급자명 열을 찾지 못했습니다.");
    return [];
  }

  const header = rows[headerIndex];

  const nameCol = header.findIndex((cell) => normalizeText(cell).includes("수급자명"));

  const weekRanges = {
    week1: findWeekColumns(rows, headerIndex, 1),
    week2: findWeekColumns(rows, headerIndex, 2),
    week3: findWeekColumns(rows, headerIndex, 3),
    week4: findWeekColumns(rows, headerIndex, 4),
    week5: findWeekColumns(rows, headerIndex, 5)
  };

  const result = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[nameCol] || "").trim();

    if (!name || name === "수급자명") continue;

    const weeks = {};

    Object.entries(weekRanges).forEach(([weekKey, range]) => {
      const cells = row.slice(range.start, range.end + 1);

      const records = cells
        .map(parseBathCell)
        .filter((item) => item !== null);

      weeks[weekKey] = {
        hasBathRecord: records.length > 0,
        recordText: records.length > 0
          ? records.map((item) => item.label).join(" / ")
          : "-"
      };
    });

    result.push({
      name,
      weeks
    });
  }

  return result;
}

function getWeekResult(required, weekData) {
  const hasRecord = weekData && weekData.hasBathRecord;

  if (required && hasRecord) return "정상";
  if (required && !hasRecord) return "누락";
  if (!required && hasRecord) return "오류";
  return "정상";
}

function makeResultClass(result) {
  if (result === "정상") return "status-ok";
  if (result === "누락") return "status-danger";
  if (result === "오류") return "status-danger";
  return "";
}

function buildWeekCell(required, weekData) {
  const result = getWeekResult(required, weekData);
  const resultClass = makeResultClass(result);
  const recordText = weekData ? weekData.recordText : "-";

  return `
    <div class="${resultClass}">${result}</div>
    <div style="font-size:12px; color:#555; margin-top:4px;">${recordText}</div>
  `;
}

function buildOverallResult(weekResults) {
  const hasError = weekResults.some((result) => result !== "정상");
  return hasError ? "확인 필요" : "정상";
}

function buildResults(monthValue, bathRows) {
  const monthEndDate = getMonthEndDate(monthValue);
  const weekEndDates = getWeekEndDates(monthValue);
  const latestPlans = getLatestPlansByRecipient(monthEndDate);

  const bathMap = {};
  bathRows.forEach((row) => {
    bathMap[row.name] = row;
  });

  const allNames = new Set([
    ...Object.keys(latestPlans),
    ...Object.keys(bathMap)
  ]);

  const results = [];

  allNames.forEach((name) => {
    const plan = latestPlans[name];
    const bath = bathMap[name];

    const weeks = bath
      ? bath.weeks
      : {
          week1: { hasBathRecord: false, recordText: "-" },
          week2: { hasBathRecord: false, recordText: "-" },
          week3: { hasBathRecord: false, recordText: "-" },
          week4: { hasBathRecord: false, recordText: "-" },
          week5: { hasBathRecord: false, recordText: "-" }
        };

    const weekRequired = {
      week1: isBathRequiredAtDate(plan, name, weekEndDates.week1),
      week2: isBathRequiredAtDate(plan, name, weekEndDates.week2),
      week3: isBathRequiredAtDate(plan, name, weekEndDates.week3),
      week4: isBathRequiredAtDate(plan, name, weekEndDates.week4),
      week5: isBathRequiredAtDate(plan, name, weekEndDates.week5)
    };

    const weekResults = [
      getWeekResult(weekRequired.week1, weeks.week1),
      getWeekResult(weekRequired.week2, weeks.week2),
      getWeekResult(weekRequired.week3, weeks.week3),
      getWeekResult(weekRequired.week4, weeks.week4),
      getWeekResult(weekRequired.week5, weeks.week5)
    ];

    const anyRequired = Object.values(weekRequired).some(Boolean);

    results.push({
      name,
      planDate: plan ? plan.writtenDate : "-",
      counselText: getCounselTextForMonth(name, monthEndDate),
      requiredText: anyRequired ? "있음" : "없음",
      weekRequired,
      weeks,
      overallResult: buildOverallResult(weekResults)
    });
  });

  return results.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

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
    const overallClass = item.overallResult === "정상" ? "status-ok" : "status-danger";

row.innerHTML = `
  <td>${item.name}</td>
  <td>${item.planDate || "-"}</td>
  <td>${item.counselText || "없음"}</td>
  <td>${item.requiredText || "없음"}</td>
  <td>${buildWeekCell(item.weekRequired.week1, item.weeks.week1)}</td>
  <td>${buildWeekCell(item.weekRequired.week2, item.weeks.week2)}</td>
  <td>${buildWeekCell(item.weekRequired.week3, item.weeks.week3)}</td>
  <td>${buildWeekCell(item.weekRequired.week4, item.weeks.week4)}</td>
  <td>${buildWeekCell(item.weekRequired.week5, item.weeks.week5)}</td>
  <td class="${overallClass}">${item.overallResult}</td>
`;

    bathResultBody.appendChild(row);
  });
}

checkBathBtn.addEventListener("click", async () => {
  await syncCarePlanLibraryFromGoogleSheet();
  const checkMonth = checkMonthInput.value;
  const file = bathFileInput.files[0];

  if (!checkMonth) {
    alert("확인 월을 선택해주세요.");
    return;
  }

  if (!file) {
    alert("목욕 리포트 파일을 업로드해주세요.");
    return;
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    const data = new Uint8Array(event.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const bathRows = parseBathReport(workbook);
    const results = buildResults(checkMonth, bathRows);

    renderResults(results);
  };

  reader.readAsArrayBuffer(file);
});

clearBathBtn.addEventListener("click", () => {
  checkMonthInput.value = "";
  bathFileInput.value = "";

  bathResultBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="11">확인 월과 목욕 리포트 파일을 선택해주세요.</td>
    </tr>
  `;
});
