export const generateCSV = (records) => {
    const headers = [
        "ID", "Date", "Time", "Type", "Status",
        "Driver Name", "Driver ID",
        "Recipient", "Remittance",
        "Quantity", "Volumen",
        "Reembolso", "Collected Value",
        "Portes", "Address", "Notes"
    ];

    const rows = records.map(r => {
        return [
            r.id,
            r.date,
            r.createdAt ? new Date(r.createdAt).toLocaleTimeString() : '',
            r.type,
            r.status,
            r.driverName || '',
            r.driverId || '',
            r.recipient || '',
            r.remittance || '',
            r.quantity || '',
            r.volumen || '',
            r.reembolso || '', // Expected
            r.collectedValue || '', // Actual
            r.portes || '',
            r.address || '',
            (r.notes || '').replace(/\n/g, ' ')
        ].map(field => `"${String(field || '').replace(/"/g, '""')}"`).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
};

export const parseCSV = (csvText) => {
    // 1. Tokenize CSV
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
        } else if ((char === '\r' || char === '\n') && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            if (currentRow.length > 0 || currentCell) {
                currentRow.push(currentCell);
                rows.push(currentRow);
            }
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    if (currentRow.length > 0 || currentCell) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }

    if (rows.length < 2) return [];

    const headers = rows[0];

    // 2. Map Headers to DB Keys
    const keyMap = {
        "ID": "id",
        "Date": "date",
        "Time": "time", // Ignored on import usually, or parsed to createdAt
        "Type": "type",
        "Status": "status",
        "Driver Name": "driverName",
        "Driver ID": "driverId",
        "Recipient": "recipient",
        "Remittance": "remittance",
        "Quantity": "quantity",
        "Volumen": "volumen",
        "Reembolso": "reembolso",
        "Collected Value": "collectedValue",
        "Portes": "portes",
        "Address": "address",
        "Notes": "notes"
    };

    return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, index) => {
            const key = keyMap[h];
            if (key) {
                obj[key] = row[index] || '';
            }
        });
        return obj;
    });
};
