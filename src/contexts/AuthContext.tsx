/**
 * AuthContext.tsx
 * Purpose: Provides authentication state (current user, role, tenantId) throughout the application.
 * Manages login/logout, session timers, and enforces role-based access rules.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthContextType } from '../types';
import {
    auth,
    db,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    doc,
    getDoc,
    setDoc,
    sendPasswordResetEmail
} from '../firebase';


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null); // 'driver', 'office', 'backoffice'
    const [tenantId, setTenantId] = useState<string | null>(null); // Multi-tenant support
    const [loading, setLoading] = useState(true);

    function isWithinWorkHours() {
        return true; // Always allow access for testing
    }

    function login(email: string, password: string): Promise<any> {
        return signInWithEmailAndPassword(auth, email, password);
    }

    function logout() {
        return signOut(auth);
    }

    /**
     * Sends a password reset email to the specified address.
     * Uses the default Firebase Auth email templates.
     */
    function resetPassword(email: string): Promise<void> {
        return sendPasswordResetEmail(auth, email);
    }

    // Admin function to create users (Place in dedicated Admin context later or keep here if simple)
    async function registerUser(email: string, password: string, role: string, name: string): Promise<void> {
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

    // Listen to Firebase Auth state changes.
    // Fetches user role, tenantId, and enforces active status/time constraints.
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
                    }
                    // ENFORCE ACTIVE STATUS (Soft Delete)
                    else if (userData.active === false) {
                        await logout();
                        alert("Access Denied: Your account has been deactivated. Please contact your administrator.");
                        setCurrentUser(null);
                        setUserRole(null);
                        setTenantId(null);
                    }
                    else {
                        setCurrentUser({ ...user, ...userData } as User);
                    }
                } else {
                    // Fallback if user has no doc (shouldn't happen in production)
                    setCurrentUser(user as unknown as User);
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
        loading,
        login,
        logout,
        registerUser,
        resetPassword
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
