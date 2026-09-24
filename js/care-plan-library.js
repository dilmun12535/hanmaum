import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  collection, getDocs, doc, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const elPlanFileSelector = document.getElementById("planFile");
const elPlanDateSelector = document.getElementById("planWrittenDate");
const elPlanUploadTrigger = document.getElementById("uploadPlanBtn");
const elPlanDeleteTrigger = document.getElementById("deleteSelectedPlanBtn");
const elPlanSelectAllTrigger = document.getElementById("selectAllPlanCheckbox");
const elPlanTableBodyContainer = document.getElementById("planLibraryTableBody");
const elMigrationFile = document.getElementById("legacyDbFile");
const elMigrationBtn = document.getElementById("migratePlanBtn");
const elMigrationStatus = document.getElementById("migrationStatus");

let carePlanLibrary = [];
let currentUser = null;

if (elPlanDateSelector) {
  elPlanDateSelector.setAttribute("max", "9999-12-31");
  elPlanDateSelector.addEventListener("input", () => {
    const value = elPlanDateSelector.value;
    if (value && value.length > 10) elPlanDateSelector.value = value.slice(0, 10);
  });
}

function normalizeText(value) { return String(value || "").replace(/\s/g, "").trim(); }
function normalizeDateString(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear(); const m = String(value.getMonth()+1).padStart(2,"0"); const d = String(value.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (text.includes("T")) return text.split("T")[0];
  return text;
}
function formatDateValue(value) { return normalizeDateString(value) || "-"; }
function extractInfoFromFileName(fileName) {
  const nameOnly = fileName.replace(/\.(xlsx|xls)$/i, "").trim();
  const match = nameOnly.match(/^(L\d+)\s+(.+?)\s+수급자\s+급여제공계획/i);
  if (match) return { longTermNumber: match[1], recipientName: match[2].trim() };
  const parts = nameOnly.split(/\s+/);
  return { longTermNumber: parts[0] || "", recipientName: parts[1] || "" };
}
function getCareItemCount(rows) {
  return rows.filter(row => normalizeText(JSON.stringify(row)).length > 0).length;
}
function getLoginName() {
  return sessionStorage.getItem("loginUser") || localStorage.getItem("loginUser") || currentUser?.email || "알 수 없음";
}
function safeRows(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try { const parsed = JSON.parse(String(value)); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
function setMigrationStatus(text, isError=false) {
  if (!elMigrationStatus) return;
  elMigrationStatus.textContent = text;
  elMigrationStatus.style.color = isError ? "#b91c1c" : "#334155";
}

async function loadLibrary() {
  try {
    if (!currentUser) return;
    const snap = await getDocs(collection(db, "carePlans"));
    carePlanLibrary = snap.docs.map(s => {
      const data = s.data();
      return {
        ...data,
        firestoreId: s.id,
        id: data.id ?? s.id,
        writtenDate: normalizeDateString(data.writtenDate),
        rows: Array.isArray(data.rows) ? data.rows : safeRows(data.rowsJson),
        checked: false
      };
    });
    if (elPlanSelectAllTrigger) elPlanSelectAllTrigger.checked = false;
    renderLibrary();
  } catch (error) {
    console.error("Firestore 불러오기 오류:", error);
    alert("Firebase에서 급여제공계획서 데이터를 불러오지 못했습니다. Firestore 규칙을 확인해주세요.");
  }
}

async function addPlanToFirestore(plan) {
  if (!currentUser) throw new Error("로그인 정보가 없습니다.");
  const id = String(plan.id || Date.now());
  const rows = plan.rows || [];
  await setDoc(doc(db, "carePlans", id), {
    id,
    longTermNumber: plan.longTermNumber || "",
    recipientName: plan.recipientName || "",
    writtenDate: normalizeDateString(plan.writtenDate),
    fileName: plan.fileName || "",
    itemCount: Number(plan.itemCount || 0),
    uploadedAt: plan.uploadedAt || new Date().toLocaleString("ko-KR"),
    uploadedBy: plan.uploadedBy || getLoginName(),
    ownerUid: currentUser.uid,
    rows
  });
}

async function deleteSelectedFromFirestore(plans) {
  for (const plan of plans) {
    await deleteDoc(doc(db, "carePlans", String(plan.firestoreId || plan.id)));
  }
}

function renderLibrary() {
  if (!elPlanTableBodyContainer) return;
  elPlanTableBodyContainer.innerHTML = "";
  if (carePlanLibrary.length === 0) {
    elPlanTableBodyContainer.innerHTML = `<tr class="empty-row"><td></td><td colspan="7" style="text-align:center;padding:25px 0;">등록된 급여제공계획서가 없습니다.</td></tr>`;
    if (elPlanSelectAllTrigger) elPlanSelectAllTrigger.checked = false;
    return;
  }
  const sortedList = [...carePlanLibrary].sort((a,b) => {
    const na=String(a.recipientName||""), nb=String(b.recipientName||"");
    if (na===nb) return normalizeDateString(b.writtenDate).localeCompare(normalizeDateString(a.writtenDate));
    return na.localeCompare(nb,"ko");
  });
  for (const plan of sortedList) {
    const row=document.createElement("tr");
    row.innerHTML=`<td class="checkbox-col" style="text-align:center;"><input type="checkbox" class="plan-checkbox" data-id="${plan.firestoreId || plan.id}" ${plan.checked?"checked":""}/></td><td>${plan.longTermNumber||"-"}</td><td>${plan.recipientName||"-"}</td><td>${formatDateValue(plan.writtenDate)}</td><td style="text-align:left;">${plan.fileName||"-"}</td><td>${plan.itemCount||0}개</td><td>${plan.uploadedAt||"-"}</td><td>${plan.uploadedBy||"알 수 없음"}</td>`;
    elPlanTableBodyContainer.appendChild(row);
  }
  bindCheckboxEvents();
}
function bindCheckboxEvents() {
  document.querySelectorAll(".plan-checkbox").forEach(cb => cb.addEventListener("change", e => {
    const id=String(e.target.dataset.id);
    carePlanLibrary=carePlanLibrary.map(p => String(p.firestoreId||p.id)===id ? {...p,checked:e.target.checked}:p);
    if (elPlanSelectAllTrigger && !e.target.checked) elPlanSelectAllTrigger.checked=false;
  }));
}

if (elPlanUploadTrigger) elPlanUploadTrigger.addEventListener("click", () => {
  if (!elPlanFileSelector || !elPlanDateSelector) return;
  const file=elPlanFileSelector.files[0], writtenDate=normalizeDateString(elPlanDateSelector.value);
  if (!file) return alert("급여제공계획서 파일을 선택해주세요.");
  if (!writtenDate) return alert("급여제공계획서 작성일자를 선택해주세요.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(writtenDate)) return alert("작성일자는 YYYY-MM-DD 형식으로 입력해주세요.");
  const fileInfo=extractInfoFromFileName(file.name);
  if (!fileInfo.longTermNumber || !fileInfo.recipientName) return alert("파일명에서 장기요양번호와 수급자명을 확인하지 못했습니다. 파일명을 확인해주세요.");
  const reader=new FileReader();
  reader.onload=async event => {
    try {
      const workbook=XLSX.read(new Uint8Array(event.target.result),{type:"array"});
      const worksheet=workbook.Sheets[workbook.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(worksheet,{defval:""});
      const newPlan={id:String(Date.now()),longTermNumber:fileInfo.longTermNumber,recipientName:fileInfo.recipientName,writtenDate,fileName:file.name,uploadedAt:new Date().toLocaleString("ko-KR"),uploadedBy:getLoginName(),itemCount:getCareItemCount(rows),rows,checked:false};
      elPlanUploadTrigger.disabled=true; elPlanUploadTrigger.textContent="등록 중...";
      await addPlanToFirestore(newPlan);
      elPlanFileSelector.value=""; elPlanDateSelector.value="";
      await loadLibrary();
      alert("급여제공계획서가 Firebase에 등록되었습니다.");
    } catch(error) { console.error(error); alert("등록 중 오류가 발생했습니다. Firestore 권한을 확인해주세요."); }
    finally { elPlanUploadTrigger.disabled=false; elPlanUploadTrigger.textContent="계획서 등록"; }
  };
  reader.readAsArrayBuffer(file);
});

if (elPlanSelectAllTrigger) elPlanSelectAllTrigger.addEventListener("change", e => { carePlanLibrary=carePlanLibrary.map(p=>({...p,checked:e.target.checked})); renderLibrary(); });
if (elPlanDeleteTrigger) elPlanDeleteTrigger.addEventListener("click", async () => {
  const selected=carePlanLibrary.filter(p=>p.checked);
  if (!selected.length) return alert("삭제할 계획서를 선택해주세요.");
  if (!confirm(`선택한 ${selected.length}개의 계획서를 삭제하시겠습니까?\n본인이 등록/이전한 자료만 삭제할 수 있습니다.`)) return;
  try { elPlanDeleteTrigger.disabled=true; await deleteSelectedFromFirestore(selected); await loadLibrary(); alert("삭제되었습니다."); }
  catch(error) { console.error(error); alert("삭제 권한이 없거나 삭제 중 오류가 발생했습니다."); }
  finally { elPlanDeleteTrigger.disabled=false; }
});

if (elMigrationBtn) elMigrationBtn.addEventListener("click", async () => {
  const file=elMigrationFile?.files?.[0];
  if (!file) return alert("기존 Google Sheets에서 내려받은 DB 엑셀 파일을 선택해주세요.");
  if (!currentUser) return alert("로그인 후 이용해주세요.");
  if (!confirm("선택한 DB 엑셀의 '급여제공계획서' 시트를 Firebase로 이전합니다.\n계획서를 한 건씩 순서대로 저장하며, 기존 시트의 id가 같아도 계획서별로 별도 저장됩니다. 계속할까요?")) return;

  elMigrationBtn.disabled=true;
  let done=0;
  let failed=[];
  try {
    setMigrationStatus("엑셀 파일을 읽는 중...");
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(new Uint8Array(buf),{type:"array",cellDates:true});
    const ws=wb.Sheets["급여제공계획서"];
    if (!ws) throw new Error("'급여제공계획서' 시트를 찾을 수 없습니다.");

    const rows=XLSX.utils.sheet_to_json(ws,{defval:"",raw:false});
    const valid=rows.filter(r=>r.id && (r.longTermNumber || r.recipientName));
    if (!valid.length) throw new Error("이전할 계획서 데이터가 없습니다.");

    for (let i=0; i<valid.length; i++) {
      const r=valid[i];
      const sourceId=String(r.id || '').trim();
      // 기존 시트에서 id가 중복되어도 서로 다른 계획서가 덮어써지지 않도록
      // 장기요양번호 + 작성일자 + 원본 행번호를 포함한 고유 문서 ID를 사용합니다.
      const uniqueKey = [
        sourceId || 'legacy',
        String(r.longTermNumber || '').trim(),
        normalizeDateString(r.writtenDate) || 'nodate',
        String(i + 2)
      ].join('__').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
      const id=uniqueKey;
      try {
        const parsedRows=safeRows(r.rowsJson);
        // rowsJson 문자열과 rows 배열을 동시에 저장하면 같은 데이터가 두 번 들어가
        // 문서 크기가 커지므로 Firestore에는 rows 배열만 저장합니다.
        await setDoc(doc(db,"carePlans",id),{
          id,
          longTermNumber:String(r.longTermNumber||"").trim(),
          recipientName:String(r.recipientName||"").trim(),
          writtenDate:normalizeDateString(r.writtenDate),
          fileName:String(r.fileName||""),
          itemCount:Number(r.itemCount||parsedRows.length||0),
          uploadedAt:String(r.uploadedAt||""),
          uploadedBy:String(r.uploadedBy||""),
          ownerUid:currentUser.uid,
          rows:parsedRows,
          migratedFrom:"googleSheets",
          sourceId
        },{merge:true});
        done++;
      } catch (itemError) {
        console.error(`계획서 이전 실패 (${id})`, itemError);
        failed.push({id, name:String(r.recipientName||""), error:itemError?.message||String(itemError)});
      }
      setMigrationStatus(`Firebase 이전 중... ${i+1} / ${valid.length}건 · 성공 ${done}건${failed.length ? ` · 실패 ${failed.length}건` : ""}`);
    }

    await loadLibrary();
    if (failed.length) {
      const preview=failed.slice(0,5).map(x=>`${x.name||x.id}: ${x.error}`).join("\n");
      setMigrationStatus(`이전 완료: 성공 ${done}건 / 실패 ${failed.length}건. 실패 건은 다시 확인해주세요.`,true);
      alert(`이전 작업이 끝났습니다.\n성공: ${done}건\n실패: ${failed.length}건\n\n${preview}${failed.length>5?"\n외 실패 건이 더 있습니다.":""}`);
    } else {
      setMigrationStatus(`이전 완료: ${done}건. Firestore 목록을 다시 불러왔습니다.`);
      alert(`급여제공계획서 ${done}건을 Firebase로 이전했습니다.`);
    }
  } catch(error) {
    console.error("이전 오류:",error);
    setMigrationStatus(`이전 실패: ${error.message || error}`,true);
    alert("이전 중 오류가 발생했습니다. 화면의 상태 메시지를 확인해주세요.");
  } finally {
    elMigrationBtn.disabled=false;
  }
});

onAuthStateChanged(auth, user => {
  currentUser=user;
  if (user) loadLibrary();
});
