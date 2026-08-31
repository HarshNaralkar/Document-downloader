function formatError(error) {
    const status = error?.response?.status;
    const statusText = error?.response?.statusText;
    const data = error?.response?.data;
    const apiMessage = data?.error?.message || data?.message;
    const message = error?.message || apiMessage || statusText || String(error || 'Unknown error');

    return {
        message: apiMessage || message || 'Unknown error',
        code: error?.code || data?.error?.status || null,
        status: status || null,
        statusText: statusText || null,
        details: data?.error?.details || null
    };
}

function formatErrorMessage(error) {
    const formatted = formatError(error);
    const parts = [];

    if (formatted.status) parts.push(`HTTP ${formatted.status}`);
    if (formatted.code) parts.push(formatted.code);
    if (formatted.message) parts.push(formatted.message);

    return parts.join(' - ') || 'Unknown error';
}

module.exports = {
    formatError,
    formatErrorMessage
};