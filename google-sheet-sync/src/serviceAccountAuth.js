const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TOKEN_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
let cachedToken = null;

function base64Url(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function resolveKeyFile(keyFile) {
    if (!keyFile) return '';
    return path.isAbsolute(keyFile) ? keyFile : path.resolve(process.cwd(), keyFile);
}

function loadServiceAccountCredentials(keyFile) {
    const directJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.PTLIST_SERVICE_ACCOUNT_JSON;
    if (directJson) {
        try {
            const credentials = JSON.parse(directJson);
            if (credentials.type === 'service_account' && credentials.client_email && credentials.private_key) {
                return credentials;
            }
        } catch (err) {
            console.error('[Google Auth] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
        }
    }

    const resolvedPath = resolveKeyFile(keyFile);
    if (!resolvedPath) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var or GOOGLE_WORKER_SERVICE_ACCOUNT_KEY_FILE is required for Google Sheets API sync');
    }

    const credentials = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    if (credentials.type !== 'service_account') {
        throw new Error('Google credentials file must be a service_account JSON key');
    }
    if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Google service account JSON key is missing client_email or private_key');
    }

    return credentials;
}

function createJwt(credentials, nowSeconds = Math.floor(Date.now() / 1000)) {
    const header = {
        alg: 'RS256',
        typ: 'JWT'
    };
    const claim = {
        iss: credentials.client_email,
        scope: TOKEN_SCOPE,
        aud: credentials.token_uri || 'https://oauth2.googleapis.com/token',
        exp: nowSeconds + 3600,
        iat: nowSeconds
    };

    const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();

    return `${unsigned}.${signer.sign(credentials.private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}

async function getAccessToken(keyFile) {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
        return cachedToken.accessToken;
    }

    const credentials = loadServiceAccountCredentials(keyFile);
    const assertion = createJwt(credentials);
    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
    });

    const response = await axios.post(credentials.token_uri || 'https://oauth2.googleapis.com/token', body.toString(), {
        timeout: 30000,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    cachedToken = {
        accessToken: response.data.access_token,
        expiresAt: Date.now() + Number(response.data.expires_in || 3600) * 1000
    };

    return cachedToken.accessToken;
}

module.exports = {
    createJwt,
    getAccessToken,
    loadServiceAccountCredentials,
    resolveKeyFile
};