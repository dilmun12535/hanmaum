let lastErrors = [];

const $ = (id) => document.getElementById(id);

window.addEventListener("DOMContentLoaded", () => {
  setTodayText();

  $("checkBtn").addEventListener("click", handleCheck);
  $("resetBtn").addEventListener("click", resetPage);
  $("downloadBtn").addEventListener("click", downloadCsv);
});

function setTodayText() {
  const el = $("todayText");
  if (!el) return;

  const now = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  el.textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")} (${days[now.getDay()]})`;
}

async function handleCheck() {
  const file = $("excelFile").files[0];
  if (!file) {
    showError("엑셀 파일을 먼저 선택해 주세요.");
    return;
  }

  hideError();
  resetResultOnly();
  setLoading(true);

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    const sheetNames = workbook.SheetNames || [];

    const errors = [];
    updateProgress(0, sheetNames.length, "검사 시작...");

    for (let i = 0; i < sheetNames.length; i++) {
      const sheetName = sheetNames[i];
      const ws = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });

      const sheetErrors = inspectSheet(rows, sheetName);
      errors.push(...sheetErrors);

      if (i % 10 === 0) {
        updateProgress(i + 1, sheetNames.length, `검사 중... ${i + 1} / ${sheetNames.length}`);
        await wait(0);
      }
    }

    updateProgress(sheetNames.length, sheetNames.length, `검사 완료 ${sheetNames.length} / ${sheetNames.length}`);
    lastErrors = errors;
    renderResults(errors, sheetNames.length);
  } catch (err) {
    console.error(err);
    showError("파일을 읽는 중 오류가 발생했습니다. 엑셀 파일 형식을 확인해 주세요.");
  } finally {
    setLoading(false);
  }
}

function inspectSheet(rows, sheetName) {
  const errors = [];
  const recipientName = findRecipientName(rows) || sheetName;
  const dateInfo = findDateColumns(rows);

  if (!dateInfo || dateInfo.columns.length === 0) return errors;

  const bathTimeRow = findRowIndex(rows, ["목욕"], ["소요시간", "시간"]);
  const bathMethodRow = findRowIndex(rows, ["목욕"], ["방법"]);
  const lunchRow = findRowIndex(rows, ["점심"]);
  const dinnerRow = findRowIndex(rows, ["저녁"]);

  for (const colInfo of dateInfo.columns) {
    const col = colInfo.col;
    const dateText = colInfo.dateText;

    // 식사 점검: 점심/저녁 칸에 식사 기록이 있으면 정량 필수
    checkMealCell(errors, rows, sheetName, recipientName, dateText, lunchRow, col, "점심");
    checkMealCell(errors, rows, sheetName, recipientName, dateText, dinnerRow, col, "저녁");

    // 목욕 점검: 목욕 시간이 있거나 방법이 있으면 방법은 반드시 목욕의자(샤워식)
    const bathTime = getCell(rows, bathTimeRow, col);
    const bathMethod = getCell(rows, bathMethodRow, col);
    const hasBath = isMeaningfulBathValue(bathTime) || isMeaningfulBathValue(bathMethod);

    if (hasBath && normalizeText(bathMethod) !== normalizeText("목욕의자(샤워식)")) {
      errors.push({
        sheetName,
        recipientName,
        dateText,
        type: "목욕",
        currentValue: bathMethod || bathTime || "빈칸",
        expectedValue: "목욕의자(샤워식)",
        message: bathMethod ? "목욕 방법이 기준과 다릅니다." : "목욕 시간이 있으나 목욕 방법이 비어 있습니다.",
      });
    }
  }

  return errors;
}

function checkMealCell(errors, rows, sheetName, recipientName, dateText, rowIndex, col, mealName) {
  if (rowIndex < 0) return;

  const value = getCell(rows, rowIndex, col);
  if (!isMeaningfulMealValue(value)) return;

  const normalized = normalizeText(value);
  const hasAmount = normalized.includes("정량");

  if (!hasAmount) {
    const mealType = extractMealType(value);
    errors.push({
      sheetName,
      recipientName,
      dateText,
      type: `식사-${mealName}`,
      currentValue: value,
      expectedValue: `${mealType || "식사"}(1(정량))`,
      message: "식사량이 정량으로 작성되어 있지 않습니다.",
    });
  }
}

function findRecipientName(rows) {
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < Math.min(row.length, 10); c++) {
      if (normalizeText(row[c]) === "수급자명") {
        for (let next = c + 1; next <= c + 4; next++) {
          const v = cleanText(row[next]);
          if (v) return v;
        }
      }
    }
  }
  return "";
}

function findDateColumns(rows) {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r] || [];
    const columns = [];

    for (let c = 0; c < row.length; c++) {
      const value = cleanText(row[c]);
      if (isDateHeader(value)) {
        columns.push({ col: c, dateText: normalizeDateHeader(value) });
      }
    }

    if (columns.length >= 2) return { rowIndex: r, columns };
  }

  return null;
}

function isDateHeader(value) {
  const text = cleanText(value);
  return /^\d{1,2}\s*[\/.-]\s*\d{1,2}/.test(text);
}

function normalizeDateHeader(value) {
  const text = cleanText(value);
  const match = text.match(/(\d{1,2})\s*[\/.-]\s*(\d{1,2})/);
  if (!match) return text;
  return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}`;
}

function findRowIndex(rows, requiredWords, optionalWords = []) {
  for (let r = 0; r < rows.length; r++) {
    const labelText = normalizeText((rows[r] || []).slice(0, 8).join(" "));
    const hasRequired = requiredWords.every((word) => labelText.includes(normalizeText(word)));
    const hasOptional = optionalWords.length === 0 || optionalWords.some((word) => labelText.includes(normalizeText(word)));

    if (hasRequired && hasOptional) return r;
  }
  return -1;
}

function getCell(rows, r, c) {
  if (r < 0 || c < 0) return "";
  return cleanText(rows?.[r]?.[c]);
}

function isMeaningfulMealValue(value) {
  const text = normalizeText(value);
  if (!text) return false;
  if (text === "■" || text === "□" || text === "0") return false;

  return ["일반식", "죽식", "다진식", "경관식", "유동식", "미음", "식"].some((word) => text.includes(word));
}

function isMeaningfulBathValue(value) {
  const text = normalizeText(value);
  if (!text) return false;
  if (text === "■" || text === "□" || text === "0") return false;
  return true;
}

function extractMealType(value) {
  const text = cleanText(value).replace(/\s+/g, "");
  const types = ["일반식", "죽식", "다진식", "경관식", "유동식", "미음"];
  return types.find((type) => text.includes(type)) || "";
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\r/g, "").trim();
}

function normalizeText(value) {
  return cleanText(value).replace(/\s+/g, "").replace(/[　]/g, "");
}

function renderResults(errors, sheetCount) {
  const mealErrors = errors.filter((e) => e.type.startsWith("식사")).length;
  const bathErrors = errors.filter((e) => e.type === "목욕").length;

  $("sheetCount").textContent = sheetCount;
  $("mealErrorCount").textContent = mealErrors;
  $("bathErrorCount").textContent = bathErrors;
  $("totalErrorCount").textContent = errors.length;

  const body = $("resultBody");
  body.innerHTML = "";

  if (errors.length === 0) {
    $("emptyBox").style.display = "block";
    $("resultSection").style.display = "none";
    return;
  }

  $("emptyBox").style.display = "none";
  $("resultSection").style.display = "block";

  const fragment = document.createDocumentFragment();
  for (const error of errors) {
    const tr = document.createElement("tr");
    const badgeClass = error.type === "목욕" ? "bath" : "meal";
    tr.innerHTML = `
      <td>${escapeHtml(error.sheetName)}</td>
      <td>${escapeHtml(error.recipientName)}</td>
      <td>${escapeHtml(error.dateText)}</td>
      <td><span class="badge ${badgeClass}">${escapeHtml(error.type)}</span></td>
      <td>${escapeHtml(error.currentValue).replace(/\n/g, "<br>")}</td>
      <td>${escapeHtml(error.expectedValue)}</td>
      <td>${escapeHtml(error.message)}</td>
    `;
    fragment.appendChild(tr);
  }
  body.appendChild(fragment);
}

function downloadCsv() {
  if (!lastErrors.length) {
    alert("다운로드할 오류 목록이 없습니다.");
    return;
  }

  const headers = ["시트명", "수급자명", "날짜", "항목", "현재값", "정상값", "오류내용"];
  const rows = lastErrors.map((e) => [
    e.sheetName,
    e.recipientName,
    e.dateText,
    e.type,
    e.currentValue,
    e.expectedValue,
    e.message,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `식사_목욕_오류목록_${formatDateForFile(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatDateForFile(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function updateProgress(done, total, text) {
  $("progressArea").style.display = "block";
  $("progressText").textContent = text;
  const percent = total ? Math.round((done / total) * 100) : 0;
  $("progressFill").style.width = `${percent}%`;
}

function setLoading(isLoading) {
  $("checkBtn").disabled = isLoading;
  $("excelFile").disabled = isLoading;
}

function resetPage() {
  $("excelFile").value = "";
  resetResultOnly();
  hideError();
  $("progressArea").style.display = "none";
  $("progressFill").style.width = "0%";
  $("progressText").textContent = "검사 준비 중...";
}

function resetResultOnly() {
  lastErrors = [];
  $("sheetCount").textContent = "0";
  $("mealErrorCount").textContent = "0";
  $("bathErrorCount").textContent = "0";
  $("totalErrorCount").textContent = "0";
  $("resultBody").innerHTML = "";
  $("resultSection").style.display = "none";
  $("emptyBox").style.display = "none";
}

function showError(message) {
  const el = $("errorText");
  el.textContent = message;
  el.style.display = "block";
}

function hideError() {
  const el = $("errorText");
  el.textContent = "";
  el.style.display = "none";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
