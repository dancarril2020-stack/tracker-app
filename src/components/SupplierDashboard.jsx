import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, collection, addDoc, query, where, doc, updateDoc, onSnapshot } from '../firebase';
import { logAction, ACTIONS } from '../utils/audit';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';

const ITEMS_PER_PAGE = 10;

export default function SupplierDashboard() {
    const { currentUser, tenantId } = useAuth();
    const [loading, setLoading] = useState(false);
    const [requests, setRequests] = useState([]);

    const [invoiceNum] = useState(() => 'INV-' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0'));

    const [formData, setFormData] = useState({
        recipient: '',
        address: '',
        quantity: '',
        volumen: '',
        reembolso: '',
        targetTenant: ''
    });

    // Filtering & Pagination State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [filterRecipient, setFilterRecipient] = useState('');
    const [filterTenant, setFilterTenant] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Edit Modal State
    const [editingRequest, setEditingRequest] = useState(null);

    useEffect(() => {
        if (!currentUser) return;

        const q = query(
            collection(db, "records"),
            where("supplierId", "==", currentUser.uid)
        );

        const unsub = onSnapshot(q, (snap) => {
            let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setRequests(data);
        }, (error) => {
            console.error("Error fetching supplier requests:", error);
        });

        return () => unsub();
    }, [currentUser, tenantId]);

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterDate, filterRecipient, filterTenant, filterStatus]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const supplierName = currentUser.tenantId ? currentUser.tenantId.toUpperCase() : currentUser.name || currentUser.email;

            const newDoc = await addDoc(collection(db, "records"), {
                type: 'pickup',
                status: 'supplier_submitted',
                supplierId: currentUser.uid,
                supplierName: supplierName,
                ...formData,
                supplierReference: invoiceNum,
                remittance: supplierName,
                scannedAtPickup: [],
                scannedAtLoad: [],
                tenantId: formData.targetTenant.toLowerCase().replace(/\s+/g, '-'),
                createdAt: new Date().toISOString(),
                date: new Date().toISOString().split('T')[0]
            });
            await logAction(currentUser, ACTIONS.CREATE_ITEM, `Supplier created request for ${formData.recipient} to ${formData.targetTenant} (Invoice: ${invoiceNum})`, newDoc.id);
            setFormData({ recipient: '', address: '', quantity: '', volumen: '', reembolso: '', targetTenant: '' });
            alert("Request submitted successfully!");
        } catch (err) {
            console.error(err);
            alert("Error submitting request: " + err.message);
        }
        setLoading(false);
    };

    const handleCancel = async (id) => {
        if (!window.confirm("Are you sure you want to cancel this request?")) return;
        try {
            await updateDoc(doc(db, "records", id), { status: 'supplier_cancelled' });
            await logAction(currentUser, ACTIONS.UPDATE, `Supplier cancelled request`, id);
        } catch (err) {
            console.error("Failed to cancel", err);
            alert("Failed to cancel: " + err.message);
        }
    };

    // Filter Logic
    const filteredRequests = requests.filter(req => {
        let match = true;
        if (filterDate && !req.createdAt.startsWith(filterDate)) match = false;
        if (filterRecipient && !(req.recipient && req.recipient.toLowerCase().includes(filterRecipient.toLowerCase()))) match = false;
        if (filterTenant && !(req.tenantId && req.tenantId.toLowerCase().includes(filterTenant.toLowerCase()))) match = false;
        if (filterStatus && req.status !== filterStatus) match = false;

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const matchesSearch =
                (req.recipient && req.recipient.toLowerCase().includes(term)) ||
                (req.address && req.address.toLowerCase().includes(term)) ||
                (req.supplierReference && req.supplierReference.toLowerCase().includes(term)) ||
                (req.tenantId && req.tenantId.toLowerCase().includes(term));
            if (!matchesSearch) match = false;
        }
        return match;
    });

    const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE);
    const paginatedRequests = filteredRequests.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const uniformActionBtnStyle = {
        padding: '0.4rem 0.8rem',
        fontSize: '0.85rem',
        fontWeight: '500',
        borderRadius: '6px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.3rem',
        height: '32px',
        border: '1px solid transparent',
        transition: 'all 0.2s',
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gap: '2rem' }}>

            <div className="glass-panel">
                <header style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Create Loading Request</h2>
                    <div style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Provider/Company:</span>
                            <div style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{currentUser.tenantId || currentUser.name || currentUser.email}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Invoice Number:</span>
                            <div style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '1.1rem' }}>{invoiceNum}</div>
                        </div>
                    </div>
                </header>

                <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Recipient Name *</label>
                        <input name="recipient" required placeholder="Who is receiving this?" value={formData.recipient} onChange={handleChange} />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Delivery Address *</label>
                        <input name="address" required placeholder="Full address including Zip Code" value={formData.address} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>Quantity *</label>
                        <input name="quantity" type="number" required placeholder="e.g. 3" value={formData.quantity} onChange={handleChange} min={1} />
                    </div>
                    <div className="form-group">
                        <label>Weight / Dimensions (Obs) *</label>
                        <input name="volumen" required placeholder="e.g. 10kg, Fragile" value={formData.volumen} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>COD Amount (€) *</label>
                        <input name="reembolso" type="number" step="0.01" min="0" required placeholder="Enter 0 if already paid" value={formData.reembolso} onChange={handleChange} />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Transport Client (e.g. TVR or GLS) *</label>
                        <input name="targetTenant" required placeholder="Name of your logistics provider" value={formData.targetTenant} onChange={handleChange} />
                    </div>
                    <div style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
                        <button type="submit" disabled={loading} className="primary-button" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}>
                            {loading ? 'Submitting...' : 'Submit Request & Prepare Labels'}
                        </button>
                    </div>
                </form>
            </div>

            <div className="glass-panel">
                <h3 style={{ marginTop: 0 }}>My Requests</h3>

                {/* Search & Filters */}
                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
                    <div>
                        <label className="label">Search All</label>
                        <input
                            placeholder="Search requests..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label className="label">Filter Date</label>
                        <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label className="label">Filter Recipient</label>
                        <input
                            placeholder="Recipient..."
                            value={filterRecipient}
                            onChange={(e) => setFilterRecipient(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label className="label">Filter Transport Client</label>
                        <input
                            placeholder="Transport Client..."
                            value={filterTenant}
                            onChange={(e) => setFilterTenant(e.target.value)}
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div>
                        <label className="label">Filter Status</label>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                        >
                            <option value="">All Statuses</option>
                            <option value="supplier_submitted">Waiting Pickup</option>
                            <option value="supplier_cancelled">Cancelled</option>
                            <option value="assigned">Assigned</option>
                            <option value="picked_up_supplier">In Warehouse</option>
                            <option value="assigned_load">Assigned Load</option>
                            <option value="pending">Out for Delivery</option>
                            <option value="delivered">Delivered</option>
                        </select>
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                <th style={{ padding: '0.5rem' }}>Date</th>
                                <th style={{ padding: '0.5rem' }}>Invoice No.</th>
                                <th style={{ padding: '0.5rem' }}>Recipient</th>
                                <th style={{ padding: '0.5rem' }}>Address</th>
                                <th style={{ padding: '0.5rem' }}>Transport Client</th>
                                <th style={{ padding: '0.5rem' }}>Qty</th>
                                <th style={{ padding: '0.5rem' }}>Weight/Obs</th>
                                <th style={{ padding: '0.5rem' }}>COD (€)</th>
                                <th style={{ padding: '0.5rem' }}>Status</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedRequests.map(req => (
                                <tr key={req.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', opacity: req.status === 'supplier_cancelled' ? 0.6 : 1 }}>
                                    <td style={{ padding: '0.5rem' }}>{new Date(req.createdAt).toLocaleDateString()}</td>
                                    <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{req.supplierReference}</td>
                                    <td style={{ padding: '0.5rem' }}>{req.recipient}</td>
                                    <td style={{ padding: '0.5rem', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={req.address}>{req.address}</td>
                                    <td style={{ padding: '0.5rem', textTransform: 'uppercase' }}>{req.targetTenant || req.tenantId}</td>
                                    <td style={{ padding: '0.5rem' }}>{req.quantity}</td>
                                    <td style={{ padding: '0.5rem' }}>{req.volumen || '-'}</td>
                                    <td style={{ padding: '0.5rem' }}>{req.reembolso || '0'}</td>
                                    <td style={{ padding: '0.5rem', fontWeight: 'bold', color: req.status === 'supplier_submitted' ? '#3b82f6' : req.status === 'supplier_cancelled' ? '#ef4444' : 'var(--primary)' }}>
                                        {req.status === 'supplier_submitted' ? 'Waiting Pickup' : req.status === 'supplier_cancelled' ? 'Cancelled' : req.status}
                                    </td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'nowrap' }}>
                                            <PrintLabelsButton request={req} btnStyle={uniformActionBtnStyle} />
                                            {req.status === 'supplier_submitted' && (
                                                <>
                                                    <button onClick={() => setEditingRequest(req)} style={{ ...uniformActionBtnStyle, background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', border: '1px solid var(--border)' }}>✏️ Edit</button>
                                                    <button onClick={() => handleCancel(req.id)} style={{ ...uniformActionBtnStyle, background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid #ef4444' }}>❌ Cancel</button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {paginatedRequests.length === 0 && (
                                <tr>
                                    <td colSpan="10" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No requests found for the given filters.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => prev - 1)}
                            className="secondary-button"
                        >
                            Previous
                        </button>
                        <span>Page {currentPage} of {totalPages}</span>
                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(prev => prev + 1)}
                            className="secondary-button"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* Supplier Edit Modal */}
            {editingRequest && (
                <SupplierEditModal
                    request={editingRequest}
                    onClose={() => setEditingRequest(null)}
                />
            )}
        </div>
    );
}

// Supplier Specific Edit Modal
const SupplierEditModal = ({ request, onClose }) => {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState({ ...request });
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const updates = {
                recipient: formData.recipient,
                address: formData.address,
                quantity: formData.quantity,
                volumen: formData.volumen,
                reembolso: formData.reembolso,
                targetTenant: formData.targetTenant,
                tenantId: formData.targetTenant.toLowerCase().replace(/\s+/g, '-')
            };
            await updateDoc(doc(db, "records", request.id), updates);
            await logAction(currentUser, ACTIONS.UPDATE, `Supplier edited request ${request.supplierReference}`, request.id);
            onClose();
        } catch (err) {
            console.error(err);
            alert("Error updating: " + err.message);
        }
        setLoading(false);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex',
            alignItems: 'center', justifyContent: 'center'
        }}>
            <div className="glass-panel" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
                <h2 style={{ marginTop: 0 }}>Edit Request</h2>
                <form onSubmit={handleSave} style={{ display: 'grid', gap: '1rem' }}>
                    <div className="form-group">
                        <label>Recipient Name</label>
                        <input name="recipient" required value={formData.recipient} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>Delivery Address</label>
                        <input name="address" required value={formData.address} onChange={handleChange} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>Quantity</label>
                            <input name="quantity" type="number" min="1" required value={formData.quantity} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Weight / Obs</label>
                            <input name="volumen" value={formData.volumen} onChange={handleChange} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>COD Amount (€)</label>
                            <input name="reembolso" type="number" step="0.01" min="0" required value={formData.reembolso} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Transport Client</label>
                            <input name="targetTenant" required value={formData.targetTenant} onChange={handleChange} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button type="button" onClick={onClose} className="secondary-button" style={{ flex: 1 }}>Cancel</button>
                        <button type="submit" disabled={loading} className="primary-button" style={{ flex: 1 }}>{loading ? 'Saving...' : 'Save Changes'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const PrintLabelsButton = ({ request, btnStyle }) => {
    const [generating, setGenerating] = useState(false);
    const quantity = Number(request.quantity) || 1;
    const canvasRefs = useRef([]);

    const handlePrint = async () => {
        setGenerating(true);
        setTimeout(() => {
            try {
                const doc = new jsPDF({ format: 'a6' }); // 105 x 148 mm

                for (let i = 0; i < quantity; i++) {
                    if (i > 0) doc.addPage();

                    doc.setFontSize(14);
                    doc.text(`Company: TVR Logistics`, 10, 15);

                    doc.setFontSize(10);
                    const safeAddress = request.address ? request.address.substring(0, 40) : 'N/A'; // Fit A6
                    doc.text(`Recipient: ${request.recipient}`, 10, 25);
                    doc.text(`Address: ${safeAddress}`, 10, 32);
                    doc.text(`Ref/Invoice: ${request.supplierReference || 'N/A'}`, 10, 39);
                    doc.text(`Remittance: ${request.supplierName || request.remittance || 'N/A'}`, 10, 46);
                    doc.text(`Package: ${i + 1} of ${quantity}`, 10, 53);
                    doc.text(`Date: ${new Date(request.createdAt).toLocaleDateString()}`, 10, 60);

                    const canvas = canvasRefs.current[i];
                    if (canvas) {
                        const imgData = canvas.toDataURL('image/png');
                        doc.addImage(imgData, 'PNG', 15, 65, 75, 75); // 75x75 mm QR code scaled
                    }
                }
                doc.save(`Labels_${request.supplierReference || request.id}.pdf`);
            } catch (err) {
                console.error("Error generating PDF", err);
                alert("Failed to generate labels.");
            }
            setGenerating(false);
        }, 300);
    };

    return (
        <>
            <button
                onClick={handlePrint}
                disabled={generating}
                style={{ ...btnStyle, background: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary)', borderColor: 'var(--primary)' }}
            >
                {generating ? '...' : '🖨️ Print QRs'}
            </button>
            <div style={{ display: 'none' }}>
                {Array.from({ length: quantity }).map((_, i) => (
                    <QRCodeCanvas
                        key={i}
                        value={`{"id":"${request.id}","pkg":${i + 1},"tot":${quantity}}`}
                        size={300}
                        level="H"
                        ref={el => canvasRefs.current[i] = el}
                    />
                ))}
            </div>
        </>
    );
};
