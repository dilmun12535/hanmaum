/* special-notes-check.js
   급여제공기록지 특이사항 검증 - 날짜 오인식/0건 표시 개선본

   변경사항
   - 검증월 삭제 → 업로드 기록 범위로 표시
   - 날짜 인식 엄격화: 시간(06:51), 방번호, 20분 등을 날짜로 오인식하지 않음
   - API가 0건이면 실패/0건을 구분 표시
   - 계획서 연결이 0건이어도 석식 공란을 무조건 누락 처리하지 않음
   - 토요일 식사 공란은 기본적으로 누락 처리하지 않음
*/

(() => {
  "use strict";

  const API_URL =
    "https://script.google.com/macros/s/AKfycbwJhnr6jFypaNIPzsaCUx8zk9Lc0SHN3AYPzhoT0uoMW_eTDPVlnrIzONA1gCD0_A5WDQ/exec";

  const state = {
    file: null,
    recordRows: [],
    requiredItems: [],
    results: [],
    typeFilter: "all",
    recordRangeText: "",
    libraries: {
      counsel: [],
      plan: [],
      attendance: [],
      fee: []
    }
  };

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");

  function getWeekday(dateKey) {
    if (!dateKey) return "";
    const d = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    return ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  }

  function isSaturday(dateKey) {
    return getWeekday(dateKey) === "토";
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = String(value ?? "");
  }

  function setStatus(id, text, mode) {
    const el = $(id);
    if (!el) return;

    el.textContent = text;
    el.classList.remove("status-ok-text", "status-warn-text", "status-error-text");

    if (mode === "ok") el.classList.add("status-ok-text");
    if (mode === "warn") el.classList.add("status-warn-text");
    if (mode === "error") el.classList.add("status-error-text");
  }

  function normalize(value) {
    return String(value ?? "")
      .replace(/\s+/g, "")
      .replace(/[(){}\[\],.·ㆍ:;'"‘’“”]/g, "")
      .trim();
  }

  function cleanName(value) {
    return String(value ?? "")
      .replace(/\s+/g, "")
      .replace(/어르신|수급자|님|氏/g, "")
      .trim();
  }

  function onlyDigits(value) {
    return String(value ?? "").replace(/\D/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[m]));
  }

  function toDateKey(value) {
    if (!value) return "";

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }

    const s = String(value).trim();

    let m = s.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

    m = s.match(/(20\d{2})(\d{2})(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    return "";
  }

  function timeToMin(value) {
    const m = String(value ?? "").match(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2] || 0);
  }

  function getTimeRange(value) {
    const s = String(value ?? "").trim();
    const matches = [...s.matchAll(/(\d{1,2})\s*[:시]\s*(\d{1,2})?/g)]
      .map((m) => `${pad(m[1])}:${pad(m[2] || 0)}`);

    if (matches.length >= 2) return { start: matches[0], end: matches[1] };
    if (matches.length === 1) return { start: "", end: matches[0] };
    return { start: "", end: "" };
  }

  function findYear(rows) {
    const joined = rows.slice(0, 10).flat().map(String).join(" ");
    const m = joined.match(/(20\d{2})/);
    return m ? Number(m[1]) : new Date().getFullYear();
  }

  function dateFromHeaderStrict(value, year) {
    const raw = String(value ?? "").trim();

    if (!raw) return "";

    if (raw.includes(":") || /시\s*\d{0,2}/.test(raw) || /분/.test(raw)) return "";

    let m = raw.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*(?:일)?\s*(?:\([월화수목금토일]\))?/);
    if (m) {
      const month = Number(m[2]);
      const day = Number(m[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${m[1]}-${pad(month)}-${pad(day)}`;
      }
      return "";
    }

    m = raw.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*(?:\([월화수목금토일]\))?$/);
    if (m) {
      const month = Number(m[1]);
      const day = Number(m[2]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${pad(month)}-${pad(day)}`;
      }
    }

    return "";
  }

  function findName(rows, sheetName, fileName) {
    for (let r = 0; r < Math.min(rows.length, 14); r += 1) {
      for (let c = 0; c < rows[r].length; c += 1) {
        const cell = normalize(rows[r][c]);

        if (cell.includes("수급자명") || cell === "성명" || cell === "이름") {
          for (let k = 1; k <= 4; k += 1) {
            const next = cleanName(rows[r][c + k]);
            if (next && /[가-힣]/.test(next) && !/생년월일|등급|인정번호|기관/.test(next)) {
              return next;
            }
          }
        }
      }
    }

    const fileMatch = String(fileName || "").match(/L?\d{8,12}\s*([가-힣]{2,5})/);
    if (fileMatch) return cleanName(fileMatch[1]);

    const sheetMatch = String(sheetName || "").match(/[가-힣]{2,5}/);
    return sheetMatch ? cleanName(sheetMatch[0]) : "이름 미확인";
  }

  function findLongTermNo(rows, fileName) {
    const fileNo = String(fileName || "").match(/L?\d{8,12}/);
    if (fileNo) return fileNo[0];

    for (let r = 0; r < Math.min(rows.length, 14); r += 1) {
      for (let c = 0; c < rows[r].length; c += 1) {
        const cell = normalize(rows[r][c]);

        if (cell.includes("장기요양인정번호") || cell.includes("인정번호")) {
          for (let k = 1; k <= 4; k += 1) {
            const next = String(rows[r][c + k] ?? "").trim();
            const m = next.match(/L?\d{8,12}/);
            if (m) return m[0];
          }
        }
      }
    }

    return "";
  }

  function findDateColumns(rows, year) {
    const found = [];
    const maxHeaderRows = Math.min(rows.length, 12);

    for (let r = 0; r < maxHeaderRows; r += 1) {
      let rowDateCount = 0;
      const temp = [];

      for (let c = 0; c < rows[r].length; c += 1) {
        const date = dateFromHeaderStrict(rows[r][c], year);
        if (date) {
          rowDateCount += 1;
          temp.push({ row: r, col: c, date });
        }
      }

      if (rowDateCount >= 2) {
        found.push(...temp);
      }
    }

    const seen = new Set();

    return found.filter((item) => {
      const key = `${item.col}-${item.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function rowLabel(row) {
    return normalize(row.slice(0, 10).join(" "));
  }

  function findRowsByLabel(rows, keywords) {
    const out = [];

    rows.forEach((row, idx) => {
      const label = rowLabel(row);
      if (keywords.some((k) => label.includes(normalize(k)))) {
        out.push(idx);
      }
    });

    return out;
  }

  function getCell(rows, r, c) {
    if (r == null || c == null || !rows[r]) return "";
    return String(rows[r][c] ?? "").trim();
  }

  function nearbyText(rows, rowIndexes, col) {
    const parts = [];

    rowIndexes.forEach((r) => {
      for (let c = Math.max(0, col - 1); c <= col + 1; c += 1) {
        const v = getCell(rows, r, c);
        if (v) parts.push(v);
      }
    });

    return parts.join("\n").trim();
  }

  function isMarked(value) {
    const raw = String(value ?? "");
    const s = normalize(raw);

    if (!s) return false;
    if (/거부|미실시|안드|못드|미제공|결식|불참|안함|안하|X/.test(s)) return false;

    return /■|●|○|O|V|✓|✔|1|실시|제공|완료|일반식|다진식|죽식|대변|소변|교환/.test(raw);
  }

  function isNegative(value) {
    const s = normalize(value);
    return /거부|미실시|안드|못드|미제공|결식|불참|안함|안하|X/.test(s);
  }

  function getArrayFromResponse(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== "object") return [];

    const candidates = [
      data.data,
      data.rows,
      data.items,
      data.list,
      data.result,
      data.results,
      data.plans,
      data.counsels,
      data.attendance,
      data.records
    ];

    for (const item of candidates) {
      if (Array.isArray(item)) return item;
    }

    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) return data[key];
    }

    return [];
  }

  async function fetchAction(action) {
    const url = `${API_URL}?action=${encodeURIComponent(action)}&_=${Date.now()}`;
    const res = await fetch(url, { method: "GET" });

    if (!res.ok) {
      throw new Error(`${action} HTTP ${res.status}`);
    }

    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error(`${action} JSON 파싱 실패`);
    }
  }

  async function fetchAny(actions) {
    let lastError = null;

    for (const action of actions) {
      try {
        const data = await fetchAction(action);
        const arr = getArrayFromResponse(data);
        if (arr.length > 0) return { action, data, rows: arr };
        lastError = new Error(`${action} 0건`);
      } catch (err) {
        lastError = err;
      }
    }

    return { action: "", data: null, rows: [], error: lastError };
  }

  function parseRowsJson(row) {
    const raw =
      row.rowsJson ??
      row.rowJson ??
      row.dataJson ??
      row.detailsJson ??
      row.json ??
      "";

    if (!raw) return [];
    if (Array.isArray(raw)) return raw;

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function normalizeLibraryRow(row) {
    const name =
      row.recipientName ??
      row.name ??
      row.수급자명 ??
      row.어르신 ??
      row.성명 ??
      "";

    const longTermNo =
      row.longTermNumber ??
      row.longTermNo ??
      row.careNumber ??
      row.장기요양번호 ??
      row.인정번호 ??
      row.longTermCareNumber ??
      "";

    const date =
      toDateKey(row.writtenDate) ||
      toDateKey(row.date) ||
      toDateKey(row.serviceDate) ||
      toDateKey(row.attendanceDate) ||
      toDateKey(row.changeDate) ||
      toDateKey(row.작성일자) ||
      toDateKey(row.일자) ||
      toDateKey(row.변경일);

    return {
      ...row,
      _name: cleanName(name),
      _longTermNo: String(longTermNo || "").trim(),
      _longTermDigits: onlyDigits(longTermNo),
      _date: date,
      _rows: parseRowsJson(row),
      _text: String(
        Object.values(row)
          .filter((v) => typeof v !== "object")
          .join(" ")
      )
    };
  }

  async function loadLibraries() {
    setStatus("counselLibraryStatus", "상담일지 보관함 불러오는 중...", "warn");
    setStatus("attendanceLibraryStatus", "출석관리 보관함 불러오는 중...", "warn");
    setStatus("feeLibraryStatus", "계획서/수가 보관함 불러오는 중...", "warn");

    const counsel = await fetchAny(["getCounselList", "getCounsels", "getCounsel", "listCounsel", "counselList"]);
    state.libraries.counsel = counsel.rows.map(normalizeLibraryRow);
    if (state.libraries.counsel.length) {
      setStatus("counselLibraryStatus", `상담일지 ${state.libraries.counsel.length}건 연결됨`, "ok");
    } else {
      setStatus("counselLibraryStatus", "상담일지 0건 또는 action 이름 확인 필요", "warn");
    }

    const attendance = await fetchAny(["getAttendanceList", "getAttendance", "listAttendance", "attendanceList"]);
    state.libraries.attendance = attendance.rows.map(normalizeLibraryRow);
    if (state.libraries.attendance.length) {
      setStatus("attendanceLibraryStatus", `출석관리 ${state.libraries.attendance.length}건 연결됨`, "ok");
    } else {
      setStatus("attendanceLibraryStatus", "출석관리 0건 또는 action 이름 확인 필요", "warn");
    }

    const plan = await fetchAny(["getPlanList", "getPlans", "getPlan", "listPlan", "planList"]);
    state.libraries.plan = plan.rows.map(normalizeLibraryRow);

    const fee = await fetchAny(["getMonthlyFeeList", "getMonthlyFee", "getFeeList", "monthlyFeeList"]);
    state.libraries.fee = fee.rows.map(normalizeLibraryRow);

    if (state.libraries.plan.length || state.libraries.fee.length) {
      setStatus("feeLibraryStatus", `계획서 ${state.libraries.plan.length}건 / 월별수가 ${state.libraries.fee.length}건 연결됨`, "ok");
    } else {
      setStatus("feeLibraryStatus", "계획서/월별수가 0건 또는 action 이름 확인 필요", "warn");
    }
  }

  function samePerson(a, b) {
    const nameA = cleanName(a.name || a._name);
    const nameB = cleanName(b.name || b._name);
    const noA = onlyDigits(a.longTermNo || a._longTermNo || a._longTermDigits);
    const noB = onlyDigits(b.longTermNo || b._longTermNo || b._longTermDigits);

    if (noA && noB && noA === noB) return true;
    if (nameA && nameB && nameA === nameB) return true;

    return false;
  }

  function latestBeforeOrOn(rows, recordDate, recordPerson) {
    const dateKey = recordDate || "9999-12-31";

    return rows
      .filter((row) => samePerson(recordPerson, row))
      .filter((row) => !row._date || row._date <= dateKey)
      .sort((a, b) => String(b._date || "").localeCompare(String(a._date || "")))[0] || null;
  }

  function relatedOnExactDate(rows, recordDate, recordPerson) {
    return rows.filter((row) => {
      if (!samePerson(recordPerson, row)) return false;
      if (!row._date) return false;
      return row._date === recordDate;
    });
  }

  function textOfLibraryRow(row) {
    if (!row) return "";

    const parts = [];
    if (row._text) parts.push(row._text);

    if (Array.isArray(row._rows)) {
      row._rows.forEach((r) => {
        if (Array.isArray(r)) parts.push(r.join(" "));
        else if (r && typeof r === "object") parts.push(Object.values(r).join(" "));
        else parts.push(String(r ?? ""));
      });
    }

    return parts.join(" ");
  }

  function getPlanMealCount(text) {
    const t = normalize(text);

    if (!t) return null;

    if (/식사3회|3회|아침점심저녁|조식중식석식/.test(t)) return 3;
    if (/식사2회|2회|점심저녁|중식석식|석식|저녁/.test(t)) return 2;
    if (/식사1회|1회|점심|중식|균형잡힌식단관리/.test(t)) return 1;

    return null;
  }

  function detectPlanBenefits(planRow, feeRow, counselRows) {
    const planText = textOfLibraryRow(planRow);
    const feeText = textOfLibraryRow(feeRow);
    const counselText = counselRows.map(textOfLibraryRow).join(" ");
    const allText = `${planText} ${feeText} ${counselText}`;
    const text = normalize(allText);

    const planExists = Boolean(planRow || feeRow);
    let mealCount = getPlanMealCount(`${planText} ${feeText}`);
    const counselMealCount = getPlanMealCount(counselText);

    if (counselMealCount !== null) mealCount = counselMealCount;

    let meal = mealCount !== null || /균형잡힌식단관리|식사도움|식사제공|영양관리/.test(text);
    let lunch = meal && (mealCount === null || mealCount >= 1);
    let dinner = meal && mealCount !== null && mealCount >= 2;

    if (/석식제외|저녁제외|석식미제공|저녁미제공|식사1회|1회만|점심만/.test(text)) dinner = false;
    if (/식사제외|식사중단|균형잡힌식단관리제외/.test(text)) {
      meal = false;
      lunch = false;
      dinner = false;
      mealCount = 0;
    }

    let bath = /몸씻기도움|목욕|목욕도움|전신입욕|부분목욕/.test(text);
    if (/목욕제외|몸씻기도움제외|목욕중단|목욕미제공/.test(text)) bath = false;

    let medication = /정확한복약도움|복약도움|투약|약도움/.test(text);
    if (/복약도움제외|투약제외|정확한복약도움제외|약도움제외/.test(text)) medication = false;

    return { planExists, meal, lunch, dinner, mealCount, bath, medication, text: allText };
  }

  function parseWorkbook(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("파일이 없습니다."));
        return;
      }

      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const wb = XLSX.read(data, { type: "array", cellDates: false });
          const parsed = [];

          wb.SheetNames.forEach((sheetName) => {
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: False, defval: "" });
          });
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // 위 raw: False 오타 방지용으로 parseWorkbook을 다시 정의합니다.
  function parseWorkbook(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const wb = XLSX.read(data, { type: "array", cellDates: false });
          const parsed = [];

          wb.SheetNames.forEach((sheetName) => {
            const ws = wb.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
            if (!rows.length) return;

            const year = findYear(rows);
            const name = findName(rows, sheetName, file.name);
            const longTermNo = findLongTermNo(rows, file.name);
            const dateCols = findDateColumns(rows, year);
            if (!dateCols.length) return;

            const timeRows = findRowsByLabel(rows, ["이용시간", "급여시간", "서비스시간", "시작시간", "종료시간"]);
            const lunchRows = findRowsByLabel(rows, ["점심", "중식"]);
            const dinnerRows = findRowsByLabel(rows, ["저녁", "석식"]);
            const breakfastRows = findRowsByLabel(rows, ["아침", "조식"]);
            const bathRows = findRowsByLabel(rows, ["목욕"]);
            const toiletRows = findRowsByLabel(rows, ["화장실", "배설", "대변", "소변"]);
            const medicationRows = findRowsByLabel(rows, ["투약", "복약"]);
            const noteRows = findRowsByLabel(rows, ["특이사항"]);

            dateCols.forEach(({ col, date }) => {
              const timeText = nearbyText(rows, timeRows, col);
              const range = getTimeRange(timeText);
              const breakfast = nearbyText(rows, breakfastRows, col);
              const lunch = nearbyText(rows, lunchRows, col);
              const dinner = nearbyText(rows, dinnerRows, col);
              const bath = nearbyText(rows, bathRows, col);
              const toilet = nearbyText(rows, toiletRows, col);
              const medication = nearbyText(rows, medicationRows, col);
              const note = nearbyText(rows, noteRows, col);

              const hasAnyData = [timeText, breakfast, lunch, dinner, bath, toilet, medication, note].some(Boolean);
              if (!hasAnyData) return;

              parsed.push({
                name,
                longTermNo,
                date,
                sheetName,
                timeText,
                startTime: range.start,
                endTime: range.end,
                breakfast,
                lunch,
                dinner,
                bath,
                toilet,
                medication,
                note
              });
            });
          });

          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function addRequired(list, row, type, code, requiredText, groupA, groupB, recommend, sourceText) {
    list.push({
      name: row.name,
      longTermNo: row.longTermNo,
      date: row.date,
      type,
      code,
      requiredText,
      uploaded: row.note || "",
      groupA,
      groupB,
      recommend,
      source: row.sheetName,
      sourceText: sourceText || ""
    });
  }

  function hasAnyAttendance(row) {
    return Boolean(row.timeText || row.breakfast || row.lunch || row.dinner || row.bath || row.toilet || row.medication || row.note);
  }

  function buildRequiredItems() {
    const list = [];

    state.recordRows.forEach((row) => {
      if (!hasAnyAttendance(row)) return;

      const person = { name: row.name, longTermNo: row.longTermNo };
      const counselToday = relatedOnExactDate(state.libraries.counsel, row.date, person);
      const latestPlan = latestBeforeOrOn(state.libraries.plan, row.date, person);
      const latestFee = latestBeforeOrOn(state.libraries.fee, row.date, person);
      const benefits = detectPlanBenefits(latestPlan, latestFee, counselToday);

      const saturday = isSaturday(row.date);
      const saturdayMealExplicit = /토요일식사|토요식사|토요일점심|토요일중식|토요일석식|토요일저녁|토요일제공|토요제공/.test(normalize(benefits.text));

      const counselTodayText = normalize(counselToday.map(textOfLibraryRow).join(" "));
      const bathN = normalize(row.bath);
      const medN = normalize(row.medication);
      const endMin = timeToMin(row.endTime);

      if (counselTodayText) {
        if (/목욕|몸씻기/.test(counselTodayText)) {
          addRequired(list, row, "상담일지", "counsel-bath-change", "상담일지 변경에 따른 목욕 관련 내용이 특이사항에 필요합니다.", ["목욕", "몸씻기"], ["오늘부터", "금일부터", "변경", "제공", "제외", "중단"], "상담일지 변경에 따라 금일부터 목욕 제공 내용이 변경되었음을 확인하였음.", textOfLibraryRow(counselToday[0]));
        }

        if (/다진식|죽식|일반식|식사|석식|저녁/.test(counselTodayText)) {
          addRequired(list, row, "상담일지", "counsel-meal-change", "상담일지 변경에 따른 식사 형태 또는 식사 횟수 변경 내용이 특이사항에 필요합니다.", ["식사", "다진", "죽식", "일반식", "석식", "저녁"], ["오늘부터", "금일부터", "변경", "제공", "제외", "중단"], "상담일지 변경에 따라 금일부터 식사 제공 내용이 변경되었음을 확인하였음.", textOfLibraryRow(counselToday[0]));
        }

        if (/복약|투약|약/.test(counselTodayText)) {
          addRequired(list, row, "상담일지", "counsel-medication-change", "상담일지 변경에 따른 복약도움 내용이 특이사항에 필요합니다.", ["복약", "투약", "약"], ["오늘부터", "금일부터", "변경", "제공", "제외", "중단"], "상담일지 변경에 따라 금일부터 복약도움 내용이 변경되었음을 확인하였음.", textOfLibraryRow(counselToday[0]));
        }
      }

      if (benefits.lunch && (!saturday || saturdayMealExplicit) && (!isMarked(row.lunch) || isNegative(row.lunch))) {
        addRequired(list, row, "식사", "lunch-missing", "점심 미실시 내용이 특이사항에 필요합니다.", ["점심", "중식"], ["안드", "미실시", "거부", "섭취안", "식사안", "드지않", "결식"], "점심을 제공하였으나 드시지 않으셨으며 상태를 관찰하였음.", `계획서/상담일지 기준 식사 ${benefits.mealCount || ""}회 대상`);
      }

      if (benefits.dinner && (!saturday || saturdayMealExplicit) && (!isMarked(row.dinner) || isNegative(row.dinner))) {
        addRequired(list, row, "식사", "dinner-missing", "석식 미실시 내용이 특이사항에 필요합니다.", ["석식", "저녁"], ["안드", "미실시", "거부", "섭취안", "식사안", "드지않", "결식"], "석식을 제공하였으나 드시지 않으셨으며 상태를 관찰하였음.", `계획서/상담일지 기준 식사 ${benefits.mealCount || ""}회 대상`);
      }

      let earlyBaseMin = 16 * 60 + 30;
      const latestAttendance = latestBeforeOrOn(state.libraries.attendance, row.date, person);

      if (latestAttendance) {
        const range = getTimeRange(textOfLibraryRow(latestAttendance));
        const libEnd = timeToMin(range.end);
        if (libEnd !== null) earlyBaseMin = libEnd - 30;
      }

      if (saturday && !latestAttendance) earlyBaseMin = 16 * 60;

      if (endMin !== null && endMin < earlyBaseMin) {
        addRequired(list, row, "조기하원", "early-leave", `${row.endTime} 조기 하원 내용이 특이사항에 필요합니다.`, ["조기", "일찍", "하원", "귀가"], ["하원", "귀가", "가심"], `${row.endTime}경 개인 사정으로 조기 하원하심.`, row.timeText);
      }

      if ((benefits.bath && (!isMarked(row.bath) || isNegative(row.bath))) || bathN.includes("거부") || bathN.includes("미실시")) {
        addRequired(list, row, "목욕", "bath-refusal", "목욕 거부 또는 미실시 내용이 특이사항에 필요합니다.", ["목욕"], ["거부", "못하", "미실시", "안하"], "목욕을 권유하였으나 거부하셔서 실시하지 못하였음.", benefits.bath ? "계획서/상담일지 기준 목욕 대상" : row.bath);
      }

      if ((benefits.medication && (!isMarked(row.medication) || isNegative(row.medication))) || medN.includes("거부") || medN.includes("미실시")) {
        addRequired(list, row, "투약", "medication-issue", "투약 미실시 또는 거부 내용이 특이사항에 필요합니다.", ["투약", "복약", "약"], ["거부", "미실시", "안드", "못드"], "복약 도움을 제공하려 하였으나 투약이 이루어지지 않아 상태를 관찰하였음.", benefits.medication ? "계획서/상담일지 기준 복약도움 대상" : row.medication);
      }
    });

    state.requiredItems = list;
  }

  function keywordOk(note, groupA, groupB) {
    const n = normalize(note);
    if (!n) return false;

    const aOk = !groupA.length || groupA.some((k) => n.includes(normalize(k)));
    const bOk = !groupB.length || groupB.some((k) => n.includes(normalize(k)));

    return aOk && bOk;
  }

  function compareResults() {
    state.results = state.requiredItems.map((item) => {
      const ok = keywordOk(item.uploaded, item.groupA, item.groupB);
      const status = ok ? "ok" : item.uploaded ? "warn" : "miss";

      return {
        ...item,
        status,
        reason: ok
          ? "필수 핵심 단어가 특이사항에서 확인되었습니다."
          : item.uploaded
            ? "특이사항은 있으나 필요한 핵심 내용이 부족하여 확인이 필요합니다."
            : "업로드된 특이사항이 비어 있거나 관련 내용이 확인되지 않습니다."
      };
    });
  }

  function badge(status) {
    if (status === "ok") return '<span class="badge badge-ok">정상</span>';
    if (status === "miss") return '<span class="badge badge-miss">누락</span>';
    return '<span class="badge badge-warn">확인필요</span>';
  }

  function getFilteredResults() {
    const statusFilter = $("statusFilter")?.value || "all";
    let rows = state.results.slice();

    if (state.typeFilter !== "all") rows = rows.filter((row) => row.type === state.typeFilter);
    if (statusFilter !== "all") rows = rows.filter((row) => row.status === statusFilter);

    return rows;
  }

  function render() {
    setText("totalCount", state.results.length);
    setText("okCount", state.results.filter((r) => r.status === "ok").length);
    setText("missCount", state.results.filter((r) => r.status === "miss").length);
    setText("warnCount", state.results.filter((r) => r.status === "warn").length);
    setText("uploadedCount", state.recordRows.filter((r) => r.note).length);

    const body = $("resultBody");
    if (!body) return;

    const rows = getFilteredResults();

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty">표시할 결과가 없습니다.</td></tr>';
      return;
    }

    body.innerHTML = rows.map((row, idx) => `
      <tr>
        <td>${badge(row.status)}</td>
        <td><b>${escapeHtml(row.name)}</b><div class="small">${escapeHtml(row.longTermNo || "")}</div></td>
        <td>${escapeHtml(row.date)}<div class="small">${getWeekday(row.date)}</div></td>
        <td>${escapeHtml(row.type)}</td>
        <td class="note-text">${escapeHtml(row.requiredText)}</td>
        <td class="note-text">${escapeHtml(row.uploaded || "없음")}</td>
        <td>${escapeHtml(row.reason)}${row.sourceText ? `<div class="small">근거: ${escapeHtml(String(row.sourceText).slice(0, 100))}</div>` : ""}</td>
        <td class="note-text">${escapeHtml(row.recommend)}<br /><button type="button" class="copy-btn" data-row="${idx}">문구 선택</button></td>
      </tr>
    `).join("");

    body.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = rows[Number(btn.dataset.row)];
        window.prompt("추천 문구를 복사하세요.", row.recommend);
      });
    });
  }

  function updateRecordRangeText() {
    const dates = [...new Set(state.recordRows.map((r) => r.date).filter(Boolean))].sort();

    if (!dates.length) {
      state.recordRangeText = "";
      setText("detectedMonthText", "업로드 파일 자동 인식");
      return;
    }

    const start = dates[0];
    const end = dates[dates.length - 1];
    state.recordRangeText = start === end ? start : `${start} ~ ${end}`;
    setText("detectedMonthText", `${state.recordRangeText} / ${dates.length}일 인식`);
  }

  async function handleFileChange() {
    const file = $("recordFile")?.files?.[0];

    state.file = file || null;
    state.recordRows = [];
    state.requiredItems = [];
    state.results = [];

    if (!file) {
      setStatus("recordFileStatus", "제공기록지 엑셀 파일 하나만 업로드하세요.", "");
      setText("detectedMonthText", "업로드 파일 자동 인식");
      render();
      return;
    }

    if (!window.XLSX) {
      alert("XLSX 라이브러리를 불러오지 못했습니다. 인터넷 연결 또는 script 태그를 확인해주세요.");
      return;
    }

    setStatus("recordFileStatus", "파일을 읽는 중입니다...", "warn");

    try {
      state.recordRows = await parseWorkbook(file);
      updateRecordRangeText();

      if (!state.recordRows.length) {
        setStatus("recordFileStatus", "파일은 업로드됐지만 날짜/수급자/특이사항 구조를 읽지 못했습니다.", "warn");
      } else {
        setStatus("recordFileStatus", `${file.name} / ${state.recordRows.length}개 일자 기록 인식`, "ok");
      }

      render();
    } catch (err) {
      console.error(err);
      setStatus("recordFileStatus", "파일 읽기 실패", "error");
      alert("파일을 읽는 중 오류가 발생했습니다. 엑셀 파일인지 확인해주세요.");
    }
  }

  async function runCheck() {
    if (!$("recordFile")?.files?.[0]) {
      alert("장기요양급여 제공기록지 엑셀 파일을 먼저 업로드해주세요.");
      return;
    }

    if (!state.recordRows.length) await handleFileChange();

    buildRequiredItems();
    compareResults();
    render();

    if (!state.results.length) {
      alert("검증할 특이사항 필요 항목을 찾지 못했습니다. 제공기록지 구조 또는 보관함 데이터를 확인해주세요.");
    }
  }

  function downloadResult() {
    if (!state.results.length) {
      alert("다운로드할 결과가 없습니다. 먼저 검증하기를 눌러주세요.");
      return;
    }

    const rows = state.results.map((r) => ({
      결과: r.status === "ok" ? "정상" : r.status === "miss" ? "누락" : "확인필요",
      어르신: r.name,
      장기요양번호: r.longTermNo,
      일자: r.date,
      요일: getWeekday(r.date),
      구분: r.type,
      필요특이사항: r.requiredText,
      업로드특이사항: r.uploaded,
      판정사유: r.reason,
      추천문구: r.recommend,
      근거: r.sourceText,
      시트: r.source
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "특이사항검증결과");
    XLSX.writeFile(wb, `특이사항검증결과_${state.recordRangeText || "업로드"}.xlsx`);
  }

  function resetPage() {
    if (confirm("초기화할까요?")) location.reload();
  }

  function initTodayText() {
    const el = $("todayText");
    if (!el) return;

    const d = new Date();
    el.textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  }

  function bindEvents() {
    $("recordFile")?.addEventListener("change", handleFileChange);
    $("checkBtn")?.addEventListener("click", runCheck);
    $("downloadBtn")?.addEventListener("click", downloadResult);
    $("resetBtn")?.addEventListener("click", resetPage);
    $("reloadBtn")?.addEventListener("click", loadLibraries);
    $("statusFilter")?.addEventListener("change", render);

    document.querySelectorAll("#typeTabs button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#typeTabs button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.typeFilter = btn.dataset.type || "all";
        render();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    initTodayText();
    bindEvents();
    render();
    await loadLibraries();
  });
})();
