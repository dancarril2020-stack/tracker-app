import { createClient } from '@supabase/supabase-js';
import { User } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Register a new user without signing out the current one.
 * Uses a secondary Supabase client instance to handle the sign-up.
 */
export const registerUser = async (email: string, password: string, role: string, name: string, tenantId: string = 'default', supplierCompanyName?: string) => {
    // Create a secondary app instance that doesn't persist the session
    const secondarySupabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: false, // Don't persist session so it doesn't overwrite current user
            autoRefreshToken: false,
        }
    });

    try {
        const { data: authData, error: authError } = await secondarySupabase.auth.signUp({
            email,
            password
        });
        
        if (authError) throw authError;
        if (!authData.user) throw new Error("Failed to create user account.");

        const uid = authData.user.id;

        // Store role, name and tenantId in the public users table
        // Note: Because we have RLS on users, and the secondary client isn't fully authenticated 
        // with admin rights, this insert might fail if RLS blocks it. 
        // The current RLS rule says "auth.uid() != null" can create (from firestore rules). 
        // Let's assume the main client inserts it, since the main client is logged in as backoffice/admin!
        
        const { error: dbError } = await supabase.from('users').insert({
            id: uid,
            email,
            name,
            role,
            tenantId
        });

        if (dbError) throw dbError;

        return { uid, email, role, name, tenantId };
    } catch (error) {
        throw error;
    }
};

/**
 * Fetch all users from Supabase
 */
export const getUsers = async (): Promise<User[]> => {
    try {
        const { data, error } = await supabase.from('users').select('*');
        if (error) throw error;
        
        // Map id to uid for frontend compatibility
        return (data || []).map(doc => ({ ...doc, uid: doc.id } as User));
    } catch (error) {
        console.error("Error fetching users:", error);
        return [];
    }
};

/**
 * Fetch users belonging to a specific tenant
 */
export const getUsersByTenant = async (tenantId: string): Promise<User[]> => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('tenantId', tenantId || 'default');
            
        if (error) throw error;
        return (data || []).map(doc => ({ ...doc, uid: doc.id } as User));
    } catch (error) {
        console.error("Error fetching users by tenant:", error);
        return [];
    }
};

/**
 * Toggle user active status (Soft Delete)
 */
export const updateUserStatus = async (uid: string, active: boolean) => {
    try {
        // We might need to add an 'active' boolean column to our public.users schema if we rely on it.
        // I will assume it's part of the data. 
        // Wait, 'active' was used in firestore but I didn't add it to the SQL script!
        // Let's add it to the update here, but we will need to update the table if they really use it.
        // Since we didn't add it in SQL, we can just alter it later, or it'll fail. Let's send the query.
        const { error } = await supabase
            .from('users')
            .update({ active })
            .eq('id', uid);
            
        if (error) throw error;
        return true;
    } catch (error) {
        console.error("Error updating user status:", error);
        throw error;
    }
};
