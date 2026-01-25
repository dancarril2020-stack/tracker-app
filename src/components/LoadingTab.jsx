import React, { useState, useEffect } from 'react';
import { db, collection, addDoc, query, where, getDocs, updateDoc, doc, getUsers, onSnapshot } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import EditModal from './EditModal';

export default function LoadingTab({ onCompleteLoad }) {
    const { currentUser, userRole } = useAuth();

    // UI State
    const [viewMode, setViewMode] = useState('assigned'); // 'assigned' | 'loaded'
    const [loading, setLoading] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);

    // Data State
    const [assignedLoads, setAssignedLoads] = useState([]);
    const [loadedLoads, setLoadedLoads] = useState([]);
    const [allDailyRecords, setAllDailyRecords] = useState([]); // For Metric Stability

    // Form State (for creating assignments)
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState('');
    const [formData, setFormData] = useState({
        recipient: '',
        remittance: '',
        quantity: '',
        volumen: '',
        reembolso: ''
    });

    // --- 1. FETCH DRIVERS ---
    useEffect(() => {
        // ... (lines 31-41 remain same - skipped in replacement if context allows, but replace block needs contiguous)
        // I will replace the state def first.
    }, []); // Wait, replace_file_content needs contigous block.

    // I will replace just the state definition part.
    // And then the handleSubmit part in a separate chunk or same tool call with multiple replacements if supported (yes).

    // Let's do it in chunks.

    // Chunk 1: State
    // Chunk 2: HandleSubmit Update Logic
    // Chunk 3: HandleSubmit Add Logic

    // --- 1. FETCH DRIVERS ---
    useEffect(() => {
        async function fetchDrivers() {
            if (userRole === 'office' || userRole === 'backoffice') {
                const allUsers = await getUsers();
                const driverList = allUsers.filter(u => u.role === 'driver');
                setDrivers(driverList);
                if (driverList.length > 0) setSelectedDriver(driverList[0].uid);
            } else {
                setSelectedDriver(currentUser.uid);
            }
        }
        fetchDrivers();
    }, [userRole, currentUser]);

    // --- 2. FETCH LOADS (Real-time) ---
    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        const recordsRef = collection(db, "records");

        const targetDriverId = (userRole === 'office' || userRole === 'backoffice') ? selectedDriver : currentUser.uid;

        if (!targetDriverId) return;

        // Fetch loads AND deliveries to keep the metric stable after delivery
        const q = query(
            recordsRef,
            where("driverId", "==", targetDriverId),
            where("date", "==", today),
            where("type", "in", ["load", "delivery", "delivery_failed"])
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // 1. Assigned (Waiting)
            const assigned = allRecords.filter(l => l.type === 'load' && l.status === 'assigned_load');

            // 2. Active Loaded (Pending / On Truck)
            const matchedLoaded = allRecords.filter(l =>
                l.type === 'load' && (l.status === 'pending' || l.status === 'incident_missing' || l.status === 'incident_excess')
            );

            setAssignedLoads(assigned);
            setLoadedLoads(matchedLoaded);
            setAllDailyRecords(allRecords);
        });

        return () => unsubscribe();
    }, [selectedDriver, currentUser, userRole]);

    // --- 3. ACTIONS ---

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

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
                where("status", "==", statusToFind)
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
            } else {
                await addDoc(collection(db, "records"), {
                    type: 'load',
                    driverId: targetDriverId,
                    driverName: targetDriverName,
                    ...formData,
                    status: statusToFind,
                    createdAt: new Date().toISOString(),
                    date: today
                });
            }

            setFormData({ recipient: '', remittance: '', quantity: '', volumen: '', reembolso: '' });
        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
        }
        setLoading(false);
    };

    const handleLoadAction = async (load) => {
        if (!window.confirm(`Confirm loading: ${load.recipient}?`)) return;
        setLoading(true);
        try {
            await updateDoc(doc(db, "records", load.id), {
                status: 'pending',
                loadedAt: new Date().toISOString()
            });
        } catch (err) {
            console.error(err);
            alert("Error updating load: " + err.message);
        }
        setLoading(false);
    };

    // Stable Metric Calculation (includes delivered items)
    const totalAssignedQty = allDailyRecords.filter(l => l.status === 'assigned_load').reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);
    const totalLoadedAndDeliveredQty = allDailyRecords.filter(l => l.status !== 'assigned_load').reduce((acc, curr) => acc + Number(curr.quantity || 0), 0);

    // --- HELPER FOR CARD STYLE ---
    const getStatusColor = (record) => {
        if (record.status === 'assigned_load') return '#f59e0b';
        return '#3b82f6';
    };

    const renderCard = (record) => (
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
                        Albarán: <span style={{ color: 'var(--text-main)' }}>{record.remittance}</span>
                    </div>
                    {record.volumen && (
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            <span style={{ color: '#f51519ff' }}>Notas: </span> <span style={{ color: 'var(--text-main)' }}>{record.volumen}</span>
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
                <button
                    onClick={() => setEditingRecord(record)}
                    className="secondary-button"
                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid var(--text-muted)', color: 'var(--text-muted)' }}
                >
                    Edit
                </button>

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


            {/* View: Assigned */}
            {viewMode === 'assigned' && (
                <div className="animate-fade-in">
                    <div className="glass-panel" style={{ marginBottom: '1rem', border: '1px solid var(--primary)' }}>
                        <h3 style={{ marginTop: 0 }}>+ New Assignment</h3>
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

                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {assignedLoads.map(record => renderCard(record))}
                        {assignedLoads.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No pending assignments.</div>}
                    </div>
                </div>
            )}

            {/* View: Loaded */}
            {viewMode === 'loaded' && (
                <div className="animate-fade-in">
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {loadedLoads.map(record => renderCard(record))}
                        {loadedLoads.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No loaded items.</div>}
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
                    onSave={() => {
                        setEditingRecord(null);
                        // No need to fetch manually, onSnapshot handles it
                    }}
                />
            )}
        </div>
    );
}
