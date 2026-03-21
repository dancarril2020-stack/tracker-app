import React, { useState, useEffect, useMemo } from 'react';
import { db, collection, query, where, getDocs, orderBy, Timestamp, deleteDoc, doc, getUsersByTenant, updateDoc, setDoc } from '../firebase';
import { logAction, ACTIONS } from '../utils/audit'; // Import audit
import { generateCSV, parseCSV } from '../utils/csvHelper'; // Import CSV helper

import { useAuth } from '../contexts/AuthContext';
import EditModal from './EditModal';

export default function DeliverySummary() {
    const { currentUser, userRole, tenantId } = useAuth();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedSession, setSelectedSession] = useState('all'); // 'all', 'morning', 'afternoon'
    const [editingRecord, setEditingRecord] = useState(null);

    // Driver Filter State
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState('all');

    // Search State
    const [searchTerm, setSearchTerm] = useState('');


    // Type Filter State (for clickable metrics)
    const [selectedFilter, setSelectedFilter] = useState('all'); // 'all', 'loads', 'pending', 'delivered', 'pickups'

    useEffect(() => {
        async function fetchDrivers() {
            if (userRole === 'office' || userRole === 'backoffice') {
                const allUsers = await getUsersByTenant(tenantId);
                setDrivers(allUsers.filter(u => u.role === 'driver'));
            }
        }
        fetchDrivers();
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
                const constraints = [
                    where("date", "==", summaryDate),
                    where("tenantId", "==", tenantId || 'default')
                ];

                if (selectedDriver !== 'all') {
                    constraints.push(where("driverId", "==", selectedDriver));
                }

                q = query(recordsRef, ...constraints);
            } else {
                q = query(
                    recordsRef,
                    where("date", "==", summaryDate),
                    where("driverId", "==", currentUser.uid),
                    where("tenantId", "==", tenantId || 'default')
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

    // Delete Logic
    const handleDelete = async (record) => {
        if (!window.confirm("Are you sure you want to PERMANENTLY DELETE this record?")) return;

        try {
            // 1. Revert Load Status if deleting a Delivery
            if (record.type === 'delivery') {
                const q = query(
                    collection(db, "records"),
                    where("type", "==", "load"),
                    where("remittance", "==", record.remittance),
                    where("recipient", "==", record.recipient),
                    where("tenantId", "==", tenantId || 'default')
                );
                const snapshot = await getDocs(q);

                for (const docSnap of snapshot.docs) {
                    const load = docSnap.data();
                    const currentDelivered = Number(load.deliveredQuantity || 0);
                    const quantityRestored = Number(record.quantity || 0);

                    let newDelivered = currentDelivered - quantityRestored;
                    if (newDelivered < 0) newDelivered = 0;

                    let newStatus = 'pending';
                    if (newDelivered > 0 && newDelivered < Number(load.quantity)) {
                        newStatus = 'incident_missing';
                    } else if (newDelivered >= Number(load.quantity)) {
                        // Should not happen unless there are other deliveries, but keep it safe
                        newStatus = 'delivered';
                    }

                    await updateDoc(doc(db, "records", docSnap.id), {
                        deliveredQuantity: newDelivered,
                        status: newStatus,
                        linkedDeliveryTime: null // Clear link if full revert? Or keep last? Safe to clear or just leave.
                    });
                }
            }

            // 2. Delete the Record
            await deleteDoc(doc(db, "records", record.id));

            // 3. Log Audit
            const actionType = record.type === 'load' ? ACTIONS.DELETE_LOAD : ACTIONS.DELETE_DELIVERY;
            await logAction(currentUser, actionType, `Deleted ${record.type} record for ${record.recipient}`, record.id);

            fetchRecords();
        } catch (err) {
            console.error(err);
            alert("Error deleting: " + err.message);
        }
    };


    // --- EXPORT / IMPORT LOGIC ---
    const handleExport = () => {
        if (!records || records.length === 0) {
            alert("No records to export.");
            return;
        }
        const csvContent = generateCSV(records);
        const blobs = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blobs);

        link.setAttribute("href", url);
        link.setAttribute("download", `tvr_data_${summaryDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!window.confirm("WARNING: Importing data will OVERWRITE existing records with the same ID. Are you sure?")) {
            e.target.value = ''; // Reset input
            return;
        }

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target.result;
            try {
                const parsedRecords = parseCSV(text);
                if (parsedRecords.length === 0) {
                    alert("No valid records found in file.");
                    return;
                }

                setLoading(true);
                let count = 0;
                for (const record of parsedRecords) {
                    if (record.id) {
                        // Ensure we restore to the 'records' collection
                        // Convert empty strings for numbers if necessary, but string is usually safe for storage if app handles checks
                        // Ideally we should sanitize/validate date? Assuming trusted source.
                        const docRef = doc(db, "records", record.id);
                        await setDoc(docRef, record, { merge: true });
                        count++;
                    }
                }
                alert(`Successfully imported ${count} records.`);
                await logAction(currentUser, ACTIONS.UPDATE, `Imported ${count} records from CSV`, null);
                fetchRecords(); // Refresh view
            } catch (err) {
                console.error(err);
                alert("Error importing file: " + err.message);
            } finally {
                setLoading(false);
                e.target.value = ''; // Reset
            }
        };
        reader.readAsText(file);
    };

    // --- LOAD Action for Driver in Summary ---
    const handleLoadAction = async (load) => {
        if (!window.confirm(`Confirm loading: ${load.recipient}?`)) return;
        setLoading(true);
        try {
            await updateDoc(doc(db, "records", load.id), {
                status: 'pending', // Transitions to 'Loaded' list (and 'Pending' execution)
                loadedAt: new Date().toISOString()
            });
            await logAction(currentUser, ACTIONS.UPDATE, `Driver loaded items for ${load.recipient} (from Summary)`, load.id);
            fetchRecords(); // Refresh
        } catch (err) {
            console.error(err);
            alert("Error updating load: " + err.message);
        }
        setLoading(false);
    };

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

    // --- Memoized Filtered Records (Phase 1: Date/Driver/Session) ---
    const baseFilteredRecords = useMemo(() => {
        return records.filter(r => {
            if (selectedSession !== 'all' && r.session !== selectedSession) return false;
            return true;
        });
    }, [records, selectedSession]);

    // Metrics
    const metrics = useMemo(() => {
        const loads = baseFilteredRecords.filter(r => r.type === 'load');
        const deliveries = baseFilteredRecords.filter(r => r.type === 'delivery');
        const pickups = baseFilteredRecords.filter(r => r.type === 'pickup');

        // Incident check: Sum of Missing Items (Quantity)
        // If pending: Missing all items.
        // If incident_missing: Missing the difference.
        // Logic for Loads Metric: Loaded (pending) / Total (pending + assigned_load)
        // Note: 'pending' load means it is loaded on truck. 'assigned_load' means waiting.
        const assignedLoadsCount = loads.filter(l => l.status === 'assigned_load').reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
        const loadedLoadsCount = loads.filter(l => l.status !== 'assigned_load').reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
        // We include incidents in loaded count because they were loaded/attempted.

        const totalLoadsMetric = `${loadedLoadsCount} / ${loadedLoadsCount + assignedLoadsCount}`;

        // Incident check: Separate Missing vs Surplus
        let pendingCount = 0;
        let surplusCount = 0;
        let failedCount = 0;

        loads.filter(l => l.status !== 'assigned_load').forEach(load => {
            // Only count incidents/pending for items that represent "Active/Loaded" stock
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

        // Also count explicitly created 'delivery_failed' records
        const failedRecords = baseFilteredRecords.filter(r => r.type === 'delivery_failed');
        failedRecords.forEach(f => {
            failedCount += Number(f.quantity || 0);
        });

        const sumQty = (arr) => arr.reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);

        return {
            totalLoads: totalLoadsMetric,
            totalDeliveries: sumQty(deliveries),
            totalPickups: (() => {
                const completedCount = pickups.filter(p => p.status === 'completed_pickup').reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
                const assignedCount = pickups.filter(p => p.status === 'assigned').reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
                return `${completedCount} / ${completedCount + assignedCount}`;
            })(),
            pendingCount,
            surplusCount,
            failedCount,
            reembolsoTotal: [...deliveries, ...pickups].reduce((acc, curr) => {
                // Exclude 'assigned', 'assignment_complete', 'assigned_load', and 'pending' items
                if (['assigned', 'assignment_complete', 'assigned_load', 'pending'].includes(curr.status)) return acc;

                // Use collectedValue if present (actual collection), otherwise fallback to reembolso (expected/manual)
                const valStr = (curr.collectedValue || curr.reembolso || "0").toString();
                const val = parseFloat(valStr.replace(',', '.'));
                return acc + (isNaN(val) ? 0 : val);
            }, 0).toFixed(2)
        };
    }, [baseFilteredRecords]);


    // --- LOAD VIEW SUB-STATE ---
    const [loadViewMode, setLoadViewMode] = useState('assigned'); // 'assigned' | 'loaded'

    if (loading) return <div className="glass-panel" style={{ textAlign: 'center' }}>Loading data...</div>;

    // Filter Logic
    const getFilteredRecords = () => {
        let filtered = baseFilteredRecords.filter(record => {
            // Search Filter
            if (searchTerm) {
                const term = searchTerm.toLowerCase().trim();
                const recipient = (record.recipient || '').toLowerCase();
                if (!recipient.includes(term)) return false;
            }
            return true;
        });

        if (selectedFilter === 'loads') {
            // Apply Sub-Filter
            if (loadViewMode === 'assigned') {
                return filtered.filter(r => r.type === 'load' && r.status === 'assigned_load');
            } else {
                return filtered.filter(r => r.type === 'load' && r.status !== 'assigned_load');
            }
        } else if (selectedFilter === 'pending') {
            // Show "Remaining to Deliver" (Loaded but not fully delivered)
            return filtered.filter(r => r.type === 'load' && (r.status === 'pending' || r.status === 'incident_missing') && r.status !== 'assigned_load');
        } else if (selectedFilter === 'delivered') {
            return filtered.filter(r => r.type === 'delivery' || r.type === 'delivery_failed'); // Include failed in delivered history? Or separate? 
            // Usually delivered tab shows successes. Failed shows in 'Failed' metric, but maybe here too?
            // Let's stick to 'delivery' type.
        } else if (selectedFilter === 'pickups') {
            return filtered.filter(r => r.type === 'pickup');
        }

        return filtered; // 'all' - simplistic
    };

    const displayRecords = getFilteredRecords();

    // Helper to get border color based on record type/status
    const getStatusColor = (record) => {
        if (record.type === 'load') {
            if (record.status === 'assigned_load') return '#f59e0b'; // Orange for assigned
            return '#3b82f6'; // Blue for loaded/pending
        }
        if (record.type === 'delivery') return '#22c55e'; // Green
        if (record.type === 'delivery_failed') return '#ef4444'; // Red
        if (record.type === 'pickup') return '#f97316'; // Orange
        return 'var(--border)';
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>

            {/* Date Filter & Metrics Header */}
            <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h2 style={{ margin: 0 }}>Daily Summary</h2>

                    {/* EXPORT / IMPORT ACTIONS (Office Only) */}
                    {(userRole === 'office' || userRole === 'backoffice') && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button
                                onClick={handleExport}
                                className="secondary-button"
                            >
                                ⬇️ Export CSV
                            </button>
                            <label className="secondary-button" style={{ cursor: 'pointer' }}>
                                ⬆️ Import CSV
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleImport}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </div>
                    )}
                </div>

                {/* Filters Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>

                    {/* Session Filter */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <label className="label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0' }}>Session</label>
                        <select
                            value={selectedSession}
                            onChange={(e) => setSelectedSession(e.target.value)}
                            style={{ width: '100%', padding: '0.6rem', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.9rem' }}
                        >
                            <option value="all">📅 All Day</option>
                            <option value="morning">🌅 Morning</option>
                            <option value="afternoon">🌇 Afternoon</option>
                        </select>
                    </div>

                    {/* Driver Filter (Office Only) */}
                    {(userRole === 'office' || userRole === 'backoffice') && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <label className="label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0' }}>Driver</label>
                            <select
                                value={selectedDriver}
                                onChange={(e) => setSelectedDriver(e.target.value)}
                                style={{ width: '100%', padding: '0.6rem', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.9rem' }}
                            >
                                <option value="all">All Drivers</option>
                                {drivers.map(d => (
                                    <option key={d.uid} value={d.uid}>
                                        {d.name || d.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Date Filter */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <label className="label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0' }}>Date</label>
                        <input
                            type="date"
                            value={summaryDate}
                            onChange={(e) => setSummaryDate(e.target.value)}
                            style={{ width: '100%', padding: '0.6rem', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '0.9rem' }}
                        />
                    </div>
                </div>


                {/* Search Bar */}
                <div style={{ marginBottom: '1rem' }}>
                    <input
                        type="text"
                        placeholder="Search by customer/recipient..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '1rem' }}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    <div
                        className="metric-card"
                        onClick={() => setSelectedFilter(selectedFilter === 'loads' ? 'all' : 'loads')}
                        style={{
                            cursor: 'pointer',
                            border: selectedFilter === 'loads' ? '2px solid rgb(59, 130, 246)' : '1px solid var(--border)',
                        }}
                    >
                        <div className="metric-val" style={{ color: 'rgb(59, 130, 246)' }}>{metrics.totalLoads}</div>
                        <div className="metric-label">Loaded / Assigned</div>
                    </div>
                    <div
                        className="metric-card"
                        onClick={() => setSelectedFilter(selectedFilter === 'pending' ? 'all' : 'pending')}
                        style={{
                            cursor: 'pointer',
                            border: selectedFilter === 'pending' ? '2px solid rgb(239, 68, 68)' : '1px solid var(--border)',
                            boxShadow: selectedFilter === 'pending' ? '0 0 12px rgb(239, 68, 68)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
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
                            {metrics.failedCount > 0 && (
                                <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>
                                    (F: {metrics.failedCount})
                                </span>
                            )}
                            {metrics.pendingCount === 0 && metrics.surplusCount === 0 && metrics.failedCount === 0 && '0'}
                        </div>
                        <div className="metric-label">
                            {metrics.surplusCount > 0 && metrics.pendingCount > 0 ? 'Incidents' :
                                metrics.surplusCount > 0 ? 'Surplus' : 'Pending / Failed'}
                        </div>
                    </div>
                    <div
                        className="metric-card"
                        onClick={() => setSelectedFilter(selectedFilter === 'delivered' ? 'all' : 'delivered')}
                        style={{
                            cursor: 'pointer',
                            border: selectedFilter === 'delivered' ? '2px solid rgb(34, 197, 94)' : '1px solid var(--border)',
                            boxShadow: selectedFilter === 'delivered' ? '0 0 12px rgb(34, 197, 94)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        <div className="metric-val" style={{ color: 'rgb(34, 197, 94)' }}>{metrics.totalDeliveries}</div>
                        <div className="metric-label">Delivered</div>
                    </div>
                    <div
                        className="metric-card"
                        onClick={() => setSelectedFilter(selectedFilter === 'pickups' ? 'all' : 'pickups')}
                        style={{
                            cursor: 'pointer',
                            border: selectedFilter === 'pickups' ? '2px solid var(--primary)' : '1px solid var(--border)',
                            boxShadow: selectedFilter === 'pickups' ? '0 0 12px var(--primary)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        <div className="metric-val">{metrics.totalPickups}</div>
                        <div className="metric-label">Pick-ups</div>
                    </div>
                    <div className="metric-card" style={{ gridColumn: '1 / -1' }}>
                        <div className="metric-val">€ {metrics.reembolsoTotal}</div>
                        <div className="metric-label">Total Reembolso</div>
                    </div>
                </div>
            </div>

            {/* Loads Sub-Filter Toggle */}
            {selectedFilter === 'loads' && (
                <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
                    <button
                        onClick={() => setLoadViewMode('assigned')}
                        className={loadViewMode === 'assigned' ? 'primary-button' : 'secondary-button'}
                        style={{ flex: 1, padding: '0.5rem', opacity: loadViewMode === 'assigned' ? 1 : 0.7 }}
                    >
                        Waiting Assignment (Assigned)
                    </button>
                    <button
                        onClick={() => setLoadViewMode('loaded')}
                        className={loadViewMode === 'loaded' ? 'primary-button' : 'secondary-button'}
                        style={{ flex: 1, padding: '0.5rem', opacity: loadViewMode === 'loaded' ? 1 : 0.7 }}
                    >
                        Loaded on Truck
                    </button>
                </div>
            )}

            {/* Record List */}
            <div style={{ display: 'grid', gap: '1rem' }}>
                {displayRecords.map(record => (
                    <div key={record.id} className="card" style={{
                        borderLeft: `4px solid ${getStatusColor(record)}`
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <span style={{
                                    textTransform: 'uppercase',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    color: record.type === 'delivery_failed' ? '#ef4444' : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem'
                                }}>
                                    {record.type}
                                    {record.type === 'pickup' && (record.status === 'assigned' || record.status === 'assignment_complete') && (
                                        <span style={{ color: '#f59e0b', marginLeft: '0.5rem' }}>
                                            - ASSIGNED {record.status === 'assignment_complete' ? '(Processed)' : ''}
                                        </span>
                                    )}
                                    {record.type === 'pickup' && record.status !== 'assigned' && (
                                        <span style={{ color: '#22c55e', marginLeft: '0.5rem' }}>
                                            - PICK-UP DONE
                                        </span>
                                    )}
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
                                    {record.type === 'load' && record.status === 'assigned_load' && (
                                        <span style={{ fontSize: '0.7rem', background: 'gray', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>WAITING LOAD</span>
                                    )}
                                    {record.status === 'delivery_failed' && (
                                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                                            {/*(DELIVERY FAILED)*/}
                                        </span>
                                    )}
                                    {record.auditHistory?.length > 0 && <span title="Edited" style={{ fontSize: '1rem' }}>📝</span>}<span style={{ color: '#ef4444' }}>{record.failureReason || ''}</span>
                                </span>
                                <h3 style={{ margin: '0.25rem 0' }}>{record.recipient}</h3>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    Albarán: <span style={{ color: 'var(--text-main)' }}>{record.remittance}</span>
                                </div>
                                {record.address && (
                                    <div style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                        📍 {record.address}
                                    </div>
                                )}
                                {record.observations && (
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontStyle: 'italic', marginTop: '0.25rem', padding: '0.4rem', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                                        <span style={{ color: 'var(--primary)', fontStyle: 'normal', fontWeight: 'bold' }}>Obs:</span> {record.observations}
                                    </div>
                                )}
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    <span style={{ color: '#f51519ff' }}>Notas: </span> <span style={{ color: 'var(--text-main)' }}>{record.volumen}</span>
                                </div>

                                {(userRole === 'office' || userRole === 'backoffice') && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '0.25rem' }}>
                                        Driver: {record.driverName}
                                    </div>
                                )}
                                {record.assignedByName && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem', fontStyle: 'italic' }}>
                                        Assigned by: {record.assignedByName}
                                    </div>
                                )}
                            </div>

                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: (record.type === 'delivery' || (record.type === 'pickup' && record.status !== 'assigned')) ? '#22c55e' : '#ef4444' }}>x{record.quantity}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {new Date(record.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                {record.reembolso && (
                                    <div style={{ marginTop: '0.5rem', color: ((record.type === 'delivery' || (record.type === 'pickup' && record.status !== 'assigned')) && (record.collectedValue ? record.collectedValue !== '0' : record.reembolso !== '0')) ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
                                        € {record.collectedValue || record.reembolso}
                                    </div>
                                )}
                            </div>
                        </div>

                        {canEdit(record) && (
                            <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                {(userRole === 'office' || userRole === 'backoffice') && (
                                    <button
                                        onClick={() => handleDelete(record)}
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
