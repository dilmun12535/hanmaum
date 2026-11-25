import {auth,db} from './firebase-config.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {doc,getDoc,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const ref=doc(db,'portalSettings','timelyNoticeRoster');
let admin=false;
window.saveSharedRoster=async rows=>{if(!admin)throw Error('관리자 권한이 필요합니다.');await setDoc(ref,{people:rows.map(p=>({name:String(p.name||''),birth:String(p.birth||''),grade:String(p.grade||''),days:Array.from({length:7},(_,i)=>Boolean(p.days[i]))})),updatedAt:serverTimestamp()});};
onAuthStateChanged(auth,async user=>{window.rosterReady=false;admin=false;window.setRosterAccess(false);if(!user){document.getElementById('saved').textContent='로그인이 필요합니다.';return;}try{const [profile,snap]=await Promise.all([getDoc(doc(db,'users',user.uid)),getDoc(ref)]);admin=profile.exists()&&profile.data().role==='admin';const rows=snap.exists()?snap.data().people:[];if(!Array.isArray(rows))throw Error('등원요일 데이터 형식 오류');window.applySharedRoster(rows.map(p=>({...p,days:Array.from({length:7},(_,i)=>Boolean(p.days?.[i]))})),admin);window.setRosterAccess(admin);}catch(e){document.getElementById('saved').textContent='공용 등원요일 불러오기 실패: '+e.message;}});
