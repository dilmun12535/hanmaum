import {auth,db} from './firebase-config.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {doc,getDoc,collection,query,where,onSnapshot,addDoc,updateDoc,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const $=id=>document.getElementById(id);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
async function profile(user){const snap=await getDoc(doc(db,'users',user.uid));return snap.exists()?snap.data():{}}
function msg(id,t){$(id).textContent=t}
function safe(t){return String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export {auth,db,onAuthStateChanged,doc,getDoc,collection,query,where,onSnapshot,addDoc,updateDoc,deleteDoc,serverTimestamp,$,today,profile,msg,safe};

// 출근표 미등록 시 안전하게 자동 배정하지 않음.
export const working = mark => ['○','O','o','●','⊙','△'].includes(String(mark||'').trim());
export const offDuty = mark => ['X','x','Ⅹ','-','―','－','◐'].includes(String(mark||'').trim());
export function periodFor(t,date){const d=new Date(date+'T12:00:00');if(t.cycle==='daily'||t.cycle==='once')return date;if(t.cycle==='monthly')return date.slice(0,7);d.setDate(d.getDate()-(d.getDay()+6)%7);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
export function dueFor(t,date){const d=new Date(date+'T12:00:00');const pad=n=>String(n).padStart(2,'0');if(t.cycle==='daily')return date;if(t.cycle==='once')return t.rule;if(t.cycle==='monthly'){const [y,m]=date.split('-').map(Number);return `${y}-${pad(m)}-${pad(t.rule==='last'?new Date(y,m,0).getDate():Math.min(Number(t.rule),new Date(y,m,0).getDate()))}`}d.setDate(d.getDate()+(Number(t.rule)-d.getDay()+7)%7);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
export function activeUid(a,date,schedules){const main=schedules.find(s=>s.uid===a.assigneeUid&&s.date===date);if(main&&working(main.mark))return a.assigneeUid;if(main&&offDuty(main.mark)){const backup=schedules.find(s=>s.uid===a.backupUid&&s.date===date);return backup&&working(backup.mark)?a.backupUid:null}return null}
