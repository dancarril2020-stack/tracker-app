
/**
 * Utility to help manage Morning vs Afternoon sessions.
 * Morning: Up to 13:30
 * Afternoon: After 13:30
 */

export const SESSION_THRESHOLD = "13:30";

/**
 * Returns the current session based on the system time.
 * @returns {'morning' | 'afternoon'}
 */
export function getCurrentSession() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // 13:30 threshold
    if (hours < 13 || (hours === 13 && minutes <= 30)) {
        return 'morning';
    }
    return 'afternoon';
}

/**
 * Formatting helper for display
 * @param {string} session 
 * @returns {string}
 */
export function formatSessionLabel(session) {
    if (session === 'morning') return 'Morning (up to 13:30)';
    if (session === 'afternoon') return 'Afternoon (after 13:30)';
    return 'Unknown Session';
}
