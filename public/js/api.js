const API_BASE = '/api';

const API = {
    getHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (Auth.getToken()) {
            headers['x-auth-token'] = Auth.getToken();
            headers['x-auth-role'] = Auth.getRole();
        }
        return headers;
    },
    async fetchWrap(url, options = {}) {
        options.headers = this.getHeaders();
        const res = await fetch(API_BASE + url, options);
        if(!res.ok) {
            const err = await res.json().catch(()=>({}));
            throw new Error(err.error || 'API Error');
        }
        return res.json();
    },
    getGlobalData() { return this.fetchWrap('/global/data'); },
    getNeeds() { return this.fetchWrap('/needs'); },
    
    addNeed(data) { return this.fetchWrap('/needs', { method: 'POST', body: JSON.stringify(data) }); },
    
    registerAdmin(username, password) { return this.fetchWrap('/admin/register', { method: 'POST', body: JSON.stringify({username, password}) }); },
    registerVolunteer(data) { return this.fetchWrap('/volunteers', { method: 'POST', body: JSON.stringify(data) }); },
    getVolunteers() { return this.fetchWrap('/volunteers'); },
    
    universalLogin(username, password, loginRole) { 
        return this.fetchWrap('/auth/login', { method: 'POST', body: JSON.stringify({username, password, loginRole}) }); 
    },
    
    requestToJoinTask(needId) { return this.fetchWrap(`/needs/request/${needId}`, { method: 'POST' }); },
    approveRequest(needId, volunteerUsername) { return this.fetchWrap(`/needs/approve/${needId}`, { method: 'POST', body: JSON.stringify({volunteerUsername}) }); },
    completeTask(needId) { return this.fetchWrap(`/needs/complete/${needId}`, { method: 'POST' }); },
    
    matchVolunteer(needId) { return this.fetchWrap(`/match/${needId}`); }, // the gemini logic
    
    getAdminProfile() { return this.fetchWrap('/admin/profile'); },
    updateAdminProfile(data) { return this.fetchWrap('/admin/profile', { method: 'PUT', body: JSON.stringify(data) }); },
    getVolunteerProfile() { return this.fetchWrap('/volunteer/profile'); },
    updateVolunteerProfile(data) { return this.fetchWrap('/volunteer/profile', { method: 'PUT', body: JSON.stringify(data) }); },
    
    getChatHistory(needId) { return this.fetchWrap(`/chat/history?needId=${needId}`); },
    sendChatMessage(needId, text) { return this.fetchWrap('/chat/send', { method: 'POST', body: JSON.stringify({ needId, text }) }); },
    submitReview(volunteerUsername, rating, comment, needId) { 
        return this.fetchWrap('/volunteers/review', { method: 'POST', body: JSON.stringify({ volunteerUsername, rating, comment, needId }) }); 
    }
};

window.API = API;

function showSpinner(text) {
    const spinner = document.getElementById('globalSpinner');
    const spinnerText = document.getElementById('spinnerText');
    if (spinner) {
        if(text && spinnerText) spinnerText.innerText = text;
        spinner.style.display = 'flex';
        return new Promise(res => setTimeout(res, 50));
    }
}

function hideSpinner() {
    const spinner = document.getElementById('globalSpinner');
    if (spinner) {
        spinner.style.display = 'none';
    }
}
