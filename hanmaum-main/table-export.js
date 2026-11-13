(function(){
  const configs={
    'meal-check.html':['식사 제공 확인','.meal-table'],
    'bath-check.html':['목욕 제공 확인','.info-table'],
    'toilet-check.html':['화장실 제공 확인','.info-table'],
    'cognitive-check.html':['인지활동 제공 확인','.cognitive-table'],
    'therapy-check.html':['물리치료 제공 확인','.therapy-check-table'],
    'nursing-vital-check.html':['간호제공 확인','.split-check-table'],
    'medication-check.html':['투약 확인','.split-check-table'],
    'meal-bath-check.html':['정량_목욕의자 확인','table']
  };
  function clean(s){return String(s||'').replace(/\s+/g,' ').trim()}
  function month(){const el=document.getElementById('checkMonth'); return clean(el?.value||'').replace('-','')||new Date().toISOString().slice(0,7).replace('-','')}
  function exportTable(title, selector){
    if(typeof XLSX==='undefined'){alert('엑셀 기능을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');return;}
    const table=document.querySelector(selector); if(!table){alert('다운로드할 결과표가 없습니다.');return;}
    const clone=table.cloneNode(true);
    clone.querySelectorAll('button,input,select,textarea').forEach(x=>x.remove());
    clone.querySelectorAll('tr.empty-row').forEach(x=>x.remove());
    const rows=[...clone.rows].map(tr=>[...tr.cells].map(td=>clean(td.innerText)));
    if(rows.length<2){alert('먼저 확인 결과를 불러와주세요.');return;}
    const ws=XLSX.utils.aoa_to_sheet(rows), wb=XLSX.utils.book_new();
    ws['!cols']=rows[0].map((_,i)=>({wch:Math.min(45,Math.max(10,...rows.map(r=>clean(r[i]).length+2)))}));
    XLSX.utils.book_append_sheet(wb,ws,'확인결과'); XLSX.writeFile(wb,`${title}_${month()}.xlsx`);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const key=location.pathname.split('/').pop(), cfg=configs[key]; if(!cfg)return;
    const host=document.querySelector('.page-actions')||document.querySelector('.page-header'); if(!host)return;
    const b=document.createElement('button'); b.type='button'; b.textContent='엑셀 다운로드'; b.className='btn';
    b.style.cssText='background:#16a34a;color:white;border:0;border-radius:10px;padding:11px 18px;font-weight:700;cursor:pointer;margin-left:10px;';
    b.addEventListener('click',()=>exportTable(cfg[0],cfg[1])); host.appendChild(b);
  });
})();
