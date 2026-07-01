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
  const categoryList = $("categoryList");
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
  let selectedCategory = "all";
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

  function issuesForType(type) {
    const all = [];
    people.forEach(p => {
      p.days.forEach(day => {
        const issues = day.issues.filter(i => type === "all" || i.type === type);
        const hasIssue = issues.length > 0;
        if (type === "all") {
          if (hasIssue) issues.forEach(i => all.push({ person: p, day, issue: i }));
        } else {
          all.push({ person: p, day, issue: issues[0] || null });
        }
      });
    });
    return all;
  }

  function categoryStatus(type) {
    const list = people.flatMap(p => p.issues).filter(i => type === "all" || i.type === type);
    if (list.some(i => i.level === "error")) return "err";
    if (list.some(i => i.level === "warning")) return "warn";
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
    statIds.list.textContent = `${Object.keys(LABELS).length + 1}개`;
    statIds.error.textContent = errors.length;
    statIds.warn.textContent = warns.length;
    ["meal", "bath", "toilet", "nursing", "medicine"].forEach(type => {
      statIds[type].textContent = allIssues.filter(i => i.type === type).length;
    });
  }

  function renderCategoryList() {
    const cats = [["all", "전체 오류"], ...Object.entries(LABELS)];
    categoryList.innerHTML = cats.map(([type, label]) => {
      const status = categoryStatus(type);
      const issueCount = people.flatMap(p => p.issues).filter(i => type === "all" || i.type === type).length;
      const targetCount = type === "all" ? people.length : issuesForType(type).length;
      return `<button class="category-item ${selectedCategory === type ? "active" : ""}" data-type="${type}">
        <div class="category-top"><div class="category-name">${escapeHtml(label)}</div><span class="badge ${status}">${statusText(status)}</span></div>
        <div class="category-meta">대상 ${targetCount}건 · 오류/주의 ${issueCount}건</div>
      </button>`;
    }).join("");
    categoryList.querySelectorAll(".category-item").forEach(btn => btn.addEventListener("click", () => selectCategory(btn.dataset.type)));
  }

  function dayValueForType(day, type) {
    if (type === "meal") return [day.values.lunch, day.values.dinner].filter(Boolean).join(" / ") || "-";
    if (type === "bath") return [day.values.bathTime, day.values.bathMethod].filter(Boolean).join(" / ") || "-";
    if (type === "toilet") return day.values.toiletText || "-";
    if (type === "nursing") return day.values.nursing || "-";
    if (type === "medicine") return day.values.medicine || "-";
    if (type === "cognitive") return day.values.cognitive || "-";
    if (type === "pt") return day.values.pt || "-";
    return "-";
  }

  function renderDetail() {
    if (!people.length) {
      detailEmpty.style.display = "block";
      detailBody.style.display = "none";
      downloadBtn.disabled = true;
      return;
    }
    detailEmpty.style.display = "none";
    detailBody.style.display = "block";
    downloadBtn.disabled = false;

    const label = selectedCategory === "all" ? "전체 오류" : LABELS[selectedCategory];
    const allCategoryIssues = people.flatMap(p => p.issues).filter(i => selectedCategory === "all" || i.type === selectedCategory);
    const status = categoryStatus(selectedCategory);
    detailName.textContent = label;
    detailMeta.textContent = `${people.length}명 검사 · 오류/주의 ${allCategoryIssues.length}건`;
    detailBadge.className = `badge ${status}`;
    detailBadge.textContent = statusText(status);

    let rows = [];
    if (selectedCategory === "all") {
      people.forEach(p => p.issues.forEach(i => rows.push({ person: p, date: i.date, type: i.type, level: i.level, title: i.title, desc: i.desc, value: i.value || "" })));
    } else {
      people.forEach(p => p.days.forEach(day => {
        const issue = day.issues.find(i => i.type === selectedCategory);
        rows.push({ person: p, date: day.label, fullDate: day.date, type: selectedCategory, level: issue ? issue.level : "ok", title: issue ? issue.title : "정상", desc: issue ? issue.desc : "", value: issue ? (issue.value || dayValueForType(day, selectedCategory)) : dayValueForType(day, selectedCategory), notes: day.values.notes || "" });
      }));
    }

    if (currentTab !== "all") rows = rows.filter(r => r.level === currentTab);
    rows.sort((a, b) => (LABELS[a.type] || "").localeCompare(LABELS[b.type] || "", "ko") || a.person.name.localeCompare(b.person.name, "ko") || String(a.fullDate || a.date).localeCompare(String(b.fullDate || b.date)));

    detailHead.innerHTML = `<tr><th>구분</th><th>성명</th><th>일자</th><th>판정</th><th>내용/현재값</th><th>특이사항</th><th>사유</th></tr>`;
    detailRows.innerHTML = rows.length ? rows.map(r => {
      const cls = r.level === "error" ? "cell-error" : r.level === "warning" ? "cell-warn" : "cell-ok";
      const 판정 = r.level === "error" ? "오류" : r.level === "warning" ? "주의" : "정상";
      return `<tr>
        <td>${escapeHtml(LABELS[r.type] || r.type)}</td>
        <td>${escapeHtml(r.person.name)}</td>
        <td>${escapeHtml(r.date)}</td>
        <td class="${cls}">${판정}</td>
        <td class="${cls}">${escapeHtml(r.title)}${r.value ? ` / ${escapeHtml(r.value)}` : ""}</td>
        <td class="cell-note ${r.notes ? "cell-warn" : "cell-empty"}" title="${escapeHtml(r.notes || "")}">${escapeHtml(r.notes || "-")}</td>
        <td>${escapeHtml(r.desc || "-")}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="7" class="cell-empty">표시할 결과가 없습니다.</td></tr>`;

    const issueRows = rows.filter(r => r.level === "error" || r.level === "warning");
    issueList.innerHTML = issueRows.length
      ? issueRows.slice(0, 80).map(r => `<div class="issue-card ${r.level === "warning" ? "warn" : ""}">
          <div class="issue-title">${escapeHtml(LABELS[r.type] || r.type)} · ${escapeHtml(r.person.name)} · ${escapeHtml(r.date)} · ${escapeHtml(r.title)}</div>
          <div class="issue-desc">${escapeHtml(r.desc || "")}${r.value ? `<br>현재값: ${escapeHtml(r.value)}` : ""}</div>
        </div>`).join("")
      : `<div class="issue-card warn"><div class="issue-title">표시할 오류가 없습니다.</div><div class="issue-desc">현재 선택한 구분에서는 특이 오류가 없습니다.</div></div>`;
  }

  function selectCategory(type) {
    selectedCategory = type;
    renderCategoryList();
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
    selectedCategory = selectedCategory || "all";
    renderCategoryList();
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
      renderCategoryList();
      if (people.length) selectCategory("all");
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
    selectedCategory = "all";
    currentTab = "all";
    recordFile.value = "";
    clearError();
    progressArea.style.display = "none";
    progressFill.style.width = "0%";
    updateStats();
    renderCategoryList();
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
