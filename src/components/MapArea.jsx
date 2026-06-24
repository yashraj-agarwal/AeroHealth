
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});
export default function MapArea({ patients = [] }) { 
  const hospitalPos = [12.9700, 77.7500]; 
  return (
    <div className="card" style={{ height: '400px', padding: 0, overflow: 'hidden' }}>
      {}
      <MapContainer center={hospitalPos} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer 
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
          attribution='&copy; OpenStreetMap contributors'
        />
        <Circle center={hospitalPos} radius={500} pathOptions={{ color: 'red', fillOpacity: 0.1 }} />
        <Marker position={hospitalPos}>
          <Popup><strong>Manipal Whitefield</strong></Popup>
        </Marker>
        {}
        {Array.isArray(patients) && patients.map(p => {
          if (!p || !p.lat || !p.lng) return null; 
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