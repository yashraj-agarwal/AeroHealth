// src/components/MapArea.jsx
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// 1. BULLETPROOF ICON FIX FOR VITE
// This prevents the map from crashing by pulling the pins from a secure CDN
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function MapArea({ patients = [] }) { // 2. Default to empty array safely
  const hospitalPos = [12.9700, 77.7500]; // Manipal Whitefield

  return (
    <div className="card" style={{ height: '400px', padding: 0, overflow: 'hidden' }}>
      {/* 3. The MapContainer MUST have a defined height */}
      <MapContainer center={hospitalPos} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer 
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
          attribution='&copy; OpenStreetMap contributors'
        />
        
        <Circle center={hospitalPos} radius={500} pathOptions={{ color: 'red', fillOpacity: 0.1 }} />
        
        <Marker position={hospitalPos}>
          <Popup><strong>Manipal Whitefield</strong></Popup>
        </Marker>
        
        {/* 4. Safety check to ensure patient data has valid GPS coordinates before drawing pins */}
        {Array.isArray(patients) && patients.map(p => {
          if (!p || !p.lat || !p.lng) return null; // Skip if missing GPS
          
          return (
            <Marker key={p.id} position={[p.lat, p.lng]}>
              <Popup>
                <strong>{p.name}</strong><br/>
                {p.dept}<br/>
                ETA: {p.eta}m
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}