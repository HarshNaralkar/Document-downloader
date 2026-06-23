const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const files = ['agreement.docx', 'afi_noc.docx', 'Annexure.docx', 'POA_DM.docx', 'request_letter.docx'];
const dir = path.resolve('templates/ROYAL/OMAN');

files.forEach(file => {
    const docxPath = path.join(dir, file);
    if (!fs.existsSync(docxPath)) {
        return;
    }
    try {
        const content = fs.readFileSync(docxPath);
        const zip = new PizZip(content);
        const docXml = zip.file('word/document.xml').asText();
        
        // Find fonts using regex
        const asciiMatches = docXml.match(/w:ascii="([^"]+)"/g) || [];
        const csMatches = docXml.match(/w:cs="([^"]+)"/g) || []; // w:cs is for Complex Scripts (like Arabic!)
        
        const fonts = new Set();
        asciiMatches.forEach(match => {
            const fontName = match.match(/w:ascii="([^"]+)"/)[1];
            fonts.add(fontName);
        });
        csMatches.forEach(match => {
            const fontName = match.match(/w:cs="([^"]+)"/)[1];
            fonts.add(fontName + ' (Complex)');
        });
        
        console.log(`${file} fonts:`, Array.from(fonts));
    } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
    }
});
