import React, { useState, useEffect, useMemo } from 'react';
import { db, collection, query, where, getDocs, orderBy, Timestamp, deleteDoc, doc, getUsers } from '../firebase';
import { logAction, ACTIONS } from '../utils/audit'; // Import audit

import { useAuth } from '../contexts/AuthContext';
import EditModal from './EditModal';

export default function DeliverySummary() {
    const { currentUser, userRole } = useAuth();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
    const [editingRecord, setEditingRecord] = useState(null);

    // Driver Filter State
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState('all');

    useEffect(() => {
        // Fetch Drivers on mount if user is office
        if (userRole === 'office' || userRole === 'backoffice') {
            const allUsers = getUsers();
            setDrivers(allUsers.filter(u => u.role === 'driver'));
        }
    }, [userRole]);

    useEffect(() => {
        fetchRecords();
    }, [summaryDate, currentUser, userRole, selectedDriver]);

    async function fetchRecords() {
        setLoading(true);
        try {
            const recordsRef = collection(db, "records");
            let q;

            // Role Logic: Office sees all (or filtered). Driver sees only their own.
            if (userRole === 'office' || userRole === 'backoffice') {
                const constraints = [where("date", "==", summaryDate)];

                if (selectedDriver !== 'all') {
                    constraints.push(where("driverId", "==", selectedDriver));
                }

                q = query(recordsRef, ...constraints);
            } else {
                q = query(
                    recordsRef,
                    where("date", "==", summaryDate),
                    where("driverId", "==", currentUser.uid)
                );
            }

            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Sort in memory
            data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            setRecords(data);
        } catch (err) {
            console.error(err);
        }
        setLoading(false);
    }

    // Edit Rules:
    const canEdit = (record) => {
        if (userRole === 'backoffice') return false;
        if (userRole === 'office') return true;

        // Driver logic
        const today = new Date().toISOString().split('T')[0];
        if (record.date !== today) return false;

        // Strict 23:59 check is implied by date check, as records are from today
        return true;
    };

    // Metrics
    const metrics = useMemo(() => {
        const loads = records.filter(r => r.type === 'load');
        const deliveries = records.filter(r => r.type === 'delivery');
        const pickups = records.filter(r => r.type === 'pickup');

        // Incident check: Sum of Missing Items (Quantity)
        // If pending: Missing all items.
        // If incident_missing: Missing the difference.
        // Incident check: Separate Missing vs Surplus
        let pendingCount = 0;
        let surplusCount = 0;

        loads.forEach(load => {
            const loadedQty = Number(load.quantity || 0);

            if (load.status === 'pending') {
                pendingCount += loadedQty;
            } else if (load.status === 'incident_missing') {
                const deliveredQty = Number(load.deliveredQuantity || 0);
                pendingCount += (loadedQty - deliveredQty);
            } else if (load.status === 'incident_excess') {
                const deliveredQty = Number(load.deliveredQuantity || 0);
                surplusCount += (deliveredQty - loadedQty);
            }
        });


        const sumQty = (arr) => arr.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);

        return {
            totalLoads: sumQty(loads),
            totalDeliveries: sumQty(deliveries),
            totalPickups: sumQty(pickups),
            pendingCount,
            surplusCount,
            reembolsoTotal: deliveries.reduce((acc, curr) => {
                const val = parseFloat((curr.reembolso || "0").replace(',', '.'));
                return acc + (isNaN(val) ? 0 : val);
            }, 0).toFixed(2)
        };
    }, [records]);

    if (loading) return <div className="glass-panel" style={{ textAlign: 'center' }}>Loading data...</div>;

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>

            {/* Date Filter & Metrics Header */}
            <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h2 style={{ margin: 0 }}>Daily Summary</h2>

                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {(userRole === 'office' || userRole === 'backoffice') && (
                            <select
                                value={selectedDriver}
                                onChange={(e) => setSelectedDriver(e.target.value)}
                                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                            >
                                <option value="all">All Drivers</option>
                                {drivers.map(d => (
                                    <option key={d.uid} value={d.uid}>
                                        {d.name || d.email}
                                    </option>
                                ))}
                            </select>
                        )}

                        <input
                            type="date"
                            value={summaryDate}
                            onChange={(e) => setSummaryDate(e.target.value)}
                            style={{ width: 'auto' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    <div className="metric-card">
                        <div className="metric-val">{metrics.totalLoads}</div>
                        <div className="metric-label">Loads</div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-val">
                            {metrics.pendingCount > 0 && (
                                <span style={{ color: '#ef4444' }}>{metrics.pendingCount}</span>
                            )}
                            {metrics.pendingCount > 0 && metrics.surplusCount > 0 && (
                                <span style={{ margin: '0 0.5rem', fontSize: '1rem', color: 'var(--text-muted)' }}>|</span>
                            )}
                            {metrics.surplusCount > 0 && (
                                <span style={{ color: '#f59e0b' }}>+{metrics.surplusCount}</span>
                            )}
                            {metrics.pendingCount === 0 && metrics.surplusCount === 0 && '0'}
                        </div>
                        <div className="metric-label">
                            {metrics.surplusCount > 0 && metrics.pendingCount > 0 ? 'Incidents' :
                                metrics.surplusCount > 0 ? 'Surplus' : 'Missing / Pending'}
                        </div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-val">{metrics.totalDeliveries}</div>
                        <div className="metric-label">Delivered</div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-val">{metrics.totalPickups}</div>
                        <div className="metric-label">Pick-ups</div>
                    </div>
                    <div className="metric-card" style={{ gridColumn: '1 / -1' }}>
                        <div className="metric-val">€ {metrics.reembolsoTotal}</div>
                        <div className="metric-label">Total Reembolso</div>
                    </div>
                </div>
            </div>

            {/* Record List */}
            <div style={{ display: 'grid', gap: '1rem' }}>
                {records.map(record => (
                    <div key={record.id} className="card" style={{
                        borderLeft: `4px solid ${record.type === 'load' ? '#3b82f6' :
                            record.type === 'delivery' ? '#22c55e' : '#f97316'
                            }`
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <span style={{
                                    textTransform: 'uppercase',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    color: 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem'
                                }}>
                                    {record.type}
                                    {record.status === 'pending' && (
                                        <span style={{ color: '#ef4444' }}>
                                            (PENDING <span style={{ fontSize: '0.9em' }}>x{record.quantity}</span>)
                                        </span>
                                    )}
                                    {record.status === 'incident_missing' && (
                                        <span style={{ color: '#ef4444' }}>
                                            (MISSING ITEMS <span style={{ fontSize: '0.9em' }}>x{Number(record.quantity) - Number(record.deliveredQuantity || 0)}</span>)
                                        </span>
                                    )}
                                    {record.status === 'incident_excess' && (
                                        <span style={{ color: '#f59e0b' }}>
                                            (SURPLUS <span style={{ fontSize: '0.9em' }}>x{Number(record.deliveredQuantity || 0) - Number(record.quantity)}</span>)
                                        </span>
                                    )}
                                    {record.status === 'delivery_failed' && (
                                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                                            (DELIVERY FAILED)
                                        </span>
                                    )}
                                    {record.auditHistory?.length > 0 && <span title="Edited" style={{ fontSize: '1rem' }}>📝</span>}
                                </span>
                                <h3 style={{ margin: '0.25rem 0' }}>{record.recipient}</h3>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    Albarán: <span style={{ color: 'var(--text-main)' }}>{record.remittance}</span>
                                </div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    <span style={{ color: '#f51519ff' }}>Notas:</span> <span style={{ color: 'var(--text-main)' }}>{record.volumen}</span>
                                </div>
                                {record.status === 'delivery_failed' && record.failureReason && (
                                    <div style={{ fontSize: '0.9rem', color: '#ef4444', marginTop: '0.2rem' }}>
                                        <strong>Reason:</strong> {record.failureReason}
                                    </div>
                                )}
                                {(userRole === 'office' || userRole === 'backoffice') && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '0.25rem' }}>
                                        Driver: {record.driverName}
                                    </div>
                                )}
                            </div>

                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: record.type === 'delivery' ? '#22c55e' : '#ef4444' }}>x{record.quantity}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {new Date(record.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                {record.reembolso && (
                                    <div style={{ marginTop: '0.5rem', color: (record.type === 'delivery' && (record.collectedValue ? record.collectedValue !== '0' : record.reembolso !== '0')) ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
                                        € {record.reembolso}
                                    </div>
                                )}
                            </div>
                        </div>

                        {canEdit(record) && (
                            <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                {(userRole === 'office' || userRole === 'backoffice') && (
                                    <button
                                        onClick={async () => {
                                            if (window.confirm("Are you sure you want to PERMANENTLY DELETE this record?")) {
                                                try {
                                                    await deleteDoc(doc(db, "records", record.id));

                                                    // LOG AUDIT
                                                    const actionType = record.type === 'load' ? ACTIONS.DELETE_LOAD : ACTIONS.DELETE_DELIVERY;
                                                    await logAction(currentUser, actionType, `Deleted ${record.type} record for ${record.recipient}`, record.id);

                                                    fetchRecords();
                                                } catch (err) {
                                                    alert("Error deleting: " + err.message);
                                                }
                                            }
                                        }}
                                        style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444' }}
                                    >
                                        Delete
                                    </button>
                                )}
                                <button
                                    onClick={() => setEditingRecord(record)}
                                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid var(--text-muted)', color: 'var(--text-muted)' }}
                                >
                                    Edit
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {editingRecord && (
                <EditModal
                    record={editingRecord}
                    onClose={() => setEditingRecord(null)}
                    onUpdate={fetchRecords}
                />
            )}

            <style>{`
        .metric-card {
          background: rgba(255, 255, 255, 0.05);
          padding: 1rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          text-align: center;
        }
        .metric-val {
          font-size: 1.5rem;
          font-weight: bold;
          color: var(--primary);
        }
        .metric-label {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-transform: uppercase;
          margin-top: 0.25rem;
        }
      `}</style>
        </div>
    );
}
