/* 월별 어르신 수가 보관함 */
const MONTHLY_FEE_API_URL = "https://script.google.com/macros/s/AKfycbwJhnr6jFypaNIPzsaCUx8zk9Lc0SHN3AYPzhoT0uoMW_eTDPVlnrIzONA1gCD0_A5WDQ/exec";

const $ = (id) => document.getElementById(id);
const state = { file: null, rows: [], savedRows: [] };

window.addEventListener("DOMContentLoaded", () => {
  setTodayText();
  $("monthInput").value = new Date().toISOString().slice(0, 7);
  $("fileInput").addEventListener("change", handleFileChange);
  $("uploadBtn").addEventListener("click", uploadMonthlyFee);
  $("reloadBtn").addEventListener("click", loadMonthlyFee);
  $("deleteMonthBtn").addEventListener("click", deleteMonth);
  $("monthInput").addEventListener("change", loadMonthlyFee);
  $("searchInput").addEventListener("input", renderTable);
  loadMonthlyFee();
});

function setTodayText() {
  const el = $("todayText");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

function showNotice(message, type = "info") {
  const box = $("noticeBox");
  box.style.display = "block";
  box.textContent = message;
  box.style.background = type === "error" ? "#fef2f2" : type === "success" ? "#ecfdf3" : "#fffbeb";
  box.style.color = type === "error" ? "#b42318" : type === "success" ? "#027a48" : "#92400e";
}

function apiUrl(payload) {
  if (!MONTHLY_FEE_API_URL || MONTHLY_FEE_API_URL.includes("여기에_")) {
    throw new Error("monthly-fee-library.js 상단의 MONTHLY_FEE_API_URL에 앱스크립트 웹앱 URL을 넣어주세요.");
  }
  return `${MONTHLY_FEE_API_URL}?payload=${encodeURIComponent(JSON.stringify(payload))}`;
}

async function requestApi(payload) {
  const res = await fetch(apiUrl(payload), { method: "GET" });
  if (!res.ok) throw new Error("앱스크립트 연결에 실패했습니다.");
  return await res.json();
}

function handleFileChange(e) {
  const file = e.target.files && e.target.files[0];
  state.file = file || null;
  $("fileName").textContent = file ? file.name : "선택된 파일 없음";
  $("uploadBtn").disabled = !file;
  if (file) previewFile(file);
}

async function previewFile(file) {
  try {
    showNotice("파일을 읽는 중입니다...");
    const items = await parseMonthlyFeeFile(file, $("monthInput").value);
    state.rows = items;
    showNotice(`미리보기 완료: ${items.length.toLocaleString()}건을 찾았습니다. 저장하려면 업로드 저장을 누르세요.`, "success");
  } catch (err) {
    state.rows = [];
    showNotice(err.message || "파일을 읽지 못했습니다.", "error");
  }
}

async function parseMonthlyFeeFile(file, selectedMonth) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const headerRowIndex = rows.findIndex((r) => r.some((c) => String(c).trim() === "일자") && r.some((c) => String(c).trim() === "수급자명"));
  if (headerRowIndex < 0) throw new Error("헤더 행을 찾지 못했습니다. '일자', '수급자명', '수가코드', '수가명'이 있는 파일인지 확인해주세요.");

  const headers = rows[headerRowIndex].map((v) => String(v).trim());
  const idx = makeHeaderIndex(headers);
  const items = [];

  rows.slice(headerRowIndex + 1).forEach((row) => {
    const dateText = normalizeDate(readCell(row, idx, ["일자"]));
    const month = normalizeMonth(selectedMonth || dateText);
    const recipientName = readCell(row, idx, ["수급자명"]);
    const longTermNumber = readCell(row, idx, ["수급자인정번호", "인정번호"]);
    const serviceCode = readCell(row, idx, ["수가코드"]);
    const serviceName = readCell(row, idx, ["수가명"]);

    if (!recipientName || !dateText) return;

    items.push({
      id: `${month}_${recipientName}_${longTermNumber}_${serviceCode}_${dateText}_${Math.random().toString(36).slice(2, 7)}`,
      month,
      recipientName,
      longTermNumber,
      certNumber: longTermNumber,
      birthDate: normalizeDate(readCell(row, idx, ["생년월일"])),
      careManagerName: readCell(row, idx, ["요양보호사명"]),
      careManagerBirthDate: "",
      careManagerCareNumber: readCell(row, idx, ["요양보호사번호"]),
      workerType: readCell(row, idx, ["종사자구분"]),
      familyCareYn: readCell(row, idx, ["가족여부"]),
      familyRelation: readCell(row, idx, ["가족관계"]),
      serviceType: readCell(row, idx, ["서비스구분"]),
      serviceCode,
      serviceName,
      unitPrice: toNumber(readCell(row, idx, ["수가", "단가"])),
      serviceDates: [dateText],
      serviceDays: 1,
      totalAmount: toNumber(readCell(row, idx, ["수가", "금액", "총액"])),
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      rows: Object.fromEntries(headers.map((h, i) => [h || `col${i + 1}`, row[i] || ""]))
    });
  });

  return mergeDailyRows(items);
}

function makeHeaderIndex(headers) {
  const idx = {};
  headers.forEach((h, i) => { if (h && idx[h] === undefined) idx[h] = i; });
  return idx;
}

function readCell(row, idx, names) {
  for (const name of names) {
    if (idx[name] !== undefined) return String(row[idx[name]] || "").trim();
  }
  return "";
}

function mergeDailyRows(items) {
  const map = new Map();
  items.forEach((item) => {
    const key = [item.month, item.recipientName.replace(/\s/g, ""), item.longTermNumber.replace(/\s/g, ""), item.serviceCode.replace(/\s/g, "")].join("|");
    if (!map.has(key)) {
      map.set(key, { ...item, serviceDates: [...item.serviceDates], serviceDays: 1, totalAmount: item.totalAmount || item.unitPrice || 0, rows: [item.rows] });
      return;
    }
    const old = map.get(key);
    item.serviceDates.forEach((d) => { if (d && !old.serviceDates.includes(d)) old.serviceDates.push(d); });
    old.serviceDays = old.serviceDates.length;
    old.totalAmount += item.totalAmount || item.unitPrice || 0;
    old.rows.push(item.rows);
  });
  return Array.from(map.values()).map((item) => ({ ...item, serviceDates: item.serviceDates.sort() }));
}

async function uploadMonthlyFee() {
  try {
    if (!state.rows.length) throw new Error("저장할 자료가 없습니다. 파일을 다시 선택해주세요.");
    $("uploadBtn").disabled = true;
    showNotice("구글시트에 저장 중입니다...");
    const result = await requestApi({
      action: "addMonthlyFee",
      month: $("monthInput").value,
      replaceMonth: $("replaceMonth").checked,
      fileName: state.file ? state.file.name : "",
      uploadedAt: new Date().toISOString(),
      uploadedBy: localStorage.getItem("loginUser") || "사회복지사",
      items: state.rows
    });
    showNotice(`저장 완료: ${Number(result.count || 0).toLocaleString()}건 저장, ${Number(result.skippedCount || 0).toLocaleString()}건 제외`, "success");
    await loadMonthlyFee();
  } catch (err) {
    showNotice(err.message || "저장 중 오류가 발생했습니다.", "error");
  } finally {
    $("uploadBtn").disabled = !state.file;
  }
}

async function loadMonthlyFee() {
  try {
    showNotice("저장된 자료를 불러오는 중입니다...");
    const month = $("monthInput").value;
    const rows = await requestApi({ action: "listMonthlyFee", month });
    state.savedRows = Array.isArray(rows) ? rows : [];
    renderSummary();
    renderTable();
    showNotice("자료를 불러왔습니다.", "success");
  } catch (err) {
    state.savedRows = [];
    renderSummary();
    renderTable();
    showNotice(err.message || "자료를 불러오지 못했습니다.", "error");
  }
}

async function deleteMonth() {
  const month = $("monthInput").value;
  if (!month) return showNotice("삭제할 월을 선택해주세요.", "error");
  if (!confirm(`${month} 수가 자료를 구글시트에서 삭제할까요?`)) return;
  try {
    await requestApi({ action: "deleteMonthlyFee", month });
    showNotice(`${month} 자료를 삭제했습니다.`, "success");
    await loadMonthlyFee();
  } catch (err) {
    showNotice(err.message || "삭제하지 못했습니다.", "error");
  }
}

function renderSummary() {
  const rows = state.savedRows;
  const recipients = new Set(rows.map((r) => `${r.recipientName}|${r.longTermNumber || r.certNumber}`));
  const amount = rows.reduce((sum, r) => sum + toNumber(r.totalAmount), 0);
  $("summaryMonth").textContent = $("monthInput").value || "전체";
  $("summaryRecipients").textContent = `${recipients.size.toLocaleString()}명`;
  $("summaryRows").textContent = `${rows.length.toLocaleString()}건`;
  $("summaryAmount").textContent = `${amount.toLocaleString()}원`;
  $("statusText").textContent = `${rows.length.toLocaleString()}건 표시 중`;
}

function renderTable() {
  const q = ($("searchInput").value || "").replace(/\s/g, "").toLowerCase();
  const body = $("tableBody");
  const rows = state.savedRows.filter((r) => !q || JSON.stringify(r).replace(/\s/g, "").toLowerCase().includes(q));
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="10" class="empty">저장된 자료가 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = rows.map((r) => `
    <tr>
      <td><span class="pill">${escapeHtml(r.month)}</span></td>
      <td>${escapeHtml(r.recipientName)}</td>
      <td>${escapeHtml(r.longTermNumber || r.certNumber)}</td>
      <td>${escapeHtml(r.birthDate)}</td>
      <td>${escapeHtml(r.serviceType)}</td>
      <td>${escapeHtml(r.serviceCode)}</td>
      <td>${escapeHtml(r.serviceName)}</td>
      <td>${toNumber(r.unitPrice).toLocaleString()}</td>
      <td>${toNumber(r.serviceDays).toLocaleString()}</td>
      <td>${toNumber(r.totalAmount).toLocaleString()}</td>
    </tr>`).join("");
}

function normalizeMonth(value) {
  const text = String(value || "").trim().replace(/[./]/g, "-");
  const m = text.match(/(\d{4})-(\d{1,2})/);
  return m ? `${m[1]}-${String(m[2]).padStart(2, "0")}` : text;
}

function normalizeDate(value) {
  const text = String(value || "").trim().replace(/^'/, "");
  if (!text) return "";
  const iso = text.match(/(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  return text.split("T")[0];
}

function toNumber(value) {
  const n = Number(String(value || "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
}
