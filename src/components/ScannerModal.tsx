import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

// Global lock to prevent React 18 Strict Mode from running two scanner instances simultaneously
let isScannerActive = false;

export default function ScannerModal({ onClose, onScan }: { onClose: () => void, onScan: (data: any) => void }) {
    const scannedKeysRef = useRef(new Set<string>()); // Debounce scanning
    const onScanRef = useRef(onScan);

    // Keep onScanRef updated
    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    useEffect(() => {
        let scanner: Html5QrcodeScanner | null = null;
        let isUnmounted = false;
        let didAcquireLock = false;

        const initScanner = async () => {
            // Spin-lock until any previous scanner finishes tearing down asynchronously
            while (isScannerActive) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // If the component unmounted while we were waiting, abort initialization entirely
            if (isUnmounted) return;

            isScannerActive = true;
            didAcquireLock = true;

            // Wipe the container to guarantee a clean slate
            const readerElement = document.getElementById("reader");
            if (readerElement) {
                readerElement.innerHTML = '';
            }

            try {
                scanner = new Html5QrcodeScanner(
                    "reader", 
                    { fps: 10, qrbox: { width: 250, height: 250 } }, 
                    /* verbose= */ false
                );

                // Required global assignment if html5-qrcode checks it (simulated click handler etc)
                (window as any).__simulateQRScan = (data: any) => onScanRef.current(data);

                scanner.render(
                    (decodedText) => {
                        // To prevent scanning the same QR multiple times per second
                        if (!scannedKeysRef.current.has(decodedText)) {
                            scannedKeysRef.current.add(decodedText);
                            
                            try {
                                const payload = JSON.parse(decodedText);
                                onScanRef.current(payload);
                            } catch (e) {
                                 console.error("Invalid QR Code payload", e);
                                 // If not JSON, pass the raw text maybe? Or ignore.
                                 onScanRef.current({ raw: decodedText });
                            }
                        }
                    },
                    (error) => {
                        // Typically you don't need to log every frame error
                    }
                );
            } catch (err) {
                console.error("Failed to initialize scanner:", err);
                isScannerActive = false;
                didAcquireLock = false;
            }
        };

        initScanner();

        // Cleanup
        return () => {
            isUnmounted = true;
            if (scanner) {
                // Clear is asynchronous, which is what caused the race condition.
                // We only release the lock when it is FINISHED clearing.
                scanner.clear().then(() => {
                    isScannerActive = false;
                }).catch(error => {
                    console.error("Failed to clear scanner", error);
                    isScannerActive = false;
                });
            } else if (didAcquireLock) {
                isScannerActive = false;
            }
        };
    }, []);

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
