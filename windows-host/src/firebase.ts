import { initializeApp } from 'firebase/app'
import { getDatabase, ref, set, onValue, push, remove, onDisconnect } from 'firebase/database'
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBYbqpXPTQN6OQgdgwjoiBPkJcCOaqMsqs",
  authDomain: "hearth-326b6.firebaseapp.com",
  projectId: "hearth-326b6",
  databaseURL: "https://hearth-326b6-default-rtdb.firebaseio.com",
  storageBucket: "hearth-326b6.firebasestorage.app",
  messagingSenderId: "347216482701",
  appId: "1:347216482701:web:90c44a2754d31fcf912dc4",
  measurementId: "G-RWQPLR0E7Y"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig)

// Initialize Realtime Database
export const db = getDatabase(app)

// Initialize Auth
export const auth = getAuth(app)

export { ref, set, onValue, push, remove, onDisconnect, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged }
