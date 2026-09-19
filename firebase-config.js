// Public Firebase web config - safe to expose client-side. Access control
// is enforced by Firestore security rules (firestore.rules), not by hiding
// these values; they're meant to be embedded in client code like this.
const firebaseConfig = {
  apiKey: "AIzaSyCaXyZ4uAME4f2C7UPkKXI_-2pZhwoWiRA",
  authDomain: "receptsamling-59b55.firebaseapp.com",
  projectId: "receptsamling-59b55",
  storageBucket: "receptsamling-59b55.firebasestorage.app",
  messagingSenderId: "307835765296",
  appId: "1:307835765296:web:84ba8155decf498e3be3f5"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
