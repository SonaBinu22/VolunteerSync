// Global data map for efficient routing logic:
let globalAdmins = [];
let globalVolunteers = [];
let cachedNeeds = [];

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('needsGrid')) {
        loadNeeds();
        
        // Wire up filter event listeners
        const searchInput = document.getElementById('searchNeeds');
        const urgencySelect = document.getElementById('filterUrgency');
        const statusSelect = document.getElementById('filterStatus');
        
        if (searchInput) searchInput.oninput = filterAndRenderNeeds;
        if (urgencySelect) urgencySelect.onchange = filterAndRenderNeeds;
        if (statusSelect) statusSelect.onchange = filterAndRenderNeeds;
    }
    
    // Connect to real-time updates via Server-Sent Events (SSE)
    if (typeof EventSource !== 'undefined') {
        const eventSource = new EventSource('/api/events');
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'update') {
                    console.log('Live update received:', data);
                    if (document.getElementById('needsGrid')) {
                        loadNeeds();
                    }
                    if (document.getElementById('vGrid') && typeof loadVolunteers === 'function') {
                        loadVolunteers();
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
            API.getGlobalData() // { needs, volunteers, admins }
        ]);
        globalAdmins = globalData.admins;
        globalVolunteers = globalData.volunteers;
        cachedNeeds = needs;

        renderRoleBanner(needs);
        filterAndRenderNeeds();
    } catch (err) {
        if (grid) grid.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
    }
}

function filterAndRenderNeeds() {
    const grid = document.getElementById('needsGrid');
    if (!grid) return;

    // Get filter inputs if they exist in the HTML
    const searchVal = document.getElementById('searchNeeds')?.value.toLowerCase() || '';
    const urgencyVal = document.getElementById('filterUrgency')?.value || '';
    const statusVal = document.getElementById('filterStatus')?.value || '';

    const filtered = cachedNeeds.filter(need => {
        const titleMatch = need.title.toLowerCase().includes(searchVal);
        const descMatch = need.description.toLowerCase().includes(searchVal);
        const locMatch = need.location.toLowerCase().includes(searchVal);
        
        // Match search text against title, description, or location
        const textMatch = titleMatch || descMatch || locMatch;
        
        // Match urgency
        const urgencyMatch = !urgencyVal || (need.aiAnalysis && need.aiAnalysis.urgency && need.aiAnalysis.urgency.toLowerCase() === urgencyVal.toLowerCase());
        
        // Match status
        const statusMatch = !statusVal || (need.status === statusVal);

        return textMatch && urgencyMatch && statusMatch;
    });

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
        let labels = assignedVolunteers.map(v => `
            <div class="assigned-badge-detailed" title="View Profile">
                ${v.pic ? `<img src="${v.pic}" alt="Avatar"/>` : ''}
                <span>${v.name}</span>
            </div>
        `).join('');

        assignedSection = `
            <div class="assigned-section">
                <div class="assigned-label">Joined Volunteers:</div>
                <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.5rem">${labels}</div>
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

                            reqHtml += `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:0.5rem 0.75rem; border-radius:8px; margin-bottom:0.5rem; flex-wrap:wrap; gap:0.5rem;">
                                <div style="display:flex; align-items:center; gap:10px">
                                   <img src="${vData.profilePic}" style="width:28px; height:28px; border-radius:50%; object-fit:cover;">
                                   <div>
                                       <span style="font-size:0.9rem; font-weight:600; color:var(--text-main);">${vData.name}</span>
                                       <span style="display:block; font-size:0.75rem; font-weight:700; color:${scoreColor}">${matchPercent}% Match</span>
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

    return `
        <div class="card need-card">
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
            </div>
            
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
    if(!confirm("Are you sure? This will finalize the task and boost your Admin reputation score.")) return;
    await showSpinner("Finalizing...");
    try { await API.completeTask(needId); await loadNeeds(); } 
    catch (err) { alert(err.message); } finally { hideSpinner(); }
};
