/**
 * SupplierDashboard.tsx
 * Purpose: Provides a dashboard for suppliers to create loading requests,
 * manage their recipient/product catalogs, and track the status of their shipments.
 */
import React, { useState, useEffect, useRef } from 'react';
import { RecordItem, Recipient, Product } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { db, collection, addDoc, query, where, doc, updateDoc, deleteDoc, onSnapshot, getDocs } from '../firebase';
import { logAction, ACTIONS } from '../utils/audit';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';

const ITEMS_PER_PAGE = 10;

export default function SupplierDashboard() {
    const { currentUser, tenantId } = useAuth();
    const [loading, setLoading] = useState(false);
    const [requests, setRequests] = useState<RecordItem[]>([]);

    const [invoiceNum, setInvoiceNum] = useState<string>(() => `INV-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`);

    // Dynamic Data States
    const [recipientsList, setRecipientsList] = useState<Recipient[]>([]);
    const [productsList, setProductsList] = useState<Product[]>([]);
    const [zipPortesMap, setZipPortesMap] = useState<Record<string, number>>({});

    const [formData, setFormData] = useState({
        recipient: '',
        address: '',
        zipCode: '',
        phone: '',
        quantity: '',
        volumen: '',
        reembolso: '',
        observations: '',
        portes: 0,
        portesPaymentType: 'debidos',
        hasBankAccount: false
    });

    const [recipientSearch, setRecipientSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);
    const [showProductDropdown, setShowProductDropdown] = useState(false);

    // Filtering & Pagination State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [filterRecipient, setFilterRecipient] = useState('');
    const [filterTenant, setFilterTenant] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Edit Modal State
    const [editingRequest, setEditingRequest] = useState<RecordItem | null>(null);

    // Catalog sub-tab state
    const [activeSupplierTab, setActiveSupplierTab] = useState<'orders' | 'catalog'>('orders');
    const [showAddRecipient, setShowAddRecipient] = useState(false);
    const [showAddProduct, setShowAddProduct] = useState(false);
    const [recipientForm, setRecipientForm] = useState({ name: '', address: '', zipCode: '', phone: '', hasBankAccount: false });
    const [productForm, setProductForm] = useState({ name: '', weightObs: '' });
    const [recipientListSearch, setRecipientListSearch] = useState('');
    const [productListSearch, setProductListSearch] = useState('');

    // Fetch supplier requests and dynamically load recipients/products on component mount.
    useEffect(() => {
        if (!currentUser) return;

        const q = query(
            collection(db, "records"),
            where("supplierId", "==", currentUser.uid)
        );

        const unsub = onSnapshot(q, (snap) => {
            let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecordItem));
            data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setRequests(data);
        }, (error) => {
            console.error("Error fetching supplier requests:", error);
        });

        // Fetch dynamic data
        const fetchDynamicData = async () => {
            try {
                const recQ = query(collection(db, "recipients"), where("supplierId", "==", currentUser.uid));
                const recSnapshot = await getDocs(recQ);
                const recList: Recipient[] = [];
                recSnapshot.forEach(doc => recList.push({ id: doc.id, ...doc.data() } as Recipient));
                setRecipientsList(recList);

                const prodQ = query(collection(db, "products"), where("supplierId", "==", currentUser.uid));
                const prodSnapshot = await getDocs(prodQ);
                const prodList: Product[] = [];
                prodSnapshot.forEach(doc => prodList.push({ id: doc.id, ...doc.data() } as Product));
                setProductsList(prodList);

                const zipSnapshot = await getDocs(collection(db, "zip_portes"));
                const zipMap: Record<string, number> = {};
                zipSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.zipCode && data.price !== undefined) {
                        zipMap[data.zipCode] = Number(data.price);
                    }
                });
                setZipPortesMap(zipMap);
            } catch (err) {
                console.error("Error fetching dynamic data:", err);
            }
        };
        fetchDynamicData();

        return () => unsub();
    }, [currentUser, tenantId]);

    // Reset pagination when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterDate, filterRecipient, filterTenant, filterStatus]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Handle form submission to create a new request in Firestore.
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        setLoading(true);
        try {
            const supplierName = (currentUser.supplierCompanyName || currentUser.name || currentUser.email || 'Unknown Supplier').toUpperCase();
            const targetTenant = tenantId || 'default';

            const newDoc = await addDoc(collection(db, "records"), {
                type: 'pickup',
                status: 'supplier_submitted',
                supplierId: currentUser.uid,
                supplierName: supplierName,
                ...formData,
                targetTenant: targetTenant.toUpperCase(),
                tenantId: targetTenant.toLowerCase(),
                supplierReference: invoiceNum,
                remittance: supplierName,
                scannedAtPickup: [],
                scannedAtLoad: [],
                createdAt: new Date().toISOString(),
                date: new Date().toISOString().split('T')[0]
            });
            await logAction(currentUser, ACTIONS.CREATE_ITEM, `Supplier created request for ${formData.recipient} (Invoice: ${invoiceNum})`, newDoc.id);
            setFormData({ recipient: '', address: '', zipCode: '', phone: '', quantity: '', volumen: '', reembolso: '', observations: '', portes: 0, portesPaymentType: 'debidos', hasBankAccount: false });
            setRecipientSearch('');
            setProductSearch('');
            setInvoiceNum(`INV-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`);
            alert("Request submitted successfully!");
        } catch (err) {
            console.error(err);
            alert("Error submitting request: " + (err as Error).message);
        }
        setLoading(false);
    };

    const handleCancel = async (id: string) => {
        if (!window.confirm("Are you sure you want to cancel this request?")) return;
        try {
            await updateDoc(doc(db, "records", id), { status: 'supplier_cancelled' });
            await logAction(currentUser, ACTIONS.EDIT_LOAD, `Supplier cancelled request`, id);
        } catch (err) {
            console.error("Failed to cancel", err);
            alert("Failed to cancel: " + (err as Error).message);
        }
    };

    // --- CATALOG HANDLERS ---
    const handleAddRecipient = async () => {
        if (!currentUser) return;
        if (!recipientForm.name || !recipientForm.address || !recipientForm.zipCode || !recipientForm.phone) {
            alert('Please fill in all recipient fields.');
            return;
        }
        try {
            await addDoc(collection(db, 'recipients'), { ...recipientForm, supplierId: currentUser.uid });
            setRecipientForm({ name: '', address: '', zipCode: '', phone: '', hasBankAccount: false });
            setShowAddRecipient(false);
            // Refresh the list used by the invoice autocomplete too
            const recQ = query(collection(db, "recipients"), where("supplierId", "==", currentUser.uid));
            const snap = await getDocs(recQ);
            const list: Recipient[] = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() } as Recipient));
            setRecipientsList(list);
        } catch (err) {
            alert('Error adding recipient: ' + (err as Error).message);
        }
    };

    const handleDeleteRecipient = async (id: string) => {
        if (!window.confirm('Delete this recipient?')) return;
        try {
            await deleteDoc(doc(db, 'recipients', id));
            setRecipientsList(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            alert('Error deleting recipient: ' + (err as Error).message);
        }
    };

    const handleAddProduct = async () => {
        if (!currentUser) return;
        if (!productForm.name || !productForm.weightObs) {
            alert('Please fill in all product fields.');
            return;
        }
        try {
            await addDoc(collection(db, 'products'), { ...productForm, supplierId: currentUser.uid });
            setProductForm({ name: '', weightObs: '' });
            setShowAddProduct(false);
            // Refresh the list used by the invoice autocomplete too
            const prodQ = query(collection(db, "products"), where("supplierId", "==", currentUser.uid));
            const snap = await getDocs(prodQ);
            const list: Product[] = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() } as Product));
            setProductsList(list);
        } catch (err) {
            alert('Error adding product: ' + (err as Error).message);
        }
    };

    const handleDeleteProduct = async (id: string) => {
        if (!window.confirm('Delete this product?')) return;
        try {
            await deleteDoc(doc(db, 'products', id));
            setProductsList(prev => prev.filter(p => p.id !== id));
        } catch (err) {
            alert('Error deleting product: ' + (err as Error).message);
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

            {/* Internal sub-tab navigation */}
            <div style={{ display: 'flex', gap: '0.6rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                <button
                    type="button"
                    onClick={() => setActiveSupplierTab('orders')}
                    style={{
                        background: activeSupplierTab === 'orders' ? 'rgba(249,115,22,0.15)' : 'transparent',
                        border: activeSupplierTab === 'orders' ? '1px solid var(--primary)' : '1px solid var(--border)',
                        color: activeSupplierTab === 'orders' ? 'var(--primary)' : 'var(--text-muted)',
                        borderRadius: '8px', padding: '0.5rem 1.2rem', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s'
                    }}
                >
                    📦 Orders
                </button>
                <button
                    type="button"
                    onClick={() => setActiveSupplierTab('catalog')}
                    style={{
                        background: activeSupplierTab === 'catalog' ? 'rgba(249,115,22,0.15)' : 'transparent',
                        border: activeSupplierTab === 'catalog' ? '1px solid var(--primary)' : '1px solid var(--border)',
                        color: activeSupplierTab === 'catalog' ? 'var(--primary)' : 'var(--text-muted)',
                        borderRadius: '8px', padding: '0.5rem 1.2rem', cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s'
                    }}
                >
                    🗂️ My Catalog
                </button>
            </div>

            {/* Orders Tab */}
            {activeSupplierTab === 'orders' && <>
                <div className="glass-panel">
                    <header style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Create Loading Request</h2>
                        <div style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Provider/Company:</span>
                                <div style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{currentUser?.supplierCompanyName || currentUser?.name || currentUser?.email || 'N/A'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Invoice Number:</span>
                                <div style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '1.1rem' }}>{invoiceNum}</div>
                            </div>
                        </div>
                    </header>

                    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                        {/* Recipient Search & Selection */}
                        <div className="form-group" style={{ gridColumn: '1 / -1', position: 'relative' }}>
                            <label>Search Recipient (Database) 🔍</label>
                            <div style={{ display: 'flex', position: 'relative' }}>
                                <input
                                    placeholder="Type to search clients..."
                                    value={recipientSearch}
                                    onChange={(e) => {
                                        setRecipientSearch(e.target.value);
                                        setShowRecipientDropdown(true);
                                    }}
                                    onFocus={() => setShowRecipientDropdown(true)}
                                    style={{ flex: 1, paddingRight: '30px' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowRecipientDropdown(!showRecipientDropdown)}
                                    style={{
                                        position: 'absolute', right: 0, top: 0, bottom: 0,
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        padding: '0 10px', color: 'var(--text-muted)'
                                    }}
                                >
                                    ▼
                                </button>
                            </div>
                            {showRecipientDropdown && (
                                <div className="glass-panel" style={{ position: 'absolute', width: '100%', zIndex: 100, maxHeight: '200px', overflowY: 'auto', top: '100%', marginTop: '5px', padding: '0.5rem' }}>
                                    {recipientsList.filter(r => !recipientSearch || r.name.toLowerCase().includes(recipientSearch.toLowerCase())).map(r => (
                                        <div
                                            key={r.id}
                                            className="dropdown-item"
                                            style={{ padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                                            onClick={() => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    recipient: r.name,
                                                    address: r.address,
                                                    zipCode: r.zipCode,
                                                    phone: r.phone,
                                                    hasBankAccount: r.hasBankAccount,
                                                    portes: zipPortesMap[r.zipCode] || 0
                                                }));
                                                setRecipientSearch(r.name);
                                                setShowRecipientDropdown(false);
                                            }}
                                        >
                                            <strong>{r.name}</strong> - {r.zipCode}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label>Recipient Name *</label>
                            <input name="recipient" required placeholder="Name" value={formData.recipient} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Recipient Phone</label>
                            <input name="phone" placeholder="Phone" value={formData.phone} onChange={handleChange} />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / span 2' }}>
                            <label>Delivery Address *</label>
                            <input name="address" required placeholder="Full address" value={formData.address} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Zip Code</label>
                            <input
                                name="zipCode"
                                placeholder="Zip"
                                value={formData.zipCode}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setFormData(prev => ({ ...prev, zipCode: val, portes: zipPortesMap[val] || 0 }));
                                }}
                            />
                        </div>
                        <div className="form-group">
                            <label>Portes (€) & Tipo [Auto]</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input name="portes" value={formData.portes ? formData.portes.toFixed(2) : '0.00'} readOnly style={{ flex: 1, background: 'rgba(255,255,255,0.05)', cursor: 'not-allowed' }} />
                                <select
                                    name="portesPaymentType"
                                    value={formData.portesPaymentType || 'debidos'}
                                    onChange={handleChange}
                                    style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                >
                                    <option value="debidos">Debidos</option>
                                    <option value="pagados">Pagados</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="checkbox"
                                checked={formData.hasBankAccount}
                                readOnly
                                style={{ width: '20px', height: '20px' }}
                            />
                            <label style={{ margin: 0 }}>Has Bank Account with Transport Client</label>
                        </div>

                        <hr style={{ gridColumn: '1 / -1', border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />

                        {/* Product Search & Selection */}
                        <div className="form-group" style={{ gridColumn: '1 / span 2', position: 'relative' }}>
                            <label>Search Product / Service 📦</label>
                            <div style={{ display: 'flex', position: 'relative' }}>
                                <input
                                    placeholder="Type to search products..."
                                    value={productSearch}
                                    onChange={(e) => {
                                        setProductSearch(e.target.value);
                                        setShowProductDropdown(true);
                                    }}
                                    onFocus={() => setShowProductDropdown(true)}
                                    style={{ flex: 1, paddingRight: '30px' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowProductDropdown(!showProductDropdown)}
                                    style={{
                                        position: 'absolute', right: 0, top: 0, bottom: 0,
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        padding: '0 10px', color: 'var(--text-muted)'
                                    }}
                                >
                                    ▼
                                </button>
                            </div>
                            {showProductDropdown && (
                                <div className="glass-panel" style={{ position: 'absolute', width: '100%', zIndex: 100, maxHeight: '200px', overflowY: 'auto', top: '100%', marginTop: '5px', padding: '0.5rem' }}>
                                    {productsList.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())).map(p => (
                                        <div
                                            key={p.id}
                                            className="dropdown-item"
                                            style={{ padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                                            onClick={() => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    volumen: p.weightObs
                                                }));
                                                setProductSearch(p.name);
                                                setShowProductDropdown(false);
                                            }}
                                        >
                                            <strong>{p.name}</strong> ({p.weightObs})
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="form-group">
                            <label>Weight / Dimensions *</label>
                            <input name="volumen" required placeholder="e.g. 10kg" value={formData.volumen} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                            <label>Quantity *</label>
                            <input name="quantity" type="number" required placeholder="Qty" value={formData.quantity} onChange={handleChange} min={1} />
                        </div>
                        <div className="form-group">
                            <label>Reembolso (€) *</label>
                            <input name="reembolso" type="number" step="0.01" min="0" required placeholder="0 if paid" value={formData.reembolso} onChange={handleChange} />
                        </div>

                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>Observations / Manual Notes</label>
                            <textarea
                                name="observations"
                                placeholder="Special instructions, fragile, etc."
                                value={formData.observations}
                                onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
                                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)', minHeight: '80px' }}
                            />
                        </div>

                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>Transport Client (Automated)</label>
                            <div style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontWeight: 'bold', color: 'var(--primary)', border: '1px dashed var(--primary)' }}>
                                {tenantId?.toUpperCase() || 'DEFAULT'}
                            </div>
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
                                    <th style={{ padding: '0.5rem' }}>Date & Time</th>
                                    <th style={{ padding: '0.5rem' }}>Invoice No.</th>
                                    <th style={{ padding: '0.5rem' }}>Recipient</th>
                                    <th style={{ padding: '0.5rem' }}>Address</th>
                                    <th style={{ padding: '0.5rem' }}>Transport Client</th>
                                    <th style={{ padding: '0.5rem' }}>Driver</th>
                                    <th style={{ padding: '0.5rem' }}>Qty</th>
                                    <th style={{ padding: '0.5rem' }}>Weight/Obs</th>
                                    <th style={{ padding: '0.5rem' }}>REEMB (€)</th>
                                    <th style={{ padding: '0.5rem' }}>Status</th>
                                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedRequests.map(req => (
                                    <tr key={req.id} data-record-id={req.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', opacity: req.status === 'supplier_cancelled' ? 0.6 : 1 }}>
                                        <td style={{ padding: '0.5rem' }}>{new Date(req.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                                        <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{req.supplierReference}</td>
                                        <td style={{ padding: '0.5rem' }}>{req.recipient}</td>
                                        <td style={{ padding: '0.5rem', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={req.address}>{req.address}</td>
                                        <td style={{ padding: '0.5rem', textTransform: 'uppercase' }}>{req.tenantId}</td>
                                        <td style={{ padding: '0.5rem' }}>{req.driverName || '-'}</td>
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
                                        <td colSpan={10} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No requests found for the given filters.</td>
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
                        zipPortesMap={zipPortesMap}
                    />
                )}
            </>}

            {/* My Catalog Tab */}
            {activeSupplierTab === 'catalog' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

                    {/* Recipients Panel */}
                    <div className="glass-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>👥 Recipients / Clients</h3>
                            <button
                                type="button"
                                onClick={() => setShowAddRecipient(v => !v)}
                                style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', background: 'rgba(249,115,22,0.15)', border: '1px solid var(--primary)', color: 'var(--primary)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                {showAddRecipient ? '✕ Cancel' : '+ Add'}
                            </button>
                        </div>

                        {/* Add Recipient inline form */}
                        {showAddRecipient && (
                            <div className="animate-fade-in" style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'grid', gap: '0.5rem' }}>
                                    <input
                                        placeholder="Company / Client Name *"
                                        value={recipientForm.name}
                                        onChange={e => setRecipientForm(p => ({ ...p, name: e.target.value }))}
                                        style={{ marginBottom: 0 }}
                                    />
                                    <input
                                        placeholder="Address *"
                                        value={recipientForm.address}
                                        onChange={e => setRecipientForm(p => ({ ...p, address: e.target.value }))}
                                        style={{ marginBottom: 0 }}
                                    />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                        <input
                                            placeholder="Zip Code *"
                                            value={recipientForm.zipCode}
                                            onChange={e => setRecipientForm(p => ({ ...p, zipCode: e.target.value }))}
                                            style={{ marginBottom: 0 }}
                                        />
                                        <input
                                            placeholder="Phone *"
                                            value={recipientForm.phone}
                                            onChange={e => setRecipientForm(p => ({ ...p, phone: e.target.value }))}
                                            style={{ marginBottom: 0 }}
                                        />
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.3rem 0' }}>
                                        <input
                                            type="checkbox"
                                            checked={recipientForm.hasBankAccount}
                                            onChange={e => setRecipientForm(p => ({ ...p, hasBankAccount: e.target.checked }))}
                                            style={{ width: '18px', height: '18px', margin: 0 }}
                                        />
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Has Bank Account with Transport Client</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleAddRecipient}
                                        style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.6rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.3rem' }}
                                    >
                                        Save Recipient
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Search */}
                        <input
                            placeholder="🔍 Search recipients..."
                            value={recipientListSearch}
                            onChange={e => setRecipientListSearch(e.target.value)}
                            style={{ marginBottom: '1rem' }}
                        />

                        {/* Recipients list */}
                        <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '420px', overflowY: 'auto' }}>
                            {recipientsList
                                .filter(r => !recipientListSearch || r.name.toLowerCase().includes(recipientListSearch.toLowerCase()))
                                .map(r => (
                                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.address} · {r.zipCode}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', marginTop: '0.2rem' }}>
                                                <span>{r.phone}</span>
                                                {r.hasBankAccount && <span style={{ color: 'var(--primary)' }}>🏦 Bank</span>}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteRecipient(r.id)}
                                            title="Delete recipient"
                                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0, marginLeft: '0.5rem' }}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))
                            }
                            {recipientsList.filter(r => !recipientListSearch || r.name.toLowerCase().includes(recipientListSearch.toLowerCase())).length === 0 && (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: '0.9rem' }}>No recipients found.</div>
                            )}
                        </div>
                    </div>

                    {/* Products Panel */}
                    <div className="glass-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📦 Products</h3>
                            <button
                                type="button"
                                onClick={() => setShowAddProduct(v => !v)}
                                style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', background: 'rgba(249,115,22,0.15)', border: '1px solid var(--primary)', color: 'var(--primary)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                {showAddProduct ? '✕ Cancel' : '+ Add'}
                            </button>
                        </div>

                        {/* Add Product inline form */}
                        {showAddProduct && (
                            <div className="animate-fade-in" style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'grid', gap: '0.5rem' }}>
                                    <input
                                        placeholder="Product / Service Name *"
                                        value={productForm.name}
                                        onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))}
                                        style={{ marginBottom: 0 }}
                                    />
                                    <input
                                        placeholder="Weight / Observations *"
                                        value={productForm.weightObs}
                                        onChange={e => setProductForm(p => ({ ...p, weightObs: e.target.value }))}
                                        style={{ marginBottom: 0 }}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddProduct}
                                        style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.6rem', fontWeight: 600, cursor: 'pointer', marginTop: '0.3rem' }}
                                    >
                                        Save Product
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Search */}
                        <input
                            placeholder="🔍 Search products..."
                            value={productListSearch}
                            onChange={e => setProductListSearch(e.target.value)}
                            style={{ marginBottom: '1rem' }}
                        />

                        {/* Products list */}
                        <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '420px', overflowY: 'auto' }}>
                            {productsList
                                .filter(p => !productListSearch || p.name.toLowerCase().includes(productListSearch.toLowerCase()))
                                .map(p => (
                                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{p.weightObs}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteProduct(p.id)}
                                            title="Delete product"
                                            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0, marginLeft: '0.5rem' }}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))
                            }
                            {productsList.filter(p => !productListSearch || p.name.toLowerCase().includes(productListSearch.toLowerCase())).length === 0 && (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: '0.9rem' }}>No products found.</div>
                            )}
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}

// Supplier Specific Edit Modal
const SupplierEditModal = ({ request, onClose, zipPortesMap }: { request: RecordItem, onClose: () => void, zipPortesMap: Record<string, number> }) => {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState({ ...request });
    const [loading, setLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const updates = {
                recipient: formData.recipient,
                address: formData.address,
                zipCode: formData.zipCode,
                phone: formData.phone,
                quantity: formData.quantity,
                volumen: formData.volumen,
                reembolso: formData.reembolso,
                observations: formData.observations,
                portes: formData.portes,
                portesPaymentType: formData.portesPaymentType || 'debidos',
                hasBankAccount: formData.hasBankAccount
            };
            await updateDoc(doc(db, "records", request.id), updates);
            await logAction(currentUser, ACTIONS.EDIT_LOAD, `Supplier edited request ${request.supplierReference}`, request.id);
            onClose();
        } catch (err) {
            console.error(err);
            alert("Error updating: " + (err as Error).message);
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
                        <label>Recipient Phone</label>
                        <input name="phone" value={formData.phone} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>Delivery Address</label>
                        <input name="address" required value={formData.address} onChange={handleChange} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>Zip Code</label>
                            <input name="zipCode" value={formData.zipCode} onChange={(e) => {
                                const val = e.target.value;
                                setFormData(prev => ({ ...prev, zipCode: val, portes: zipPortesMap[val] || prev.portes }));
                            }} />
                        </div>
                        <div className="form-group">
                            <label>Portes (€) & Tipo</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <input name="portes" type="number" step="0.01" value={formData.portes} onChange={handleChange} style={{ flex: 1 }} />
                                <select
                                    name="portesPaymentType"
                                    value={formData.portesPaymentType || 'debidos'}
                                    onChange={(e) => setFormData(prev => ({ ...prev, portesPaymentType: e.target.value as 'debidos' | 'pagados' }))}
                                    style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                                >
                                    <option value="debidos">Debidos</option>
                                    <option value="pagados">Pagados</option>
                                </select>
                            </div>
                        </div>
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
                    <div className="form-group">
                        <label>Reembolso (€)</label>
                        <input name="reembolso" type="number" step="0.01" min="0" required value={formData.reembolso} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>Observations</label>
                        <textarea name="observations" value={formData.observations} onChange={handleChange} style={{ width: '100%', minHeight: '60px' }} />
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


const PrintLabelsButton = ({ request, btnStyle }: { request: RecordItem, btnStyle: React.CSSProperties }) => {
    const [generating, setGenerating] = useState(false);
    const quantity = Number(request.quantity) || 1;
    const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

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
                        ref={el => { if (el) canvasRefs.current[i] = el; }}
                    />
                ))}
            </div>
        </>
    );
};
