import fs from 'fs';
import PostalMime from 'postal-mime';

async function run() {
    const file = fs.readFileSync('/Users/ethandutson/Downloads/email test.eml');
    const parser = new PostalMime();
    const email = await parser.parse(file);
    
    let plainText = email.text || stripHtml(email.html) || "No content";
    console.log("=== RAW TEXT ===");
    console.log(plainText);
    console.log("================");
    
    const messages = extractThread(plainText, email);
    console.log("Extracted", messages.length, "messages.");
    messages.forEach((m, i) => {
        console.log(`\n--- Message ${i + 1} ---`);
        console.log(`Author: ${m.author}`);
        console.log(`Date: ${m.date}`);
        console.log(`Content length: ${m.content ? m.content.length : 0}`);
    });
}

function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>?/gm, ''); // dumb strip for testing
}

function extractThread(plainText, emailMeta) {
    const lines = plainText.split('\n');
    let messages = [];
    let currentMessage = {
        author: emailMeta.from ? (emailMeta.from.name || emailMeta.from.address) : "Main Sender",
        date: emailMeta.date || "Just now",
        lines: []
    };
    
    const forwardedRegex = /[\-]{2,}\s*Forwarded message\s*[\-]{2,}/i;
    const outlookHRRegex = /_{10,}/; 
    const originalMessageRegex = /[\-]{2,}\s*Original Message\s*[\-]{2,}/i;
    const onDateWroteRegex = /^\s*On\s+.*?wrote:\s*$/i; 
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        if (forwardedRegex.test(line) || outlookHRRegex.test(line) || originalMessageRegex.test(line)) {
            if (currentMessage.lines.some(l => l.trim() !== "")) {
                currentMessage.content = currentMessage.lines.join('\n').trim();
                messages.push(currentMessage);
            }
            
            currentMessage = { author: "Unknown Sender", date: "Unknown Date", lines: [] };
            
            let iter = i + 1;
            while (iter < lines.length && iter < i + 15) {
                let hLine = lines[iter].trim();
                if(hLine.startsWith("From:")) {
                    currentMessage.author = hLine.substring(5).trim();
                } else if (hLine.startsWith("Date:") || hLine.startsWith("Sent:")) {
                    currentMessage.date = hLine.substring(5).trim();
                } else if (hLine === "") {
                    iter++; break;
                }
                iter++;
            }
            i = iter - 1; 
            continue;
        }
        
        if (onDateWroteRegex.test(line)) {
            if (currentMessage.lines.some(l => l.trim() !== "")) {
                currentMessage.content = currentMessage.lines.join('\n').trim();
                messages.push(currentMessage);
            }
            
            let authorGuess = line.replace(/^\s*On\s+/i, '').replace(/wrote:\s*$/i, '').trim();
            let parsedDate = "Unknown";
            let parsedAuthor = authorGuess || "Unknown";
            
            let match = authorGuess.match(/^(.*\b(?:AM|PM|am|pm))\s*[,|-]?\s*(.+)$/i);
            if (!match) {
                match = authorGuess.match(/^(.*\b(?:20\d{2}|19\d{2}|\d{1,2}:\d{2}))\s*[,|-]?\s*(.+)$/i);
            }
            if (match) {
                parsedDate = match[1].trim();
                parsedAuthor = match[2].trim();
            }
            
            currentMessage = {
                author: parsedAuthor,
                date: parsedDate,
                lines: []
            };
            continue;
        }
        
        if (line.trim().startsWith('>')) line = line.replace(/^\s*>+/, '').trimStart();
        currentMessage.lines.push(line);
    }
    
    if (currentMessage.lines.some(l => l.trim() !== "")) {
        currentMessage.content = currentMessage.lines.join('\n').trim();
        messages.push(currentMessage);
    }
    
    messages.reverse();
    return messages;
}

run().catch(console.error);
