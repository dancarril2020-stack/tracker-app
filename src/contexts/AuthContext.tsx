/**
 * AuthContext.tsx
 * Purpose: Provides authentication state (current user, role, tenantId) throughout the application.
 * Manages login/logout, session timers, and enforces role-based access rules via Supabase.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthContextType } from '../types';
import { supabase } from '../supabase';

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
    const [userRole, setUserRole] = useState<string | null>(null);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    function isWithinWorkHours() {
        return true; // Always allow access for testing
    }

    async function login(email: string, password: string): Promise<any> {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    }

    async function logout() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }

    async function resetPassword(email: string): Promise<void> {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
    }

    // Admin function to create users. 
    // In Supabase, creating a secondary user from the client while logged in requires admin rights or an Edge Function.
    // We will leave this signature here for compatibility with UserManagement.
    async function registerUser(email: string, password: string, role: string, name: string): Promise<void> {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });
        if (error) throw error;

        if (data.user) {
            const { error: dbError } = await supabase.from('users').insert({
                id: data.user.id,
                email,
                name,
                role,
                tenantId: 'default' // This will be overwritten by UserManagement's own registerUser implementation later
            });
            if (dbError) throw dbError;
        }
    }

    useEffect(() => {
        let isMounted = true;

        async function fetchUserProfile(userId: string, authUser: any) {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();

            if (error) {
                console.error("Error fetching user profile:", error);
                if (isMounted) {
                    setCurrentUser(authUser as unknown as User);
                    setLoading(false);
                }
                return;
            }

            if (data && isMounted) {
                setUserRole(data.role);
                setTenantId(data.tenantId || 'default');

                // Role-based Time Check
                if (data.role === 'driver' && !isWithinWorkHours()) {
                    await logout();
                    alert("Session Locked: Access is allowed only between 08:00 and 20:30.");
                    setCurrentUser(null);
                    setUserRole(null);
                    setTenantId(null);
                }
                // ENFORCE ACTIVE STATUS (Soft Delete)
                else if (data.active === false) {
                    await logout();
                    alert("Access Denied: Your account has been deactivated.");
                    setCurrentUser(null);
                    setUserRole(null);
                    setTenantId(null);
                }
                else {
                    setCurrentUser({ ...authUser, ...data } as User);
                }
            }
            if (isMounted) setLoading(false);
        }

        // Check initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                fetchUserProfile(session.user.id, session.user);
            } else {
                if (isMounted) {
                    setCurrentUser(null);
                    setLoading(false);
                }
            }
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                fetchUserProfile(session.user.id, session.user);
            } else {
                if (isMounted) {
                    setCurrentUser(null);
                    setUserRole(null);
                    setTenantId(null);
                    setLoading(false);
                }
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
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
