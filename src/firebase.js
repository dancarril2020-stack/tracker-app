import { initializeApp, deleteApp } from "firebase/app";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword
} from "firebase/auth";
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    getDocs,
    orderBy,
    limit,
    arrayUnion,
    Timestamp,
    onSnapshot
} from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Register a new user without signing out the current one.
 * Uses a secondary Firebase app instance to handle the sign-up.
 */
export const registerUser = async (email, password, role, name, tenantId = 'default') => {
    // Create a secondary app instance
    const secondaryApp = initializeApp(firebaseConfig, "Secondary");
    const secondaryAuth = getAuth(secondaryApp);

    try {
        const res = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const uid = res.user.uid;

        // Store role, name and tenantId in Firestore
        const userData = {
            email,
            role,
            name,
            tenantId,
            active: true, // Default to active
            createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, "users", uid), userData);

        // Sign out of the secondary instance and delete the app
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);

        return { uid, email, role, name, tenantId };
    } catch (error) {
        // Clean up even on error
        await deleteApp(secondaryApp);
        throw error;
    }
};

/**
 * Fetch all users from Firestore
 */
export const getUsers = async () => {
    try {
        const q = query(collection(db, "users"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching users:", error);
        return [];
    }
};

/**
 * Fetch users belonging to a specific tenant
 */
export const getUsersByTenant = async (tenantId) => {
    try {
        const q = query(collection(db, "users"), where("tenantId", "==", tenantId || 'default'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching users by tenant:", error);
        return [];
    }
};

/**
 * Toggle user active status (Soft Delete)
 */
export const updateUserStatus = async (uid, active) => {
    try {
        await updateDoc(doc(db, "users", uid), { active });
        return true;
    } catch (error) {
        console.error("Error updating user status:", error);
        throw error;
    }
};

export {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    collection,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    getDocs,
    orderBy,
    limit,
    arrayUnion,
    Timestamp,
    onSnapshot
};

export default {};
