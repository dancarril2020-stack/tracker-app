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
    LOGIN: 'Login' // Optional, but good for tracking
};

/**
 * Logs a user action to the 'audit_logs' collection.
 * @param {Object} currentUser - The user object from AuthContext
 * @param {string} action - One of the ACTIONS constants
 * @param {string} details - Human readable details
 * @param {string|null} recordId - ID of the record being acted upon
 * @param {Object|null} metadata - Any extra data (snapshot of previous state etc)
 */
export async function logAction(currentUser, action, details, recordId = null, metadata = null) {
    try {
        if (!currentUser) return; // Should not happen in auth'd app

        await addDoc(collection(db, 'audit_logs'), {
            timestamp: new Date().toISOString(),
            userEmail: currentUser.email,
            userName: currentUser.name || currentUser.email,
            userRole: currentUser.role || 'unknown',
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
