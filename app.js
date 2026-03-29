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
        renderParticipants(messages);
    }
    
    function stripHtml(html) {
        if (!html) return "";
        let doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || "";
    }

    function extractThread(plainText, emailMeta) {
        // We evaluate text line by line to detect split points like:
        // "---------- Forwarded message ---------" 
        // "From: "  or "Date: " blocks
        // "On ... wrote:"
        
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
            
            // Check for standard block boundaries
            if (forwardedRegex.test(line) || outlookHRRegex.test(line) || originalMessageRegex.test(line)) {
                // Save current message before moving to nested block
                if (currentMessage.lines.some(l => l.trim() !== "")) {
                    currentMessage.content = currentMessage.lines.join('\n').trim();
                    messages.push(currentMessage);
                }
                
                // Initialize next message
                currentMessage = {
                    author: "Unknown Sender",
                    date: "Unknown Date",
                    lines: []
                };
                
                // Parse immediate next lines for From/Date headers
                let iter = i + 1;
                while (iter < lines.length && iter < i + 15) {
                    let hLine = lines[iter].trim();
                    if(hLine.startsWith("From:")) {
                        currentMessage.author = hLine.substring(5).trim();
                    } else if (hLine.startsWith("Date:") || hLine.startsWith("Sent:")) {
                        currentMessage.date = hLine.substring(5).trim();
                    } else if (hLine === "") {
                        // Empty line denotes end of headers block occasionally
                        iter++;
                        break;
                    }
                    iter++;
                }
                i = iter - 1; 
                continue;
            }
            
            // Check for "On date, someone wrote:" prefix
            if (onDateWroteRegex.test(line)) {
                if (currentMessage.lines.some(l => l.trim() !== "")) {
                    currentMessage.content = currentMessage.lines.join('\n').trim();
                    messages.push(currentMessage);
                }
                
                // Extract author from line if possible
                let authorGuess = line.replace(/^\s*On\s+/i, '').replace(/wrote:\s*$/i, '').trim();
                
                let parsedDate = "Unknown";
                let parsedAuthor = authorGuess || "Unknown";
                
                // Attempt to split string like "Sat, Mar 28, 2026, 4:33 PM Ethan Dutson"
                const dateSplitRegex = /^((?:.*?\d{4}(?:[^\w]*\d{1,2}:\d{2}(?:\s*[a-z]{2,3})?)?)|(?:.*?\d{1,2}:\d{2}(?:\s*[a-z]{2,3})?))\s*(?:,)?\s+(.+)$/i;
                const match = authorGuess.match(dateSplitRegex);
                if (match) {
                    parsedDate = match[1].trim();
                    let remainder = match[2].trim();
                    // Clean up any lingering "at 9:00 AM " or "14:30" prefixes that the optional group missed
                    remainder = remainder.replace(/^(?:at\s+|-|,)?\s*(?:\d{1,2}:\d{2}(?:\s*[a-zA-Z]{2,3})?)?\s*(?:-|,)?\s*/i, '');
                    parsedAuthor = remainder || "Unknown";
                }
                
                currentMessage = {
                    author: parsedAuthor,
                    date: parsedDate,
                    lines: []
                };
                continue;
            }
            
            // Remove > prefixes from quotes for cleaner display
            if (line.trim().startsWith('>')) {
                line = line.replace(/^\s*>+/, '').trimStart();
            }
            
            currentMessage.lines.push(line);
        }
        
        if (currentMessage.lines.some(l => l.trim() !== "")) {
            currentMessage.content = currentMessage.lines.join('\n').trim();
            messages.push(currentMessage);
        }
        
        // Ensure consistent chronological order.
        // Usually nested threads have oldest at bottom, newest at top.
        // Discord shows oldest top, newest bottom.
        messages.reverse();
        
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
            
            let cleanAuthor = msg.author.replace(/<.*?>/g, '').replace(/".*?"/g, '').trim() || "Unknown";
            const isConsecutive = cleanAuthor === lastAuthor;
            
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
            contentEl.textContent = msg.content;
            msgEl.appendChild(contentEl);
            
            container.appendChild(msgEl);
            
            lastAuthor = cleanAuthor;
        });
        
        // Auto scroll
        setTimeout(() => container.scrollTop = container.scrollHeight, 50);
    }

    function renderParticipants(messages) {
        const list = document.getElementById('members-list');
        list.innerHTML = '';
        
        const participantsMap = new Map();
        messages.forEach(m => {
            let fullAuthor = m.author.trim();
            if(fullAuthor && fullAuthor !== "Unknown") {
                let cleanName = fullAuthor.replace(/<.*?>/g, '').replace(/".*?"/g, '').trim() || fullAuthor;
                if(!participantsMap.has(cleanName)) {
                    participantsMap.set(cleanName, fullAuthor);
                } else if (!participantsMap.get(cleanName).includes('@') && fullAuthor.includes('@')) {
                    participantsMap.set(cleanName, fullAuthor);
                }
            }
        });
        
        document.getElementById('participant-count').innerText = participantsMap.size;
        
        participantsMap.forEach((fullAuthor, cleanName) => {
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
