import {auth,db} from './firebase-config.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {doc,getDoc,collection,query,where,onSnapshot,addDoc,updateDoc,deleteDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const $=id=>document.getElementById(id);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
async function profile(user){const snap=await getDoc(doc(db,'users',user.uid));return snap.exists()?snap.data():{}}
function msg(id,t){$(id).textContent=t}
function safe(t){return String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export {auth,db,onAuthStateChanged,doc,getDoc,collection,query,where,onSnapshot,addDoc,updateDoc,deleteDoc,serverTimestamp,$,today,profile,msg,safe};
