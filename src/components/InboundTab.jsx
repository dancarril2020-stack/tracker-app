import React, { useState, useEffect } from 'react';
import { db, collection, query, where, onSnapshot, doc, updateDoc, getUsersByTenant } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { logAction, ACTIONS } from '../utils/audit';

export default function InboundTab() {
    const { tenantId, currentUser } = useAuth();
    const [records, setRecords] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Assignment State
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [actionType, setActionType] = useState(''); // 'pickup' or 'load'
    const [selectedDriver, setSelectedDriver] = useState('');
    const [selectedSession, setSelectedSession] = useState('morning'); // Default to morning

    useEffect(() => {
        getUsersByTenant(tenantId).then(users => {
            const drv = users.filter(u => u.role === 'driver');
            setDrivers(drv);
            if (drv.length > 0) setSelectedDriver(drv[0].uid);
        });

        const q = query(collection(db, "records"), where("tenantId", "==", tenantId || 'default'));

        const unsub = onSnapshot(q, snap => {
            const data = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(d => ['supplier_submitted', 'picked_up_supplier'].includes(d.status));
            
            data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setRecords(data);
        });

        return () => unsub();
    }, [tenantId]);

    const handleOpenAssign = (rec, type) => {
        setSelectedRecord(rec);
        setActionType(type);
        if (drivers.length > 0) setSelectedDriver(drivers[0].uid);
    };

    const handleAssignSubmit = async () => {
        if (!selectedDriver) return alert("Select a driver");
        setLoading(true);
        const driverName = drivers.find(d => d.uid === selectedDriver)?.name || 'Unknown Driver';

        try {
            const recordRef = doc(db, 'records', selectedRecord.id);
            const today = new Date().toISOString().split('T')[0];
            
            let updates = {};
            if (actionType === 'pickup') {
                updates = {
                    status: 'assigned_load', // Goes to Last Mile Driver Tab (User requested "Load in Warehouse")
                    type: 'load',
                    driverId: selectedDriver,
                    driverName: driverName,
                    assignedByName: currentUser.name || currentUser.email,
                    date: today,
                    session: selectedSession
                };
            } else if (actionType === 'load') {
                updates = {
                    status: 'assigned_load', // Goes to Last Mile Driver Tab
                    type: 'load',
                    driverId: selectedDriver,
                    driverName: driverName,
                    assignedByName: currentUser.name || currentUser.email,
                    date: today,
                    session: selectedSession // required for driver tabs
                };
            }

            await updateDoc(recordRef, updates);
            await logAction(currentUser, ACTIONS.UPDATE, `Assigned ${actionType} for ${selectedRecord.recipient} to ${driverName}`, selectedRecord.id);
            
            setSelectedRecord(null);
        } catch (err) {
            console.error(err);
            alert("Error assigning: " + err.message);
        }
        setLoading(false);
    };

    const waitingPickups = records.filter(r => r.status === 'supplier_submitted');
    const inWarehouse = records.filter(r => r.status === 'picked_up_supplier');

    const renderTable = (list, type) => (
        <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'rgba(255,255,255,0.05)' }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '0.8rem' }}>Supplier</th>
                        <th style={{ padding: '0.8rem' }}>Recipient</th>
                        <th style={{ padding: '0.8rem' }}>Location</th>
                        <th style={{ padding: '0.8rem' }}>Qty</th>
                        <th style={{ padding: '0.8rem' }}>Date</th>
                        <th style={{ padding: '0.8rem', textAlign: 'right' }}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {list.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.8rem' }}>{r.supplierName || 'Unknown'}</td>
                            <td style={{ padding: '0.8rem' }}>{r.recipient}</td>
                            <td style={{ padding: '0.8rem' }}>{r.address || 'N/A'}</td>
                            <td style={{ padding: '0.8rem', fontWeight: 'bold' }}>{r.quantity}</td>
                            <td style={{ padding: '0.8rem' }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                            <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                <button 
                                    className="primary-button" 
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                    onClick={() => handleOpenAssign(r, type)}
                                >
                                    Assign {type === 'pickup' ? 'First Mile' : 'Last Mile'}
                                </button>
                            </td>
                        </tr>
                    ))}
                    {list.length === 0 && (
                        <tr>
                            <td colSpan="6" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No records found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <h2>Inbound Supplier Requests</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Manage and assign items generated by your suppliers.</p>

            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#3b82f6', marginTop: 0 }}>Waiting Pickups (At Supplier)</h3>
                {renderTable(waitingPickups, 'pickup')}
            </div>

            <div className="glass-panel">
                <h3 style={{ color: '#8b5cf6', marginTop: 0 }}>In Warehouse (Ready for Route)</h3>
                {renderTable(inWarehouse, 'load')}
            </div>

            {selectedRecord && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="glass-panel" style={{ width: '90%', maxWidth: '400px', background: 'var(--bg-main)' }}>
                        <h3 style={{ marginTop: 0 }}>Assign {actionType === 'pickup' ? 'Pickup' : 'Route Delivery'}</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {selectedRecord.recipient} ({selectedRecord.quantity} items)
                        </p>
                        
                        <div style={{ margin: '1rem 0', textAlign: 'left' }}>
                            <label className="label">Select Route Session</label>
                            <select 
                                value={selectedSession} 
                                onChange={e => setSelectedSession(e.target.value)}
                                style={{ width: '100%', padding: '0.8rem', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)', borderRadius: '4px', marginBottom: '1rem' }}
                            >
                                <option value="morning">🌅 Morning Route</option>
                                <option value="afternoon">🌇 Afternoon Route</option>
                            </select>

                            <label className="label">Select Driver</label>
                            <select 
                                value={selectedDriver} 
                                onChange={e => setSelectedDriver(e.target.value)}
                                style={{ width: '100%', padding: '0.8rem', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)', borderRadius: '4px' }}
                            >
                                {drivers.map(d => (
                                    <option key={d.uid} value={d.uid}>{d.name || d.email}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                            <button 
                                onClick={handleAssignSubmit} 
                                className="primary-button" 
                                style={{ flex: 1, padding: '0.8rem' }}
                                disabled={loading}
                            >
                                {loading ? 'Assigning...' : 'Confirm Assignment'}
                            </button>
                            <button 
                                onClick={() => setSelectedRecord(null)} 
                                className="secondary-button" 
                                style={{ flex: 1, padding: '0.8rem' }}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
