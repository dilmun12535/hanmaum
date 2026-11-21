// Firestore에 저장하는 매뉴얼 HTML은 허용된 태그와 속성만 남깁니다.
export function cleanManualHtml(input) {
  const allowed = new Set(['P','DIV','BR','STRONG','B','EM','I','U','S','H2','H3','H4','UL','OL','LI','TABLE','THEAD','TBODY','TR','TH','TD','A','SPAN','BLOCKQUOTE']);
  const root = document.createElement('div');
  root.innerHTML = String(input || '');
  const walk = node => {
    for (const child of [...node.children]) {
      if (!allowed.has(child.tagName)) {
        const fragment = document.createDocumentFragment();
        while (child.firstChild) fragment.appendChild(child.firstChild);
        child.replaceWith(fragment);
        walk(node);
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase(), value = attr.value;
        if (name === 'href' && child.tagName === 'A' && /^https?:\/\//i.test(value)) {
          child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer'); continue;
        }
        if (name === 'style' && /^(SPAN|P|DIV|TD|TH|H2|H3|H4)$/.test(child.tagName)) {
          const color = (value.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8}|rgb\([\d\s,]+\))/i) || [])[1];
          const bg = (value.match(/(?:^|;)\s*background(?:-color)?\s*:\s*(#[0-9a-f]{3,8}|rgb\([\d\s,]+\))/i) || [])[1];
          child.removeAttribute('style');
          if (color) child.style.color = color;
          if (bg && ['TD','TH'].includes(child.tagName)) child.style.backgroundColor = bg;
          continue;
        }
        if (['TD','TH'].includes(child.tagName) && ['colspan','rowspan'].includes(name) && /^[1-9]\d?$/.test(value)) continue;
        child.removeAttribute(attr.name);
      }
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

export function legacyManualHtml(m) {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const p = s => esc(s).replace(/\n/g, '<br>');
  return [['업무 개요',m.overview],['진행 순서',m.steps],['주의사항',m.cautions]]
    .filter(x => x[1]).map(([h,v]) => `<h3>${h}</h3><p>${p(v)}</p>`).join('') +
    (/^https?:\/\//i.test(m.link || '') ? `<p><a href="${esc(m.link)}">참고 링크</a></p>` : '');
}

export function manualEditorMarkup(m) {
  return `<div class="rich-toolbar" role="toolbar" aria-label="매뉴얼 편집 도구" style="display:flex;flex-wrap:wrap;align-items:center;gap:5px">
    <select data-format="block" aria-label="문단 형식"><option value="P">본문</option><option value="H2">큰 제목</option><option value="H3">소제목</option></select>
    <button type="button" data-cmd="bold" title="굵게" aria-label="굵게"><b>가</b></button>
    <button type="button" data-cmd="italic" title="기울임" aria-label="기울임"><i>가</i></button>
    <button type="button" data-cmd="underline" title="밑줄" aria-label="밑줄"><u>가</u></button>
    <label title="글자색" aria-label="글자색" style="display:inline-flex;align-items:center;gap:3px;font-size:12px">색 <input type="color" data-color value="#1f2937" aria-label="글자색" style="width:26px;height:26px;padding:1px"></label>
    <button type="button" data-cmd="insertUnorderedList" title="글머리표" aria-label="글머리표">☷</button>
    <button type="button" data-cmd="insertOrderedList" title="번호 목록" aria-label="번호 목록">1.</button>
    <button type="button" data-table title="표 삽입">▦ 표</button>
    <button type="button" data-link title="링크 삽입">🔗</button>
    <button type="button" data-cmd="removeFormat" title="서식 지우기" aria-label="서식 지우기">지우기</button>
  </div>
  <div class="rich-table-tools" data-table-tools hidden style="margin:8px 0;padding:9px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:9px;display:none;flex-wrap:wrap;gap:5px;align-items:center">
    <strong style="font-size:12px;margin-right:4px;color:#1e40af">표 편집</strong>
    <button type="button" data-table-action="row-above">위에 행 +</button>
    <button type="button" data-table-action="row-below">아래에 행 +</button>
    <button type="button" data-table-action="row-delete">행 삭제</button>
    <button type="button" data-table-action="col-left">왼쪽 열 +</button>
    <button type="button" data-table-action="col-right">오른쪽 열 +</button>
    <button type="button" data-table-action="col-delete">열 삭제</button>
    <label style="display:inline-flex;align-items:center;gap:3px;font-size:12px">셀 배경 <input type="color" data-cell-bg value="#fff2cc" aria-label="선택한 셀 배경색" style="width:28px;height:27px;padding:1px"></label>
    <button type="button" data-table-action="table-delete">표 삭제</button>
    <button type="button" data-table-close aria-label="표 도구 닫기" title="표 도구 닫기">×</button>
  </div>
  <div class="rich-editor" contenteditable="true" role="textbox" aria-label="매뉴얼 본문" aria-multiline="true" data-rich-editor>${cleanManualHtml(m.html || legacyManualHtml(m))}</div>
  <p class="rich-help">표의 셀을 클릭하면 행·열 편집 메뉴가 나타납니다. 일반 글을 클릭하면 자동으로 숨겨집니다.</p>`;
}

export function wireManualEditor(modal) {
  const editor = modal.querySelector('[data-rich-editor]');
  const bar = modal.querySelector('.rich-toolbar');
  const tools = modal.querySelector('[data-table-tools]');
  let range = null, activeCell = null;
  const showTools = show => { tools.hidden = !show; tools.style.display = show ? 'flex' : 'none'; };
  const saveRange = () => {
    const sel = window.getSelection();
    if (sel.rangeCount && editor.contains(sel.anchorNode)) range = sel.getRangeAt(0).cloneRange();
  };
  const restore = () => {
    editor.focus();
    if (range) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
  };
  const selectCell = node => {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const cell = el?.closest?.('td,th');
    activeCell = cell && editor.contains(cell) ? cell : null;
    showTools(Boolean(activeCell));
  };
  editor.addEventListener('keyup', () => { saveRange(); selectCell(window.getSelection()?.anchorNode); });
  editor.addEventListener('mouseup', () => { saveRange(); selectCell(window.getSelection()?.anchorNode); });
  editor.addEventListener('click', e => { selectCell(e.target); saveRange(); });
  editor.addEventListener('focusin', e => selectCell(e.target));
  tools.querySelector('[data-table-close]').onclick = () => { activeCell = null; showTools(false); };
  const emptyCell = () => { const td = document.createElement('td'); td.appendChild(document.createElement('br')); return td; };
  const notifyCell = () => {
    if (!activeCell || !editor.contains(activeCell)) { showTools(false); alert('먼저 표 안의 셀을 클릭하세요.'); return false; }
    return true;
  };
  const tableAction = action => {
    if (!notifyCell()) return;
    const cell = activeCell, row = cell.closest('tr'), table = cell.closest('table');
    if (!row || !table) return;
    const index = [...row.cells].indexOf(cell), rows = [...table.rows];
    if (action === 'table-delete') {
      if (confirm('표 전체를 삭제할까요?')) { table.remove(); activeCell = null; showTools(false); }
      return;
    }
    if (action === 'row-above' || action === 'row-below') {
      const newRow = document.createElement('tr');
      for (let i = 0; i < row.cells.length; i++) newRow.appendChild(emptyCell());
      row.parentNode.insertBefore(newRow, action === 'row-above' ? row : row.nextSibling);
      activeCell = newRow.cells[Math.min(index, newRow.cells.length - 1)]; return;
    }
    if (action === 'row-delete') {
      row.remove(); activeCell = table.rows[0]?.cells[0] || null;
      if (!table.rows.length) table.remove(); showTools(Boolean(activeCell)); return;
    }
    if (action === 'col-left' || action === 'col-right') {
      for (const r of rows) {
        const at = Math.min(index + (action === 'col-right' ? 1 : 0), r.cells.length);
        r.insertBefore(emptyCell(), r.cells[at] || null);
      }
      activeCell = row.cells[Math.min(index + (action === 'col-right' ? 1 : 0), row.cells.length - 1)]; return;
    }
    if (action === 'col-delete') {
      for (const r of rows) if (r.cells[index]) r.cells[index].remove();
      activeCell = table.querySelector('td,th');
      if (!activeCell) table.remove(); showTools(Boolean(activeCell));
    }
  };
  tools.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  tools.querySelectorAll('[data-table-action]').forEach(b => b.onclick = () => tableAction(b.dataset.tableAction));
  tools.querySelector('[data-cell-bg]').addEventListener('input', e => { if (notifyCell()) activeCell.style.backgroundColor = e.target.value; });
  bar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  bar.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => { restore(); document.execCommand(b.dataset.cmd, false, null); saveRange(); });
  bar.querySelector('[data-format]').onchange = e => { restore(); document.execCommand('formatBlock', false, e.target.value); saveRange(); };
  bar.querySelector('[data-color]').oninput = e => { restore(); document.execCommand('foreColor', false, e.target.value); saveRange(); };
  bar.querySelector('[data-table]').onclick = () => {
    restore();
    const rowInput = prompt('표 행 수 (1~12)', '3'); if (rowInput === null) return;
    const colInput = prompt('표 열 수 (1~8)', '3'); if (colInput === null) return;
    const rows = Math.min(12, Math.max(1, Number(rowInput) || 3));
    const cols = Math.min(8, Math.max(1, Number(colInput) || 3));
    const html = '<table><tbody>' + Array.from({length:rows}, () => '<tr>' + Array.from({length:cols}, () => '<td>내용 입력</td>').join('') + '</tr>').join('') + '</tbody></table><p><br></p>';
    document.execCommand('insertHTML', false, html); saveRange();
  };
  bar.querySelector('[data-link]').onclick = () => {
    saveRange(); const url = prompt('연결할 URL (https://...)'); if (!url) return;
    if (!/^https?:\/\//i.test(url)) { alert('http 또는 https 링크만 사용할 수 있습니다.'); return; }
    restore(); document.execCommand('createLink', false, url); saveRange();
  };
  editor.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
  return () => cleanManualHtml(editor.innerHTML);
}
