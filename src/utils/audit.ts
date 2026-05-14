import { db, collection, addDoc } from '../firebase';

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
    LOGIN: 'Login' // Optional, but good for tracking
};

import { User } from './types';

/**
 * Logs a user action to the 'audit_logs' collection.
 * @param {User | null} currentUser - The user object from AuthContext
 * @param {string} action - One of the ACTIONS constants
 * @param {string} details - Human readable details
 * @param {string|null} recordId - ID of the record being acted upon
 * @param {any|null} metadata - Any extra data (snapshot of previous state etc)
 */
export async function logAction(currentUser: any, action: string, details: string, recordId: string | null = null, metadata: any = null) {
    try {
        if (!currentUser) return; // Should not happen in auth'd app

        await addDoc(collection(db, 'audit_logs'), {
            timestamp: Date.now(), // Store as number for easier range queries
            userId: currentUser.uid,
            userEmail: currentUser.email,
            userName: currentUser.name || currentUser.email,
            userRole: currentUser.role || 'unknown',
            tenantId: currentUser.tenantId || 'default', // Critical for isolation
            action,
            details,
            recordId,
            metadata, // Optional extra data
        });
    } catch (error) {
        console.error("Failed to log action:", error);
        // We do typically NOT want to block the user if logging fails, so we just log to console.
    }
}
