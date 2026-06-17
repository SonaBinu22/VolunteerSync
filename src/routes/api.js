const { needs, volunteers, admins, messages, saveData } = require('../services/dataStore');
const geminiService = require('../services/gemini');

const parseBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); }
            catch(err) { reject(err); }
        });
        req.on('error', err => reject(err));
    });
};

const sendJson = (res, statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
};

module.exports = async function apiHandler(req, res) {
    const method = req.method;
    const url = req.url.split('?')[0];
    const token = req.headers['x-auth-token'];
    const role = req.headers['x-auth-role'];

    // --- PASSWORD RECOVERY API ---
    if (method === 'POST' && url === '/api/auth/recover-init') {
        try {
            const { username, role: loginRole } = await parseBody(req);
            if (!username || !loginRole) {
                return sendJson(res, 400, { error: 'Username and role are required' });
            }
            let user;
            if (loginRole === 'admin') {
                user = admins.find(a => a.username === username);
            } else if (loginRole === 'volunteer') {
                user = volunteers.find(v => v.username === username);
            } else {
                return sendJson(res, 400, { error: 'Invalid role' });
            }

            if (!user) {
                return sendJson(res, 404, { error: 'User not found' });
            }

            if (loginRole === 'admin') {
                return sendJson(res, 200, { 
                    challenge: 'email', 
                    prompt: 'Please enter your registered email address to verify identity.' 
                });
            } else {
                return sendJson(res, 200, { 
                    challenge: 'phone', 
                    prompt: 'Please enter your registered phone number to verify identity.' 
                });
            }
        } catch (err) {
            return sendJson(res, 500, { error: 'Internal server error' });
        }
    }

    if (method === 'POST' && url === '/api/auth/recover-reset') {
        try {
            const { username, role: loginRole, answer, newPassword } = await parseBody(req);
            if (!username || !loginRole || !answer || !newPassword) {
                return sendJson(res, 400, { error: 'Missing required fields' });
            }

            let user;
            if (loginRole === 'admin') {
                user = admins.find(a => a.username === username);
            } else if (loginRole === 'volunteer') {
                user = volunteers.find(v => v.username === username);
            } else {
                return sendJson(res, 400, { error: 'Invalid role' });
            }

            if (!user) {
                return sendJson(res, 404, { error: 'User not found' });
            }

            let isCorrect = false;
            if (loginRole === 'admin') {
                const registeredEmail = (user.email || '').trim().toLowerCase();
                const providedAnswer = answer.trim().toLowerCase();
                isCorrect = registeredEmail && registeredEmail === providedAnswer;
            } else {
                const registeredPhone = (user.phone || '').replace(/\D/g, '');
                const providedPhone = answer.replace(/\D/g, '');
                isCorrect = registeredPhone && registeredPhone === providedPhone;
                if (!isCorrect) {
                    isCorrect = (user.phone || '').trim() === answer.trim();
                }
            }

            if (!isCorrect) {
                return sendJson(res, 400, { error: 'Incorrect recovery information. Verification failed.' });
            }

            user.password = newPassword;
            saveData();
            return sendJson(res, 200, { message: 'Password reset successful.' });
        } catch (err) {
            return sendJson(res, 500, { error: 'Internal server error' });
        }
    }

    // --- UNIFIED AUTH API ---
    if (method === 'POST' && url === '/api/auth/login') {
        try {
            const { username, password, loginRole } = await parseBody(req);
            let user;
            if (loginRole === 'admin') user = admins.find(a => a.username === username && a.password === password);
            else user = volunteers.find(v => v.username === username && v.password === password);

            if (!user) return sendJson(res, 401, { error: 'Invalid credentials' });
            return sendJson(res, 200, { token: user.username, role: loginRole });
        } catch(err) { return sendJson(res, 500, { error: 'Internal error' }); }
    }

    if (method === 'POST' && url === '/api/admin/register') {
        try {
            const { username, password } = await parseBody(req);
            if (!username || !password) return sendJson(res, 400, { error: 'Username and password required' });
            if (admins.find(a => a.username === username)) return sendJson(res, 400, { error: 'Username taken' });
            admins.push({ username, password, name: '', email: '', phone: '', rating: 5.0, tasksCompleted: 0 }); 
            return sendJson(res, 201, { message: 'Admin registered' });
        } catch(err) { return sendJson(res, 500, { error: 'Internal error' }); }
    }

    if (method === 'POST' && url === '/api/volunteers') { // Universal volunteer registration
        try {
            const body = await parseBody(req);
            const { username, password, name, address, phone, currentLocation, bloodGroup, gender, profilePic, skills, availability } = body;
            if (!username || !password || !name) return sendJson(res, 400, { error: 'Username, password, and name required' });
            if (volunteers.find(v => v.username === username)) return sendJson(res, 400, { error: 'Username taken' });

            const picUrl = profilePic || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
            const newVolunteer = {
                username, password, id: 'v' + Date.now().toString(),
                name, address, phone, currentLocation: currentLocation || address, 
                bloodGroup, gender, profilePic: picUrl, skills, availability,
                reviews: []
            };
            volunteers.push(newVolunteer);
            return sendJson(res, 201, newVolunteer);
        } catch (err) { return sendJson(res, 500, { error: 'Registration failed' }); }
    }

    if (method === 'GET' && url === '/api/global/data') {
        // Safe endpoint to get aggregate data for UI routing
        return sendJson(res, 200, { needs, volunteers, admins: admins.map(a => ({username: a.username, rating: a.rating, tasksCompleted: a.tasksCompleted})) });
    }

    if (method === 'GET' && url === '/api/volunteers') {
        return sendJson(res, 200, volunteers);
    }

    if (url === '/api/admin/profile') {
        if (!token || role !== 'admin') {
            return sendJson(res, 403, { error: 'Unauthorized: Admin access required' });
        }
        const adminObj = admins.find(a => a.username === token);
        if (!adminObj) return sendJson(res, 404, { error: 'Admin profile not found' });

        if (method === 'GET') {
            return sendJson(res, 200, adminObj);
        }
        if (method === 'PUT') {
            try {
                const { name, email, phone } = await parseBody(req);
                adminObj.name = name || adminObj.name;
                adminObj.email = email || adminObj.email;
                adminObj.phone = phone || adminObj.phone;
                return sendJson(res, 200, adminObj);
            } catch(e) {
                return sendJson(res, 500, { error: 'Failed to update admin profile' });
            }
        }
    }

    if (url === '/api/volunteer/profile') {
        if (!token || role !== 'volunteer') {
            return sendJson(res, 403, { error: 'Unauthorized: Volunteer access required' });
        }
        const volObj = volunteers.find(v => v.username === token);
        if (!volObj) return sendJson(res, 404, { error: 'Volunteer profile not found' });

        if (method === 'GET') {
            return sendJson(res, 200, volObj);
        }
        if (method === 'PUT') {
            try {
                const { name, address, phone, currentLocation, bloodGroup, gender, profilePic, skills, availability } = await parseBody(req);
                volObj.name = name || volObj.name;
                volObj.address = address !== undefined ? address : volObj.address;
                volObj.phone = phone !== undefined ? phone : volObj.phone;
                volObj.currentLocation = currentLocation !== undefined ? currentLocation : volObj.currentLocation;
                volObj.bloodGroup = bloodGroup !== undefined ? bloodGroup : volObj.bloodGroup;
                volObj.gender = gender !== undefined ? gender : volObj.gender;
                volObj.profilePic = profilePic !== undefined ? profilePic : volObj.profilePic;
                volObj.skills = skills !== undefined ? skills : volObj.skills;
                volObj.availability = availability !== undefined ? availability : volObj.availability;
                return sendJson(res, 200, volObj);
            } catch(e) {
                return sendJson(res, 500, { error: 'Failed to update volunteer profile' });
            }
        }
    }

    // --- NEEDS CRUD ---
    if (method === 'GET' && url === '/api/needs') {
        return sendJson(res, 200, needs);
    }

    if (method === 'POST' && url === '/api/needs') {
        if (!token || role !== 'admin' || !admins.find(a => a.username === token)) {
             return sendJson(res, 403, { error: 'Unauthorized: Only admins can add tasks' });
        }
        try {
            const body = await parseBody(req);
            const { title, description, location, taskLocationDetails, requiredVolunteerCount } = body;
            const aiAnalysis = await geminiService.analyzeNeed(description);

            const newNeed = {
                id: Date.now().toString(),
                title, description, location, 
                taskLocationDetails: taskLocationDetails || '',
                requiredVolunteerCount: parseInt(requiredVolunteerCount) || 1,
                status: "open", createdAt: new Date().toISOString(), createdBy: token,
                requests: [], aiAnalysis, assignedVolunteers: [],
                checklist: [
                    { id: 'c_prep_' + Date.now(), text: 'Preparation & site check-in', completed: false, completedBy: null },
                    { id: 'c_exec_' + Date.now(), text: 'Execute primary task operations', completed: false, completedBy: null },
                    { id: 'c_cleanup_' + Date.now(), text: 'Clean up & final reporting', completed: false, completedBy: null }
                ]
            };
            needs.unshift(newNeed);
            return sendJson(res, 201, newNeed);
        } catch (err) { return sendJson(res, 500, { error: 'Error', details: err.message }); }
    }

    // --- BI-DIRECTIONAL INTERACTIONS ---
    // Volunteer explicitly requests to join
    if (method === 'POST' && url.startsWith('/api/needs/request/')) {
        if (role !== 'volunteer') return sendJson(res, 403, { error: 'Only volunteers can request to join' });
        const needId = url.split('/api/needs/request/')[1];
        const need = needs.find(n => n.id === needId);
        if (!need) return sendJson(res, 404, { error: 'Need not found' });
        if (need.requests.find(r => r.username === token)) return sendJson(res, 400, { error: 'Already requested' });
        
        need.requests.push({ username: token, status: 'pending' });
        return sendJson(res, 200, { message: 'Requested successfully' });
    }

    // Admin approves request
    if (method === 'POST' && url.startsWith('/api/needs/approve/')) {
        if (role !== 'admin') return sendJson(res, 403, { error: 'Only admins can approve' });
        try {
            const needId = url.split('/api/needs/approve/')[1];
            const { volunteerUsername } = await parseBody(req);
            const need = needs.find(n => n.id === needId);
            
            if (need.createdBy !== token) return sendJson(res, 403, { error: 'You do not own this task' });
            const reqIdx = need.requests.findIndex(r => r.username === volunteerUsername);
            if (reqIdx > -1) need.requests[reqIdx].status = 'approved';
            
            // Add robust details into assigned bucket
            const vFull = volunteers.find(v => v.username === volunteerUsername);
            need.assignedVolunteers.push({ id: vFull.id, name: vFull.name, pic: vFull.profilePic });
            
            if (need.assignedVolunteers.length >= (need.requiredVolunteerCount || 1)) {
                 need.status = 'matched';
            }
            return sendJson(res, 200, { message: 'Approved successfully' });
        } catch(e) { return sendJson(res, 500, { error: 'Error processing approval' }); }
    }

    // Admin marks complete
    if (method === 'POST' && url.startsWith('/api/needs/complete/')) {
        if (role !== 'admin') return sendJson(res, 403, { error: 'Only admins can manage this' });
        const needId = url.split('/api/needs/complete/')[1];
        const need = needs.find(n => n.id === needId);
        if (need.createdBy !== token) return sendJson(res, 403, { error: 'Not your task' });
        
        need.status = 'completed';
        const adminObj = admins.find(a => a.username === token);
        adminObj.tasksCompleted += 1;
        // Optionally bump rating slightly safely to max 5.0
        adminObj.rating = Math.min(5.0, adminObj.rating + 0.05).toFixed(1);
        
        return sendJson(res, 200, { message: 'Task Marked Complete' });
    }

    // --- CHECKLIST MILESTONES API ---
    if (method === 'POST' && url === '/api/needs/checklist/add') {
        try {
            const { needId, text } = await parseBody(req);
            if (!needId || !text) return sendJson(res, 400, { error: 'needId and text are required' });
            
            const need = needs.find(n => n.id === needId);
            if (!need) return sendJson(res, 404, { error: 'Need not found' });
            
            const isOwner = need.createdBy === token;
            const isAssigned = need.assignedVolunteers.some(v => v.id === volunteers.find(gv => gv.username === token)?.id);
            if (!isOwner && !isAssigned) {
                return sendJson(res, 403, { error: 'Unauthorized: Only task owner or assigned volunteer can edit checklist' });
            }

            if (!need.checklist) need.checklist = [];
            const newItem = {
                id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                text,
                completed: false,
                completedBy: null
            };
            need.checklist.push(newItem);
            
            if (global.broadcastEvent) {
                global.broadcastEvent({ type: 'update', method, url });
            }
            return sendJson(res, 201, newItem);
        } catch (err) {
            return sendJson(res, 500, { error: 'Failed to add checklist item' });
        }
    }

    if (method === 'POST' && url === '/api/needs/checklist/toggle') {
        try {
            const { needId, itemId } = await parseBody(req);
            if (!needId || !itemId) return sendJson(res, 400, { error: 'needId and itemId are required' });
            
            const need = needs.find(n => n.id === needId);
            if (!need) return sendJson(res, 404, { error: 'Need not found' });
            
            const isOwner = need.createdBy === token;
            const isAssigned = need.assignedVolunteers.some(v => v.id === volunteers.find(gv => gv.username === token)?.id);
            if (!isOwner && !isAssigned) {
                return sendJson(res, 403, { error: 'Unauthorized: Only task owner or assigned volunteer can toggle milestones' });
            }

            if (!need.checklist) need.checklist = [];
            const item = need.checklist.find(i => i.id === itemId);
            if (!item) return sendJson(res, 404, { error: 'Checklist item not found' });
            
            item.completed = !item.completed;
            item.completedBy = item.completed ? token : null;
            
            if (global.broadcastEvent) {
                global.broadcastEvent({ type: 'update', method, url });
            }
            return sendJson(res, 200, item);
        } catch (err) {
            return sendJson(res, 500, { error: 'Failed to toggle checklist item' });
        }
    }

    if (method === 'GET' && url.startsWith('/api/match/')) { // legacy Gemini fallback
        if (role !== 'admin') return sendJson(res, 403, { error: 'Auth required' });
        const needId = url.split('/api/match/')[1];
        const need = needs.find(n => n.id === needId);
        if(!need) return sendJson(res, 404, {error:'Not found'});
        try {
            const matchResult = await geminiService.matchVolunteer(need, volunteers);
            need.assignedVolunteers = matchResult.selectedVolunteerDetails || !!matchResult.selectedVolunteerNames ? matchResult.selectedVolunteerDetails || [] : [];
            need.status = 'matched';
            need.matchReason = matchResult.reason || "Auto-matched by AI.";
            return sendJson(res, 200, { need });
        } catch(e){ return sendJson(res,500,{error:'fail'}); }
    }

    if (method === 'GET' && url === '/api/chat/history') {
        const parsedUrl = new URL(req.url, 'http://localhost');
        const needId = parsedUrl.searchParams.get('needId');
        if (!needId) return sendJson(res, 400, { error: 'needId required' });
        const history = messages.filter(m => m.needId === needId);
        return sendJson(res, 200, history);
    }

    if (method === 'POST' && url === '/api/chat/send') {
        try {
            const { needId, text } = await parseBody(req);
            if (!needId || !text) return sendJson(res, 400, { error: 'needId and text required' });
            const senderUsername = token;
            const senderRole = role;
            if (!senderUsername) return sendJson(res, 401, { error: 'Unauthorized' });
            
            let senderName = senderUsername;
            if (senderRole === 'admin') {
                const adm = admins.find(a => a.username === senderUsername);
                if (adm) senderName = adm.name || adm.username;
            } else {
                const vol = volunteers.find(v => v.username === senderUsername);
                if (vol) senderName = vol.name || vol.username;
            }
            
            const messageObj = {
                id: Date.now().toString(),
                needId,
                sender: senderUsername,
                senderName,
                senderRole,
                text,
                timestamp: new Date().toISOString()
            };
            messages.push(messageObj);
            
            if (global.broadcastEvent) {
                global.broadcastEvent({ type: 'chat', needId, message: messageObj });
            }
            
            return sendJson(res, 201, messageObj);
        } catch(e) {
            return sendJson(res, 500, { error: 'Error sending message' });
        }
    }

    if (method === 'POST' && url === '/api/volunteers/review') {
        if (role !== 'admin') return sendJson(res, 403, { error: 'Only admins can review volunteers' });
        try {
            const { volunteerUsername, rating, comment, needId } = await parseBody(req);
            if (!volunteerUsername || !rating) return sendJson(res, 400, { error: 'volunteerUsername and rating required' });
            const vol = volunteers.find(v => v.username === volunteerUsername);
            if (!vol) return sendJson(res, 404, { error: 'Volunteer not found' });
            if (!vol.reviews) vol.reviews = [];
            const newReview = {
                reviewer: token,
                rating: parseFloat(rating) || 5.0,
                comment: comment || '',
                needId: needId || '',
                timestamp: new Date().toISOString()
            };
            vol.reviews.push(newReview);
            
            if (global.broadcastEvent) {
                global.broadcastEvent({ type: 'review', volunteerUsername, review: newReview, volunteer: vol });
            }
            
            return sendJson(res, 200, { message: 'Review added successfully', volunteer: vol });
        } catch(e) {
            return sendJson(res, 500, { error: 'Error submitting review' });
        }
    }

    return sendJson(res, 404, { error: 'API Route Not Found' });
};
