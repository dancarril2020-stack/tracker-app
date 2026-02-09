export const generateCSV = (records) => {
    const headers = [
        "ID", "Date", "CreatedAt", "Type", "Status",
        "Driver Name", "Driver ID",
        "Recipient", "Remittance",
        "Quantity", "Volumen",
        "Reembolso", "Collected Value",
        "Portes", "Address", "Session", "Observations"
    ];

    const rows = records.map(r => {
        return [
            r.id,
            r.date,
            r.createdAt || '',
            r.type,
            r.status,
            r.driverName || '',
            r.driverId || '',
            r.recipient || '',
            r.remittance || '',
            r.quantity || '',
            r.volumen || '',
            r.reembolso || '',
            r.collectedValue || '',
            r.portes || '',
            r.address || '',
            r.session || '',
            (r.observations || '').replace(/\n/g, ' ')
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
        "CreatedAt": "createdAt",
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
        "Session": "session",
        "Observations": "observations"
    };

    return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, index) => {
            const key = keyMap[h];
            if (key) {
                let val = row[index] || '';
                // Type casting for numeric fields if needed
                if (key === 'quantity') val = Number(val) || 0;
                obj[key] = val;
            }
        });
        return obj;
    });
};
