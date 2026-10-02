(() => {
  const $ = (id) => document.getElementById(id);

  const checkMonth = $("checkMonth");
  const recordFile = $("recordFile");
  const checkBtn = $("checkBtn");
  const resetBtn = $("resetBtn");
  const progressArea = $("progressArea");
  const progressText = $("progressText");
  const progressFill = $("progressFill");
  const errorText = $("errorText");
  const personList = $("personList");
  const searchInput = $("searchInput");
  const detailEmpty = $("detailEmpty");
  const detailBody = $("detailBody");
  const detailName = $("detailName");
  const detailMeta = $("detailMeta");
  const detailBadge = $("detailBadge");
  const detailHead = $("detailHead");
  const detailRows = $("detailRows");
  const issueList = $("issueList");
  const downloadBtn = $("downloadBtn");

  const statIds = {
    person: $("personCount"), error: $("errorCount"), warn: $("warnCount"),
    meal: $("mealCount"), bath: $("bathCount"), toilet: $("toiletCount"), nursing: $("nursingCount"), medicine: $("medicineCount"), list: $("listBadge")
  };

  let people = [];
  let selectedIndex = -1;
  let currentTab = "all";

  const LABELS = {
    meal: "식사", bath: "목욕", toilet: "화장실", nursing: "간호", medicine: "투약", cognitive: "인지", pt: "물리"
  };

  function normalize(v) {
    return String(v ?? "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  }
  function compact(v) {
    return normalize(v).replace(/\s/g, "");
  }
  function onlyName(v) {
    return normalize(v).replace(/[^가-힣a-zA-Z0-9]/g, "");
  }
  function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  }
  function setProgress(done, total, label = "검사 중") {
    progressArea.style.display = "block";
    const pct = total ? Math.round((done / total) * 100) : 0;
    progressText.textContent = `${label} ${done} / ${total}`;
    progressFill.style.width = `${pct}%`;
  }
  function showError(msg) {
    errorText.textContent = msg;
    errorText.style.display = "block";
  }
  function clearError() {
    errorText.textContent = "";
    errorText.style.display = "none";
  }
  function getCell(rows, r, c) {
    if (r < 0 || c < 0 || !rows[r]) return "";
    return normalize(rows[r][c]);
  }
  function rowText(rows, r) {
    return compact((rows[r] || []).join(" "));
  }

  function defaultMonth() {
    const d = new Date();
    checkMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function sheetToRowsWithMerges(sheet) {
    if (!sheet || !sheet["!ref"]) return [];
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const rows = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        row[c - range.s.c] = cell ? (cell.w ?? cell.v ?? "") : "";
      }
      rows.push(row);
    }
    (sheet["!merges"] || []).forEach((merge) => {
      const startCell = sheet[XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c })];
      const value = startCell ? (startCell.w ?? startCell.v ?? "") : "";
      for (let r = merge.s.r; r <= merge.e.r; r++) {
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          const rr = r - range.s.r;
          const cc = c - range.s.c;
          if (!rows[rr]) rows[rr] = [];
          rows[rr][cc] = value;
        }
      }
    });
    return rows;
  }

  function findRecipientName(rows, sheetName) {
    for (let r = 0; r < Math.min(rows.length, 12); r++) {
      for (let c = 0; c < (rows[r] || []).length; c++) {
        if (compact(rows[r][c]).includes("수급자명")) {
          for (let k = c + 1; k <= c + 5; k++) {
            const candidate = normalize(rows[r][k]);
            if (/^[가-힣]{2,5}/.test(candidate)) return candidate.replace(/\s.*/, "");
          }
        }
      }
    }
    const fromSheet = normalize(sheetName).match(/[가-힣]{2,5}/);
    return fromSheet ? fromSheet[0] : sheetName;
  }

  function findDateColumns(rows, monthValue) {
    const result = [];
    const seen = new Set();
    const [year, month] = (monthValue || "").split("-").map(Number);
    for (let r = 0; r < Math.min(rows.length, 18); r++) {
      for (let c = 0; c < (rows[r] || []).length; c++) {
        const text = normalize(rows[r][c]);
        let m = text.match(/(\d{1,2})\s*[./]\s*(\d{1,2})/);
        if (!m) m = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
        if (!m) continue;
        const mm = Number(m[1]);
        const dd = Number(m[2]);
        if (month && mm !== month) continue;
        const date = `${year || new Date().getFullYear()}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        const key = `${date}_${c}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ row: r, col: c, date, label: `${String(mm).padStart(2, "0")}/${String(dd).padStart(2, "0")}` });
      }
    }
    return result.sort((a, b) => a.col - b.col);
  }

  function findRow(rows, keywords, start = 0) {
    for (let r = start; r < rows.length; r++) {
      const text = rowText(rows, r);
      if (keywords.every(k => text.includes(compact(k)))) return r;
    }
    return -1;
  }
  function findAnyRow(rows, keywords, start = 0) {
    for (let r = start; r < rows.length; r++) {
      const text = rowText(rows, r);
      if (keywords.some(k => text.includes(compact(k)))) return r;
    }
    return -1;
  }
  function getNearValue(rows, r, c, wide = 2) {
    if (r < 0) return "";
    const offsets = [0, 1, 2, -1, -2, 3, -3].filter(o => Math.abs(o) <= wide || o === 0);
    for (const o of offsets) {
      const v = getCell(rows, r, c + o);
      if (v) return v;
    }
    return "";
  }

  function makeIssue(date, type, level, title, desc, value = "") {
    return { date, type, level, title, desc, value };
  }
  function isChecked(v) {
    const t = compact(v);
    return t === "■" || t === "☑" || t === "✓" || t === "√" || t === "O" || t === "○" || t.includes("완료") || t.includes("제공");
  }
  function parseCount(v) {
    const t = compact(v);
    if (!t) return 0;
    if (isChecked(t)) return 1;
    const nums = [...t.matchAll(/\d+/g)].map(m => Number(m[0]));
    return nums.reduce((a, b) => a + b, 0);
  }
  function mealStatus(v) {
    const t = compact(v);
    if (!t) return { exists: false, ok: false, label: "" };
    if (t.includes("일정없음") || t.includes("미이용")) return { exists: false, ok: true, label: "-" };
    const exists = /(일반식|죽식|다진식|경관식|미음|밥|식)/.test(t);
    return { exists, ok: !exists || t.includes("정량"), label: normalize(v) };
  }
  function hasTime(v) {
    return /\d+\s*분/.test(compact(v));
  }
  function hasNursingVitals(v) {
    const t = compact(v);
    return /\d{2,3}\s*[-/]\s*\d{2,3}/.test(t) || /\d{2,3}\s*／\s*\d{2,3}/.test(t);
  }

  function analyzeSheet(workbook, sheetName, monthValue) {
    const sheet = workbook.Sheets[sheetName];
    const rows = sheetToRowsWithMerges(sheet);
    const name = findRecipientName(rows, sheetName);
    const dateColumns = findDateColumns(rows, monthValue);

    const serviceTimeRow = findAnyRow(rows, ["총시간", "시간"], 0);
    const lunchRow = findRow(rows, ["점심"]);
    const dinnerRow = findRow(rows, ["저녁"]);
    const bathTimeRow = findRow(rows, ["목욕", "소요시간"]);
    const bathMethodRow = bathTimeRow >= 0 ? bathTimeRow + 1 : findRow(rows, ["목욕", "방법"]);
    const toiletRow = findAnyRow(rows, ["화장실이용하기", "대변", "소변"], 0);
    const cognitiveRow = findAnyRow(rows, ["인지관리지원", "인지활동", "인지자극"], 0);
    const nursingRow = findAnyRow(rows, ["혈압", "건강관리"], 0);
    const medicineRow = findAnyRow(rows, ["투약관리", "복약", "약복용"], 0);
    const ptRow = findAnyRow(rows, ["물리치료", "기능회복", "신체기능"], 0);
    const noteRows = [];
    for (let r = 0; r < rows.length; r++) if (rowText(rows, r).includes("특이사항")) noteRows.push(r);

    const days = dateColumns.map(({ date, label, col }) => {
      const day = { date, label, values: {}, issues: [] };
      const serviceTime = getNearValue(rows, serviceTimeRow, col, 1);
      const lunch = mealStatus(getNearValue(rows, lunchRow, col, 1));
      const dinner = mealStatus(getNearValue(rows, dinnerRow, col, 1));
      const bathTime = getNearValue(rows, bathTimeRow, col, 1);
      const bathMethod = getNearValue(rows, bathMethodRow, col, 1);
      const toiletText = getNearValue(rows, toiletRow, col, 1);
      const nursing = getNearValue(rows, nursingRow, col, 1);
      const medicine = getNearValue(rows, medicineRow, col, 1);
      const cognitive = getNearValue(rows, cognitiveRow, col, 1);
      const pt = getNearValue(rows, ptRow, col, 1);
      const notes = noteRows.map(r => getNearValue(rows, r, col, 1)).filter(Boolean).join(" / ");

      day.values = { serviceTime, lunch: lunch.label, dinner: dinner.label, bathTime, bathMethod, toiletText, nursing, medicine, cognitive, pt, notes };

      if (lunch.exists && !lunch.ok) day.issues.push(makeIssue(date, "meal", "error", "점심 식사량 확인", "점심 식사 내용에 ‘정량’이 포함되어 있지 않습니다.", lunch.label));
      if (dinner.exists && !dinner.ok) day.issues.push(makeIssue(date, "meal", "error", "저녁 식사량 확인", "저녁 식사 내용에 ‘정량’이 포함되어 있지 않습니다.", dinner.label));

      if (hasTime(bathTime) || compact(bathMethod).includes("목욕") || compact(bathMethod).includes("샤워")) {
        if (!compact(bathMethod)) day.issues.push(makeIssue(date, "bath", "error", "목욕 방법 누락", "목욕 시간이 있으나 목욕 방법이 비어 있습니다.", bathTime));
        else if (compact(bathMethod) !== "목욕의자(샤워식)") day.issues.push(makeIssue(date, "bath", "warning", "목욕 방법 확인", "기준값 ‘목욕의자(샤워식)’과 다릅니다.", bathMethod));
      }

      const toiletCount = parseCount(toiletText);
      if (toiletText && toiletCount > 0 && toiletCount < 5) day.issues.push(makeIssue(date, "toilet", "error", "화장실 횟수 부족", "화장실/대소변 기록 합계가 5회 미만으로 보입니다.", toiletText));
      if (compact(toiletText).includes("기저귀")) day.issues.push(makeIssue(date, "toilet", "warning", "기저귀 기록 확인", "기저귀 교환 도움 대상자인지 계획서 기준 확인이 필요합니다.", toiletText));

      if (nursingRow >= 0 && serviceTime && !hasNursingVitals(nursing)) day.issues.push(makeIssue(date, "nursing", "error", "간호 활력징후 확인", "출석/이용 시간이 있으나 혈압 기록을 찾지 못했습니다.", nursing));
      if (medicine && !isChecked(medicine) && !/투약|복약|약/.test(compact(medicine))) day.issues.push(makeIssue(date, "medicine", "warning", "투약 기록 확인", "투약관리 칸의 값 확인이 필요합니다.", medicine));
      if (cognitiveRow >= 0 && serviceTime && !cognitive) day.issues.push(makeIssue(date, "cognitive", "warning", "인지활동 확인", "인지활동 기록이 비어 있습니다. 대상 등급 여부 확인이 필요합니다.", ""));
      if (ptRow >= 0 && serviceTime && !pt) day.issues.push(makeIssue(date, "pt", "warning", "물리치료 확인", "물리치료/기능회복 기록이 비어 있습니다. 대상 여부 확인이 필요합니다.", ""));

      return day;
    });

    const issues = days.flatMap(d => d.issues);
    return { sheetName, name, dateCount: dateColumns.length, days, issues, rowsFound: { lunchRow, dinnerRow, bathTimeRow, toiletRow, nursingRow, medicineRow, cognitiveRow, ptRow } };
  }

  function statusFor(person, type) {
    const list = person.issues.filter(i => i.type === type);
    if (list.some(i => i.level === "error")) return "err";
    if (list.some(i => i.level === "warning")) return "warn";
    return "ok";
  }
  function overallStatus(person) {
    if (person.issues.some(i => i.level === "error")) return "err";
    if (person.issues.some(i => i.level === "warning")) return "warn";
    return "ok";
  }
  function statusText(cls) {
    return cls === "err" ? "오류" : cls === "warn" ? "주의" : "정상";
  }

  function updateStats() {
    const allIssues = people.flatMap(p => p.issues);
    const errors = allIssues.filter(i => i.level === "error");
    const warns = allIssues.filter(i => i.level === "warning");
    statIds.person.textContent = people.length;
    statIds.list.textContent = `${people.length}명`;
    statIds.error.textContent = errors.length;
    statIds.warn.textContent = warns.length;
    ["meal", "bath", "toilet", "nursing", "medicine"].forEach(type => {
      statIds[type].textContent = allIssues.filter(i => i.type === type).length;
    });
  }

  function renderPersonList() {
    const keyword = onlyName(searchInput.value);
    const filtered = people
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => !keyword || onlyName(p.name).includes(keyword));
    if (!filtered.length) {
      personList.innerHTML = `<div class="detail-empty">표시할 어르신이 없습니다.</div>`;
      return;
    }
    personList.innerHTML = filtered.map(({ p, index }) => {
      const overall = overallStatus(p);
      return `<button class="person-item ${index === selectedIndex ? "active" : ""}" data-index="${index}">
        <div class="person-top"><div class="person-name">${escapeHtml(p.name)}</div><span class="badge ${overall}">${statusText(overall)}</span></div>
        <div class="person-meta">${escapeHtml(p.sheetName)} · ${p.dateCount}일 · 오류 ${p.issues.filter(i => i.level === "error").length} / 주의 ${p.issues.filter(i => i.level === "warning").length}</div>
        <div class="status-row">
          ${Object.entries(LABELS).map(([type, label]) => `<span class="status-chip ${statusFor(p, type)}">${label}</span>`).join("")}
        </div>
      </button>`;
    }).join("");
    personList.querySelectorAll(".person-item").forEach(btn => btn.addEventListener("click", () => selectPerson(Number(btn.dataset.index))));
  }

  function cellClass(day, type) {
    const list = day.issues.filter(i => i.type === type);
    if (list.some(i => i.level === "error")) return "cell-error";
    if (list.some(i => i.level === "warning")) return "cell-warn";
    return "cell-ok";
  }
  function cellText(day, type) {
    const list = day.issues.filter(i => i.type === type);
    if (list.length) return list.map(i => i.title).join(" / ");
    if (type === "meal") return [day.values.lunch, day.values.dinner].filter(Boolean).join(" / ") || "정상";
    if (type === "bath") return [day.values.bathTime, day.values.bathMethod].filter(Boolean).join(" / ") || "-";
    if (type === "toilet") return day.values.toiletText || "정상";
    if (type === "nursing") return day.values.nursing || "정상";
    if (type === "medicine") return day.values.medicine || "-";
    if (type === "cognitive") return day.values.cognitive || "-";
    if (type === "pt") return day.values.pt || "-";
    return "";
  }

  function renderDetail() {
    const person = people[selectedIndex];
    if (!person) {
      detailEmpty.style.display = "block";
      detailBody.style.display = "none";
      downloadBtn.disabled = true;
      return;
    }
    detailEmpty.style.display = "none";
    detailBody.style.display = "block";
    downloadBtn.disabled = false;
    const overall = overallStatus(person);
    detailName.textContent = person.name;
    detailMeta.textContent = `${person.sheetName} · ${person.dateCount}일 검사`;
    detailBadge.className = `badge ${overall}`;
    detailBadge.textContent = statusText(overall);

    const types = currentTab === "all" ? Object.keys(LABELS) : [currentTab];
    detailHead.innerHTML = `<tr><th>일자</th>${types.map(t => `<th>${LABELS[t]}</th>`).join("")}<th>특이사항</th></tr>`;
    detailRows.innerHTML = person.days.map(day => `<tr>
      <td>${escapeHtml(day.label)}</td>
      ${types.map(type => `<td class="${cellClass(day, type)}">${escapeHtml(cellText(day, type))}</td>`).join("")}
      <td class="cell-note ${day.values.notes ? "cell-warn" : "cell-empty"}" title="${escapeHtml(day.values.notes)}">${escapeHtml(day.values.notes || "-")}</td>
    </tr>`).join("");

    const visibleIssues = person.issues.filter(i => currentTab === "all" || i.type === currentTab);
    issueList.innerHTML = visibleIssues.length
      ? visibleIssues.map(i => `<div class="issue-card ${i.level === "warning" ? "warn" : ""}">
          <div class="issue-title">${escapeHtml(i.date)} · ${escapeHtml(LABELS[i.type])} · ${escapeHtml(i.title)}</div>
          <div class="issue-desc">${escapeHtml(i.desc)}${i.value ? `<br>현재값: ${escapeHtml(i.value)}` : ""}</div>
        </div>`).join("")
      : `<div class="issue-card warn"><div class="issue-title">표시할 오류가 없습니다.</div><div class="issue-desc">현재 선택한 범위에서는 특이 오류가 없습니다.</div></div>`;
  }

  function selectPerson(index) {
    selectedIndex = index;
    renderPersonList();
    renderDetail();
  }

  async function runCheck() {
    clearError();
    const file = recordFile.files && recordFile.files[0];
    if (!checkMonth.value) return showError("검사 월을 선택해주세요.");
    if (!file) return showError("제공기록지 엑셀 파일을 선택해주세요.");
    if (typeof XLSX === "undefined") return showError("엑셀 처리 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.");

    checkBtn.disabled = true;
    resetBtn.disabled = true;
    people = [];
    selectedIndex = -1;
    renderPersonList();
    renderDetail();

    try {
      setProgress(0, 1, "파일 읽는 중");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false, cellText: true });
      const sheetNames = workbook.SheetNames.filter(name => !/^(_|숨김|메타|안내)/.test(name));
      const parsed = [];
      for (let i = 0; i < sheetNames.length; i++) {
        setProgress(i + 1, sheetNames.length, "시트 검사 중");
        const result = analyzeSheet(workbook, sheetNames[i], checkMonth.value);
        if (result.dateCount > 0) parsed.push(result);
        await new Promise(r => setTimeout(r, 0));
      }
      people = parsed.sort((a, b) => a.name.localeCompare(b.name, "ko"));
      updateStats();
      renderPersonList();
      if (people.length) selectPerson(0);
      else showError("선택한 월의 날짜 칸을 찾지 못했습니다. 제공기록지 양식 또는 검사 월을 확인해주세요.");
      setProgress(sheetNames.length, sheetNames.length, "검사 완료");
    } catch (err) {
      console.error(err);
      showError(`검사 중 오류가 발생했습니다: ${err.message || err}`);
    } finally {
      checkBtn.disabled = false;
      resetBtn.disabled = false;
    }
  }

  function resetAll() {
    people = [];
    selectedIndex = -1;
    currentTab = "all";
    recordFile.value = "";
    clearError();
    progressArea.style.display = "none";
    progressFill.style.width = "0%";
    updateStats();
    renderPersonList();
    renderDetail();
  }

  function downloadCsv() {
    const rows = [["성명", "시트명", "일자", "구분", "수준", "제목", "내용", "현재값"]];
    people.forEach(p => p.issues.forEach(i => rows.push([p.name, p.sheetName, i.date, LABELS[i.type] || i.type, i.level, i.title, i.desc, i.value || ""])));
    const csv = rows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `제공기록지_통합검증_${checkMonth.value || "결과"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  checkBtn.addEventListener("click", runCheck);
  resetBtn.addEventListener("click", resetAll);
  searchInput.addEventListener("input", renderPersonList);
  downloadBtn.addEventListener("click", downloadCsv);
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      renderDetail();
    });
  });

  defaultMonth();
  resetAll();
})();
