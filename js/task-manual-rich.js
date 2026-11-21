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
          if (['TD','TH'].includes(child.tagName)) {
            for (const side of ['top','right','bottom','left']) {
              const match = value.match(new RegExp('(?:^|;)\\s*border-' + side + '\\s*:\\s*(none|(?:0(?:\\.5)?|1|1\\.5|2|3|4)px\\s+(?:solid|dashed|dotted)\\s+(?:#[0-9a-f]{3,8}|rgb\\([\\d\\s,]+\\)))\\s*(?:;|$)', 'i'));
              if (match) child.style.setProperty('border-' + side, match[1]);
            }
          }
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
  const ico = (name,body) => `<button type="button" title="${name}" aria-label="${name}">${body}</button>`;
  return `<style>
  .rich-toolbar{display:flex!important;align-items:center;flex-wrap:wrap;gap:5px;padding:9px!important;background:#f5f8fd;border:1px solid #d9e4f4;border-radius:11px;position:relative}
  .rich-toolbar button,.rich-table-tools button{font:inherit;min-width:34px;min-height:34px;padding:6px 9px;border:1px solid #d2ddec;background:white;border-radius:7px;color:#243653;cursor:pointer}
  .rich-toolbar button:hover,.rich-table-tools button:hover{background:#e9f1ff;border-color:#9bbaf6}
  .rich-toolbar select{height:35px;border:1px solid #d2ddec;border-radius:7px;background:white;padding:0 7px;max-width:98px}
  .rich-toolbar .rich-sep{width:1px;height:23px;background:#d6e1ef;margin:0 2px}
  .rich-toolbar .rich-color{display:flex;align-items:center;gap:3px;border:1px solid #d2ddec;border-radius:7px;background:#fff;padding:4px 7px;height:35px;box-sizing:border-box}
  .rich-toolbar input[type=color]{width:22px;height:23px;padding:0;border:0;background:transparent;cursor:pointer}
  .rich-table-pop{position:absolute;z-index:1000;top:calc(100% + 5px);left:0;max-width:calc(100vw - 48px);width:274px;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:white;box-shadow:0 12px 30px #17255426}
  .rich-table-pop[hidden],.rich-table-tools[hidden]{display:none!important}
  .rich-grid{display:grid;grid-template-columns:repeat(10,19px);gap:3px;margin:10px 0;user-select:none}
  .rich-grid button{width:19px;height:19px;min-width:19px;min-height:19px;padding:0;border:1px solid #cbd5e1;border-radius:2px;background:#fff}
  .rich-grid button.selected{background:#bfdbfe;border-color:#2563eb}
  .rich-grid-caption{text-align:center;font-size:13px;color:#334155}
  .rich-table-tools{position:fixed!important;z-index:1100;max-width:270px;min-width:215px;padding:7px!important;background:#fff!important;border:1px solid #cbd5e1!important;border-radius:10px!important;box-shadow:0 12px 35px #0f172a2b;display:flex;flex-direction:column;align-items:stretch!important;gap:2px!important}
  .rich-table-tools button{width:100%;text-align:left;border:0;background:transparent;min-height:32px;padding:7px 10px}
  .rich-table-tools .rich-menu-title{padding:5px 9px;font-size:12px;font-weight:700;color:#64748b}
  .rich-table-tools .rich-menu-divider{height:1px;background:#e2e8f0;margin:3px 0}
  .rich-table-tools .rich-menu-bg{display:flex;align-items:center;justify-content:space-between;padding:5px 10px;font-size:13px}
  .rich-table-tools .rich-menu-bg input{width:28px;height:27px;border:0;padding:0}
  .rich-border-pop{position:absolute;z-index:1010;top:calc(100% + 5px);left:180px;width:265px;max-width:calc(100vw - 40px);padding:13px;background:white;border:1px solid #cbd5e1;border-radius:11px;box-shadow:0 12px 30px #17255426}
   .rich-border-pop[hidden]{display:none!important}
   .rich-border-pop label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:9px 0;font-size:13px;color:#334155}
   .rich-border-pop select{max-width:none;width:150px}
   .rich-border-pop .border-positions{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:10px}
   .rich-border-pop .border-positions button{font-size:12px;min-width:0;padding:7px 3px}
   .rich-border-pop .border-positions button[data-border-position=all]{background:#eaf1ff;color:#1d4ed8}
   .rich-editor{min-height:280px}
  </style>
  <div class="rich-toolbar" role="toolbar" aria-label="매뉴얼 편집 도구">
    <select data-format="block" aria-label="문단 형식"><option value="P">본문</option><option value="H2">큰 제목</option><option value="H3">소제목</option></select>
    <span class="rich-sep"></span>
    <button type="button" data-cmd="bold" title="굵게 (Ctrl+B)" aria-label="굵게"><b>B</b></button>
    <button type="button" data-cmd="italic" title="기울임 (Ctrl+I)" aria-label="기울임"><i>I</i></button>
    <button type="button" data-cmd="underline" title="밑줄 (Ctrl+U)" aria-label="밑줄"><u>U</u></button>
    <label class="rich-color" title="글자색">A <input type="color" data-color value="#1f2937" aria-label="글자색"></label>
    <span class="rich-sep"></span>
    <button type="button" data-cmd="insertUnorderedList" title="글머리표" aria-label="글머리표">☷</button>
    <button type="button" data-cmd="insertOrderedList" title="번호 목록" aria-label="번호 목록">1.</button>
    <span class="rich-sep"></span>
    <button type="button" data-table title="표 삽입" aria-expanded="false">▦ <span style="font-size:12px">표 ▾</span></button>
    <button type="button" data-border-toggle title="표 테두리 설정" aria-expanded="false">▤ <span style="font-size:12px">테두리 ▾</span></button>
    <button type="button" data-link title="링크 삽입" aria-label="링크 삽입">🔗</button>
    <button type="button" data-cmd="removeFormat" title="서식 지우기" aria-label="서식 지우기">⌫</button>
    <div class="rich-border-pop" data-border-pop hidden>
      <strong style="font-size:13px">표 테두리</strong>
      <p style="margin:6px 0 10px;font-size:12px;color:#64748b">표 안의 셀을 먼저 클릭하세요.</p>
      <label>선 굵기 <select data-border-width><option value="0.5">0.5px</option><option value="1" selected>1px</option><option value="1.5">1.5px</option><option value="2">2px</option><option value="3">3px</option><option value="4">4px</option></select></label>
      <label>선 모양 <select data-border-style><option value="solid">실선 ━━━</option><option value="dashed">파선 ┄┄┄</option><option value="dotted">점선 ·····</option></select></label>
      <label>선 색상 <input type="color" data-border-color value="#94a3b8" aria-label="테두리 색상"></label>
      <div class="border-positions">
        <button type="button" data-border-position="all">전체</button><button type="button" data-border-position="outer">바깥쪽</button><button type="button" data-border-position="inner">안쪽</button>
        <button type="button" data-border-position="top">위쪽</button><button type="button" data-border-position="bottom">아래쪽</button><button type="button" data-border-position="left">왼쪽</button><button type="button" data-border-position="right">오른쪽</button><button type="button" data-border-position="none">테두리 없음</button><button type="button" data-border-close>닫기</button>
      </div>
    </div>
    <div class="rich-table-pop" data-table-pop hidden><strong style="font-size:13px">표 삽입</strong><div class="rich-grid" data-table-grid role="group" aria-label="표 행과 열 선택"></div><div class="rich-grid-caption" data-grid-caption>마우스로 크기를 선택하세요</div></div>
  </div>
  <div class="rich-table-tools" data-table-tools hidden role="menu" aria-label="표 편집 메뉴">
    <div class="rich-menu-title">표 편집</div>
    <button type="button" data-table-action="row-above">＋ 위에 행 삽입</button>
    <button type="button" data-table-action="row-below">＋ 아래에 행 삽입</button>
    <button type="button" data-table-action="col-left">＋ 왼쪽에 열 삽입</button>
    <button type="button" data-table-action="col-right">＋ 오른쪽에 열 삽입</button>
    <div class="rich-menu-divider"></div>
    <button type="button" data-table-action="row-delete">－ 행 삭제</button>
    <button type="button" data-table-action="col-delete">－ 열 삭제</button>
    <label class="rich-menu-bg">셀 배경색 <input type="color" data-cell-bg value="#fff2cc" aria-label="셀 배경색"></label>
    <div class="rich-menu-divider"></div>
    <button type="button" data-table-action="table-delete" style="color:#b91c1c">표 전체 삭제</button>
    <button type="button" data-table-close>닫기</button>
  </div>
  <div class="rich-editor" contenteditable="true" role="textbox" aria-label="매뉴얼 본문" aria-multiline="true" data-rich-editor>${cleanManualHtml(m.html || legacyManualHtml(m))}</div>
  <p class="rich-help">표를 삽입하려면 ▦ 표를 누르세요. 표 안의 셀을 클릭한 뒤 상단의 테두리 메뉴에서 선 굵기·모양·색상을 설정하세요. 행·열 편집은 마우스 오른쪽 버튼을 사용하세요.</p>`;
}

export function wireManualEditor(modal) {
  const editor = modal.querySelector('[data-rich-editor]');
  const bar = modal.querySelector('.rich-toolbar');
  const tools = modal.querySelector('[data-table-tools]');
  const pop = modal.querySelector('[data-table-pop]');
  const grid = modal.querySelector('[data-table-grid]');
  const caption = modal.querySelector('[data-grid-caption]');
  const borderPop = modal.querySelector('[data-border-pop]');
  let range = null, activeCell = null;
  const showTools = (show, x, y) => { tools.hidden = !show; if (show) { const w = 270, h = 340; tools.style.left = Math.max(8, Math.min(x ?? 100, window.innerWidth - w - 8)) + 'px'; tools.style.top = Math.max(8, Math.min(y ?? 100, window.innerHeight - h - 8)) + 'px'; } };
  const closeBorder = () => { borderPop.hidden = true; bar.querySelector('[data-border-toggle]').setAttribute('aria-expanded','false'); };
  const closePop = () => { pop.hidden = true; bar.querySelector('[data-table]').setAttribute('aria-expanded','false'); };
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
    if (!activeCell) showTools(false);
  };
  editor.addEventListener('keyup', () => { saveRange(); selectCell(window.getSelection()?.anchorNode); });
  editor.addEventListener('mouseup', () => { saveRange(); selectCell(window.getSelection()?.anchorNode); });
  editor.addEventListener('click', e => { selectCell(e.target); saveRange(); });
  editor.addEventListener('focusin', e => selectCell(e.target));
  editor.addEventListener('contextmenu', e => { const cell = e.target.closest?.('td,th'); if (!cell || !editor.contains(cell)) return; e.preventDefault(); activeCell = cell; saveRange(); closePop(); closeBorder(); showTools(true, e.clientX, e.clientY); });
  document.addEventListener('pointerdown', e => { if (!tools.contains(e.target)) showTools(false); if (!pop.contains(e.target) && !e.target.closest('[data-table]')) closePop(); if (!borderPop.contains(e.target) && !e.target.closest('[data-border-toggle]')) closeBorder(); });
  tools.querySelector('[data-table-close]').onclick = () => { activeCell = null; showTools(false); };
  // 테두리 설정은 선택한 셀을 기준으로 하며, 바깥/안쪽은 해당 표 전체에 적용합니다.
  const borderButton = bar.querySelector('[data-border-toggle]');
  borderButton.onclick = () => {
    if (!borderPop.hidden) { closeBorder(); return; }
    if (!activeCell || !editor.contains(activeCell)) { alert('표 안의 셀을 먼저 클릭하세요.'); return; }
    closePop(); showTools(false); borderPop.hidden = false;
    borderButton.setAttribute('aria-expanded','true');
  };
  borderPop.querySelector('[data-border-close]').onclick = closeBorder;
  const borderFor = (cell, side, val) => cell.style.setProperty('border-' + side, val);
  borderPop.querySelectorAll('[data-border-position]').forEach(button => button.onclick = () => {
    if (!activeCell || !editor.contains(activeCell)) { closeBorder(); return alert('표 안의 셀을 먼저 클릭하세요.'); }
    const table = activeCell.closest('table');
    const rows = [...table.rows];
    const rowIndex = rows.findIndex(r => [...r.cells].includes(activeCell));
    const colIndex = [...activeCell.parentElement.cells].indexOf(activeCell);
    const cells = [...table.querySelectorAll('td,th')];
    const position = button.dataset.borderPosition;
    const width = borderPop.querySelector('[data-border-width]').value;
    const style = borderPop.querySelector('[data-border-style]').value;
    const color = borderPop.querySelector('[data-border-color]').value;
    const val = position === 'none' ? 'none' : `${width}px ${style} ${color}`;
    const apply = (cell, sides) => sides.forEach(side => borderFor(cell, side, val));
    const sides = ['top','right','bottom','left'];
    if (position === 'all' || position === 'none') cells.forEach(c => apply(c,sides));
    else if (position === 'outer' || position === 'inner') {
      rows.forEach((r,ri) => [...r.cells].forEach((c,ci) => {
        const edge = {top:ri===0,bottom:ri===rows.length-1,left:ci===0,right:ci===r.cells.length-1};
        apply(c,sides.filter(side => position==='outer' ? edge[side] : !edge[side]));
      }));
    } else apply(activeCell,[position]);
    closeBorder();
  });
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
      activeCell = newRow.cells[Math.min(index, newRow.cells.length - 1)]; showTools(false); return;
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
      activeCell = row.cells[Math.min(index + (action === 'col-right' ? 1 : 0), row.cells.length - 1)]; showTools(false); return;
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
  const insertTable = (rows, cols) => {
    restore();
    const html = '<table><tbody>' + Array.from({length:rows}, () => '<tr>' + Array.from({length:cols}, () => '<td>내용 입력</td>').join('') + '</tr>').join('') + '</tbody></table><p><br></p>';
    document.execCommand('insertHTML', false, html); saveRange(); closePop();
  };
  for(let r=1;r<=8;r++) for(let c=1;c<=10;c++){
    const cell=document.createElement('button');cell.type='button';cell.dataset.rows=r;cell.dataset.cols=c;cell.title=`${c}열 × ${r}행`;cell.setAttribute('aria-label',cell.title);
    cell.addEventListener('pointerenter',()=>{grid.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',Number(b.dataset.rows)<=r&&Number(b.dataset.cols)<=c));caption.textContent=`${c}열 × ${r}행`;});
    cell.addEventListener('click',()=>insertTable(r,c));grid.appendChild(cell);
  }
  bar.querySelector('[data-table]').onclick = () => { if(pop.hidden){saveRange();pop.hidden=false;bar.querySelector('[data-table]').setAttribute('aria-expanded','true')}else closePop(); };
  bar.querySelector('[data-link]').onclick = () => {
    saveRange(); const url = prompt('연결할 URL (https://...)'); if (!url) return;
    if (!/^https?:\/\//i.test(url)) { alert('http 또는 https 링크만 사용할 수 있습니다.'); return; }
    restore(); document.execCommand('createLink', false, url); saveRange();
  };
  editor.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
  return () => cleanManualHtml(editor.innerHTML);
}
