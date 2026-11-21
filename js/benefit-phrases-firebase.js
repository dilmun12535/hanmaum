import {auth,db} from './firebase-config.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {doc,getDoc,onSnapshot,setDoc,updateDoc,deleteField,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
const ref=doc(db,'portalSettings','benefitOpinionPhrases');
const mappingRef=doc(db,'portalSettings','benefitOpinionMappings');
let unsubscribe=null,mappingUnsubscribe=null,admin=false,current={};
const showError=e=>{const el=document.getElementById('phraseStatus');if(el)el.textContent='문구 설정 불러오기 실패: '+e.message;};
const set=async(name,kind,value)=>{
 if(!admin)throw Error('관리자 권한이 필요합니다.');
 // 하나의 문서에 급여별 템플릿을 보관합니다. 필드명은 URL 인코딩합니다.
 const key=encodeURIComponent(name);
 await updateDoc(ref,{[`phrases.${key}.${kind}`]:value,updatedAt:serverTimestamp()}).catch(async e=>{
  if(e.code==='not-found')await setDoc(ref,{phrases:{[key]:{[kind]:value}},updatedAt:serverTimestamp()});
  else throw e;
 });
};
const remove=async(name,kind)=>{
 if(!admin)throw Error('관리자 권한이 필요합니다.');
 const key=encodeURIComponent(name);
 await updateDoc(ref,{[`phrases.${key}.${kind}`]:deleteField(),updatedAt:serverTimestamp()});
};
onAuthStateChanged(auth,async user=>{
 if(unsubscribe){unsubscribe();unsubscribe=null;}if(mappingUnsubscribe){mappingUnsubscribe();mappingUnsubscribe=null;}
 if(!user){window.location.href="../index.html";return;}
 try{
  const snap=await getDoc(doc(db,'users',user.uid));
  admin=snap.exists()&&snap.data().role==='admin';
  window.benefitWizardSetUser?.(user.uid);
  window.benefitPhraseReady?.({admin,templates:current,set,remove});
  unsubscribe=onSnapshot(ref,s=>{current=s.exists()?(s.data().phrases||{}):{};window.benefitPhraseChanged?.(current)},showError);
  mappingUnsubscribe=onSnapshot(mappingRef,s=>window.benefitMappingsChanged?.(s.exists()?s.data().entries||[]:[]),showError);
 }catch(e){showError(e)}
});
