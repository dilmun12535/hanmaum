// 상담일지 데이터는 Firebase Firestore(counsels)에서 관리합니다.

const counselFileInput = document.getElementById("counselFile");
const uploadCounselBtn = document.getElementById("uploadCounselBtn");
const deleteSelectedCounselBtn = document.getElementById("deleteSelectedCounselBtn");
const selectAllCounselCheckbox = document.getElementById("selectAllCounselCheckbox");

const counselLibraryTableBody =
  document.getElementById("counselLibraryTableBody") ||
  document.getElementById("counselTableBody");

let counselLibrary = [];
let isCounselAdmin = false;
const mayDeleteCounsel = item => !!auth.currentUser && (isCounselAdmin || item.ownerUid === auth.currentUser.uid);
async function refreshCounselAdmin() {
  isCounselAdmin = false;
  const user = auth.currentUser;
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (auth.currentUser?.uid === user.uid) isCounselAdmin = snap.exists() && snap.data().role === "admin";
  } catch (error) { console.error("관리자 권한 확인 실패:", error); }
}

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

    if (cellText === target || (target === "수급자" && cellText === "수급자명")) {
        for (let next = c + 1; next <= c + 8; next++) {
          if (row[next]) return row[next];
        }
      }
    }
  }

  return "";
}

// 급여내용 자체를 기준으로 분류합니다. 반영사유/종합의견은 분류에 사용하지 않습니다.
function detectCareCategory(text) {
  const clean = normalizeText(text);
  if (!clean) return "";
  // 옷갈아입기와 몸씻기는 서로 다른 급여입니다.
  if (/옷갈아입기|옷입기|옷벗기|착의|탈의/.test(clean) && !/목욕|몸씻기/.test(clean)) return "옷갈아입기";
  if (/목욕|몸씻기|전신씻기|샤워/.test(clean)) return "목욕";
  if (/기저귀|기저귀교환|기저귀갈기/.test(clean)) return "기저귀";
  if (/물리치료|기능회복훈련|작업치료/.test(clean)) return "물리치료";
  if (/정확한복약도움|복약|투약|약복용|약챙겨/.test(clean)) return "간호";
  if (/기능상태에맞는음식준비|균형잡힌식단관리|식사|음식준비|다진식|죽식|일반식|연식/.test(clean)) return "식사";
  if (/화장실|대변|소변|배설|배변|배뇨/.test(clean)) return "화장실";
  if (/인지활동|인지지원|인지훈련/.test(clean)) return "인지활동";
  return "기타";
}

function detectChangeType(text) {
  const clean = normalizeText(text);
  if (/제외|중단|삭제|미제공|하지않/.test(clean)) return "제외";
  if (/추가|시작|제공|반영/.test(clean)) return "추가";
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
  if (headerRowIndex === -1) return [];
  const header = rows[headerRowIndex] || [];
  const dateCol = header.findIndex(cell => normalizeText(cell).includes("반영일"));
  const typeCol = header.findIndex(cell => normalizeText(cell).includes("급여구분"));
  const contentCol = header.findIndex(cell => normalizeText(cell).includes("급여내용"));
  const reasonCol = header.findIndex(cell => normalizeText(cell).includes("반영사유"));
  if (dateCol < 0 || contentCol < 0) return [];
  const result = [];
  let lastDate = "";
  let lastType = "";
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rowText = normalizeText(row.join(" "));
    if (!rowText) continue;
    if (/^(상담일지|작성자|수급자)/.test(rowText) && r > headerRowIndex + 1) break;
    const rawDate = row[dateCol];
    const rawType = typeCol >= 0 ? row[typeCol] : "";
    const content = contentCol >= 0 ? row[contentCol] : "";
    const reason = reasonCol >= 0 ? row[reasonCol] : "";
    if (rawDate) lastDate = rawDate;
    if (rawType) lastType = rawType;
    if (!normalizeText(content)) continue;
    const category = detectCareCategory(content || lastType);
    if (!category) continue;
    const changeSource = [rawType, content].join(" ");
    result.push({reflectionDateRaw: rawDate || lastDate, category,
      changeType: detectChangeType(changeSource), careType: String(rawType || lastType || "").trim(),
      careContent: String(content).trim(), reason: String(reason || "").trim(),
      joined: [rawDate || lastDate, rawType || lastType, content, reason].join(" "), sourceRow: r + 1});
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
        id: `counsel_${sheetName}_${item.sourceRow || index}_${reflectionDate}`,
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
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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

// 동일 파일의 같은 상담일지 행은 재업로드해도 중복 생성하지 않습니다.
// 기존 데이터는 수정하지 않고, 새 문서만 생성합니다.
function stableCounselKey(item) {
  const key = [item.recipientName, item.consultDate, item.category,
    item.changeType, String(item.careContent || "").replace(/<br\s*\/?\s*>/gi, "\n"),
    item.reason].map(v => String(v || "").replace(/\s+/g, "").toLowerCase()).join("|");
  return key;
}
function hashCounselKey(text) {
  // 두 개의 독립 32-bit 해시를 사용하여 문서 ID를 안정적으로 만듭니다.
  let a = 2166136261, b = 2246822519;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 3266489917);
  }
  return `c_${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
function setCounselUploadStatus(message) {
  let status = document.getElementById("counselUploadStatus");
  if (!status) {
    status = document.createElement("div");
    status.id = "counselUploadStatus";
    status.setAttribute("role", "status");
    status.style.cssText = "margin:12px 0;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;color:#1e3a8a;white-space:pre-wrap;font-size:13px";
    uploadCounselBtn.parentElement.insertAdjacentElement("afterend", status);
  }
  status.textContent = message;
}
async function addCounselsToFirestore(items) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const uploadedBy = getLoginName();
  setCounselUploadStatus("기존 상담일지와 중복 여부 확인 중...");
  const existing = await getDocs(collection(db, COUNSEL_COLLECTION));
  const knownKeys = new Set(existing.docs.map(d => stableCounselKey(d.data())));
  const existingIds = new Set(existing.docs.map(d => d.id));
  const unique = new Map();
  let duplicateCount = 0;
  for (const raw of items) {
    const key = stableCounselKey(raw);
    const id = hashCounselKey(key);
    if (knownKeys.has(key) || existingIds.has(id) || unique.has(key)) {duplicateCount++; continue;}
    unique.set(key, {...raw, firestoreId:id});
  }
  const pending = [...unique.values()];
  let saved = 0;
  const failures = [];
  for (let i = 0; i < pending.length; i += 200) {
    const part = pending.slice(i, i + 200);
    const batch = writeBatch(db);
    part.forEach(raw => {
      const item = firestoreSafe({...raw, uploadedBy, ownerUid:user.uid, storage:"firestore"});
      batch.set(doc(db, COUNSEL_COLLECTION, raw.firestoreId), item);
    });
    try {
      await batch.commit();
      saved += part.length;
      setCounselUploadStatus(`저장 진행: ${saved}/${pending.length}건 완료 · 중복 ${duplicateCount}건 건너뜀`);
    } catch (error) {
      failures.push({start:i + 1, count:part.length, message:error.message || String(error),
        sheets:[...new Set(part.map(x=>x.sheetName))].slice(0,20)});
      setCounselUploadStatus(`저장 실패 묶음 발생 · 성공 ${saved}건 · 실패 ${failures.reduce((n,x)=>n+x.count,0)}건`);
      // 실패한 묶음 이후에도 나머지를 계속 시도합니다.
    }
  }
  return {parsed:items.length, saved, duplicateCount, failures};
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
  await refreshCounselAdmin();
  const unauthorized = selected.filter(item => !mayDeleteCounsel(item));
  if (unauthorized.length) return alert(`삭제 권한이 없는 상담일지 ${unauthorized.length}건이 포함되어 있습니다.`);
  if (!confirm(`선택한 ${selected.length}개의 상담일지를 Firebase에서 삭제하시겠습니까?\n${isCounselAdmin ? "관리자 권한으로 삭제합니다." : "본인이 등록한 자료만 삭제합니다."}`)) return;
  try { await deleteCounselsFromFirestore(selected); alert("삭제되었습니다."); await loadCounselLibrary(); }
  catch(e){ console.error(e); alert("삭제 중 오류가 발생했습니다.\n"+(e.message||e)); }
});

// 기존 Google Sheets → Firebase 1회 이전 기능은 이전 완료에 따라 비활성화했습니다.
// Firestore의 기존 counsels 문서는 삭제하거나 변경하지 않습니다.

loadCounselLibrary();
