const API_URL = "https://script.google.com/macros/s/AKfycbyozq26f-v_aBKD-hSMRAMhpPuVYCQRDmsXFl9m_AkgeWGBwOeXcE1CPZrfE3FFiEsK/exec";

const counselFileInput = document.getElementById("counselFile");
const uploadCounselBtn = document.getElementById("uploadCounselBtn");
const deleteSelectedCounselBtn = document.getElementById("deleteSelectedCounselBtn");
const selectAllCounselCheckbox = document.getElementById("selectAllCounselCheckbox");

const counselLibraryTableBody =
  document.getElementById("counselLibraryTableBody") ||
  document.getElementById("counselTableBody");

let counselLibrary = [];

function normalizeText(value) {
  return String(value || "").replace(/\s/g, "").trim();
}

function normalizeDateText(value) {
  if (!value) return "";

  const text = String(value).trim().replace(/^'/, "");

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(text)) return text.replace(/\./g, "-");
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text.replace(/\//g, "-");

  const match = text.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);

  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }

  if (text.includes("T")) return text.split("T")[0];

  return text;
}

function getCellValueByLabel(rows, labelText) {
  const target = normalizeText(labelText);

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];

    for (let c = 0; c < row.length; c++) {
      const cellText = normalizeText(row[c]);

    if (cellText.includes(target)) {
        for (let next = c + 1; next <= c + 8; next++) {
          if (row[next]) return row[next];
        }
      }
    }
  }

  return "";
}

function detectCareCategory(text) {
  const clean = normalizeText(text);

  if (clean.includes("목욕") || clean.includes("몸씻기") || clean.includes("옷갈아입기")) return "목욕";
  if (clean.includes("물리치료")) return "물리치료";
  if (clean.includes("균형잡힌식단관리") || clean.includes("식사")) return "식사";
  if (clean.includes("기저귀")) return "기저귀";
  if (clean.includes("정확한복약도움") || clean.includes("복약") || clean.includes("건강관리")) return "간호";
  if (clean.includes("인지활동") || clean.includes("인지지원") || clean.includes("인지")) return "인지활동";
  if (clean.includes("화장실") || clean.includes("대변") || clean.includes("소변") || clean.includes("배설")) return "화장실";

  return "";
}

function detectChangeType(text) {
  const clean = normalizeText(text);

  if (
    clean.includes("제외") ||
    clean.includes("중단") ||
    clean.includes("삭제") ||
    clean.includes("미제공") ||
    clean.includes("하지않")
  ) {
    return "제외";
  }

  if (
    clean.includes("추가") ||
    clean.includes("시작") ||
    clean.includes("제공") ||
    clean.includes("반영")
  ) {
    return "추가";
  }

  return "기타";
}

function findBenefitReflectionStartRow(rows) {
  for (let r = 0; r < rows.length; r++) {
    const rowText = normalizeText((rows[r] || []).join(" "));

    if (rowText.includes("급여제공반영정보")) {
      return r;
    }
  }

  return -1;
}

function findReflectionHeaderRow(rows, startRow) {
  for (let r = startRow; r < Math.min(rows.length, startRow + 10); r++) {
    const rowText = normalizeText((rows[r] || []).join(" "));

    if (
      rowText.includes("반영일") &&
      rowText.includes("급여구분") &&
      rowText.includes("급여내용")
    ) {
      return r;
    }
  }

  return -1;
}

function parseReflectionRows(rows) {
  const startRow = findBenefitReflectionStartRow(rows);

  if (startRow === -1) return [];

  const headerRowIndex = findReflectionHeaderRow(rows, startRow);
  const result = [];

  if (headerRowIndex === -1) return result;

  const header = rows[headerRowIndex] || [];

  const dateCol = header.findIndex((cell) => normalizeText(cell).includes("반영일"));
  const typeCol = header.findIndex((cell) => normalizeText(cell).includes("급여구분"));
  const contentCol = header.findIndex((cell) => normalizeText(cell).includes("급여내용"));
  const reasonCol = header.findIndex((cell) => normalizeText(cell).includes("반영사유"));

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rowText = normalizeText(row.join(" "));

    if (!rowText) continue;

    const dateValue = dateCol >= 0 ? row[dateCol] : "";
    const typeValue = typeCol >= 0 ? row[typeCol] : "";
    const contentValue = contentCol >= 0 ? row[contentCol] : "";
    const reasonValue = reasonCol >= 0 ? row[reasonCol] : "";

    const joined = [dateValue, typeValue, contentValue, reasonValue].join(" ");
    const category = detectCareCategory(joined);

    if (!category) continue;

    result.push({
      reflectionDateRaw: dateValue,
      category,
      changeType: detectChangeType(joined),
      careType: String(typeValue || "").trim(),
      careContent: String(contentValue || "").trim(),
      reason: String(reasonValue || "").trim(),
      joined
    });
  }

  return result;
}

function parseCounselSheet(rows, fileName, sheetName) {
  const recipientName = String(
    getCellValueByLabel(rows, "수급자") ||
    getCellValueByLabel(rows, "성명") ||
    getCellValueByLabel(rows, "어르신")
  ).trim();

  const counselDate = normalizeDateText(
    getCellValueByLabel(rows, "상담일시") ||
    getCellValueByLabel(rows, "상담일자") ||
    getCellValueByLabel(rows, "상담일")
  );

  const reflectionRows = parseReflectionRows(rows);
  const uploadedAt = new Date().toLocaleString("ko-KR");

  return reflectionRows
    .map((item, index) => {
      const reflectionDate = normalizeDateText(item.reflectionDateRaw) || counselDate;

      if (!recipientName || !reflectionDate || !item.category) return null;

      // [줄바꿈 핵심 개선 구역]: 엑셀 내 엔터 개행을 보존하고, 엔터가 없더라도 여러 문장일 경우 줄바꿈을 주입합니다.
      let formattedContent = item.careContent || item.joined;
      if (formattedContent) {
        // 기존 개행 문자 처리
        formattedContent = formattedContent.replace(/\r?\n/g, "<br />");
        // 두 문장 이상이 공백 하나로 이어져 있을 때 (예: ") 위") 한 줄 내리도록 매칭 교정
        formattedContent = formattedContent.replace(/\)\s(?=[가-힣\w])/g, ")<br />");
      }

      return {
        id: `${Date.now()}_${sheetName}_${index}_${Math.random().toString(36).slice(2, 8)}`,
        recipientName,
        consultDate: reflectionDate,
        category: item.category,
        changeType: item.changeType,
        careContent: formattedContent,
        reason: item.reason || "",
        sheetName,
        fileName,
        uploadedAt,
        row: {
          recipientName,
          counselDate,
          reflectionDate,
          careType: item.careType,
          careContent: formattedContent,
          reason: item.reason,
          joined: item.joined
        },
        checked: false
      };
    })
    .filter(Boolean);
}

function parseCounselWorkbook(workbook, fileName) {
  let allParsed = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false
    });

    allParsed = allParsed.concat(parseCounselSheet(rows, fileName, sheetName));
  });

  return allParsed;
}

import { auth, db } from "./firebase-config.js";
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const COUNSEL_COLLECTION = "counsels";

function getLoginName() {
  return sessionStorage.getItem("loginUserName") ||
    localStorage.getItem("loginUserName") ||
    sessionStorage.getItem("loginUser") ||
    localStorage.getItem("loginUser") ||
    auth.currentUser?.email || "알 수 없음";
}

function safeDocId(value) {
  return String(value || "counsel")
    .replace(/[^a-zA-Z0-9가-힣_-]/g, "_")
    .slice(0, 1400);
}

function firestoreSafe(value) {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(firestoreSafe);
  if (typeof value === "object") {
    const out = {};
    Object.entries(value).forEach(([k,v]) => out[k] = firestoreSafe(v));
    return out;
  }
  return String(value);
}

async function loadCounselLibrary() {
  try {
    const snap = await getDocs(collection(db, COUNSEL_COLLECTION));
    counselLibrary = snap.docs.map(d => ({
      ...d.data(),
      firestoreId: d.id,
      id: d.data().id || d.id,
      consultDate: normalizeDateText(d.data().consultDate || d.data().reflectionDate || d.data().counselDate || d.data().writtenDate),
      checked: false
    }));
    renderCounselLibrary();
  } catch (error) {
    console.error("상담일지 Firestore 불러오기 오류:", error);
    alert("Firebase에서 상담일지 데이터를 불러오지 못했습니다. Firestore 규칙을 확인해주세요.");
  }
}

async function addCounselsToFirestore(items) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const uploadedBy = getLoginName();
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach((raw, j) => {
      const item = firestoreSafe({ ...raw, uploadedBy, ownerUid: user.uid, storage: "firestore" });
      const unique = safeDocId(`${item.id || 'counsel'}__${item.recipientName || ''}__${item.consultDate || ''}__${item.sheetName || ''}__${i+j}`);
      batch.set(doc(db, COUNSEL_COLLECTION, unique), item, { merge: true });
    });
    await batch.commit();
  }
}

async function deleteCounselsFromFirestore(items) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    items.slice(i, i + 400).forEach(item => {
      batch.delete(doc(db, COUNSEL_COLLECTION, item.firestoreId || String(item.id)));
    });
    await batch.commit();
  }
}

function renderCounselLibrary() {
  counselLibraryTableBody.innerHTML = "";
  if (counselLibrary.length === 0) {
    counselLibraryTableBody.innerHTML = `<tr class="empty-row"><td colspan="10" style="text-align:center;">등록된 급여제공반영 상담일지가 없습니다.</td></tr>`;
    selectAllCounselCheckbox.checked = false;
    return;
  }
  const sortedList = [...counselLibrary].sort((a,b) => {
    if (String(a.recipientName||"") === String(b.recipientName||"")) return String(b.consultDate||"").localeCompare(String(a.consultDate||""));
    return String(a.recipientName||"").localeCompare(String(b.recipientName||""), "ko");
  });
  sortedList.forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="checkbox-col"><input type="checkbox" class="counsel-checkbox" data-key="${item.firestoreId || item.id}" ${item.checked ? "checked" : ""} /></td>
      <td>${item.recipientName || "-"}</td><td>${item.consultDate || "-"}</td><td>${item.category || "-"}</td><td>${item.changeType || "-"}</td>
      <td style="text-align:left;padding:10px;line-height:1.4;">${item.careContent || "-"}</td>
      <td style="text-align:left;padding:10px;">${item.reason || "-"}</td><td>${item.sheetName || "-"}</td><td>${item.fileName || "-"}</td><td>${item.uploadedAt || "-"}</td>`;
    counselLibraryTableBody.appendChild(row);
  });
  document.querySelectorAll(".counsel-checkbox").forEach(cb => cb.addEventListener("change", e => {
    const key = String(e.target.dataset.key);
    counselLibrary = counselLibrary.map(x => String(x.firestoreId || x.id) === key ? {...x, checked:e.target.checked} : x);
  }));
}

uploadCounselBtn.addEventListener("click", () => {
  const file = counselFileInput.files[0];
  if (!file) return alert("상담일지 파일을 선택해주세요.");
  const reader = new FileReader();
  reader.onload = async event => {
    try {
      uploadCounselBtn.disabled = true;
      const workbook = XLSX.read(new Uint8Array(event.target.result), { type:"array" });
      const parsed = parseCounselWorkbook(workbook, file.name);
      if (!parsed.length) return alert("모든 시트를 확인했지만 급여제공반영 정보를 찾지 못했습니다.");
      await addCounselsToFirestore(parsed);
      counselFileInput.value = "";
      alert(`${parsed.length}건의 급여제공반영 정보가 Firebase에 등록되었습니다.`);
      await loadCounselLibrary();
    } catch (error) {
      console.error(error); alert("상담일지 Firebase 등록 중 오류가 발생했습니다.\n" + (error.message || error));
    } finally { uploadCounselBtn.disabled = false; }
  };
  reader.readAsArrayBuffer(file);
});

selectAllCounselCheckbox.addEventListener("change", e => {
  counselLibrary = counselLibrary.map(x => ({...x, checked:e.target.checked})); renderCounselLibrary();
});

deleteSelectedCounselBtn.addEventListener("click", async () => {
  const selected = counselLibrary.filter(x => x.checked);
  if (!selected.length) return alert("삭제할 상담일지를 선택해주세요.");
  if (!confirm(`선택한 ${selected.length}개의 상담일지를 Firebase에서 삭제하시겠습니까?`)) return;
  try { await deleteCounselsFromFirestore(selected); alert("삭제되었습니다."); await loadCounselLibrary(); }
  catch(e){ console.error(e); alert("삭제 중 오류가 발생했습니다.\n"+(e.message||e)); }
});

// 기존 Google Sheets DB 엑셀의 '상담일지' 시트를 Firebase로 1회 이전
const legacyFile = document.getElementById("legacyCounselDbFile");
const migrateBtn = document.getElementById("migrateCounselBtn");
const migrateStatus = document.getElementById("counselMigrationStatus");
function migrationStatus(t, err=false){ if(migrateStatus){ migrateStatus.textContent=t; migrateStatus.style.color=err?"#b91c1c":"#334155"; } }
function parseMaybeJson(v){ if(Array.isArray(v)||(v&&typeof v==='object')) return v; if(typeof v!=="string"||!v.trim()) return v; try{return JSON.parse(v)}catch{return v} }

migrateBtn?.addEventListener("click", async () => {
  const file = legacyFile?.files?.[0];
  const user = auth.currentUser;
  if (!file) return alert("기존 Google Sheets DB 엑셀 파일을 선택해주세요.");
  if (!user) return alert("로그인 후 이용해주세요.");
  if (!confirm("기존 DB 엑셀의 상담일지 시트를 Firebase로 이전할까요? 기존 Firebase 자료는 삭제하지 않습니다.")) return;
  migrateBtn.disabled = true;
  try {
    migrationStatus("상담일지 시트를 읽는 중...");
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:"array", cellDates:true});
    const ws = wb.Sheets["상담일지"];
    if (!ws) throw new Error("엑셀에서 '상담일지' 시트를 찾지 못했습니다.");
    const rows = XLSX.utils.sheet_to_json(ws, {defval:"", raw:false});
    let saved = 0;
    for (let start=0; start<rows.length; start+=400) {
      const batch = writeBatch(db);
      rows.slice(start,start+400).forEach((raw, idx) => {
        if (!Object.values(raw).some(v => String(v ?? "").trim())) return;
        const data = {};
        Object.entries(raw).forEach(([k,v]) => data[k] = ["row","rows","rowsJson"].includes(k) ? parseMaybeJson(v) : v);
        data.recipientName = data.recipientName || data.name || data["수급자명"] || data["수급자"] || "";
        data.consultDate = normalizeDateText(data.consultDate || data.reflectionDate || data.counselDate || data.writtenDate || data["상담일자"] || data["반영일"] || "");
        data.reflectionDate = normalizeDateText(data.reflectionDate || data.consultDate || data["반영일"] || "");
        data.ownerUid = user.uid; data.migratedFrom = "googleSheets"; data.storage = "firestore";
        const rowNo = start + idx + 2;
        // 행번호까지 포함해 같은 사람의 여러 상담일지가 서로 덮어쓰이지 않게 저장
        const fid = safeDocId(`${data.id || 'counsel'}__${data.longTermNumber || data.certNumber || ''}__${data.consultDate || data.reflectionDate || ''}__row${rowNo}`);
        batch.set(doc(db, COUNSEL_COLLECTION, fid), firestoreSafe(data), {merge:true}); saved++;
      });
      await batch.commit();
      migrationStatus(`Firebase 이전 중... ${Math.min(start+400,rows.length)}/${rows.length}`);
    }
    migrationStatus(`이전 완료 · 상담일지 ${saved}건`);
    alert(`상담일지 ${saved}건을 Firebase로 이전했습니다.`);
    await loadCounselLibrary();
  } catch(e) {
    console.error(e); migrationStatus("이전 실패: "+(e.message||e), true); alert("상담일지 이전 중 오류가 발생했습니다.\n"+(e.message||e));
  } finally { migrateBtn.disabled = false; }
});

loadCounselLibrary();
