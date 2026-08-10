import { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function ScannerModal({ onClose, onScan }: { onClose: () => void, onScan: (data: any) => void }) {
    // const scannerRef = useRef<HTMLDivElement>(null);
    const [scannedKeys, setScannedKeys] = useState(new Set()); // Debounce scanning

    useEffect(() => {
        const scanner = new Html5QrcodeScanner(
            "reader", 
            { fps: 10, qrbox: { width: 250, height: 250 } }, 
            /* verbose= */ false
        );
        (window as any).__simulateQRScan = onScan;

        scanner.render(
            (decodedText) => {
                // To prevent scanning the same QR multiple times per second
                if (!scannedKeys.has(decodedText)) {
                    setScannedKeys(prev => {
                        const newSet = new Set(prev);
                        newSet.add(decodedText);
                        return newSet;
                    });
                    
                    try {
                        const payload = JSON.parse(decodedText);
                        onScan(payload);
                    } catch (e) {
                         console.error("Invalid QR Code payload", e);
                         // If not JSON, pass the raw text maybe? Or ignore.
                         onScan({ raw: decodedText });
                    }
                }
            },
            () => {
                // Typically you don't need to log every frame error
            }
        );

        // Cleanup
        return () => {
            scanner.clear().catch(error => console.error("Failed to clear scanner", error));
        };
    }, [onScan, scannedKeys]);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 9999,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', width: '90%', maxWidth: '400px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: 'black', textAlign: 'center' }}>Scan Package QR</h3>
                
                {/* ID MUST BE 'reader' FOR html5-qrcode */}
                <div id="reader" style={{ width: '100%', minHeight: '300px' }}></div>
                
                <button 
                    onClick={onClose}
                    style={{
                        marginTop: '1rem', width: '100%', padding: '0.8rem',
                        background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                    }}
                >
                    Close Scanner
                </button>
            </div>
        </div>
    );
}
