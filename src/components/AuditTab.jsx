import React, { useState, useEffect } from 'react';
import { db, collection, query, orderBy, limit, getDocs, where, addDoc, getUsersByTenant, getUsers } from '../firebase'; // Added imports
import { useAuth } from '../contexts/AuthContext';
import { generateAuditCSV, parseAuditCSV } from '../utils/csvHelper'; // Added helpers

export default function AuditTab() {
    const { tenantId } = useAuth();
    const isSuperAdmin = tenantId === 'admin';

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedDriver, setSelectedDriver] = useState('all');
    const [drivers, setDrivers] = useState([]);

    useEffect(() => {
        fetchDrivers();
        fetchLogs();
    }, []);

    // Re-fetch when filters change (optional, or use a button)
    useEffect(() => {
        fetchLogs();
    }, [startDate, endDate, selectedDriver]);

    const fetchDrivers = async () => {
        try {
            const allUsers = isSuperAdmin ? await getUsers() : await getUsersByTenant(tenantId);
            setDrivers(allUsers.filter(u => u.role === 'driver'));
        } catch (err) {
            console.error("Error fetching drivers:", err);
        }
    };

    const fetchLogs = async () => {
        setLoading(true);
        try {
            let q;
            const auditRef = collection(db, 'audit_logs');

            // 1. Basic Server Side Query (Security first)
            if (!isSuperAdmin) {
                // Regular users only see their tenant logs. 
                // NOTE: Combining where() and orderBy() requires a manual COMPOSITE INDEX in Firestore.
                // To avoid requiring manual setup, we fetch a large batch and sort client-side.
                q = query(auditRef,
                    where('tenantId', '==', tenantId),
                    limit(1000)
                );
            } else {
                // Super Admin sees everything. Single field orderBy works without manual index.
                q = query(auditRef,
                    orderBy('timestamp', 'desc'),
                    limit(1000)
                );
            }

            const snapshot = await getDocs(q);
            let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 2. Normalize Timestamps for Sorting/Filtering
            // Old logs: ISO String, New logs: Number (ms)
            data = data.map(log => {
                let ts = log.timestamp;
                if (typeof ts === 'string') {
                    ts = new Date(ts).getTime();
                }
                return { ...log, normalizedTimestamp: ts || 0 };
            });

            // 3. Client-Side Filters
            // Date Filter
            if (startDate) {
                const startTs = new Date(startDate).getTime();
                data = data.filter(log => log.normalizedTimestamp >= startTs);
            }
            if (endDate) {
                const endTs = new Date(endDate);
                endTs.setHours(23, 59, 59, 999);
                data = data.filter(log => log.normalizedTimestamp <= endTs.getTime());
            }

            // Driver Filter
            if (selectedDriver !== 'all') {
                data = data.filter(log => log.userId === selectedDriver);
            }

            // 4. Sort Descending
            data.sort((a, b) => b.normalizedTimestamp - a.normalizedTimestamp);

            // 5. Final Display Limit
            setLogs(data.slice(0, 200));

        } catch (error) {
            console.error("CRITICAL ERROR FETCHING LOGS:", error);
            alert("Failed to load audit logs. Check console for details.");
        }
        setLoading(false);
    };

    const handleExport = () => {
        if (logs.length === 0) return;
        const csv = generateAuditCSV(logs);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const csvText = event.target.result;
            const parsedLogs = parseAuditCSV(csvText);

            if (window.confirm(`Import ${parsedLogs.length} logs? This will add them to the database.`)) {
                setLoading(true);
                try {
                    let count = 0;
                    for (const log of parsedLogs) {
                        const { id, ...logData } = log;
                        const newLog = {
                            ...logData,
                            timestamp: Number(logData.timestamp) || Date.now(),
                            tenantId: isSuperAdmin ? (logData.tenantId || 'admin') : tenantId
                        };
                        await addDoc(collection(db, 'audit_logs'), newLog);
                        count++;
                    }
                    alert(`Successfully imported ${count} logs.`);
                    fetchLogs();
                } catch (err) {
                    console.error("Import error:", err);
                    alert("Error importing logs.");
                }
                setLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const getActionColor = (action) => {
        if (action.includes('Delete')) return '#ef4444'; // Red
        if (action.includes('Edit') || action.includes('Update')) return '#f59e0b'; // Amber
        if (action.includes('Deliver')) return '#10b981'; // Green
        if (action.includes('Load')) return '#3b82f6'; // Blue
        if (action.includes('Pick-up')) return '#8b5cf6'; // Violet
        if (action.includes('Create')) return '#06b6d4'; // Cyan
        return 'var(--primary)'; // Default
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0 }}>Audit Logs</h2>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button onClick={handleExport} className="secondary-button" disabled={logs.length === 0}>
                            ⬇️ Export CSV
                        </button>
                        <label className="secondary-button" style={{ cursor: 'pointer' }}>
                            ⬆️ Import CSV
                            <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
                        </label>
                        <button onClick={fetchLogs} className="secondary-button" style={{ marginLeft: '0.5rem' }}>
                            🔄 Refresh
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="glass-panel" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Driver / User</label>
                        <select
                            value={selectedDriver}
                            onChange={(e) => setSelectedDriver(e.target.value)}
                            style={{ padding: '0.6rem', borderRadius: '4px', border: '1px solid var(--border)', minWidth: '150px' }}
                        >
                            <option value="all">All Users</option>
                            {drivers.map(d => (
                                <option key={d.uid} value={d.uid}>{d.name || d.email}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Showing max 100 results per query
                    </div>
                </div>
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
                                        <td style={{ padding: '0.8rem 1rem', whiteSpace: 'pre-wrap', verticalAlign: 'top', lineHeight: '1.4' }}>
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
