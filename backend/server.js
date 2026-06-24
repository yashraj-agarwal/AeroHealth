// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let triageQueue = [];

// GPS Engine: Real-time tracking
setInterval(() => {
  let changed = false;
  triageQueue = triageQueue.filter(p => {
    if (!p.destLat || !p.destLng) return true;

    // Calculate distance based on the REAL GPS coordinates
    const dLat = p.destLat - p.lat;
    const dLng = p.destLng - p.lng;
    const dist = Math.sqrt(dLat*dLat + dLng*dLng); 
    
    // AUTO-DISCHARGE: If you physically walk to the hospital (< ~80 meters)
    if (dist < 0.0008) {
      console.log(`Patient Arrived at ${p.destName}: ${p.name}`);
      changed = true;
      return false; 
    }
    
    // Calculate ETA based on real distance (we NO LONGER auto-drive the lat/lng here)
    p.eta = Math.max(1, Math.round(dist * 1200)); 
    changed = true;
    return true; 
  });

  if (changed) io.emit('queue_update', triageQueue);
}, 2000);

// API 1: Create New Patient Journey
app.post('/api/triage', (req, res) => {
  const patient = req.body;
  patient.id = `MNP-${Math.floor(1000 + Math.random() * 9000)}`;
  patient.time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  
  if (!patient.lat || !patient.lng) {
    patient.lat = 13.3533 + 0.02;
    patient.lng = 74.7844 + 0.02;
  }

  triageQueue.unshift(patient);
  io.emit('queue_update', triageQueue); 
  res.status(200).json({ success: true, id: patient.id });
});

// API 2: Receive Live GPS Updates
app.post('/api/update_location', (req, res) => {
  const { id, lat, lng } = req.body;
  const patient = triageQueue.find(p => p.id === id);
  if (patient) {
    patient.lat = lat;
    patient.lng = lng;
    // We don't need to force an emit here, the setInterval picks it up every 2 seconds
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Patient not found" });
  }
});

// API 3: Reroute an Active Patient
app.post('/api/reroute', (req, res) => {
  const { id, newDestName, newLat, newLng, newRoute } = req.body;
  const patient = triageQueue.find(p => p.id === id);
  if (patient) {
    console.log(`REROUTING: ${patient.name} diverted to ${newDestName}`);
    patient.destName = newDestName;
    patient.destLat = newLat;
    patient.destLng = newLng;
    if (newRoute && newRoute.length > 0) patient.route = newRoute;
    io.emit('queue_update', triageQueue);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Patient not found" });
  }
});

// API 4: Manually Remove/Discharge a Patient
app.post('/api/remove_patient', (req, res) => {
  const { id } = req.body;
  const initialLength = triageQueue.length;
  
  // Filter out the patient with the matching ID
  triageQueue = triageQueue.filter(p => p.id !== id);
  
  if (triageQueue.length < initialLength) {
    console.log(`Patient Manually Removed: ${id}`);
    io.emit('queue_update', triageQueue); // Instantly update all screens
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Patient not found" });
  }
});

io.on('connection', (socket) => {
  socket.emit('queue_update', triageQueue); 
});

server.listen(5000, () => console.log("AeroHealth Live Tracking Engine running on port 5000"));