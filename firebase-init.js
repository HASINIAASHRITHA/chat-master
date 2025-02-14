// Initialize Firebase with custom settings
const firebaseConfig = {
    apiKey: "AIzaSyB1GlCP0IcEpMZDCinLZHkCtXH8GY9Bh2s",
    authDomain: "chat-master-dd098.firebaseapp.com",
    projectId: "chat-master-dd098",
    storageBucket: "chat-master-dd098.firebasestorage.app",
    messagingSenderId: "390893590330",
    appId: "1:390893590330:web:3ef78516f7de018fdee203",
    measurementId: "G-GHBV078JGK"
};

// Initialize Firebase with merge option
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app();
}

// Configure Firestore settings
const firestoreDB = firebase.firestore();
firestoreDB.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    merge: true // Add merge option
});

// Enable Firestore persistence with multi-tab support
firestoreDB.enablePersistence({
    synchronizeTabs: true  // Enable multi-tab synchronization
}).catch((error) => {
    if (error.code === 'failed-precondition') {
        console.warn("Multiple tabs open. Persistence only works in one tab at a time.");
    } else if (error.code === 'unimplemented') {
        console.warn("Browser doesn't support persistence");
    } else {
        console.error("Firestore persistence error:", error);
    }
});

// Configure Firebase Auth to use local persistence
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch((error) => {
        console.error("Auth persistence error:", error);
    });

// Export the initialized services
window.db = firestoreDB;
window.auth = firebase.auth();
window.storage = firebase.storage();
