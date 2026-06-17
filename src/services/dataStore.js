const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const admins = [
    { username: 'admin', password: 'password123', name: 'System Administrator', email: 'admin@volunteersync.local', phone: '555-0199', rating: 4.8, tasksCompleted: 12 }
];

const needs = [
    {
        id: "1",
        title: "Food Drive Distribution",
        description: "Need help distributing food boxes to 50 families in the downtown area this weekend.",
        location: "Downtown Community Center", 
        taskLocationDetails: "Inside the main auditorium, entrance on 5th street.",
        requiredVolunteerCount: 3,
        status: "open",
        createdAt: new Date().toISOString(),
        createdBy: "admin",
        requests: [ { username: "v-alice", status: "pending" } ],
        aiAnalysis: {
            urgency: "High",
            skills: ["Physical Stamina", "Organization", "Communication"],
            reason: "Food distribution is time-sensitive and critical for families in need."
        },
        assignedVolunteers: []
    }
];

const volunteers = [
    {
        username: "v-alice", password: "password123",
        id: "v1",
        name: "Alice Johnson",
        address: "711 Maple St, Downtown",
        phone: "555-0101",
        currentLocation: "Downtown",
        bloodGroup: "O+",
        gender: "Female",
        profilePic: "https://ui-avatars.com/api/?name=Alice+Johnson&background=random",
        skills: "Organization, Communication, Teaching",
        availability: "Weekends",
        reviews: []
    },
    {
        username: "v-bob", password: "password123",
        id: "v2",
        name: "Bob Smith",
        address: "800 Oak Ave, Northside",
        phone: "555-0102",
        currentLocation: "Northside",
        bloodGroup: "A-",
        gender: "Male",
        profilePic: "https://ui-avatars.com/api/?name=Bob+Smith&background=random",
        skills: "Physical Stamina, Driving, Gardening",
        availability: "Saturdays, Evenings",
        reviews: []
    }
];

const messages = [];

function saveData() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify({ admins, needs, volunteers, messages }, null, 2), 'utf8');
    } catch (e) {
        console.error("Failed to write to db.json", e);
    }
}

// Load from db.json if present
if (fs.existsSync(DB_PATH)) {
    try {
        const fileData = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        if (fileData.admins) admins.splice(0, admins.length, ...fileData.admins);
        if (fileData.needs) needs.splice(0, needs.length, ...fileData.needs);
        if (fileData.volunteers) volunteers.splice(0, volunteers.length, ...fileData.volunteers);
        if (fileData.messages) messages.splice(0, messages.length, ...fileData.messages);
    } catch (e) {
        console.error("Failed to load db.json, using defaults.", e);
    }
} else {
    // Write defaults to db.json
    saveData();
}

module.exports = {
    admins,
    needs,
    volunteers,
    messages,
    saveData
};
