// Global data map for efficient routing logic:
let globalAdmins = [];
let globalVolunteers = [];
let cachedNeeds = [];

let map = null;
let mapMarkers = [];
let notificationLogs = [];
let activeChatNeedId = null;

// Helper to calculate reputation stats for volunteers
function getVolunteerRatingInfo(volunteer) {
    const reviews = (volunteer && volunteer.reviews) || [];
    if (reviews.length === 0) return { avg: "5.0", count: 0, stars: "⭐⭐⭐⭐⭐" };
    
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const avg = (sum / reviews.length).toFixed(1);
    const rounded = Math.round(sum / reviews.length);
    const stars = "⭐".repeat(rounded) + "☆".repeat(5 - rounded);
    return { avg, count: reviews.length, stars };
}

function getVolunteerBadges(volunteer, needsCount) {
    const list = [];
    const skillsLower = ((volunteer && volunteer.skills) || '').toLowerCase();
    
    if (needsCount > 0) {
        list.push({ label: "Helper", class: "badge-helper" });
    }
    
    const ratingInfo = getVolunteerRatingInfo(volunteer);
    if (needsCount >= 3 || (ratingInfo.count >= 2 && parseFloat(ratingInfo.avg) >= 4.7)) {
        list.push({ label: "Community Hero", class: "badge-hero" });
    }
    
    if (skillsLower.includes("nurse") || skillsLower.includes("first aid") || skillsLower.includes("medical")) {
        list.push({ label: "Medical Shield", class: "badge-medical" });
    }
    
    if (skillsLower.includes("driver") || skillsLower.includes("lifting") || skillsLower.includes("driving") || skillsLower.includes("stamina")) {
        list.push({ label: "Logistics Specialist", class: "badge-logistics" });
    }
    
    return list;
}

// Map initialization & rendering
function initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer || typeof L === 'undefined') return;
    if (map) return; 

    map = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: false
    }).setView([40.7306, -73.9352], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
}

function getCoordinates(locationStr) {
    const clean = (locationStr || '').toLowerCase();
    if (clean.includes('community center') || clean.includes('downtown')) {
        return [40.7306 + (Math.random() - 0.5) * 0.01, -73.9352 + (Math.random() - 0.5) * 0.01];
    }
    if (clean.includes('central park')) {
        return [40.7829 + (Math.random() - 0.5) * 0.005, -73.9654 + (Math.random() - 0.5) * 0.005];
    }
    if (clean.includes('northside')) {
        return [40.7484 + (Math.random() - 0.5) * 0.01, -73.9857 + (Math.random() - 0.5) * 0.01];
    }
    if (clean.includes('springfield')) {
        return [40.7589 + (Math.random() - 0.5) * 0.01, -73.9851 + (Math.random() - 0.5) * 0.01];
    }
    
    const hash = clean.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const latOffset = (hash % 100) / 5000 - 0.01;
    const lngOffset = (hash % 80) / 4000 - 0.01;
    return [40.7306 + latOffset, -73.9352 + lngOffset];
}

function updateMapMarkers(needsList) {
    if (!map || typeof L === 'undefined') return;

    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    needsList.forEach(need => {
        const coords = getCoordinates(need.location);
        const ai = need.aiAnalysis || {};
        const urgency = (ai.urgency || 'Low').toLowerCase();
        
        let markerColor = '#6366f1'; 
        if (urgency === 'high') markerColor = '#ef4444'; 
        if (urgency === 'medium') markerColor = '#f59e0b'; 

        const customIcon = L.divIcon({
            className: 'custom-map-marker',
            html: `<div style="background-color: ${markerColor}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${markerColor};"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        const marker = L.marker(coords, { icon: customIcon }).addTo(map);
        
        const popupContent = `
            <div style="font-family:'Inter'; line-height:1.4; padding:2px;">
                <strong style="color:var(--text-main); font-size:0.95rem; font-family:'Outfit';">${need.title}</strong>
                <div style="margin: 4px 0 8px 0; font-size: 0.75rem; color:var(--text-light)">📍 ${need.location}</div>
                <div style="font-size:0.8rem; margin-bottom:8px;">Urgency: <strong style="text-transform:uppercase;">${urgency}</strong></div>
                <button onclick="scrollToCard('${need.id}')" style="background:var(--primary); color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer; font-weight:600; width:100%;">View Task</button>
            </div>
        `;
        marker.bindPopup(popupContent);
        mapMarkers.push(marker);
    });

    if (Auth.isVolunteer()) {
        const currentVol = globalVolunteers.find(v => v.username === Auth.getToken());
        if (currentVol) {
            const coords = getCoordinates(currentVol.currentLocation || currentVol.address);
            const volunteerIcon = L.divIcon({
                className: 'custom-map-marker-vol',
                html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 12px #3b82f6; position:relative;"><span style="position:absolute; width:100%; height:100%; border-radius:50%; border:2px solid #3b82f6; transform:scale(2); opacity:0.4; animation: pulse 2s infinite;"></span></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });
            const volMarker = L.marker(coords, { icon: volunteerIcon }).addTo(map);
            volMarker.bindPopup(`<strong>My Location</strong><br>📍 ${currentVol.currentLocation || 'Springfield'}`);
            mapMarkers.push(volMarker);
        }
    }
}

window.scrollToCard = (id) => {
    const card = document.getElementById(`need-card-${id}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.borderColor = 'var(--primary)';
        card.style.boxShadow = 'var(--shadow-hover)';
        setTimeout(() => {
            card.style.borderColor = '';
            card.style.boxShadow = '';
        }, 2500);
    }
};

// Notification Log Helpers
function addNotificationLog(text) {
    notificationLogs.unshift({
        text,
        timestamp: new Date().toLocaleTimeString()
    });
    
    const drawer = document.getElementById('notificationDrawer');
    if (drawer && !drawer.classList.contains('open')) {
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            const currentCount = parseInt(badge.innerText) || 0;
            badge.innerText = currentCount + 1;
            badge.style.display = 'inline-block';
        }
    }

    renderNotificationLogs();
}

function renderNotificationLogs() {
    const content = document.getElementById('drawerContent');
    if (!content) return;

    if (notificationLogs.length === 0) {
        content.innerHTML = `<p style="color:var(--text-light); font-size:0.9rem; text-align:center;">No recent activities logged in this session.</p>`;
        return;
    }

    content.innerHTML = notificationLogs.map(log => `
        <div class="notification-item">
            <div>${log.text}</div>
            <span class="notification-time">🕒 ${log.timestamp}</span>
        </div>
    `).join('');
}

window.toggleNotificationDrawer = (show) => {
    const drawer = document.getElementById('notificationDrawer');
    const badge = document.getElementById('notificationBadge');
    if (!drawer) return;

    if (show === undefined) {
        drawer.classList.toggle('open');
    } else if (show) {
        drawer.classList.add('open');
    } else {
        drawer.classList.remove('open');
    }

    if (drawer.classList.contains('open') && badge) {
        badge.innerText = '0';
        badge.style.display = 'none';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('needsGrid')) {
        initCalendarToggle();
        loadNeeds();
        
        const searchInput = document.getElementById('searchNeeds');
        const urgencySelect = document.getElementById('filterUrgency');
        const statusSelect = document.getElementById('filterStatus');
        
        if (searchInput) searchInput.oninput = filterAndRenderNeeds;
        if (urgencySelect) urgencySelect.onchange = filterAndRenderNeeds;
        if (statusSelect) statusSelect.onchange = filterAndRenderNeeds;
    }
    
    if (typeof EventSource !== 'undefined') {
        const eventSource = new EventSource('/api/events');
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'update') {
                    console.log('Live update received:', data);
                    addNotificationLog(`📢 System list updated (${data.method || 'GET'} on ${data.url})`);
                    if (document.getElementById('needsGrid')) {
                        loadNeeds();
                    }
                    if (document.getElementById('vGrid') && typeof loadVolunteers === 'function') {
                        loadVolunteers();
                    }
                } else if (data.type === 'chat') {
                    console.log('Chat update received:', data);
                    if (activeChatNeedId === data.needId) {
                        loadChatHistory(data.needId);
                    } else {
                        const needObj = cachedNeeds.find(n => n.id === data.needId);
                        const title = needObj ? needObj.title : 'assigned task';
                        addNotificationLog(`💬 Chat update: message from ${data.message.senderName} on "${title}"`);
                    }
                } else if (data.type === 'review') {
                    console.log('Review update received:', data);
                    addNotificationLog(`🎖️ New review left for volunteer: ${data.volunteer.name} (Rating: ${data.review.rating}/5)`);
                    if (document.getElementById('needsGrid')) {
                        loadNeeds();
                    }
                }
            } catch (e) {
                console.error('Error parsing SSE event:', e);
            }
        };
    }
});

async function loadNeeds() {
    const grid = document.getElementById('needsGrid');
    try {
        const [needs, globalData] = await Promise.all([
            API.getNeeds(),
            API.getGlobalData()
        ]);
        globalAdmins = globalData.admins;
        globalVolunteers = globalData.volunteers;
        cachedNeeds = needs;

        initMap();
        updateMapMarkers(needs);

        renderRoleBanner(needs);
        filterAndRenderNeeds();
    } catch (err) {
        if (grid) grid.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
    }
}

function filterAndRenderNeeds() {
    const grid = document.getElementById('needsGrid');
    if (!grid) return;

    const searchVal = document.getElementById('searchNeeds')?.value.toLowerCase() || '';
    const urgencyVal = document.getElementById('filterUrgency')?.value || '';
    const statusVal = document.getElementById('filterStatus')?.value || '';

    const filtered = cachedNeeds.filter(need => {
        const titleMatch = need.title.toLowerCase().includes(searchVal);
        const descMatch = need.description.toLowerCase().includes(searchVal);
        const locMatch = need.location.toLowerCase().includes(searchVal);
        
        const textMatch = titleMatch || descMatch || locMatch;
        const urgencyMatch = !urgencyVal || (need.aiAnalysis && need.aiAnalysis.urgency && need.aiAnalysis.urgency.toLowerCase() === urgencyVal.toLowerCase());
        const statusMatch = !statusVal || (need.status === statusVal);

        return textMatch && urgencyMatch && statusMatch;
    });

    updateMapMarkers(filtered);

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color: var(--text-light); margin-top:2rem;">No tasks matching the criteria found.</p>';
        return;
    }
    grid.innerHTML = filtered.map(need => createNeedCard(need)).join('');
}

function calculateCompatibilityScore(need, volunteer) {
    if (!need || !volunteer) return 50;
    
    let score = 40; // baseline
    
    // 1. Skill overlap matching (max +35)
    const taskSkills = (need.aiAnalysis && need.aiAnalysis.skills) || [];
    const volSkills = volunteer.skills ? volunteer.skills.split(',').map(s => s.trim().toLowerCase()) : [];
    
    let skillMatches = 0;
    taskSkills.forEach(ts => {
        const tsClean = ts.toLowerCase();
        if (volSkills.some(vs => vs.includes(tsClean) || tsClean.includes(vs))) {
            skillMatches++;
        }
    });
    
    if (taskSkills.length > 0) {
        score += Math.min(35, Math.round((skillMatches / taskSkills.length) * 35));
    }
    
    // 2. Proximity location matching (max +15)
    const taskLoc = (need.location || '').toLowerCase();
    const volLoc = (volunteer.currentLocation || '').toLowerCase();
    if (taskLoc && volLoc && (taskLoc.includes(volLoc) || volLoc.includes(taskLoc))) {
        score += 15;
    } else {
        // partial match check
        const volParts = volLoc.split(/[\s,]+/);
        if (volParts.some(part => part.length > 3 && taskLoc.includes(part))) {
            score += 8;
        }
    }
    
    // 3. Availability checking (max +10)
    const taskDesc = (need.description || '').toLowerCase();
    const volAvail = (volunteer.availability || '').toLowerCase();
    
    const timeKeywords = ['weekend', 'evening', 'morning', 'saturday', 'sunday', 'weekday', 'night'];
    timeKeywords.forEach(kw => {
        if (taskDesc.includes(kw) && volAvail.includes(kw)) {
            score += 5;
        }
    });
    
    score = Math.min(99, Math.max(45, score));
    return score;
}

function renderRoleBanner(needs) {
    const banner = document.getElementById('roleHeaderBanner');
    if (!banner) return;

    if (Auth.isAdmin()) {
        const adminUser = Auth.getToken();
        const adminData = globalAdmins.find(a => a.username === adminUser) || {};
        const rating = adminData.rating || 5.0;
        const completed = adminData.tasksCompleted || 0;
        const myTasksCount = needs.filter(n => n.createdBy === adminUser && n.status !== 'completed').length;
        
        banner.innerHTML = `
            <div class="card" style="margin-bottom: 2rem; padding: 1.5rem 2rem; flex-direction: row; align-items: center; justify-content: space-between; border-color: rgba(99, 102, 241, 0.2); flex-wrap: wrap; gap: 1rem;">
                <div>
                    <h2 style="font-size: 1.5rem; color: var(--text-main); font-family: 'Outfit'; display: flex; align-items: center; gap: 8px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 4px rgba(99,102,241,0.6))"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                        Admin Portal
                    </h2>
                    <p style="color: var(--text-light); font-size: 0.9rem;">Logged in as: <strong style="color: var(--text-main);">${adminUser}</strong></p>
                </div>
                <div style="display: flex; gap: 2rem; align-items: center; flex-wrap: wrap;">
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: #f59e0b; font-family: 'Outfit';">⭐ ${rating}</div>
                        <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Reputation</div>
                    </div>
                    <div style="text-align: center; border-left: 1px solid rgba(255,255,255,0.08); padding-left: 2rem;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary); font-family: 'Outfit';">${completed}</div>
                        <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Completed</div>
                    </div>
                    <div style="text-align: center; border-left: 1px solid rgba(255,255,255,0.08); padding-left: 2rem;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent); font-family: 'Outfit';">${myTasksCount}</div>
                        <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">My Active Needs</div>
                    </div>
                </div>
            </div>
        `;
    } else if (Auth.isVolunteer()) {
        const volUser = Auth.getToken();
        const volData = globalVolunteers.find(v => v.username === volUser) || {};
        const joinedCount = needs.filter(n => n.assignedVolunteers.some(v => v.id === volData.id)).length;
        const pendingCount = needs.filter(n => n.requests.some(r => r.username === volUser && r.status === 'pending')).length;

        banner.innerHTML = `
            <div class="card" style="margin-bottom: 2rem; padding: 1.5rem 2rem; flex-direction: row; align-items: center; justify-content: space-between; border-color: rgba(99, 102, 241, 0.2); flex-wrap: wrap; gap: 1rem;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <img src="${volData.profilePic || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(volData.name)}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.1)">
                    <div>
                        <h2 style="font-size: 1.4rem; color: var(--text-main); font-family: 'Outfit';">Welcome, ${volData.name || volUser}!</h2>
                        <p style="color: var(--text-light); font-size: 0.85rem;">📍 Neighborhood: <strong style="color: var(--text-main);">${volData.currentLocation || 'N/A'}</strong></p>
                    </div>
                </div>
                <div style="display: flex; gap: 2rem; align-items: center; flex-wrap: wrap;">
                    <div style="text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: #10b981; font-family: 'Outfit';">${joinedCount}</div>
                        <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Joined Tasks</div>
                    </div>
                    <div style="text-align: center; border-left: 1px solid rgba(255,255,255,0.08); padding-left: 2rem;">
                        <div style="font-size: 1.5rem; font-weight: 700; color: #f59e0b; font-family: 'Outfit';">${pendingCount}</div>
                        <div style="font-size: 0.75rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Pending Requests</div>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Guest UI
        banner.innerHTML = `
            <div class="card" style="margin-bottom: 2rem; padding: 2rem; background: linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(217,70,239,0.05) 100%); border-color: rgba(99,102,241,0.3); text-align: left; flex-direction: row; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1.5rem;">
                <div style="max-width: 650px;">
                    <h2 style="font-size: 1.75rem; color: var(--text-main); font-family: 'Outfit'; margin-bottom: 0.5rem;">
                        👋 Join Hands with Your Community!
                    </h2>
                    <p style="color: var(--text-light); font-size: 0.95rem;">Browse public needs below. Register as a volunteer or log in to request to join tasks, coordinate with administrators, and view other helper profiles.</p>
                </div>
                <div style="display: flex; gap: 1rem;">
                    <a href="index.html" class="btn" style="box-shadow: 0 4px 14px rgba(99, 102, 241, 0.45);">Secure Login</a>
                    <a href="add-volunteer.html" class="btn" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: var(--text-main); box-shadow: none;">Register Now</a>
                </div>
            </div>
        `;
    }
}

function createNeedCard(need) {
    const ai = need.aiAnalysis || {};
    const urgency = (ai.urgency || 'Low').toLowerCase();
    const skills = ai.skills || [];
    
    // Find admin creator score
    const creator = globalAdmins.find(a => a.username === need.createdBy);
    const scoreBadge = creator ? 
        `<span style="margin-left:auto; display:flex; align-items:center; gap:4px; font-weight:600; color:#f59e0b;" title="${creator.tasksCompleted} Tasks Completed">
         <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
         ${creator.rating}</span>` : '';

    const assignedVolunteers = need.assignedVolunteers || [];
    
    let assignedSection = '';
    if (assignedVolunteers.length > 0) {
        let labels = assignedVolunteers.map(v => {
            const vData = globalVolunteers.find(gv => gv.id === v.id);
            const ratingInfo = getVolunteerRatingInfo(vData);
            return `
                <div class="assigned-badge-detailed" title="Reputation: ⭐ ${ratingInfo.avg} (${ratingInfo.count} reviews)">
                    ${v.pic ? `<img src="${v.pic}" alt="Avatar"/>` : ''}
                    <span>${v.name} (⭐ ${ratingInfo.avg})</span>
                </div>
            `;
        }).join('');

        assignedSection = `
            <div class="assigned-section">
                <div class="assigned-label">Joined Volunteers:</div>
                <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.5rem">${labels}</div>
            </div>
        `;
    }

    // Render Milestone Checklist
    let checklistSection = '';
    const checklist = need.checklist || [];
    if (checklist.length > 0) {
        const completedCount = checklist.filter(item => item.completed).length;
        const totalCount = checklist.length;
        const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        
        const isOwner = need.createdBy === Auth.getToken();
        const isAssigned = need.assignedVolunteers.some(v => v.id === globalVolunteers.find(gv => gv.username === Auth.getToken())?.id);
        const canEdit = isOwner || isAssigned;

        const checklistItems = checklist.map(item => {
            const completedByText = item.completed && item.completedBy ? ` (by ${item.completedBy})` : '';
            return `
                <li style="display:flex; align-items:center; gap:8px; margin-bottom:0.3rem; font-size:0.85rem;">
                    <input type="checkbox" 
                           ${item.completed ? 'checked' : ''} 
                           ${canEdit ? '' : 'disabled'} 
                           onclick="toggleSubtask('${need.id}', '${item.id}')"
                           style="width: 14px; height: 14px; cursor: ${canEdit ? 'pointer' : 'default'}; margin-bottom: 0;">
                    <span style="text-decoration: ${item.completed ? 'line-through' : 'none'}; color: ${item.completed ? 'var(--text-light)' : 'var(--text-main)'};">
                        ${item.text}${completedByText}
                    </span>
                </li>
            `;
        }).join('');

        const addMilestoneInput = canEdit ? `
            <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
                <input type="text" id="addChecklistInput-${need.id}" class="form-control" placeholder="Add custom subtask..." style="padding:0.4rem 0.8rem; font-size:0.8rem; margin-bottom:0; flex-grow:1;">
                <button onclick="addCustomSubtask('${need.id}')" class="btn" style="padding:0.4rem 0.8rem; font-size:0.8rem; margin:0; box-shadow:none;">Add</button>
            </div>
        ` : '';

        checklistSection = `
            <div class="checklist-section" style="margin-top:1.25rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem;">
                <div class="checklist-progress-container" style="margin-bottom: 0.75rem;">
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-light); margin-bottom:4px; font-weight:600;">
                        <span>📋 Milestone Checklist</span>
                        <span>${completedCount} of ${totalCount} completed</span>
                    </div>
                    <div class="progress-bar-bg" style="background: rgba(255,255,255,0.08); height: 6px; border-radius: 3px; overflow: hidden;">
                        <div class="progress-bar-fill" style="background: linear-gradient(90deg, var(--primary) 0%, var(--accent) 100%); height: 100%; width: ${progressPercent}%; transition: width 0.3s ease;"></div>
                    </div>
                </div>
                <ul style="list-style: none; padding: 0; margin: 0; display:flex; flex-direction:column; gap:0.4rem;">
                    ${checklistItems}
                </ul>
                ${addMilestoneInput}
            </div>
        `;
    }

    const unassignedCount = (need.requiredVolunteerCount || 1) - assignedVolunteers.length;
    let actionArea = '';

    if (need.status === 'completed') {
        actionArea = `<button disabled class="btn btn-full btn-disabled" style="margin-top:auto">Task Completed</button>`;
    } else {
        if (Auth.isAdmin()) {
            if (need.createdBy === Auth.getToken()) {
                // Admin Owner View
                let reqHtml = '';
                if (need.requests && need.requests.length > 0) {
                    reqHtml = `<div class="assigned-section"><div class="assigned-label">Pending Requests:</div>`;
                    need.requests.filter(r => r.status === 'pending').forEach(r => {
                        const vData = globalVolunteers.find(v => v.username === r.username);
                        if(vData) {
                            const matchPercent = calculateCompatibilityScore(need, vData);
                            let scoreColor = '#10b981'; // Green for high
                            if (matchPercent < 75) scoreColor = '#f59e0b'; // Amber for medium
                            if (matchPercent < 55) scoreColor = '#ef4444'; // Red for low

                            const ratingInfo = getVolunteerRatingInfo(vData);
                            reqHtml += `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:0.5rem 0.75rem; border-radius:8px; margin-bottom:0.5rem; flex-wrap:wrap; gap:0.5rem; width:100%;">
                                <div style="display:flex; align-items:center; gap:10px">
                                   <img src="${vData.profilePic}" style="width:28px; height:28px; border-radius:50%; object-fit:cover;">
                                   <div>
                                       <span style="font-size:0.9rem; font-weight:600; color:var(--text-main);">${vData.name}</span>
                                       <span style="display:block; font-size:0.75rem; font-weight:700; color:${scoreColor}">${matchPercent}% Match | ⭐ ${ratingInfo.avg} (${ratingInfo.count} reviews)</span>
                                   </div>
                                </div>
                                <button class="btn" style="padding:0.35rem 0.85rem; font-size:0.8rem; box-shadow:none;" onclick="approveJoin('${need.id}', '${vData.username}')">Approve</button>
                            </div>`;
                        }
                    });
                    reqHtml += `</div>`;
                }
                
                actionArea = `
                    ${reqHtml}
                    ${unassignedCount > 0 ? `<button onclick="findMatch('${need.id}')" class="btn btn-full" style="margin-top:auto; margin-bottom:0.5rem; background:rgba(99, 102, 241, 0.08); color:#a5b4fc; border:1px solid rgba(99, 102, 241, 0.35); box-shadow:none;">Gemini AI Form Fill (${unassignedCount})</button>` : ''}
                    <button onclick="markComplete('${need.id}')" class="btn btn-full" style="background:#10b981; margin-top:auto; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">Mark as Completed</button>
                `;
            } else {
                actionArea = `<button disabled class="btn btn-full btn-disabled" style="margin-top:auto">Owned by ${need.createdBy}</button>`;
            }
        } 
        else if (Auth.isVolunteer()) {
            // Volunteer View
            const hasRequested = need.requests && need.requests.some(r => r.username === Auth.getToken());
            const hasJoined = need.assignedVolunteers.some(v => v.id === globalVolunteers.find(gv=>gv.username===Auth.getToken())?.id);
            
            if (hasJoined) {
                 actionArea = `<button disabled class="btn btn-full btn-disabled" style="margin-top:auto">You Joined!</button>`;
            } else if (hasRequested) {
                 actionArea = `<button disabled class="btn btn-full btn-disabled" style="margin-top:auto">Request Pending Approval</button>`;
            } else {
                 if(unassignedCount > 0 && need.status !== 'matched') {
                     actionArea = `<button onclick="requestJoin('${need.id}')" class="btn btn-full" style="margin-top:auto">Request to Join</button>`;
                 } else {
                     actionArea = `<button disabled class="btn btn-full btn-disabled" style="margin-top:auto">Task Full</button>`;
                 }
             }
        } else {
             actionArea = `<button disabled class="btn btn-full btn-disabled" style="margin-top:auto">Login to Join</button>`;
        }
    }

    const isChatAvailable = (Auth.isAdmin() && need.createdBy === Auth.getToken() && need.assignedVolunteers.length > 0) ||
                           (Auth.isVolunteer() && need.assignedVolunteers.some(v => v.id === globalVolunteers.find(gv => gv.username === Auth.getToken())?.id));

    const chatButton = isChatAvailable ? 
        `<button onclick="openChatModal('${need.id}', '${need.title.replace(/'/g, "\\'")}')" class="btn btn-full" style="background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.35); color:#a5b4fc; box-shadow:none; margin-top:0.5rem;">💬 Chat Hub</button>` : '';

    return `
        <div class="card need-card" id="need-card-${need.id}">
            <div class="card-header">
                <div class="card-title">${need.title}</div>
                ${scoreBadge}
                <div class="badge ${urgency}" style="margin-left:0.5rem">${urgency.toUpperCase()}</div>
            </div>
            
            <div class="card-body">
                <div class="card-meta">
                     <svg width="14" height="14" viewBox="0 0 24 24" style="margin-right:0.25rem;" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                     ${need.location}
                </div>
                ${need.taskLocationDetails ? `<div class="card-meta" style="color:var(--text-main); font-style:italic">↳ ${need.taskLocationDetails}</div>` : ''}
                
                <div class="card-text">${need.description}</div>
                
                <div class="card-meta" style="margin-top:1rem; font-weight:600;">
                     Volunteers Required: ${need.requiredVolunteerCount || 1}
                </div>

                <div class="skills-list">
                    ${skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
                </div>

                ${assignedSection}
                ${checklistSection}
            </div>
            
            ${chatButton}
            ${actionArea}
        </div>
    `;
}

// Window actions
window.findMatch = async (needId) => {
    await showSpinner("Gemini AI is finding matches...");
    try { await API.matchVolunteer(needId); await loadNeeds(); } 
    catch (err) { alert(err.message); } finally { hideSpinner(); }
};

window.requestJoin = async (needId) => {
    await showSpinner("Sending Request...");
    try { await API.requestToJoinTask(needId); await loadNeeds(); } 
    catch (err) { alert(err.message); } finally { hideSpinner(); }
};

window.approveJoin = async (needId, volUsername) => {
    await showSpinner("Approving...");
    try { await API.approveRequest(needId, volUsername); await loadNeeds(); } 
    catch (err) { alert(err.message); } finally { hideSpinner(); }
};

window.markComplete = async (needId) => {
    const need = cachedNeeds.find(n => n.id === needId);
    if (!need) return;

    if (need.assignedVolunteers && need.assignedVolunteers.length > 0) {
        const assignedVol = need.assignedVolunteers[0];
        const volFull = globalVolunteers.find(v => v.id === assignedVol.id);
        if (volFull) {
            openReviewModal(volFull.username, volFull.name, needId);
            return;
        }
    }

    if(!confirm("Are you sure? This will finalize the task and boost your Admin reputation score.")) return;
    await showSpinner("Finalizing...");
    try { await API.completeTask(needId); await loadNeeds(); } 
    catch (err) { alert(err.message); } finally { hideSpinner(); }
};

// Chat Modal Handlers
window.openChatModal = async (needId, needTitle) => {
    activeChatNeedId = needId;
    document.getElementById('chatNeedTitle').innerText = `💬 Chat: ${needTitle}`;
    document.getElementById('chatModalOverlay').classList.add('open');
    document.getElementById('chatInputMessage').focus();
    
    await loadChatHistory(needId);
    
    const log = document.getElementById('chatMessagesLog');
    if (log) log.scrollTop = log.scrollHeight;
};

window.closeChatModal = () => {
    activeChatNeedId = null;
    document.getElementById('chatModalOverlay').classList.remove('open');
};

async function loadChatHistory(needId) {
    if (activeChatNeedId !== needId) return;
    try {
        const history = await API.getChatHistory(needId);
        renderChatMessages(history);
    } catch (e) {
        console.error("Failed to load chat history:", e);
    }
}

function renderChatMessages(messagesList) {
    const log = document.getElementById('chatMessagesLog');
    if (!log) return;

    if (messagesList.length === 0) {
        log.innerHTML = `<p style="color:var(--text-light); text-align:center; font-size:0.85rem; margin-top:2rem;">No messages yet. Send a message to start coordinating!</p>`;
        return;
    }

    const currentUsername = Auth.getToken();
    log.innerHTML = messagesList.map(msg => {
        const isSent = msg.sender === currentUsername;
        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        return `
            <div class="chat-bubble ${isSent ? 'sent' : 'received'}">
                ${!isSent ? `<span class="chat-meta">${msg.senderName} (${msg.senderRole})</span>` : ''}
                <div>${msg.text}</div>
                <span style="font-size: 0.65rem; display: block; text-align: right; opacity: 0.6; margin-top: 4px;">${time}</span>
            </div>
        `;
    }).join('');
    
    log.scrollTop = log.scrollHeight;
}

window.sendChatMessage = async () => {
    const input = document.getElementById('chatInputMessage');
    if (!input || !input.value.trim() || !activeChatNeedId) return;

    const text = input.value.trim();
    input.value = '';

    try {
        await API.sendChatMessage(activeChatNeedId, text);
        await loadChatHistory(activeChatNeedId);
    } catch (e) {
        alert("Failed to send message: " + e.message);
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'chatInputMessage') {
        sendChatMessage();
    }
});

// Review Modal Handlers
window.openReviewModal = (volUsername, volName, needId) => {
    document.getElementById('reviewVolunteerUsername').value = volUsername;
    document.getElementById('reviewVolunteerName').innerText = volName;
    document.getElementById('reviewNeedId').value = needId;
    
    document.getElementById('reviewForm').reset();
    document.getElementById('reviewModalOverlay').classList.add('open');
};

window.closeReviewModal = () => {
    document.getElementById('reviewModalOverlay').classList.remove('open');
};

window.submitVolunteerReview = async (event) => {
    event.preventDefault();
    const volunteerUsername = document.getElementById('reviewVolunteerUsername').value;
    const needId = document.getElementById('reviewNeedId').value;
    const comment = document.getElementById('reviewComment').value;
    
    const ratingRadios = document.getElementsByName('reviewRating');
    let rating = 5;
    for (const radio of ratingRadios) {
        if (radio.checked) {
            rating = radio.value;
            break;
        }
    }

    await showSpinner("Submitting Review...");
    try {
        await API.submitReview(volunteerUsername, rating, comment, needId);
        await API.completeTask(needId);
        
        closeReviewModal();
        await loadNeeds();
        alert("Task Completed & Volunteer Reviewed Successfully!");
    } catch (err) {
        alert("Review failed: " + err.message);
    } finally {
        hideSpinner();
    }
};

// CSV Export Handler
window.exportReportCSV = () => {
    if (!Auth.isAdmin()) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Task ID,Task Title,Urgency,Status,Location,Created By,Assigned Volunteers Count,Created Date\r\n";

    cachedNeeds.forEach(need => {
        const assignedCount = need.assignedVolunteers ? need.assignedVolunteers.length : 0;
        const urgency = need.aiAnalysis ? need.aiAnalysis.urgency : "Medium";
        const date = new Date(need.createdAt).toLocaleDateString();
        
        const row = [
            `"${need.id}"`,
            `"${need.title.replace(/"/g, '""')}"`,
            `"${urgency}"`,
            `"${need.status}"`,
            `"${need.location.replace(/"/g, '""')}"`,
            `"${need.createdBy}"`,
            assignedCount,
            `"${date}"`
        ];
        csvContent += row.join(",") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `VolunteerSync_Impact_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// --- INTERACTIVE CALENDAR & CHECKLIST HELPERS ---
let currentView = 'grid'; // 'grid' or 'calendar'
let calendarDate = new Date();

window.initCalendarToggle = () => {
    const btnGrid = document.getElementById('btnGridView');
    const btnCal = document.getElementById('btnCalendarView');
    const gridDiv = document.getElementById('needsGrid');
    const calDiv = document.getElementById('needsCalendar');

    if (!btnGrid || !btnCal) return;

    btnGrid.onclick = () => {
        currentView = 'grid';
        gridDiv.style.display = 'grid';
        calDiv.style.display = 'none';

        btnGrid.style.background = 'var(--primary)';
        btnGrid.style.color = 'white';
        btnGrid.style.boxShadow = '0 4px 10px rgba(99, 102, 241, 0.25)';
        btnGrid.style.fontWeight = '600';

        btnCal.style.background = 'transparent';
        btnCal.style.color = 'var(--text-light)';
        btnCal.style.boxShadow = 'none';
        btnCal.style.fontWeight = '500';
        
        filterAndRenderNeeds();
    };

    btnCal.onclick = () => {
        currentView = 'calendar';
        gridDiv.style.display = 'none';
        calDiv.style.display = 'block';

        btnCal.style.background = 'var(--primary)';
        btnCal.style.color = 'white';
        btnCal.style.boxShadow = '0 4px 10px rgba(99, 102, 241, 0.25)';
        btnCal.style.fontWeight = '600';

        btnGrid.style.background = 'transparent';
        btnGrid.style.color = 'var(--text-light)';
        btnGrid.style.boxShadow = 'none';
        btnGrid.style.fontWeight = '500';

        renderCalendar();
    };
};

window.renderCalendar = () => {
    const container = document.getElementById('needsCalendar');
    if (!container) return;

    const searchVal = document.getElementById('searchNeeds')?.value.toLowerCase() || '';
    const urgencyVal = document.getElementById('filterUrgency')?.value || '';
    const statusVal = document.getElementById('filterStatus')?.value || '';

    const filtered = cachedNeeds.filter(need => {
        const titleMatch = need.title.toLowerCase().includes(searchVal);
        const descMatch = need.description.toLowerCase().includes(searchVal);
        const locMatch = need.location.toLowerCase().includes(searchVal);
        const textMatch = titleMatch || descMatch || locMatch;
        const urgencyMatch = !urgencyVal || (need.aiAnalysis && need.aiAnalysis.urgency && need.aiAnalysis.urgency.toLowerCase() === urgencyVal.toLowerCase());
        const statusMatch = !statusVal || (need.status === statusVal);
        return textMatch && urgencyMatch && statusMatch;
    });

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevTotalDays = new Date(year, month, 0).getDate();

    let calendarHtml = `
        <div class="calendar-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
            <h2 style="font-family:'Outfit'; font-size:1.5rem; color:var(--text-main); margin:0;">${monthNames[month]} ${year}</h2>
            <div style="display:flex; gap:0.5rem;">
                <button class="btn" onclick="prevMonth()" style="padding:0.4rem 0.8rem; font-size:0.9rem; box-shadow:none;"><</button>
                <button class="btn" onclick="nextMonth()" style="padding:0.4rem 0.8rem; font-size:0.9rem; box-shadow:none;">></button>
            </div>
        </div>
        <div class="calendar-grid">
            <div class="calendar-day-header">Sun</div>
            <div class="calendar-day-header">Mon</div>
            <div class="calendar-day-header">Tue</div>
            <div class="calendar-day-header">Wed</div>
            <div class="calendar-day-header">Thu</div>
            <div class="calendar-day-header">Fri</div>
            <div class="calendar-day-header">Sat</div>
    `;

    // Fill preceding empty boxes
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const d = prevTotalDays - i;
        calendarHtml += `<div class="calendar-day-cell prev-month-day"><span class="day-number">${d}</span></div>`;
    }

    // Fill current month days
    for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const dayNeeds = filtered.filter(n => {
            const cDate = new Date(n.createdAt);
            const cDateStr = `${cDate.getFullYear()}-${String(cDate.getMonth() + 1).padStart(2, '0')}-${String(cDate.getDate()).padStart(2, '0')}`;
            return cDateStr === dateStr;
        });

        let needsHtml = '';
        dayNeeds.forEach(need => {
            const urgency = (need.aiAnalysis?.urgency || 'Low').toLowerCase();
            let urgencyClass = 'urgency-low-label';
            if (urgency === 'high') urgencyClass = 'urgency-high-label';
            if (urgency === 'medium') urgencyClass = 'urgency-medium-label';
            
            needsHtml += `
                <div class="calendar-task-tag ${urgencyClass}" onclick="openCalendarTaskModal('${need.id}', event)">
                    ${need.title}
                </div>
            `;
        });

        const today = new Date();
        const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
        const cellClass = isToday ? 'calendar-day-cell today' : 'calendar-day-cell';

        calendarHtml += `
            <div class="${cellClass}">
                <span class="day-number">${day}</span>
                <div class="calendar-tasks-container">${needsHtml}</div>
            </div>
        `;
    }

    // Fill trailing empty boxes
    const totalCells = firstDayIndex + totalDays;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let day = 1; day <= remainingCells; day++) {
        calendarHtml += `<div class="calendar-day-cell next-month-day"><span class="day-number">${day}</span></div>`;
    }

    calendarHtml += `</div>`;
    container.innerHTML = calendarHtml;
};

window.prevMonth = () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
};

window.nextMonth = () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
};

window.openCalendarTaskModal = (needId, event) => {
    if (event) event.stopPropagation();
    const need = cachedNeeds.find(n => n.id === needId);
    if (!need) return;

    document.getElementById('calModalTitle').innerText = need.title;
    
    const ai = need.aiAnalysis || {};
    const urgency = (ai.urgency || 'Low').toLowerCase();
    const skills = ai.skills || [];
    
    const assignedVolunteers = need.assignedVolunteers || [];
    let assignedNames = assignedVolunteers.length > 0 ? 
        assignedVolunteers.map(v => v.name).join(', ') : 'None yet';

    let checklistHtml = '';
    const checklist = need.checklist || [];
    if (checklist.length > 0) {
        checklistHtml = `
            <div style="margin-top:1.5rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem;">
                <strong style="color:var(--text-main); display:block; margin-bottom:0.5rem;">Milestone Checklist:</strong>
                <ul style="list-style:none; padding:0; margin:0;">
                    ${checklist.map(item => `
                        <li style="display:flex; align-items:center; gap:8px; margin-bottom:0.4rem; font-size:0.9rem;">
                            <span style="color:${item.completed ? '#10b981' : 'var(--text-light)'}">
                                ${item.completed ? '✓' : '○'}
                            </span>
                            <span style="text-decoration:${item.completed ? 'line-through' : 'none'}; color:${item.completed ? 'var(--text-light)' : 'var(--text-main)'}">
                                ${item.text}
                            </span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    const html = `
        <div style="display:flex; flex-direction:column; gap:0.75rem;">
            <div><strong style="color:var(--text-main)">Location:</strong> ${need.location}</div>
            ${need.taskLocationDetails ? `<div><strong style="color:var(--text-main)">Details:</strong> <em>${need.taskLocationDetails}</em></div>` : ''}
            <div><strong style="color:var(--text-main)">Urgency:</strong> <span class="badge ${urgency}" style="font-size:0.75rem;">${urgency.toUpperCase()}</span></div>
            <div><strong style="color:var(--text-main)">Status:</strong> <span style="text-transform:capitalize; font-weight:600; color:var(--primary);">${need.status}</span></div>
            <div><strong style="color:var(--text-main)">Required Volunteers:</strong> ${need.requiredVolunteerCount || 1}</div>
            <div><strong style="color:var(--text-main)">Assigned Helpers:</strong> ${assignedNames}</div>
            <div style="margin-top:0.5rem; line-height:1.5;"><strong style="color:var(--text-main)">Description:</strong><br/>${need.description}</div>
            <div style="margin-top:0.5rem;">
                <strong style="color:var(--text-main)">Skills Required:</strong><br/>
                <div style="display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:0.25rem;">
                    ${skills.map(skill => `<span class="skill-tag" style="margin:0">${skill}</span>`).join('')}
                </div>
            </div>
            ${checklistHtml}
            <div style="margin-top:1.5rem;">
                <button class="btn btn-full" onclick="closeCalendarTaskModal(); scrollToCard('${need.id}')" style="margin-top:0;">Navigate to Task Card</button>
            </div>
        </div>
    `;

    document.getElementById('calModalBody').innerHTML = html;
    document.getElementById('calendarTaskModalOverlay').classList.add('open');
};

window.closeCalendarTaskModal = () => {
    document.getElementById('calendarTaskModalOverlay').classList.remove('open');
};

window.toggleSubtask = async (needId, itemId) => {
    try {
        await API.toggleChecklistItem(needId, itemId);
        await loadNeeds();
    } catch (err) {
        alert("Action failed: " + err.message);
    }
};

window.addCustomSubtask = async (needId) => {
    const input = document.getElementById(`addChecklistInput-${needId}`);
    if (!input || !input.value.trim()) return;
    
    const text = input.value.trim();
    input.value = '';
    
    try {
        await API.addChecklistItem(needId, text);
        await loadNeeds();
    } catch (err) {
        alert("Action failed: " + err.message);
    }
};

