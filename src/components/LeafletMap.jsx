import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';

// Custom Icons
const createIcon = (color) => {
  return L.divIcon({
    className: 'custom-icon',
    html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
};

const userIcon = L.divIcon({
  className: 'user-icon',
  html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(59,130,246,0.8); display: flex; align-items: center; justify-content: center;"><div style="width: 4px; height: 4px; background: white; border-radius: 50%;"></div></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const recommendedIcon = L.divIcon({
  className: 'recommended-icon',
  html: `<div style="background-color: #10b981; width: 22px; height: 22px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px rgba(16,185,129,0.9); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

// Map Controller to adjust bounds dynamically
const MapController = ({ userPos, destPos }) => {
  const map = useMap();
  useEffect(() => {
    if (userPos && destPos) {
      const bounds = L.latLngBounds([userPos, destPos]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: !matchMedia("(prefers-reduced-motion: reduce)").matches });
    } else if (userPos) {
      map.setView(userPos, 13, { animate: false });
    }
  }, [userPos, destPos, map]);
  return null;
};

const LeafletMap = ({ hospitals, userCoords, selectedHospitalId }) => {
  const [route, setRoute] = useState(null);
  const selectedHospital = hospitals.find(h => h.id === selectedHospitalId);
  const { lat: destLat, lng: destLng } = selectedHospital?.coords ?? {};
  const { lat, lng } = userCoords ?? {};
  const destCoords = useMemo(() => destLat == null ? null : [destLat, destLng], [destLat, destLng]);
  const userPos = useMemo(() => lat == null ? null : [lat, lng], [lat, lng]);
  const routeKey = userPos && destCoords ? [...userPos, ...destCoords].join(",") : null;
  const routeLine = routeKey
    ? route?.key === routeKey ? route.line : [userPos, destCoords]
    : null;

  useEffect(() => {
    const token = import.meta.env.VITE_ORS_TOKEN;
    if (!routeKey || !token) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      api_key: token,
      start: `${lng},${lat}`,
      end: `${destLng},${destLat}`,
    });

    async function fetchRoute() {
      try {
        const response = await fetch(`https://api.openrouteservice.org/v2/directions/driving-car?${params}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (!response.ok) return;
        const data = await response.json();
        const coordinates = data.features?.[0]?.geometry?.coordinates;
        if (!controller.signal.aborted && coordinates?.length) {
          setRoute({ key: routeKey, line: coordinates.map(([longitude, latitude]) => [latitude, longitude]) });
        }
      } catch {
        // The straight-line preview remains available.
      }
    }

    fetchRoute();
    return () => controller.abort();
  }, [routeKey, lat, lng, destLat, destLng]);

  return (
    <div className="bg-[#18181b] rounded-xl border border-zinc-800/50 overflow-hidden relative" style={{ height: '400px' }}>
      <MapContainer 
        center={userPos || [12.9716, 77.5946]} 
        zoom={12} 
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapController userPos={userPos} destPos={destCoords} />

        {userPos && (
          <Marker position={userPos} icon={userIcon}>
            <Popup className="custom-popup">
              <div className="font-bold text-sm">Your Location</div>
            </Popup>
          </Marker>
        )}

        {hospitals.map(h => {
          const isSelected = h.id === selectedHospitalId;
          const pos = [h.coords.lat, h.coords.lng];
          const color = isSelected ? '#10b981' : (h.occ / h.beds > 0.85 ? '#ef4444' : (h.occ / h.beds > 0.65 ? '#f59e0b' : '#34d399'));
          
          return (
            <Marker 
              key={h.id} 
              position={pos} 
              icon={isSelected ? recommendedIcon : createIcon(color)}
              title={h.name}
              alt={h.name}
              zIndexOffset={isSelected ? 1000 : 0}
            >
              <Popup>
                <div className="p-1 min-w-[180px]">
                  <div className="font-bold text-[15px] mb-1">{h.name}</div>
                  <div className="text-xs text-zinc-400 mb-2">{h.area}</div>
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span>Occupancy:</span>
                    <span className={h.occ / h.beds > 0.85 ? 'text-red-500 font-bold' : 'font-bold'}>
                      {Math.round((h.occ / (h.beds || 1)) * 100)}%
                    </span>
                  </div>
                  {isSelected && (
                    <div className="mt-3">
                      <a 
                        href={`https://www.google.com/maps/dir/?api=1&destination=${h.coords.lat},${h.coords.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 rounded"
                      >
                        Get Directions
                      </a>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {routeLine && (
          <Polyline 
            positions={routeLine} 
            color="#3b82f6" 
            weight={4} 
            opacity={0.8}
            dashArray="10, 10"
            className="route-animation"
          />
        )}
      </MapContainer>
      
    </div>
  );
};

export default LeafletMap;
