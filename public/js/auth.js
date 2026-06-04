const Auth = {
    setAuth(username, role) {
        localStorage.setItem('authToken', username);
        localStorage.setItem('authRole', role); // 'admin' or 'volunteer'
    },
    getToken() { return localStorage.getItem('authToken'); },
    getRole() { return localStorage.getItem('authRole'); },
    logout() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authRole');
        window.location.href = 'index.html';
    },
    isAdmin() { return this.getRole() === 'admin'; },
    isVolunteer() { return this.getRole() === 'volunteer'; }
};

document.addEventListener('DOMContentLoaded', () => {
    // Dynamic Navbar Builder based on logged-in role
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        let linksHtml = '';
        if (Auth.isAdmin()) {
            linksHtml = `
                <a href="dashboard.html">Dashboard</a>
                <a href="live-registrations.html">Volunteers</a>
                <a href="add-need.html">Add Need</a>
                <a href="admin-profile.html">Admin Profile</a>
                <a href="#" id="nav-logout">Logout</a>
            `;
        } else if (Auth.isVolunteer()) {
            linksHtml = `
                <a href="dashboard.html">Dashboard</a>
                <a href="live-registrations.html">Volunteers</a>
                <a href="volunteer-profile.html">My Profile</a>
                <a href="#" id="nav-logout">Logout</a>
            `;
        } else {
            // Guest User menu
            linksHtml = `
                <a href="index.html">Home</a>
                <a href="live-registrations.html">Volunteers</a>
                <a href="add-volunteer.html">Sign Up Volunteer</a>
                <a href="index.html">Sign In Portal</a>
            `;
        }
        navLinks.innerHTML = linksHtml;

        // Set active class dynamically matching window location path
        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        let matched = false;
        navLinks.querySelectorAll('a').forEach(link => {
            const linkPath = link.getAttribute('href');
            if (linkPath === currentPath && !matched) {
                link.classList.add('active');
                if (currentPath === 'index.html') matched = true;
            } else {
                link.classList.remove('active');
            }
        });

        // Add logout listener
        const logoutBtn = document.getElementById('nav-logout');
        if (logoutBtn) {
            logoutBtn.onclick = (e) => {
                e.preventDefault();
                Auth.logout();
            };
        }
    }

    // Rewrite homepage/index links to dashboard for logged-in sessions to avoid redirect loops/flashes
    if (Auth.getToken()) {
        document.querySelectorAll('a[href="index.html"], a[href="/"]').forEach(link => {
            link.href = 'dashboard.html';
        });
    }

    // Protection for admin-only pages
    if(window.location.pathname.includes('admin-profile.html') || window.location.pathname.includes('add-need.html')) {
         if(!Auth.isAdmin() && document.getElementById('unauthMessage')) {
             if(document.getElementById('formWrapper')) document.getElementById('formWrapper').style.display = 'none';
             document.getElementById('unauthMessage').style.display = 'block';
         }
    }

    // Protection for volunteer-only pages
    if(window.location.pathname.includes('volunteer-profile.html')) {
         if(!Auth.isVolunteer() && document.getElementById('unauthMessage')) {
             if(document.getElementById('formWrapper')) document.getElementById('formWrapper').style.display = 'none';
             document.getElementById('unauthMessage').style.display = 'block';
         }
    }

    // Redirect to dashboard if logged in and on index page
    if ((window.location.pathname.endsWith('index.html') || window.location.pathname === '/') && Auth.getToken()) {
        window.location.href = 'dashboard.html';
    }
});
