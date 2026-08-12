/**
 * LoadingTab.tsx
 * Purpose: Manages the loading process for drivers. Drivers can view their assigned loads,
 * scan items into their truck, and mark loads as pending delivery.
 */
import React, { useState, useEffect } from 'react';
import { RecordItem, User } from '../types';
import { db, collection, addDoc, query, where, getDocs, updateDoc, doc, getDoc, getUsersByTenant, onSnapshot } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentSession } from '../utils/sessionHelper';
import { logAction, ACTIONS } from '../utils/audit';
import ScannerModal from './ScannerModal';
import EditModal from './EditModal';

export default function LoadingTab({ onCompleteLoad }: { onCompleteLoad: () => void }) {
    const { currentUser, userRole, tenantId } = useAuth();

    // UI State
    const [viewMode, setViewMode] = useState('assigned'); // 'assigned' | 'loaded'
    const [activeSession, setActiveSession] = useState(getCurrentSession());
    const [isScanning, setIsScanning] = useState(false);
    const [loading, setLoading] = useState(false);
    const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);

    // Data State
    const [assignedLoads, setAssignedLoads] = useState<RecordItem[]>([]);
    const [loadedLoads, setLoadedLoads] = useState<RecordItem[]>([]);
    // const [allDailyRecords, setAllDailyRecords] = useState<RecordItem[]>([]); // For Metric Stability

    // Form State (for creating assignments)
    const [drivers, setDrivers] = useState<User[]>([]);
    const [selectedDriver, setSelectedDriver] = useState('');
    const [formData, setFormData] = useState({
        recipient: '',
        remittance: '',
        quantity: '',
        volumen: '',
        reembolso: '',
        address: ''
    });

    // --- 1. FETCH DRIVERS ---
    useEffect(() => {
        async function fetchDrivers() {
            if (userRole === 'office' || userRole === 'backoffice') {
                const allUsers = await getUsersByTenant(tenantId || 'default');
                const driverList = allUsers.filter(u => u.role === 'driver' && u.active !== false);
                setDrivers(driverList);
                if (driverList.length > 0) setSelectedDriver(driverList[0].uid);
            } else {
                if (currentUser) {
                    setSelectedDriver(currentUser.uid);
                }
            }
        }
        fetchDrivers();
    }, [userRole, currentUser]);

    // --- 2. FETCH LOADS (Real-time) ---
    // Subscribes to Firestore to fetch assigned and active loads for the targeted driver.
    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        const recordsRef = collection(db, "records");

        const targetDriverId = (userRole === 'office' || userRole === 'backoffice') ? selectedDriver : (currentUser ? currentUser.uid : null);

        if (!targetDriverId) return;

        // Fetch loads AND deliveries to keep the metric stable after delivery
        const q = query(
            recordsRef,
            where("driverId", "==", targetDriverId),
            where("date", "==", today),
            where("type", "in", ["load", "delivery", "delivery_failed"]),
            where("tenantId", "==", tenantId || 'default')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allRecords = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<RecordItem, 'id'>) }));

            // 1. Assigned (Waiting)
            const assigned = allRecords.filter(l => l.type === 'load' && l.status === 'assigned_load');

            // 2. Active Loaded (Pending / On Truck)
            const matchedLoaded = allRecords.filter(l =>
                l.type === 'load' && (l.status === 'pending' || l.status === 'incident_missing' || l.status === 'incident_excess')
            );

            setAssignedLoads(assigned);
            setLoadedLoads(matchedLoaded);
            // setAllDailyRecords(allRecords);
            console.log(`[DEBUG] LoadingTab: Found ${assigned.length} assigned loads for driver ${targetDriverId}`);
        });

        return () => unsubscribe();
    }, [selectedDriver, currentUser, userRole, tenantId]);

    // --- 3. ACTIONS ---

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Handles manual assignment creation from the office, or driver self-assignment.
    // Checks if a matching load exists to combine quantities, otherwise creates a new record.
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;

        let targetDriverId = currentUser.uid;
        let targetDriverName = currentUser.name || currentUser.email;

        if ((userRole === 'office' || userRole === 'backoffice') && selectedDriver) {
            const driverObj = drivers.find(d => d.uid === selectedDriver);
            if (driverObj) {
                targetDriverId = driverObj.uid;
                targetDriverName = driverObj.name || driverObj.email;
            }
        }

        const statusToFind = (userRole === 'office' || userRole === 'backoffice') ? 'assigned_load' : 'pending';

        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const recordsRef = collection(db, "records");

            const q = query(
                recordsRef,
                where("driverId", "==", targetDriverId),
                where("date", "==", today),
                where("type", "==", "load"),
                where("recipient", "==", formData.recipient),
                where("remittance", "==", formData.remittance),
                where("status", "==", statusToFind),
                where("tenantId", "==", tenantId || 'default')
            );

            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const existingDoc = querySnapshot.docs[0];
                const existingData = existingDoc.data();
                const newQuantity = Number(existingData.quantity || 0) + Number(formData.quantity || 0);

                await updateDoc(doc(db, "records", existingDoc.id), {
                    quantity: newQuantity,
                    volumen: formData.volumen ? `${existingData.volumen || ''} + ${formData.volumen}` : existingData.volumen,
                    reembolso: formData.reembolso || existingData.reembolso // Update if provided
                });

                await logAction(
                    currentUser,
                    ACTIONS.UPDATE,
                    `Updated existing load for ${formData.recipient} (Qty: ${existingData.quantity || 0} → ${newQuantity})`,
                    existingDoc.id
                );
            } else {
                const newDoc = await addDoc(collection(db, "records"), {
                    type: 'load',
                    driverId: targetDriverId,
                    driverName: targetDriverName,
                    ...formData,
                    session: activeSession, // Save the active session
                    status: statusToFind,
                    tenantId: tenantId || 'default',
                    createdAt: new Date().toISOString(),
                    date: today,
                    assignedByName: (userRole === 'office' || userRole === 'backoffice') ? (currentUser.name || currentUser.email) : null
                });

                await logAction(currentUser, ACTIONS.LOAD_ITEM, `Registered load for ${formData.recipient} (${formData.quantity} units)`, newDoc.id);
            }

            setFormData({ recipient: '', remittance: '', quantity: '', volumen: '', reembolso: '', address: '' });
        } catch (err: any) {
            console.error(err);
            alert("Error: " + err.message);
        }
        setLoading(false);
    };

    const handleLoadAction = async (load: RecordItem) => {
        if (!window.confirm(`Confirm loading: ${load.recipient}?`)) return;
        if (!currentUser) return;
        setLoading(true);
        try {
            await updateDoc(doc(db, "records", load.id), {
                status: 'pending',
                loadedAt: new Date().toISOString()
            });
            await logAction(currentUser, ACTIONS.UPDATE, `Driver loaded items for ${load.recipient}`, load.id);
        } catch (err: any) {
            console.error(err);
            alert("Error updating load: " + err.message);
        }
        setLoading(false);
    };

    // Handles loading a package by scanning its QR code.
    const handleScanLoad = async (payload: { id: string }) => {
        if (!payload || !payload.id) {
            alert("Unrecognized QR Code.");
            return;
        }

        try {
            const recordRef = doc(db, 'records', payload.id);
            const recordSnap = await getDoc(recordRef);
            if (!recordSnap.exists()) {
                alert("Package record not found.");
                return;
            }

            const record = recordSnap.data();
            
            // Helpful error if they are trying to load it directly
            if (record.status === 'supplier_submitted') {
                alert("Cannot load this yet. This package must be picked up from the supplier first. Use the Pick-ups tab.");
                return;
            }

            // Allow scanning if it's assigned_load
            if (record.status !== 'assigned_load') {
                alert(`Cannot scan for loading. Status is already: ${record.status}`);
                return;
            }

            // Verify driver
            if (!currentUser || record.driverId !== currentUser.uid) {
                alert("This package is assigned to another driver.");
                return;
            }

            await updateDoc(recordRef, {
                status: 'pending',
                loadedAt: new Date().toISOString()
            });

            await logAction(currentUser, ACTIONS.UPDATE, `QR Scanned: Driver loaded items for ${record.recipient}`, payload.id);
            alert(`Carga confirmada para ${record.recipient}`);
            setIsScanning(false);

        } catch (err: any) {
            console.error(err);
            alert("Error updating scanned package: " + err.message);
        }
    };

    // Stable Metric Calculation (Filtered by Session)

    // --- HELPER FOR CARD STYLE ---
    const getStatusColor = (record: RecordItem) => {
        if (record.status === 'assigned_load') return '#f59e0b';
        return '#3b82f6';
    };

    const renderCard = (record: RecordItem) => (
        <div key={record.id} className="card" style={{ borderLeft: `4px solid ${getStatusColor(record)}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <span style={{
                        textTransform: 'uppercase',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        color: 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}>
                        LOAD
                        {record.status === 'assigned_load' && (
                            <span style={{ fontSize: '0.7rem', background: 'gray', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>WAITING LOAD</span>
                        )}
                        {record.status === 'pending' && (
                            <span style={{ color: '#3b82f6' }}>(LOADED)</span>
                        )}
                    </span>
                    <h3 style={{ margin: '0.25rem 0' }}>{record.recipient}</h3>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        Remittance: <span style={{ color: 'var(--text-main)' }}>{record.supplierName || record.remittance}</span>
                    </div>
                    {record.supplierReference && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            Factura/Ref.: <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{record.supplierReference}</span>
                        </div>
                    )}
                    {record.address && (
                        <div style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                            📍 {record.address}
                        </div>
                    )}
                    {record.volumen && (
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            <span style={{ color: '#f51519ff' }}>Notas: </span> <span style={{ color: 'var(--text-main)' }}>{record.volumen}</span>
                        </div>
                    )}
                    {record.assignedByName && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem', fontStyle: 'italic' }}>
                            Assigned by: {record.assignedByName}
                        </div>
                    )}
                </div>

                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#ef4444' }}>x{record.quantity}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {new Date(record.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {record.reembolso && (
                            <div style={{ marginTop: '0.5rem', color: '#ef4444', fontWeight: 'bold' }}>
                                € {record.reembolso}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '1rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>


                {record.status === 'assigned_load' && userRole === 'driver' && (
                    <button
                        onClick={() => handleLoadAction(record)}
                        className="primary-button"
                        style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                    >
                        ✅ LOAD
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
            {isScanning && (
                <ScannerModal 
                    onClose={() => setIsScanning(false)}
                    onScan={handleScanLoad}
                />
            )}

            {/* Session Toggle Dropdown */}
            <div style={{ marginBottom: '1.5rem' }}>
                <label className="label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Session</label>
                <select
                    value={activeSession}
                    onChange={(e) => setActiveSession(e.target.value)}
                    className="dropdown-select"
                >
                    <option value="morning">🌅 Morning (up to 13:30)</option>
                    <option value="afternoon">🌇 Afternoon (after 13:30)</option>
                </select>
            </div>

            {/* Quick Scan Button Global for Driver Loading */}
            {userRole === 'driver' && (
                 <div style={{ marginBottom: '1rem' }}>
                    <button 
                        onClick={() => setIsScanning(true)}
                        className="primary-button" 
                        style={{ width: '100%', padding: '1rem', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    >
                        📸 Escanear Carga (QR)
                    </button>
                </div>
            )}

            {/* View Toggle */}
            <div className="glass-panel" style={{ display: 'flex', padding: '0.3rem', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)' }}>
                <button
                    onClick={() => setViewMode('assigned')}
                    style={{
                        flex: 1,
                        padding: '0.5rem',
                        background: viewMode === 'assigned' ? 'var(--primary)' : 'transparent',
                        color: viewMode === 'assigned' ? 'black' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    Waiting Load
                </button>
                <button
                    onClick={() => setViewMode('loaded')}
                    style={{
                        flex: 1,
                        padding: '0.5rem',
                        background: viewMode === 'loaded' ? 'var(--primary)' : 'transparent',
                        color: viewMode === 'loaded' ? 'black' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    On Truck (Loaded)
                </button>
            </div>

            {/* View: Assigned */}
            {viewMode === 'assigned' && (
                <div className="animate-fade-in">
                    {(userRole === 'office' || userRole === 'backoffice') && (
                        <div className="glass-panel" style={{ marginBottom: '1rem', border: '1px solid var(--primary)' }}>
                            <h3 style={{ marginTop: 0 }}>+ New Assignment ({activeSession === 'morning' ? 'Morning' : 'Afternoon'})</h3>
                            <form onSubmit={handleSubmit}>

                                {/* Driver Selector for Office (Inside form as requested) */}
                                {(userRole === 'office' || userRole === 'backoffice') && (
                                    <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                                        <label className="label">Assign to Driver</label>
                                        <select
                                            value={selectedDriver}
                                            onChange={(e) => setSelectedDriver(e.target.value)}
                                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                        >
                                            {drivers.map(d => (
                                                <option key={d.uid} value={d.uid}>{d.name || d.email}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                                    <label className="label">Recipient Name *</label>
                                    <input name="recipient" value={formData.recipient} onChange={handleChange} required />
                                </div>

                                <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                                    <label className="label">Address / Location</label>
                                    <input name="address" value={formData.address} onChange={handleChange} placeholder="Optional delivery address..." />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                    <div style={{ textAlign: 'left' }}>
                                        <label className="label">Remittance *</label>
                                        <input name="remittance" value={formData.remittance} onChange={handleChange} required />
                                    </div>
                                    <div style={{ textAlign: 'left' }}>
                                        <label className="label">Quantity</label>
                                        <input name="quantity" type="number" value={formData.quantity} onChange={handleChange} />
                                    </div>
                                </div>

                                <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                                    <label className="label">Portes / Reembolso (€)</label>
                                    <input name="reembolso" type="number" step="0.01" value={formData.reembolso} onChange={handleChange} placeholder="0.00" />
                                </div>

                                <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                                    <label className="label">Volumen/Missing/Damage</label>
                                    <input name="volumen" value={formData.volumen} onChange={handleChange} placeholder="e.g. 2 pallets" />
                                </div>

                                <button type="submit" disabled={loading} style={{ width: '100%' }}>Register Load</button>
                            </form>
                        </div>
                    )}

                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {assignedLoads.filter(l => l.session === activeSession).map(record => renderCard(record))}
                        {assignedLoads.filter(l => l.session === activeSession).length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No pending assignments for this session.</div>}
                    </div>
                </div>
            )}

            {/* View: Loaded */}
            {viewMode === 'loaded' && (
                <div className="animate-fade-in">
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {loadedLoads.filter(l => l.session === activeSession).map(record => renderCard(record))}
                        {loadedLoads.filter(l => l.session === activeSession).length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No loaded items for this session.</div>}
                    </div>

                    <button
                        onClick={onCompleteLoad}
                        className="primary-button"
                        style={{ width: '100%', marginTop: '2rem', padding: '1rem' }}
                    >
                        🚀 START ROUTE (Complete Loading)
                    </button>
                </div>
            )}

            {/* Edit Modal */}
            {editingRecord && (
                <EditModal
                    record={editingRecord}
                    onClose={() => setEditingRecord(null)}
                    onUpdate={() => {
                        setEditingRecord(null);
                        // No need to fetch manually, onSnapshot handles it
                    }}
                />
            )}
        </div>
    );
}
