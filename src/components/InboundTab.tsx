import { useState, useEffect } from 'react';
import { db, collection, query, where, onSnapshot, doc, updateDoc, getUsersByTenant } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { logAction, ACTIONS } from '../utils/audit';

export default function InboundTab() {
    const { tenantId, currentUser } = useAuth();
    const [records, setRecords] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Assignment State
    const [selectedRecord, setSelectedRecord] = useState<any>(null);
    const [selectedDriver, setSelectedDriver] = useState('');
    const [selectedSession, setSelectedSession] = useState('morning');

    useEffect(() => {
        getUsersByTenant(tenantId || 'default').then(users => {
            const drv = users.filter(u => u.role === 'driver');
            setDrivers(drv);
            if (drv.length > 0) setSelectedDriver(drv[0].uid);
        });

        const q = query(collection(db, "records"), where("tenantId", "==", tenantId || 'default'));

        const unsub = onSnapshot(q, snap => {
            const data = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as any))
                .filter(d => ['supplier_submitted', 'picked_up_supplier', 'in_warehouse'].includes(d.status));
            
            data.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            setRecords(data);
        });

        return () => unsub();
    }, [tenantId]);

    const handleOpenAssign = (rec: any) => {
        setSelectedRecord(rec);
        if (drivers.length > 0) setSelectedDriver(drivers[0].uid);
    };

    const handleAssignSubmit = async () => {
        if (!selectedDriver) return alert("Select a driver");
        setLoading(true);
        const driverName = drivers.find(d => d.uid === selectedDriver)?.name || 'Unknown Driver';

        try {
            const recordRef = doc(db, 'records', selectedRecord.id);
            
            // The office is assigning the LAST MILE driver.
            // If the item is already in_warehouse, we can directly assign it as a load.
            // If it is NOT in_warehouse yet (i.e. picked_up_supplier or supplier_submitted),
            // we save the lastMileDriverId so the driver can automatically assign it when they unload it.
            
            if (selectedRecord.status === 'in_warehouse') {
                const today = new Date().toISOString().split('T')[0];
                await updateDoc(recordRef, {
                    status: 'assigned_load', 
                    type: 'load',
                    driverId: selectedDriver,
                    driverName: driverName,
                    assignedByName: currentUser?.name || currentUser?.email,
                    date: today,
                    session: selectedSession
                });
                await logAction(currentUser, ACTIONS.UPDATE, `Assigned Route Delivery for ${selectedRecord.recipient} to ${driverName}`, selectedRecord.id);
            } else {
                await updateDoc(recordRef, {
                    lastMileDriverId: selectedDriver,
                    lastMileDriverName: driverName,
                    lastMileSession: selectedSession
                });
                await logAction(currentUser, ACTIONS.UPDATE, `Pre-assigned Route Delivery for ${selectedRecord.recipient} to ${driverName}`, selectedRecord.id);
            }
            
            setSelectedRecord(null);
        } catch (err) {
            console.error(err);
            alert("Error assigning: " + (err as Error).message);
        }
        setLoading(false);
    };

    const getStatusDisplay = (status: string) => {
        switch (status) {
            case 'supplier_submitted': return <span style={{ color: '#ef4444' }}>Created</span>;
            case 'picked_up_supplier': return <span style={{ color: '#8b5cf6' }}>Picked Up</span>;
            case 'in_warehouse': return <span style={{ color: '#22c55e' }}>Delivered</span>;
            default: return status;
        }
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <h2>Inbound Supplier Requests</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Monitor supplier packages and assign the Last Mile delivery driver.</p>

            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'rgba(255,255,255,0.05)' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                <th style={{ padding: '0.8rem' }}>Date & Time</th>
                                <th style={{ padding: '0.8rem' }}>Invoice No.</th>
                                <th style={{ padding: '0.8rem' }}>Supplier</th>
                                <th style={{ padding: '0.8rem' }}>Recipient</th>
                                <th style={{ padding: '0.8rem' }}>Location</th>
                                <th style={{ padding: '0.8rem' }}>Driver</th>
                                <th style={{ padding: '0.8rem' }}>Qty</th>
                                <th style={{ padding: '0.8rem' }}>Reemb (€)</th>
                                <th style={{ padding: '0.8rem' }}>Status</th>
                                <th style={{ padding: '0.8rem', textAlign: 'right' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.8rem' }}>{new Date(r.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                                    <td style={{ padding: '0.8rem', fontFamily: 'monospace' }}>{r.supplierReference || '-'}</td>
                                    <td style={{ padding: '0.8rem' }}>{r.supplierName || 'Unknown'}</td>
                                    <td style={{ padding: '0.8rem' }}>{r.recipient}</td>
                                    <td style={{ padding: '0.8rem' }}>{r.address || 'N/A'}</td>
                                    <td style={{ padding: '0.8rem' }}>{r.driverName || '-'}</td>
                                    <td style={{ padding: '0.8rem', fontWeight: 'bold' }}>{r.quantity}</td>
                                    <td style={{ padding: '0.8rem' }}>{r.reembolso || '0'}</td>
                                    <td style={{ padding: '0.8rem', fontWeight: 'bold' }}>{getStatusDisplay(r.status)}</td>
                                    <td style={{ padding: '0.8rem', textAlign: 'right' }}>
                                        {r.lastMileDriverId ? (
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                Assigned to: {r.lastMileDriverName}
                                            </span>
                                        ) : (
                                            <button 
                                                className="primary-button" 
                                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                                onClick={() => handleOpenAssign(r)}
                                            >
                                                Assign Route
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {records.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No records found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedRecord && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="glass-panel" style={{ width: '90%', maxWidth: '400px', background: 'var(--bg-main)' }}>
                        <h3 style={{ marginTop: 0 }}>Assign Route Delivery</h3>
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
