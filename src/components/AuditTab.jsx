import React, { useState, useEffect } from 'react';
import { db, collection, query, orderBy, limit, getDocs } from '../firebase';

export default function AuditTab() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'audit_logs'),
                orderBy('timestamp', 'desc'),
                limit(100)
            );
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLogs(data);
        } catch (error) {
            console.error("Error fetching logs:", error);
        }
        setLoading(false);
    };

    const getActionColor = (action) => {
        if (action.includes('Delete')) return '#ef4444'; // Red
        if (action.includes('Edit')) return '#f59e0b'; // Amber
        if (action.includes('Deliver')) return '#10b981'; // Green
        return 'var(--primary)'; // Default
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0 }}>Audit Logs</h2>
                <button onClick={fetchLogs} className="secondary-button" style={{ fontSize: '0.9rem' }}>
                    Refresh
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading logs...</div>
            ) : logs.length === 0 ? (
                <div className="glass-panel" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No logs found.
                </div>
            ) : (
                <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
                                    <th style={{ padding: '1rem', textAlign: 'left' }}>Time</th>
                                    <th style={{ padding: '1rem', textAlign: 'left' }}>User</th>
                                    <th style={{ padding: '1rem', textAlign: 'left' }}>Action</th>
                                    <th style={{ padding: '1rem', textAlign: 'left' }}>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.8rem 1rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem' }}>
                                            <div style={{ fontWeight: 'bold' }}>{log.userName}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.userRole}</div>
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem' }}>
                                            <span style={{
                                                padding: '0.2rem 0.6rem',
                                                borderRadius: '4px',
                                                background: `${getActionColor(log.action)}20`, // 20% opacity
                                                color: getActionColor(log.action),
                                                fontWeight: 'bold',
                                                fontSize: '0.8rem',
                                                border: `1px solid ${getActionColor(log.action)}40`
                                            }}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem' }}>
                                            {log.details}
                                            {log.recordId && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>ID: {log.recordId}</div>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
