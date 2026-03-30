import PostalMime from 'https://cdn.jsdelivr.net/npm/postal-mime@2.2.1/+esm';

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const uploadOverlay = document.getElementById('upload-overlay');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const appContainer = document.getElementById('app-container');
    
    // Upload mechanics
    browseBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', async (e) => {
        if(e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    uploadOverlay.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadOverlay.classList.add('drag-over');
    });

    uploadOverlay.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadOverlay.classList.remove('drag-over');
    });

    uploadOverlay.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadOverlay.classList.remove('drag-over');
        if(e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    async function handleFile(file) {
        uploadOverlay.querySelector('h1').innerText = "Parsing...";
        
        try {
            // If it's pure text or EML
            const parser = new PostalMime();
            const email = await parser.parse(file);
            processEmail(email);
            
            // Switch UI
            uploadOverlay.classList.remove('active');
            appContainer.classList.remove('hidden');
        } catch(err) {
            console.error(err);
            uploadOverlay.querySelector('h1').innerText = "Error parsing file";
            uploadOverlay.querySelector('p').innerText = err.message;
        }
    }

    // Settings Modal Logic
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const btnLight = document.getElementById('theme-btn-light');
    const btnDark = document.getElementById('theme-btn-dark');

    if(settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('active');
        });

        closeSettings.addEventListener('click', () => {
            settingsModal.classList.remove('active');
        });

        settingsModal.addEventListener('click', (e) => {
            if(e.target === settingsModal) {
                settingsModal.classList.remove('active');
            }
        });

        // Theme toggling
        btnLight.addEventListener('click', () => {
            document.documentElement.setAttribute('data-theme', 'light');
            btnLight.classList.add('active');
            btnDark.classList.remove('active');
        });

        btnDark.addEventListener('click', () => {
            document.documentElement.setAttribute('data-theme', 'dark');
            btnDark.classList.add('active');
            btnLight.classList.remove('active');
        });
    }

    function processEmail(email) {
        console.log("Parsed Email:", email);
        
        // Populate sidebar info
        document.getElementById('subject-label').innerText = email.subject || "No Subject";
        document.getElementById('date-label').innerText = email.date ? new Date(email.date).toLocaleDateString() : "Unknown Date";
        document.getElementById('sender-label').innerText = email.from ? email.from.address : "Unknown Sender";
        
        document.getElementById('chat-title').innerText = email.subject || "message-thread";
        document.getElementById('welcome-subject').innerText = email.subject || "Thread";

        // Fallback sequentially: Text -> stripped HTML -> blank
        let plainText = email.text || stripHtml(email.html) || "No readable content found.";

        const messages = extractThread(plainText, email);

        renderMessages(messages);
        renderParticipants(messages, email);
    }
    
    function stripHtml(html) {
        if (!html) return "";
        let doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    }

    function extractThread(plainText, emailMeta) {
        let lines = plainText.split('\n');
        
        // 0. Pre-process: Strip all quote markers (>) injected by clients so that
        // subsequent header regex parsing operates on a clean state
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('>')) {
                lines[i] = lines[i].replace(/^\s*>+/, '').trimStart();
            }
        }
        
        let messages = [];
        let currentMessage = {
            author: emailMeta.from ? (emailMeta.from.name || emailMeta.from.address) : "Main Sender",
            date: emailMeta.date || "Just now",
            recipients: [],
            lines: []
        };
        
        const boundaryRegex = /(?:^[\-]{2,}\s*Forwarded message\s*[\-]{2,})|(?:^_{10,})|(?:^[\-]{2,}\s*Original Message\s*[\-]{2,})/i;
        const fromRegex = /^\s*\*?From:\*?\s+(.+)/i;
        const sentRegex = /^\s*\*?(?:Sent|Date):\*?\s+(.+)/i;
        const toCcRegex = /^\s*\*?(?:To|Cc|Bcc):\*?\s+(.*)/i;
        const subjectRegex = /^\s*\*?Subject:\*?\s+(.*)/i;
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            
            // 1. Check for standard block boundaries (Forwarded, HR, *From:*)
            let isStructuralBoundary = boundaryRegex.test(line);
            let isImplicitFromBoundary = !isStructuralBoundary && fromRegex.test(line);
            
            if (isStructuralBoundary || isImplicitFromBoundary) {
                // Save current message before moving to nested block
                if (currentMessage.lines.some(l => l.trim() !== "")) {
                    currentMessage.content = currentMessage.lines.join('\n').trim();
                    messages.push(currentMessage);
                }
                
                // Initialize next message
                currentMessage = {
                    author: "Unknown Sender",
                    date: "Unknown Date",
                    recipients: [],
                    lines: []
                };
                
                // Parse immediate next lines for From/Date headers
                let iter = isStructuralBoundary ? i + 1 : i;
                let currentHeader = null; // 'recipients' or null
                
                while (iter < lines.length && iter < i + 15) {
                    let hLine = lines[iter].trim();
                    
                    if (hLine === "") {
                        iter++;
                        break;
                    } else if (fromRegex.test(hLine)) {
                        currentMessage.author = hLine.match(fromRegex)[1].trim();
                        currentHeader = 'author';
                    } else if (sentRegex.test(hLine)) {
                        currentMessage.date = hLine.match(sentRegex)[1].trim();
                        currentHeader = 'date';
                    } else if (toCcRegex.test(hLine)) {
                        let content = hLine.match(toCcRegex)[1].trim();
                        if (content) currentMessage.recipients.push(content);
                        currentHeader = 'recipients';
                    } else if (subjectRegex.test(hLine)) {
                        currentHeader = 'subject';
                    } else if (currentHeader) {
                        // Continuation of whichever header we are currently on!
                        if (currentHeader === 'recipients') {
                            currentMessage.recipients.push(hLine);
                        } else if (currentHeader === 'author') {
                            currentMessage.author += " " + hLine;
                        } else if (currentHeader === 'date') {
                            currentMessage.date += " " + hLine;
                        } else if (currentHeader === 'subject') {
                            // Subject continuation is safely skipped here
                        }
                    } else {
                        // Not a recognized header and we have no currentHeader prefix.
                        // We must have hit body text without an empty line acting as a delimiter.
                        break; 
                    }
                    iter++;
                }
                i = iter - 1; 
                continue;
            }
            
            // 2. Check for multiline "On [date], [someone] wrote:" prefix
            let onWroteMatch = null;
            let linesConsumed = 0;
            for (let j = 1; j <= 3 && i + j - 1 < lines.length; j++) {
                let combined = lines.slice(i, i + j).join(' ').trim();
                let onWroteRegex = /^On\s+.*?wrote:$/i;
                if (onWroteRegex.test(combined)) {
                    onWroteMatch = combined;
                    linesConsumed = j;
                    break;
                }
            }

            if (onWroteMatch) {
                if (currentMessage.lines.some(l => l.trim() !== "")) {
                    currentMessage.content = currentMessage.lines.join('\n').trim();
                    messages.push(currentMessage);
                }
                
                // Extract author from line if possible
                let authorGuess = onWroteMatch.replace(/^On\s+/i, '').replace(/wrote:$/i, '').trim();
                
                let parsedDate = "Unknown";
                let parsedAuthor = authorGuess || "Unknown";
                
                // Attempt to split string like "Sat, Mar 28, 2026, 4:33 PM Ethan Dutson"
                const dateSplitRegex = /^((?:.*?\d{4}(?:[^\w]*\d{1,2}:\d{2}(?:\s*[a-z]{2,3})?)?)|(?:.*?\d{1,2}:\d{2}(?:\s*[a-z]{2,3})?))\s*(?:,)?\s+(.+)$/i;
                const match = authorGuess.match(dateSplitRegex);
                if (match) {
                    parsedDate = match[1].trim();
                    let remainder = match[2].trim();
                    remainder = remainder.replace(/^(?:at\s+|-|,)?\s*(?:\d{1,2}:\d{2}(?:\s*[a-zA-Z]{2,3})?)?\s*(?:-|,)?\s*/i, '');
                    parsedAuthor = remainder || "Unknown";
                }
                
                currentMessage = {
                    author: parsedAuthor,
                    date: parsedDate,
                    recipients: [],
                    lines: []
                };
                
                i += linesConsumed - 1; // skip the lines consumed by the multiline match
                continue;
            }
            
            // (Quote prefixes were already removed in the pre-process step!)
            
            currentMessage.lines.push(line);
        }
        
        if (currentMessage.lines.some(l => l.trim() !== "")) {
            currentMessage.content = currentMessage.lines.join('\n').trim();
            messages.push(currentMessage);
        }
        
        messages.reverse(); // Newest is at the end visually. Usually older is bottom.
        
        return messages;
    }

    function renderMessages(messages) {
        const container = document.getElementById('messages-container');
        container.innerHTML = `
            <div class="message-welcome">
                <div class="welcome-icon">💬</div>
                <h1>Welcome to the Thread!</h1>
                <p>This is the start of the <strong id="welcome-subject">${document.getElementById('welcome-subject').innerText}</strong> history.</p>
            </div>
        `;
        
        let lastAuthor = null;
        
        messages.forEach(msg => {
            if (!msg.content) return;
            
            let cleanAuthor = msg.author.replace(/<.*?>/g, '').replace(/"/g, '').trim() || "Unknown";
            const isConsecutive = false; // Never merge emails from the same author
            
            const msgEl = document.createElement('div');
            msgEl.className = 'message ' + (isConsecutive ? 'consecutive' : '');
            
            const color = getColorForUser(cleanAuthor);
            const initials = getInitials(cleanAuthor);

            if (!isConsecutive) {
                msgEl.innerHTML = `
                    <div class="message-avatar" style="background-color: ${color};">${initials}</div>
                    <div class="message-header">
                        <span class="message-author"></span>
                        <span class="message-timestamp"></span>
                    </div>
                `;
                // Safely inject text
                msgEl.querySelector('.message-author').textContent = cleanAuthor;
                msgEl.querySelector('.message-timestamp').textContent = msg.date;
            } else {
                msgEl.innerHTML = `
                    <div class="consecutive-timestamp"></div>
                `;
                msgEl.querySelector('.consecutive-timestamp').textContent = getShortTime(msg.date);
            }
            
            const contentEl = document.createElement('div');
            contentEl.className = 'message-content';
            
            let contentText = msg.content;
            let parts = contentText.split(/\n(?:--|__)\s*\n/);
            if (parts.length > 1) {
                let uniqueSigs = [];
                for (let i = 1; i < parts.length; i++) {
                    let sigClean = parts[i].trim();
                    if (!uniqueSigs.includes(sigClean) && sigClean !== "") {
                        uniqueSigs.push(sigClean);
                    }
                }
                contentText = parts[0];
                if (uniqueSigs.length > 0) {
                    contentText += "\n\n-- \n" + uniqueSigs.join("\n\n-- \n");
                }
            }
            
            contentEl.textContent = contentText;
            msgEl.appendChild(contentEl);
            
            container.appendChild(msgEl);
            
            lastAuthor = cleanAuthor;
        });
        
        // Auto scroll
        setTimeout(() => container.scrollTop = container.scrollHeight, 50);
    }

    function splitPeople(str) {
        if (!str) return [];
        let result = [];
        let current = "";
        let inQuotes = false;
        let inAngles = false;
        for (let i = 0; i < str.length; i++) {
            let char = str[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === '<') inAngles = true;
            else if (char === '>') inAngles = false;
            
            if ((char === ',' || char === ';') && !inQuotes && !inAngles) {
                result.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }
        if (current.trim()) result.push(current.trim());
        return result.filter(Boolean);
    }

    function renderParticipants(messages, emailMeta) {
        const list = document.getElementById('members-list');
        list.innerHTML = '';
        
        const participantsMap = new Map();
        
        let partIdx = 0;
        const addParticipant = (fullAuthor) => {
            if(!fullAuthor || fullAuthor === "Unknown") return;

            let cleanAuth = fullAuthor.replace(/\*?On Behalf Of\*?\s+/ig, '').trim();
            let nameMatch = cleanAuth.match(/^(.*?)</); // Match anything before the <
            let rawName = nameMatch ? nameMatch[1] : cleanAuth;
            let cleanName = rawName.replace(/"/g, '').replace(/^[;,]+|[;,]+$/g, '').trim();
            
            let email = "";
            let emailMatch = cleanAuth.match(/<(.+?)>/);
            if (emailMatch) {
                email = emailMatch[1].trim().toLowerCase();
            } else if (cleanAuth.includes('@')) {
                emailMatch = cleanAuth.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
                if (emailMatch) { 
                    email = emailMatch[1].toLowerCase();
                    if(cleanName === cleanAuth) cleanName = email; // If the whole string was an email, display it as one
                }
            }

            let nameKey = cleanName.toLowerCase().replace(/\s+/g, ' ');
            if (!cleanName) {
                cleanName = email;
                nameKey = email;
            }

            let foundKey = null;
            // Cross-reference existing map to see if we've seen this person's email OR name before
            for (let [key, data] of participantsMap.entries()) {
                if (email && data.email === email) {
                    foundKey = key;
                    break;
                }
                if (nameKey && data.nameKey === nameKey && nameKey !== "") {
                    foundKey = key;
                    break;
                }
            }

            if (foundKey === null) {
                participantsMap.set(partIdx++, {
                    display: cleanName,
                    email: email,
                    nameKey: nameKey,
                    fullAuthor: cleanAuth
                });
            } else {
                let existing = participantsMap.get(foundKey);
                // If it existed but was just an email format, upgrade it to a beautiful full name format!
                if ((existing.display.includes('@') || !existing.display) && !cleanName.includes('@') && cleanName) {
                    existing.display = cleanName;
                    existing.nameKey = nameKey;
                }
                if (!existing.email && email) {
                    existing.email = email;
                }
                participantsMap.set(foundKey, existing);
            }
        };

        if (emailMeta) {
            const addMetaParticipant = (person) => {
                if (!person) return;
                const name = person.name || person.address;
                const address = person.address || "";
                const fullAuthor = name !== address ? `${name} <${address}>` : address;
                addParticipant(fullAuthor);
            };
            addMetaParticipant(emailMeta.from);
            if (Array.isArray(emailMeta.to)) emailMeta.to.forEach(addMetaParticipant);
            if (Array.isArray(emailMeta.cc)) emailMeta.cc.forEach(addMetaParticipant);
        }

        messages.forEach(m => {
            addParticipant(m.author.trim());
            if (m.recipients) {
                m.recipients.forEach(recStr => {
                    const persons = splitPeople(recStr);
                    persons.forEach(addParticipant);
                });
            }
        });
        
        document.getElementById('participant-count').innerText = participantsMap.size;
        
        participantsMap.forEach((data, dedupeKey) => {
            let fullAuthor = data.fullAuthor;
            let cleanName = data.display;

            const el = document.createElement('div');
            el.className = 'member-item';
            
            let displayName = cleanName;
            let displayEmail = "No email provided";
            const emailMatch = fullAuthor.match(/(.*?)\s*<(.+?)>$/);
            if(emailMatch) {
                displayEmail = emailMatch[2].trim();
            } else if (fullAuthor.includes('@')) {
                displayEmail = fullAuthor;
            }
            
            const color = getColorForUser(cleanName);
            const initials = getInitials(cleanName);
            
            el.innerHTML = `
                <div class="member-avatar" style="background-color: ${color};">${initials}</div>
                <div class="member-name" title="${displayEmail}">${displayName}</div>
            `;
            
            el.addEventListener('click', (e) => {
                showUserPopout(e.currentTarget, displayName, displayEmail, color, initials);
            });
            list.appendChild(el);
        });
    }

    function showUserPopout(targetEl, name, email, color, initials) {
        const popout = document.getElementById('user-popout');
        if (!popout) return;
        
        document.getElementById('popout-name').textContent = name;
        document.getElementById('popout-email').textContent = email;
        const avatar = document.getElementById('popout-avatar');
        avatar.style.backgroundColor = color;
        avatar.textContent = initials;
        
        const rect = targetEl.getBoundingClientRect();
        popout.style.top = Math.min(rect.top, window.innerHeight - 200) + 'px';
        popout.style.left = (rect.left - 316) + 'px'; 
        
        popout.classList.add('active');
        
        const closePopout = (e) => {
            if(!popout.contains(e.target) && !targetEl.contains(e.target)) {
                popout.classList.remove('active');
                document.removeEventListener('click', closePopout);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closePopout);
        }, 10);
    }

    const userColors = {};
    const palette = ['#5865F2', '#23A559', '#F1C40F', '#E67E22', '#E74C3C', '#9B59B6', '#1ABC9C', '#E91E63'];
    let colorIndex = 0;
    
    function getColorForUser(name) {
        if (!userColors[name]) {
            userColors[name] = palette[colorIndex % palette.length];
            colorIndex++;
        }
        return userColors[name];
    }
    
    function getInitials(name) {
        const parts = name.split(/[\s_]+/).filter(p => p.length > 0 && /^[a-zA-Z]/.test(p));
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    
    function getShortTime(dateStr) {
        try {
            const d = new Date(dateStr);
            if(isNaN(d.getTime())) return "•";
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return "•"; 
        }
    }
});
