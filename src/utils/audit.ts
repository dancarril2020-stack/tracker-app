import { supabase } from '../supabase';

export const ACTIONS = {
    LOAD_ITEM: 'Load Item',
    DELIVER_ITEM: 'Deliver Item',
    CREATE_ITEM: 'Create New Item', // Manual Delivery or misc
    EDIT_LOAD: 'Edit Load',
    EDIT_DELIVERY: 'Edit Delivery',
    DELETE_LOAD: 'Delete Load',
    DELETE_DELIVERY: 'Delete Delivery',
    PICKUP_ITEM: 'Pick-up',
    DELIVERY_FAILED: 'Delivery Failed',
    UPDATE: 'Update',
    LOGIN: 'Login' // Optional, but good for tracking
};

/**
 * Logs a user action to the 'audit_logs' table.
 * @param {any | null} currentUser - The user object from AuthContext
 * @param {string} action - One of the ACTIONS constants
 * @param {string} details - Human readable details
 * @param {string|null} recordId - ID of the record being acted upon
 * @param {any|null} metadata - Any extra data (snapshot of previous state etc)
 */
export async function logAction(currentUser: any, action: string, details: string, recordId: string | null = null, metadata: any = null) {
    try {
        if (!currentUser) return; // Should not happen in auth'd app

        // We use the new schema structure which requires 'action', 'userId', and 'details' (jsonb)
        await supabase.from('audit_logs').insert({
            action,
            userId: currentUser.id || currentUser.uid, // Handle both Supabase user.id and legacy uid just in case
            details: {
                message: details,
                recordId,
                metadata,
                userEmail: currentUser.email,
                userName: currentUser.name || currentUser.email,
                userRole: currentUser.role || 'unknown',
                tenantId: currentUser.tenantId || 'default'
            }
        });
    } catch (error) {
        console.error("Failed to log action:", error);
    }
}
