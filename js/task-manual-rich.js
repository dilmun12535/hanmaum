// 제한된 서식만 허용하여 Firestore에 저장된 HTML을 안전하게 표시합니다.
export function cleanManualHtml(input){
 const allowed=new Set(['P','DIV','BR','STRONG','B','EM','I','U','S','H2','H3','H4','UL','OL','LI','TABLE','THEAD','TBODY','TR','TH','TD','A','SPAN','BLOCKQUOTE']);
 const root=document.createElement('div');root.innerHTML=String(input||'');
 const walk=node=>{for(const child of [...node.children]){if(!allowed.has(child.tagName)){child.replaceWith(document.createTextNode(child.textContent||''));continue;}
   for(const attr of [...child.attributes]){const n=attr.name.toLowerCase(),v=attr.value;
     if(n==='href'&&child.tagName==='A'&&/^https?:\/\//i.test(v)){child.setAttribute('target','_blank');child.setAttribute('rel','noopener noreferrer');continue;}
     if(n==='style'&&/^(SPAN|P|DIV|TD|TH|H2|H3|H4)$/.test(child.tagName)){
       const color=(v.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8}|rgb\([\d\s,]+\))/i)||[])[1];
       child.removeAttribute('style');if(color)child.style.color=color;const bg=(v.match(/(?:^|;)\s*background(?:-color)?\s*:\s*(#[0-9a-f]{3,8}|rgb\([\d\s,]+\))/i)||[])[1];if(bg&&['TD','TH'].includes(child.tagName))child.style.backgroundColor=bg;continue;
     }
     if(['TD','TH'].includes(child.tagName)&&['colspan','rowspan'].includes(n)&&/^[1-9]\d?$/.test(v)){continue;}child.removeAttribute(attr.name);
   }walk(child);
 }};walk(root);return root.innerHTML;
}
export function legacyManualHtml(m){
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const p=s=>esc(s).replace(/\n/g,'<br>');
 return [['업무 개요',m.overview],['진행 순서',m.steps],['주의사항',m.cautions]].filter(x=>x[1]).map(([h,v])=>`<h3>${h}</h3><p>${p(v)}</p>`).join('')+( /^https?:\/\//i.test(m.link||'')?`<p><a href="${esc(m.link)}">참고 링크</a></p>`:'');
}
export function manualEditorMarkup(m){return `<div class="rich-toolbar" role="toolbar" aria-label="매뉴얼 편집 도구">
 <select data-format="block" aria-label="문단 형식"><option value="P">본문</option><option value="H2">큰 제목</option><option value="H3">소제목</option></select>
 <button type="button" data-cmd="bold" title="굵게"><b>굵게</b></button><button type="button" data-cmd="italic" title="기울임"><i>기울임</i></button><button type="button" data-cmd="underline" title="밑줄"><u>밑줄</u></button>
 <label>글자색 <input type="color" data-color value="#1f2937" aria-label="글자색"></label>
 <button type="button" data-cmd="insertUnorderedList">글머리</button><button type="button" data-cmd="insertOrderedList">번호 목록</button>
 <button type="button" data-table>표 삽입</button>
 <span class="rich-table-tools" data-table-tools style="display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center">
 <button type="button" data-table-action="row-above">위에 행 +</button><button type="button" data-table-action="row-below">아래에 행 +</button><button type="button" data-table-action="row-delete">행 삭제</button>
 <button type="button" data-table-action="col-left">왼쪽 열 +</button><button type="button" data-table-action="col-right">오른쪽 열 +</button><button type="button" data-table-action="col-delete">열 삭제</button>
 <label>셀 배경 <input type="color" data-cell-bg value="#fff2cc" aria-label="선택한 셀 배경색"></label>
 <button type="button" data-table-action="table-delete">표 삭제</button></span><button type="button" data-link>링크</button><button type="button" data-cmd="removeFormat">서식 지우기</button>
 </div><div class="rich-editor" contenteditable="true" role="textbox" aria-label="매뉴얼 본문" aria-multiline="true" data-rich-editor>${cleanManualHtml(m.html||legacyManualHtml(m))}</div>
 <p class="rich-help">표 안의 셀을 클릭한 뒤 위쪽 도구에서 행·열을 추가하거나 삭제할 수 있습니다. 내용을 선택한 뒤 굵게·색상 등 서식을 적용하세요.</p>`}
export function wireManualEditor(modal){const editor=modal.querySelector('[data-rich-editor]');const bar=modal.querySelector('.rich-toolbar');let range=null,activeCell=null;
 const saveRange=()=>{const sel=window.getSelection();if(sel.rangeCount&&editor.contains(sel.anchorNode))range=sel.getRangeAt(0).cloneRange()};
 const restore=()=>{editor.focus();if(range){const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range)}};
 editor.addEventListener('keyup',saveRange);editor.addEventListener('mouseup',saveRange);
 editor.addEventListener('click',e=>{const cell=e.target.closest('td,th');activeCell=cell&&editor.contains(cell)?cell:null;saveRange()});
 editor.addEventListener('focusin',e=>{const cell=e.target.closest?.('td,th');if(cell&&editor.contains(cell))activeCell=cell});
 const emptyCell=()=>{const td=document.createElement('td');td.appendChild(document.createElement('br'));return td};
 const notifyCell=()=>{if(!activeCell||!editor.contains(activeCell)){alert('먼저 표 안의 셀을 클릭하세요.');return false}return true};
 const tableAction=action=>{if(!notifyCell())return;const cell=activeCell,row=cell.closest('tr'),table=cell.closest('table');if(!row||!table)return;
  const index=[...row.cells].indexOf(cell);const rows=[...table.rows];
  if(action==='table-delete'){if(confirm('표 전체를 삭제할까요?')){table.remove();activeCell=null}return}
  if(action==='row-above'||action==='row-below'){const newRow=document.createElement('tr');for(let i=0;i<row.cells.length;i++)newRow.appendChild(emptyCell());row.parentNode.insertBefore(newRow,action==='row-above'?row:row.nextSibling);activeCell=newRow.cells[Math.min(index,newRow.cells.length-1)];return}
  if(action==='row-delete'){const parent=row.parentNode;row.remove();activeCell=null;if(!table.rows.length)table.remove();return}
  if(action==='col-left'||action==='col-right'){for(const r of rows){const at=Math.min(index+(action==='col-right'?1:0),r.cells.length);r.insertBefore(emptyCell(),r.cells[at]||null)}activeCell=row.cells[Math.min(index+(action==='col-right'?1:0),row.cells.length-1)];return}
  if(action==='col-delete'){for(const r of rows){if(r.cells[index])r.cells[index].remove()}activeCell=null;if(!table.querySelector('td,th'))table.remove();return}
 };
 bar.querySelectorAll('[data-table-action]').forEach(b=>b.onclick=()=>tableAction(b.dataset.tableAction));
 bar.querySelector('[data-cell-bg]').addEventListener('input',e=>{if(notifyCell())activeCell.style.backgroundColor=e.target.value});
 bar.addEventListener('mousedown',e=>{if(e.target.closest('button'))e.preventDefault()});
 bar.querySelectorAll('[data-cmd]').forEach(b=>b.onclick=()=>{restore();document.execCommand(b.dataset.cmd,false,null);saveRange()});
 bar.querySelector('[data-format]').onchange=e=>{restore();document.execCommand('formatBlock',false,e.target.value);saveRange()};
 bar.querySelector('[data-color]').oninput=e=>{restore();document.execCommand('foreColor',false,e.target.value);saveRange()};
 bar.querySelector('[data-table]').onclick=()=>{restore();const rows=Math.min(12,Math.max(1,Number(prompt('표 행 수 (1~12)','3'))||3));const cols=Math.min(8,Math.max(1,Number(prompt('표 열 수 (1~8)','3'))||3));const html='<table><tbody>'+Array.from({length:rows},()=>'<tr>'+Array.from({length:cols},()=>'<td>내용 입력</td>').join('')+'</tr>').join('')+'</tbody></table><p><br></p>';document.execCommand('insertHTML',false,html);saveRange()};
 bar.querySelector('[data-link]').onclick=()=>{saveRange();const url=prompt('연결할 URL (https://...)');if(!url)return;if(!/^https?:\/\//i.test(url)){alert('http 또는 https 링크만 사용할 수 있습니다.');return}restore();document.execCommand('createLink',false,url);saveRange()};
 editor.addEventListener('paste',e=>{e.preventDefault();const text=e.clipboardData.getData('text/plain');document.execCommand('insertText',false,text)});
 return ()=>cleanManualHtml(editor.innerHTML);
}
