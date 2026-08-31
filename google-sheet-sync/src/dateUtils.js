function pad2(value) {
    return String(value).padStart(2, '0');
}

function parseGoogleSerialDate(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 20000 || numeric > 80000) {
        return null;
    }

    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + numeric * 24 * 60 * 60 * 1000);
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function isValidDateComponents(year, month, day) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    if (y < 1900 || y > 2100) return false;
    return true;
}

function normalizeDate(value) {
    if (value === null || value === undefined) return null;

    const text = String(value).trim();
    if (!text) return null;

    const serialDate = parseGoogleSerialDate(text);
    if (serialDate) return serialDate;

    let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) {
        if (!isValidDateComponents(match[1], match[2], match[3])) return null;
        return `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`;
    }

    match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (match) {
        const year = match[3].length === 2 ? `20${match[3]}` : match[3];
        if (!isValidDateComponents(year, match[2], match[1])) return null;
        return `${year}-${pad2(match[2])}-${pad2(match[1])}`;
    }

    return null;
}

module.exports = { normalizeDate };
