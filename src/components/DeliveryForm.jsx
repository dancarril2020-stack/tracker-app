
import React, { useState } from 'react';
import { db, collection, addDoc, query, where, getDocs, updateDoc, doc, getUsersByTenant } from '../firebase';
import { logAction, ACTIONS } from '../utils/audit';
import { getCurrentSession } from '../utils/sessionHelper';
import ScannerModal from './ScannerModal';

import { useAuth } from '../contexts/AuthContext';

export default function DeliveryForm() {
    const { currentUser, userRole, tenantId } = useAuth();
    const [viewMode, setViewMode] = useState('list'); // 'list' (default) or 'manual'
    const [activeSession, setActiveSession] = useState(getCurrentSession());
    const [pendingLoads, setPendingLoads] = useState([]);
    const [isScanning, setIsScanning] = useState(false);

    // Form Data
    const [formData, setFormData] = useState({
        recipient: '',
        remittance: '',
        quantity: '',
        volumen: '',
        reembolso: '',
        address: '',
        observations: ''
    });
    const [cardObservations, setCardObservations] = useState({}); // Track notes per card in list view
    const [loading, setLoading] = useState(false);

    // Driver Selection State (for Office/Backoffice)
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState('');

    // Search State
    const [searchTerm, setSearchTerm] = useState('');

    React.useEffect(() => {
        async function fetchDrivers() {
            if (userRole === 'office' || userRole === 'backoffice') {
                const allUsers = await getUsersByTenant(tenantId);
                const driverList = allUsers.filter(u => u.role === 'driver');
                setDrivers(driverList);
                if (driverList.length > 0) {
                    setSelectedDriver(driverList[0].uid);
                }
            } else {
                // If driver, always themselves
                setSelectedDriver(currentUser.uid);
            }
        }
        fetchDrivers();
    }, [userRole, currentUser]);

    // Initial Fetch for List Mode
    React.useEffect(() => {
        if (viewMode === 'list') {
            fetchPendingLoads();
        }
    }, [viewMode]);

    const fetchPendingLoads = async () => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const q = query(
                collection(db, "records"),
                where("driverId", "==", currentUser.uid),
                where("date", "==", today),
                where("type", "==", "load"),
                where("status", "==", "pending"),
                where("tenantId", "==", tenantId || 'default')
            );
            const snapshot = await getDocs(q);
            const data = snapshot.docs ? snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [];
            // Sort by creation time (newest first)
            data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setPendingLoads(data);
        } catch (err) {
            console.error("Error fetching pending loads:", err);
        }
        setLoading(false);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'reembolso' && !/^[0-9,]*$/.test(value)) return;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCardObsChange = (loadId, value) => {
        setCardObservations(prev => ({ ...prev, [loadId]: value }));
    };

    // Fail Modal State
    const [failingLoad, setFailingLoad] = useState(null);
    const [failureReason, setFailureReason] = useState('');

    const handleFailClick = (e, load) => {
        e.stopPropagation();
        setFailingLoad(load);
        setFailureReason('');
    };

    const confirmFailDelivery = async () => {
        if (!failureReason.trim()) {
            alert("Please provide a reason.");
            return;
        }

        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];

            // 1. Create a NEW 'Delivery' record but with failed status (so it appears as a separate card/entry history)
            // Using type 'delivery' so it might appear in delivery lists, but with status 'failed'.
            // OR use type 'delivery_failed' if we filter by types. DeliverySummary currently filters: 
            // loads = type 'load', deliveries = type 'delivery'. 
            // If we want it to show up as a "Failed Delivery" card, we might need a type that the summary picks up OR adjust summary.
            // Summary logic:
            // loads = records.filter(r => r.type === 'load');
            // deliveries = records.filter(r => r.type === 'delivery');

            // If I change type to 'delivery_failed', I need to ensure Summary picks it up if I want it shown.
            // Currently Summary only maps: records.map... 
            // It displays ALL records fetched.
            // Fetched records are: (office) all for date. (driver) all for date.

            // So if I create a new record of type 'delivery_failed', it WILL be fetched and shown in the list.
            // And the original LOAD will updated.

            await addDoc(collection(db, "records"), {
                type: 'delivery_failed',
                driverId: currentUser.uid,
                driverName: currentUser.name || currentUser.email,
                recipient: failingLoad.recipient,
                remittance: failingLoad.remittance,
                quantity: failingLoad.quantity,
                volumen: failingLoad.volumen || '',
                reembolso: failingLoad.reembolso || '',
                date: today,
                createdAt: new Date().toISOString(),
                session: failingLoad.session || activeSession,
                status: 'failed',
                failureReason: failureReason,
                linkedLoadId: failingLoad.id,
                address: failingLoad.address || '',
                tenantId: failingLoad.tenantId || tenantId || 'default'
            });

            // 2. Update the Original Load Record
            // We want it to be "removed" from the pending list (which queries status=='pending').
            // We should mark it as 'processed_failed' or similar so it doesn't show up again as pending.
            // Inherently, it shouldn't show up in the "Pending" list if status != pending.
            await updateDoc(doc(db, "records", failingLoad.id), {
                status: 'delivery_failed', // This removes it from pending list query
                failedAt: new Date().toISOString()
            });

            // Log Audit
            await logAction(currentUser, ACTIONS.DELIVERY_FAILED, `Delivery Failed for ${failingLoad.recipient}: ${failureReason}`, failingLoad.id);

            setFailingLoad(null); // Close modal
            fetchPendingLoads();
            // Optional: User might want to be redirected or just see the list update.
        } catch (err) {
            console.error("Error failing delivery:", err);
            alert("Error: " + err.message);
        }
        setLoading(false);
    };

    const handleDeliverFromList = async (e, load) => {
        if (e && e.stopPropagation) e.stopPropagation(); // Prevent bubbling

        // window.confirm removed as per user preference for smoother workflow

        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];

            let collectedValue = '';
            if (load.reembolso) {
                const input = window.prompt(`Enter collected value for ${load.recipient} (Expected: ${load.reembolso} €). Leave empty if not collected.`);
                if (input !== null) { // If not cancelled
                    collectedValue = input.trim();
                } else {
                    setLoading(false);
                    return; // Cancelled
                }
            }

            // 1. Create Delivery Record
            const deliveryRef = await addDoc(collection(db, "records"), {
                type: 'delivery',
                driverId: currentUser.uid,
                driverName: currentUser.name || currentUser.email,
                recipient: load.recipient,
                remittance: load.remittance,
                quantity: load.quantity,
                date: today,
                createdAt: new Date().toISOString(),
                session: load.session || activeSession,
                volumen: load.volumen || '',
                expectedReembolso: load.reembolso || '',
                collectedValue: collectedValue || '0',
                reembolso: collectedValue || load.reembolso || '',
                status: 'delivered',
                address: load.address || '',
                observations: cardObservations[load.id] || '',
                tenantId: load.tenantId || tenantId || 'default',
                // Preserve supplier info so it shows on delivered card
                supplierName: load.supplierName || '',
                supplierReference: load.supplierReference || ''
            });

            // 1.5 Check for Debt (Shortfall)
            // Parse values safely
            const expectedVal = parseFloat((load.reembolso || "0").toString().replace(',', '.'));
            const collectedVal = parseFloat((collectedValue || "0").toString().replace(',', '.'));

            if (!isNaN(expectedVal) && expectedVal > 0) {
                const shortfall = expectedVal - (isNaN(collectedVal) ? 0 : collectedVal);

                // Tolerance for floating point (e.g. 0.01)
                if (shortfall > 0.05) {
                    // Create Debt Record
                    await addDoc(collection(db, "debts"), {
                        recipient: load.recipient,
                        remittance: load.remittance,
                        amount: shortfall.toFixed(2),
                        originalLoadId: load.id,
                        deliveryId: deliveryRef.id,
                        driverId: currentUser.uid,
                        driverName: currentUser.name || currentUser.email,
                        date: today,
                        createdAt: new Date().toISOString(),
                        tenantId: tenantId || 'default',
                        status: 'pending'
                    });

                    await logAction(currentUser, ACTIONS.UPDATE, `Debt Created: €${shortfall.toFixed(2)} for ${load.recipient}`, load.id);
                }
            }

            // 2. Update Load Record status
            await updateDoc(doc(db, "records", load.id), {
                status: 'delivered',
                deliveredQuantity: load.quantity
            });

            await logAction(currentUser, ACTIONS.DELIVER_ITEM, `Delivered ${load.quantity} units to ${load.recipient}`, deliveryRef.id);

            // Refresh list
            fetchPendingLoads();
        } catch (err) {
            console.error("Error processing delivery:", err);
            alert("Error processing delivery: " + err.message);
        }
        setLoading(false);
    };

    const handleScan = async (payload) => {
        if (!payload || !payload.id) {
            alert("Invalid QR Code Data");
            setIsScanning(false);
            return;
        }

        const matchedLoad = pendingLoads.find(l => l.id === payload.id);
        if (matchedLoad) {
            setIsScanning(false);
            await handleDeliverFromList(null, matchedLoad);
        } else {
            alert("Package not found in your pending deliveries!");
        }
    };

    const handleSubmitManual = async (e) => {
        e.preventDefault();
        if (!formData.recipient || !formData.remittance) {
            alert("Error: Recipient and Remittance are mandatory.");
            return;
        }

        setLoading(true);
        try {
            // 1. Save Delivery Record
            const deliveryRef = await addDoc(collection(db, "records"), {
                type: 'delivery',
                driverId: ((userRole === 'office' || userRole === 'backoffice') && selectedDriver) ? selectedDriver : currentUser.uid,
                driverName: ((userRole === 'office' || userRole === 'backoffice') && selectedDriver) ?
                    (drivers.find(d => d.uid === selectedDriver)?.name || drivers.find(d => d.uid === selectedDriver)?.email || currentUser.email)
                    : (currentUser.name || currentUser.email),
                ...formData,
                session: activeSession,
                status: 'delivered',
                tenantId: tenantId || 'default',
                createdAt: new Date().toISOString(),
                date: new Date().toISOString().split('T')[0]
            });

            await logAction(currentUser, ACTIONS.DELIVER_ITEM, `Manual Delivery registered for ${formData.recipient}`, deliveryRef.id);

            // 2. Auto-Link: Find and update 'Load' record to 'Delivered'
            // We search for a 'load' with the same remittance code created today (or recently)
            const q = query(
                collection(db, "records"),
                where("remittance", "==", formData.remittance),
                where("recipient", "==", formData.recipient),
                where("type", "==", "load")
            );
            const querySnapshot = await getDocs(q);

            if (querySnapshot.docs) {
                for (const docSnap of querySnapshot.docs) {
                    const loadData = docSnap.data();
                    const loadQty = Number(loadData.quantity || 0);

                    // Accumulate quantity if there were previous partial deliveries
                    const previousDelivered = Number(loadData.deliveredQuantity || 0);
                    const currentDeliveryQty = Number(formData.quantity || 0);
                    const totalDelivered = previousDelivered + currentDeliveryQty;

                    let newStatus = 'delivered';
                    if (totalDelivered < loadQty) {
                        newStatus = 'incident_missing'; // Still missing some items
                    } else if (totalDelivered > loadQty) {
                        newStatus = 'incident_excess';
                    }

                    const loadRef = doc(db, "records", docSnap.id);
                    await updateDoc(loadRef, {
                        status: newStatus,
                        linkedDeliveryTime: new Date().toISOString(),
                        deliveredQuantity: totalDelivered
                    });
                }
            }

            alert("Delivery Registered Successfully");
            setFormData({ recipient: '', remittance: '', quantity: '', volumen: '', reembolso: '', address: '', observations: '' });
            setViewMode('list');

        } catch (err) {
            console.error(err);
            alert("Error registering delivery");
        }
        setLoading(false);
    };

    return (
        <>
            {viewMode === 'list' ? (
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
                        <h2>Pending Deliveries ({activeSession === 'morning' ? 'Morning' : 'Afternoon'})</h2>
                        <button
                            onClick={() => setViewMode('manual')}
                            className="secondary-button"
                            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                        >
                            + Manually Register Delivery
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div style={{ marginBottom: '1rem' }}>
                        <input
                            type="text"
                            placeholder="Search by customer..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)', fontSize: '1rem' }}
                        />
                    </div>

                    {pendingLoads.filter(l => l.session === activeSession).length === 0 ? (
                        <div className="glass-panel" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            No pending loads found for this session.
                            <br /><br />
                            <button onClick={() => setViewMode('manual')} style={{ background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '0.5rem 1rem' }}>
                                Register Manual Delivery
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            {pendingLoads.filter(record => {
                                if (record.session !== activeSession) return false;
                                if (!searchTerm) return true;
                                return (record.recipient || '').toLowerCase().includes(searchTerm.toLowerCase().trim());
                            }).map(record => (
                                <div key={record.id} className="card" style={{ borderLeft: '4px solid #3b82f6' }}>
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
                                                <span style={{ color: '#ef4444' }}>
                                                    (PENDING <span style={{ fontSize: '0.9em' }}>x{record.quantity}</span>)
                                                </span>
                                            </span>
                                            <h3 style={{ margin: '0.25rem 0' }}>{record.recipient}</h3>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
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
                                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                <span style={{ color: '#f51519ff' }}>Notas:</span> <span style={{ color: 'var(--text-main)' }}>{record.volumen}</span>
                                            </div>
                                            {record.assignedByName && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem', fontStyle: 'italic' }}>
                                                    Assigned by: {record.assignedByName}
                                                </div>
                                            )}

                                        </div>

                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>x{record.quantity}</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                {new Date(record.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            {record.reembolso && (
                                                <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '0.2rem' }}>
                                                    {record.reembolso} €
                                                </div>
                                            )}
                                        </div>
                                    </div>


                                    <div>
                                        <div style={{
                                            marginTop: '1rem',
                                            paddingTop: '0.5rem',
                                            borderTop: '1px solid var(--border)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.8rem',
                                            justifyContent: 'space-between'
                                        }}>
                                            <input
                                                type="text"
                                                placeholder="Add observations..."
                                                value={cardObservations[record.id] || ''}
                                                onChange={(e) => handleCardObsChange(record.id, e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '0.6rem',
                                                    fontSize: '0.9rem',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--input-bg)',
                                                    color: 'var(--text-main)',
                                                    marginBottom: 0,
                                                    textAlign: 'left',
                                                    minWidth: '0' // Prevents flex item from overflowing
                                                }}
                                            />
                                            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                                <button
                                                    onClick={(e) => handleFailClick(e, record)}
                                                    style={{
                                                        padding: '0.3rem 1rem',
                                                        fontSize: '0.9rem',
                                                        background: 'transparent',
                                                        border: '1px solid #ef4444',
                                                        color: '#ef4444',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Fail
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setIsScanning(true); }}
                                                    style={{
                                                        padding: '0.3rem 0.6rem',
                                                        fontSize: '1.2rem',
                                                        background: 'transparent',
                                                        border: '1px solid var(--primary)',
                                                        color: 'var(--primary)',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderRadius: '4px'
                                                    }}
                                                    title="Scan QR"
                                                >
                                                    📷
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeliverFromList(e, record)}
                                                    className="primary-button"
                                                    style={{ padding: '0.3rem 1rem', fontSize: '0.9rem' }}
                                                >
                                                    Deliver
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="glass-panel animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <button onClick={() => setViewMode('list')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            ← Back to List
                        </button>
                    </div>
                    <h2>Register Delivery (Entrega)</h2>
                    <form onSubmit={handleSubmitManual}>
                        {/* Driver Info and Selector */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{ textAlign: 'left' }}>
                                <label className="label">Driver</label>
                                {(userRole === 'office' || userRole === 'backoffice') ? (
                                    <select
                                        value={selectedDriver}
                                        onChange={(e) => setSelectedDriver(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '0.4rem',
                                            border: '1px solid var(--border)',
                                            borderRadius: '4px',
                                            background: 'var(--input-bg)',
                                            color: 'var(--text-main)'
                                        }}
                                    >
                                        {drivers.map(d => (
                                            <option key={d.uid} value={d.uid}>
                                                {d.name || d.email}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input value={currentUser.name || currentUser.email} disabled style={{ opacity: 0.7 }} />
                                )}
                            </div>
                            <div style={{ textAlign: 'left' }}>
                                <label className="label">Time</label>
                                <input value={new Date().toLocaleTimeString()} disabled style={{ opacity: 0.7 }} />
                            </div>
                        </div>

                        <div style={{ textAlign: 'left' }}>
                            <label className="label">Recipient Name *</label>
                            <input name="recipient" value={formData.recipient} onChange={handleChange} required />
                        </div>

                        <div style={{ textAlign: 'left', marginTop: '1rem' }}>
                            <label className="label">Address / Location</label>
                            <input name="address" value={formData.address} onChange={handleChange} placeholder="Optional delivery address..." />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ textAlign: 'left' }}>
                                <label className="label">Remittance *</label>
                                <input name="remittance" value={formData.remittance} onChange={handleChange} required />
                            </div>
                            <div style={{ textAlign: 'left' }}>
                                <label className="label">Quantity</label>
                                <input name="quantity" type="number" value={formData.quantity} onChange={handleChange} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div style={{ textAlign: 'left' }}>
                                <label className="label">Reembolso (Numbers/Comma)</label>
                                <input
                                    name="reembolso"
                                    value={formData.reembolso}
                                    onChange={handleChange}
                                    placeholder="e.g. 50,00"
                                />
                            </div>
                            <div style={{ textAlign: 'left' }}>
                                <label className="label">Volumen/Missing/etc</label>
                                <input name="volumen" value={formData.volumen} onChange={handleChange} />
                            </div>
                        </div>

                        <div style={{ textAlign: 'left' }}>
                            <label className="label">Observations</label>
                            <input name="observations" value={formData.observations} onChange={handleChange} placeholder="Notes for the summary..." />
                        </div>

                        <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
                            {loading ? 'Saving...' : 'Register Delivery'}
                        </button>
                    </form>
                </div>
            )}

            {/* Fail Modal - Moved OUTSIDE of transforming containers and pinned to TOP */}
            {failingLoad && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex',
                    alignItems: 'flex-start', // Pin to top
                    justifyContent: 'center',
                    paddingTop: '3rem', // Add space from the very top
                    zIndex: 2000,
                    backdropFilter: 'blur(5px)'
                }}>
                    <div className="glass-panel" style={{ width: '90%', maxWidth: '400px', background: '#18181b', border: '1px solid #ef4444' }}>
                        <h3 style={{ color: '#ef4444', marginTop: 0 }}>Report Delivery Failure</h3>
                        <p style={{ color: 'var(--text-muted)' }}>
                            Recipient: <strong style={{ color: 'var(--text-main)' }}>{failingLoad.recipient}</strong>
                        </p>
                        <div style={{ margin: '1rem 0' }}>
                            <label className="label">Reason for Failure</label>
                            <textarea
                                value={failureReason}
                                onChange={(e) => setFailureReason(e.target.value)}
                                placeholder="e.g. Business Closed, Customer Rejected..."
                                style={{ width: '100%', minHeight: '80px', background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-main)', padding: '0.5rem' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={() => setFailingLoad(null)}
                                style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '0.5rem' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmFailDelivery}
                                style={{ flex: 1, background: '#ef4444', border: 'none', color: 'white', padding: '0.5rem', fontWeight: 'bold' }}
                            >
                                Confirm Failure
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isScanning && (
                <ScannerModal 
                    onScan={handleScan}
                    onClose={() => setIsScanning(false)}
                />
            )}
        </>
    );
}
