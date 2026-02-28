import React, { useState, useEffect } from 'react';
import { db, collection, addDoc, query, where, getDocs, updateDoc, doc, getUsersByTenant } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentSession } from '../utils/sessionHelper';
import { logAction, ACTIONS } from '../utils/audit'; // Added audit logging

export default function PickupTab() {
    const { currentUser, userRole, tenantId } = useAuth();
    const [loading, setLoading] = useState(false);
    const [activeSession, setActiveSession] = useState(getCurrentSession());

    // --- STATE FOR OFFICE (ASSIGNMENT) ---
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState('');
    const [assignData, setAssignData] = useState({
        recipient: '',
        remittance: '',
        quantity: '',
        volumen: '',
        portes: 'paid', // 'paid' or 'due'
        reembolso: '',
        address: '', // Optional address field helpful for assignments
        session: getCurrentSession() // Default session for assignment
    });

    // --- STATE FOR DRIVER (PROCESSING) ---
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'manual'
    const [assignedPickups, setAssignedPickups] = useState([]);
    const [manualData, setManualData] = useState({
        recipient: '',
        remittance: '',
        quantity: '',
        volumen: '',
        portes: 'paid',
        reembolso: '',
        address: ''
    });

    // --- FETCH DATA ---
    useEffect(() => {
        if (userRole === 'office' || userRole === 'backoffice') {
            fetchDrivers();
        } else {
            fetchAssignedPickups();
        }
    }, [userRole, currentUser]);

    const fetchDrivers = async () => {
        const allUsers = await getUsersByTenant(tenantId);
        const driverList = allUsers.filter(u => u.role === 'driver' && u.active !== false);
        setDrivers(driverList);
        if (driverList.length > 0) setSelectedDriver(driverList[0].uid);
    };

    const fetchAssignedPickups = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, "records"),
                where("driverId", "==", currentUser.uid),
                where("type", "==", "pickup"),
                where("status", "==", "assigned") // Fetch only pending assignments
            );
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort by creation (oldest first or newest first)
            data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setAssignedPickups(data);
        } catch (err) {
            console.error("Error fetching assignments:", err);
        }
        setLoading(false);
    };

    // --- OFFICE: HANDLE ASSIGNMENT ---
    const handleAssignChange = (e) => {
        const { name, value } = e.target;
        if (name === 'reembolso' && !/^[0-9,]*$/.test(value)) return;
        setAssignData(prev => ({ ...prev, [name]: value }));
    };

    const handleAssignSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const driverObj = drivers.find(d => d.uid === selectedDriver);
            const assignRef = await addDoc(collection(db, "records"), {
                type: 'pickup',
                status: 'assigned',
                driverId: selectedDriver,
                driverName: driverObj ? (driverObj.name || driverObj.email) : 'Unknown',
                ...assignData,
                session: assignData.session || activeSession,
                tenantId: tenantId || 'default',
                assignedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                date: new Date().toISOString().split('T')[0]
            });
            await logAction(currentUser, ACTIONS.CREATE_ITEM, `Assigned Pickup to ${driverObj?.name || driverObj?.email || 'Unknown'} for ${assignData.recipient}`, assignRef.id);
            alert("Pickup Assigned Successfully!");
            setAssignData({ recipient: '', remittance: '', quantity: '', volumen: '', portes: 'paid', reembolso: '', address: '' });
        } catch (err) {
            console.error(err);
            alert("Error assigning pickup");
        }
        setLoading(false);
    };

    // --- DRIVER: HANDLE PROCESS ASSIGNMENT ---
    // --- DRIVER: HANDLE PROCESS ASSIGNMENT ---
    const handleProcessPickup = async (pickup) => {
        // Validation / Prompt for Reembolso
        let collectedValue = '';
        if (pickup.reembolso && pickup.reembolso !== '0') {
            const input = window.prompt(`Enter collected reimbursement for ${pickup.recipient} (Expected: €${pickup.reembolso}). Leave empty if not collected.`);
            if (input === null) return; // User cancelled
            collectedValue = input.trim();
        } else {
            if (!window.confirm(`Register pickup from ${pickup.recipient}?`)) return;
        }

        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const recordRef = doc(db, "records", pickup.id);

            // 1. Mark the ASSIGNMENT as 'assignment_complete'
            await updateDoc(recordRef, {
                status: 'assignment_complete'
            });

            // 2. Create a NEW record for the ACTUAL PICKUP (Result)
            const pickupResult = await addDoc(collection(db, "records"), {
                type: 'pickup',
                status: 'completed_pickup',
                driverId: pickup.driverId,
                driverName: pickup.driverName,
                recipient: pickup.recipient,
                remittance: pickup.remittance,
                quantity: pickup.quantity,
                volumen: pickup.volumen,
                portes: pickup.portes,
                address: pickup.address,
                session: pickup.session,
                tenantId: pickup.tenantId || tenantId || 'default',
                collectedValue: collectedValue || '0',
                reembolso: collectedValue || pickup.reembolso || '',
                expectedReembolso: pickup.reembolso || '',
                completedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                date: today
            });

            // 3. Check for Debt (Shortfall)
            const expectedVal = parseFloat((pickup.reembolso || "0").toString().replace(',', '.'));
            const collectedVal = parseFloat((collectedValue || "0").toString().replace(',', '.'));

            if (!isNaN(expectedVal) && expectedVal > 0) {
                const shortfall = expectedVal - (isNaN(collectedVal) ? 0 : collectedVal);
                if (shortfall > 0.05) {
                    await addDoc(collection(db, "debts"), {
                        recipient: pickup.recipient,
                        remittance: pickup.remittance,
                        amount: shortfall.toFixed(2),
                        originalLoadId: pickup.id,
                        deliveryId: pickupResult.id, // Linking to the pickup result
                        driverId: currentUser.uid,
                        driverName: currentUser.name || currentUser.email,
                        date: today,
                        createdAt: new Date().toISOString(),
                        tenantId: tenantId || 'default',
                        status: 'pending'
                    });
                    await logAction(currentUser, ACTIONS.UPDATE, `Debt Created (Pickup): €${shortfall.toFixed(2)} for ${pickup.recipient}`, pickup.id);
                }
            }

            await logAction(currentUser, ACTIONS.PICKUP_ITEM, `Completed pickup from ${pickup.recipient}`, pickupResult.id);

            fetchAssignedPickups(); // Refresh list
        } catch (err) {
            console.error(err);
            alert("Error processing pickup: " + err.message);
        }
        setLoading(false);
    };

    // --- DRIVER: HANDLE MANUAL PICKUP ---
    const handleManualChange = (e) => {
        const { name, value } = e.target;
        if (name === 'reembolso' && !/^[0-9,]*$/.test(value)) return;
        setManualData(prev => ({ ...prev, [name]: value }));
    };

    const handleManualSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const pickupRef = await addDoc(collection(db, "records"), {
                type: 'pickup',
                status: 'completed_pickup',
                driverId: currentUser.uid,
                driverName: currentUser.name || currentUser.email,
                ...manualData,
                session: activeSession,
                tenantId: tenantId || 'default',
                collectedValue: manualData.reembolso || '0',
                expectedReembolso: manualData.reembolso || '',
                createdAt: new Date().toISOString(),
                date: new Date().toISOString().split('T')[0]
            });
            await logAction(currentUser, ACTIONS.PICKUP_ITEM, `Manual Pickup registered from ${manualData.recipient}`, pickupRef.id);
            alert("Manual Pickup Registered!");
            setManualData({ recipient: '', remittance: '', quantity: '', volumen: '', portes: 'paid', reembolso: '', address: '' });
            setViewMode('list');
        } catch (err) {
            console.error(err);
            alert("Error registering pickup");
        }
        setLoading(false);
    };

    // --- RENDER: OFFICE VIEW ---
    if (userRole === 'office' || userRole === 'backoffice') {
        return (
            <div className="glass-panel animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h2>Assign Pickup to Driver</h2>
                <form onSubmit={handleAssignSubmit}>
                    <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                        <label className="label">Select Driver</label>
                        <select
                            value={selectedDriver}
                            onChange={(e) => setSelectedDriver(e.target.value)}
                            style={{ padding: '0.8rem', width: '100%', borderRadius: '4px', border: '1px solid var(--primary)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                        >
                            {drivers.map(d => (
                                <option key={d.uid} value={d.uid}>{d.name || d.email}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ textAlign: 'left' }}>
                        <label className="label">Recipient Name *</label>
                        <input name="recipient" value={assignData.recipient} onChange={handleAssignChange} required />
                    </div>

                    {/* Added Address Field for Office Assignments */}
                    <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                        <label className="label">Address / Location</label>
                        <input name="address" value={assignData.address} onChange={handleAssignChange} placeholder="Specific address for driver..." />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                        <div style={{ textAlign: 'left' }}>
                            <label className="label">Remittance/Ref *</label>
                            <input name="remittance" value={assignData.remittance} onChange={handleAssignChange} required />
                        </div>
                        <div style={{ textAlign: 'left' }}>
                            <label className="label">Quantity</label>
                            <input name="quantity" type="number" value={assignData.quantity} onChange={handleAssignChange} />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                        <div style={{ textAlign: 'left' }}>
                            <label className="label">Reembolso</label>
                            <input name="reembolso" value={assignData.reembolso} onChange={handleAssignChange} placeholder="e.g. 50,00" />
                        </div>
                        <div style={{ textAlign: 'left' }}>
                            <label className="label">Volumen/Notes</label>
                            <input name="volumen" value={assignData.volumen} onChange={handleAssignChange} />
                        </div>
                    </div>

                    <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                        <select name="portes" value={assignData.portes} onChange={handleAssignChange}>
                            <option value="paid">Paid (Pagados)</option>
                            <option value="due">Due (Debidos)</option>
                        </select>
                    </div>

                    <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                        <label className="label">Session</label>
                        <select name="session" value={assignData.session} onChange={handleAssignChange}>
                            <option value="morning">🌅 Morning</option>
                            <option value="afternoon">🌇 Afternoon</option>
                        </select>
                    </div>

                    <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '1.5rem', background: 'var(--primary)', color: 'black', fontWeight: 'bold' }}>
                        {loading ? 'Assigning...' : 'Assign Pickup'}
                    </button>
                </form>
            </div>
        );
    }

    // --- RENDER: DRIVER VIEW ---
    if (viewMode === 'list') {
        return (
            <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>

                {/* Session Toggle Dropdown */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <label className="label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Session</label>
                    <select
                        value={activeSession}
                        onChange={(e) => setActiveSession(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-main)' }}
                    >
                        <option value="morning">🌅 Morning (up to 13:30)</option>
                        <option value="afternoon">🌇 Afternoon (after 13:30)</option>
                    </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2>Assigned Pickups ({activeSession === 'morning' ? 'Morning' : 'Afternoon'})</h2>
                    <button
                        onClick={() => setViewMode('manual')}
                        className="secondary-button"
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                    >
                        + Manual Pickup
                    </button>
                </div>

                {assignedPickups.filter(p => p.session === activeSession).length === 0 ? (
                    <div className="glass-panel" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        No pending assignments for this session.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {assignedPickups.filter(p => p.session === activeSession).map(pickup => (
                            <div key={pickup.id} className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h3 style={{ margin: '0 0 0.25rem 0' }}>{pickup.recipient}</h3>
                                        {pickup.address && <div style={{ fontSize: '0.9rem', color: 'var(--primary)', marginBottom: '0.25rem' }}>📍 {pickup.address}</div>}
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ref: {pickup.remittance}</div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Notes: {pickup.volumen}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 'bold' }}>x{pickup.quantity || '-'}</div>
                                        <span style={{ fontSize: '0.75rem', background: '#f59e0b', color: 'black', padding: '2px 6px', borderRadius: '4px' }}>ASSIGNED</span>
                                        <div style={{ textAlign: 'right' }}>

                                            {pickup.reembolso && (
                                                <div style={{ marginTop: '0.5rem', color: (pickup.type === 'delivery' && (pickup.collectedValue ? pickup.collectedValue !== '0' : pickup.reembolso !== '0')) ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
                                                    € {pickup.reembolso}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>


                                <div style={{ marginTop: '1rem', textAlign: 'right' }}>
                                    <button
                                        onClick={() => handleProcessPickup(pickup)}
                                        className="primary-button"
                                        style={{ padding: '0.4rem 1rem' }}
                                    >
                                        Register / Complete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
                }
            </div >
        );
    }

    // --- RENDER: DRIVER MANUAL FORM ---
    return (
        <div className="glass-panel animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2>Manual Pickup</h2>
                <button onClick={() => setViewMode('list')} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    Cancel
                </button>
            </div>
            <form onSubmit={handleManualSubmit}>
                <div style={{ textAlign: 'left' }}>
                    <label className="label">Recipient Name *</label>
                    <input name="recipient" value={manualData.recipient} onChange={handleManualChange} required />
                </div>
                <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                    <label className="label">Address / Location</label>
                    <input name="address" value={manualData.address} onChange={handleManualChange} placeholder="Optional pickup address..." />
                </div>
                {/* ... (Previous Manual Form Content) ... */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div style={{ textAlign: 'left' }}>
                        <label className="label">Remittance *</label>
                        <input name="remittance" value={manualData.remittance} onChange={handleManualChange} required />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                        <label className="label">Quantity</label>
                        <input name="quantity" type="number" value={manualData.quantity} onChange={handleManualChange} />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div style={{ textAlign: 'left' }}>
                        <label className="label">Reembolso</label>
                        <input name="reembolso" value={manualData.reembolso} onChange={handleManualChange} placeholder="e.g. 50,00" />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                        <label className="label">Volumen</label>
                        <input name="volumen" value={manualData.volumen} onChange={handleManualChange} />
                    </div>
                </div>
                <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                    <label className="label">Portes</label>
                    <select name="portes" value={manualData.portes} onChange={handleManualChange}>
                        <option value="paid">Paid (Pagados)</option>
                        <option value="due">Due (Debidos)</option>
                    </select>
                </div>
                <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
                    {loading ? 'Saving...' : 'Register Manual Pickup'}
                </button>
            </form>
        </div>
    );
}
