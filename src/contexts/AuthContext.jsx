import React, { createContext, useContext, useState, useEffect } from 'react';
import {
    auth,
    db,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    doc,
    getDoc,
    setDoc
} from '../firebase';


const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [userRole, setUserRole] = useState(null); // 'driver', 'office', 'backoffice'
    const [tenantId, setTenantId] = useState(null); // Multi-tenant support
    const [loading, setLoading] = useState(true);

    // Time Lock Configuration (Disabled for Testing)
    const WORK_START_HOUR = 0;
    const WORK_END_HOUR = 24;
    const WORK_END_MINUTE = 59;

    function isWithinWorkHours() {
        return true; // Always allow access for testing
    }

    function login(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    }

    function logout() {
        return signOut(auth);
    }

    // Admin function to create users (Place in dedicated Admin context later or keep here if simple)
    async function registerUser(email, password, role, name) {
        // Note: Creating a secondary user while logged in is tricky in Firebase client SDK
        // Usually requires a secondary Admin App or Cloud Function.
        // For this demo, we might simulated it or require re-auth. 
        // We will stick to the architecture plan but noting this constraint.
        const res = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", res.user.uid), {
            email,
            role,
            name,
            createdAt: new Date().toISOString()
        });
    }

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Fetch Role
                const docRef = doc(db, "users", user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const userData = docSnap.data();
                    setUserRole(userData.role);
                    setTenantId(userData.tenantId || 'default'); // fallback for existing users

                    // Role-based Time Check
                    if (userData.role === 'driver' && !isWithinWorkHours()) {
                        await logout();
                        alert("Session Locked: Access is allowed only between 08:00 and 20:30.");
                        setCurrentUser(null);
                    setUserRole(null);
                    setTenantId(null);
                    } else {
                        setCurrentUser({ ...user, ...userData });
                    }
                } else {
                    // Fallback if user has no doc (shouldn't happen in production)
                    setCurrentUser(user);
                }
            } else {
                setCurrentUser(null);
                setUserRole(null);
            }
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    // Periodic Time Checker for active sessions
    useEffect(() => {
        const interval = setInterval(() => {
            if (currentUser && userRole === 'driver') {
                if (!isWithinWorkHours()) {
                    logout().then(() => {
                        alert("End of Shift: Session automatically closed (20:30).");
                        window.location.reload();
                    });
                }
            }
        }, 60000); // Check every minute

        return () => clearInterval(interval);
    }, [currentUser, userRole]);

    const value = {
        currentUser,
        userRole,
        tenantId,
        login,
        logout,
        registerUser
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
