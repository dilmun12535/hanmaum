import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBZW5OJX5vfoVUPRf3ynpfkJXI3W38_wQc",
  authDomain: "hanmaum-a59f7.firebaseapp.com",
  projectId: "hanmaum-a59f7",
  storageBucket: "hanmaum-a59f7.firebasestorage.app",
  messagingSenderId: "100242885568",
  appId: "1:100242885568:web:ba9d5a2a2dc46a4139d625",
  measurementId: "G-8WS3FLQCGC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
