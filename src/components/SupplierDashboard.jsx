import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, collection, addDoc, query, where, orderBy, onSnapshot } from '../firebase';
import { logAction, ACTIONS } from '../utils/audit';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';

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
        targetTenant: '' // The transport client
    });

    const qrContainerRef = useRef(null);

    useEffect(() => {
        if (!currentUser) return;

        const q = query(
            collection(db, "records"),
            where("supplierId", "==", currentUser.uid)
        );

        const unsub = onSnapshot(q, (snap) => {
            let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort client-side to avoid Firestore index requirements
            data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setRequests(data);
        }, (error) => {
            console.error("Error fetching supplier requests:", error);
        });

        return () => unsub();
    }, [currentUser, tenantId]);

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

    const handlePrintLabels = async (request) => {
        const doc = new jsPDF();
        const quantity = Number(request.quantity) || 1;
        
        for (let i = 1; i <= quantity; i++) {
            if (i > 1) doc.addPage();
            
            // Set up page
            doc.setFontSize(22);
            doc.text(`Company: TVR Logistics`, 20, 30);
            
            doc.setFontSize(16);
            doc.text(`Recipient: ${request.recipient}`, 20, 50);
            doc.text(`Address: ${request.address || 'N/A'}`, 20, 60);
            doc.text(`Ref/Invoice: ${request.supplierReference || 'N/A'}`, 20, 70);
            doc.text(`Remittance: ${request.supplierName || request.remittance || 'N/A'}`, 20, 80);
            doc.text(`Package: ${i} of ${quantity}`, 20, 90);

            // Generate QR Data string
            const qrData = JSON.stringify({
                id: request.id,
                pkg: i,
                total: quantity
            });

            // Create temporary canvas
            const canvas = document.createElement('canvas');
            const QRCodeReact = require('qrcode.react').QRCodeCanvas || require('qrcode.react');
            // We use standard rendering from the DOM instead of importing the whole react tree here,
            // Actually, jspdf can't render react components easily without a DOM ref.
            // A simpler way: we will render a hidden QR Code in the document, get its data URL, and add to PDF.
        }
        // doc.save(`Labels_${request.remittance || request.id}.pdf`);
    };

    return (
        <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto', display: 'grid', gap: '2rem' }}>
            
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
                        <label>Recipient Name</label>
                        <input name="recipient" required placeholder="Who is receiving this?" value={formData.recipient} onChange={handleChange} />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Delivery Address</label>
                        <input name="address" required placeholder="Full address including Zip Code" value={formData.address} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>Quantity (Boxes/Pallets)</label>
                        <input name="quantity" type="number" required placeholder="e.g. 3" value={formData.quantity} onChange={handleChange} min={1} />
                    </div>
                    <div className="form-group">
                        <label>Weight / Dimensions (Obs)</label>
                        <input name="volumen" placeholder="e.g. 10kg, Fragile" value={formData.volumen} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                        <label>COD Amount (€) *</label>
                        <input name="reembolso" type="number" step="0.01" min="0" required placeholder="Enter 0 if already paid" value={formData.reembolso} onChange={handleChange} />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Transport Client (e.g. TVR or GLS)</label>
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
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                <th style={{ padding: '0.5rem' }}>Date</th>
                                <th style={{ padding: '0.5rem' }}>Recipient</th>
                                <th style={{ padding: '0.5rem' }}>Qty</th>
                                <th style={{ padding: '0.5rem' }}>Status</th>
                                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(req => (
                                <tr key={req.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <td style={{ padding: '0.5rem' }}>{new Date(req.createdAt).toLocaleDateString()}</td>
                                    <td style={{ padding: '0.5rem' }}>{req.recipient}</td>
                                    <td style={{ padding: '0.5rem' }}>{req.quantity}</td>
                                    <td style={{ padding: '0.5rem', fontWeight: 'bold', color: req.status === 'supplier_submitted' ? '#3b82f6' : 'var(--primary)' }}>
                                        {req.status === 'supplier_submitted' ? 'Waiting Pickup' : req.status}
                                    </td>
                                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                        <PrintLabelsButton request={req} />
                                    </td>
                                </tr>
                            ))}
                            {requests.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No requests found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// Separate component to handle the QR Canvas rendering and PDF generation cleanly
const PrintLabelsButton = ({ request }) => {
    const [generating, setGenerating] = useState(false);
    const quantity = Number(request.quantity) || 1;
    const canvasRefs = useRef([]);

    const handlePrint = async () => {
        setGenerating(true);
        // Add a small delay for the DOM to render the hidden canvases if they just mounted
        setTimeout(() => {
            try {
                const doc = new jsPDF();
                
                for (let i = 0; i < quantity; i++) {
                    if (i > 0) doc.addPage();
                    
                    doc.setFontSize(22);
                    doc.text(`Company: TVR Logistics`, 20, 30);
                    
                    doc.setFontSize(14);
                    doc.text(`Recipient: ${request.recipient}`, 20, 50);
                    doc.text(`Address: ${request.address || 'N/A'}`, 20, 60);
                    doc.text(`Ref/Invoice: ${request.supplierReference || 'N/A'}`, 20, 70);
                    doc.text(`Remittance: ${request.supplierName || request.remittance || 'N/A'}`, 20, 80);
                    doc.text(`Package: ${i + 1} of ${quantity}`, 20, 90);
                    doc.text(`Date: ${new Date(request.createdAt).toLocaleDateString()}`, 20, 100);

                    // Grab the QR code from the canvas
                    const canvas = canvasRefs.current[i];
                    if (canvas) {
                        const imgData = canvas.toDataURL('image/png');
                        // Shift image down to 120 because of extra text line
                        doc.addImage(imgData, 'PNG', 20, 120, 100, 100);
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
                className="secondary-button" 
                disabled={generating}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}
            >
                {generating ? '...' : '🖨️ Print QRs'}
            </button>
            
            {/* Hidden Canvases for jsPDF to extract */}
            <div style={{ display: 'none' }}>
                {Array.from({ length: quantity }).map((_, i) => (
                    <QRCodeCanvas 
                        key={i}
                        value={`{"id":"${request.id}","pkg":${i+1},"tot":${quantity}}`} 
                        size={300} 
                        level="H"
                        ref={el => canvasRefs.current[i] = el}
                    />
                ))}
            </div>
        </>
    );
};
