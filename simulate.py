import requests
import time
import random
import threading
import math

# ─── CONFIGURATION ──────────────────────────────────────────────────
BACKEND_URL = "http://127.0.0.1:5000"
KASTURBA_COORDS = {"lat": 13.3533, "lng": 74.7844}

SPAWN_ZONES = [
    {"name": "Udupi City", "lat": 13.3389, "lng": 74.7461},
    {"name": "Malpe Beach", "lat": 13.3500, "lng": 74.6999},
    {"name": "Parkala", "lat": 13.3300, "lng": 74.8000},
    {"name": "Syndicate Circle", "lat": 13.3560, "lng": 74.7880},
    {"name": "Ambagilu", "lat": 13.3550, "lng": 74.7550}
]

CASES = [
    {"desc": "Severe chest pain and radiating arm numbness", "dept": "Cardiology", "sev": "critical", "pri": 1},
    {"desc": "Unconscious after motorcycle accident", "dept": "Emergency", "sev": "critical", "pri": 1},
    {"desc": "Facial droop and slurred speech", "dept": "Neurology", "sev": "critical", "pri": 1},
    {"desc": "Severe asthma attack, barely breathing", "dept": "Emergency", "sev": "urgent", "pri": 2},
    {"desc": "High fever, continuous vomiting", "dept": "General Ward", "sev": "urgent", "pri": 2},
    {"desc": "Fractured tibia from sports injury", "dept": "Orthopedics", "sev": "stable", "pri": 3},
]

NAMES = ["Rahul", "Priya", "Amit", "Sneha", "Vikram", "Anjali", "Karan", "Neha", "Rohit", "Pooja"]

# ─── MATH HELPERS FOR SMOOTH DRIVING ────────────────────────────────

def haversine_distance(lon1, lat1, lon2, lat2):
    """Calculates the distance in meters between two GPS coordinates."""
    R = 6371000 # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def interpolate_point(lon1, lat1, lon2, lat2, fraction):
    """Finds a coordinate between point 1 and point 2 based on a fraction (0.0 to 1.0)."""
    return [
        lon1 + (lon2 - lon1) * fraction,
        lat1 + (lat2 - lat1) * fraction
    ]

# ─── SIMULATION ENGINE ──────────────────────────────────────────────

def fetch_osrm_route(start, end):
    url = f"https://router.project-osrm.org/route/v1/driving/{start['lng']},{start['lat']};{end['lng']},{end['lat']}?overview=full&geometries=geojson"
    try:
        res = requests.get(url, timeout=5)
        data = res.json()
        if data.get("routes"):
            return data["routes"][0]["geometry"]["coordinates"]
    except Exception as e:
        pass
    return []

def simulate_patient(patient_num):
    name = f"{random.choice(NAMES)} (Sim {patient_num})"
    case = random.choice(CASES)
    zone = random.choice(SPAWN_ZONES)
    
    start_lat = zone["lat"] + random.uniform(-0.015, 0.015)
    start_lng = zone["lng"] + random.uniform(-0.015, 0.015)
    
    print(f"🚑 Dispatching {name} from {zone['name']}")
    
    route_coords = fetch_osrm_route({"lat": start_lat, "lng": start_lng}, KASTURBA_COORDS)
    if not route_coords or len(route_coords) < 2: return
    name="Live Local User"
    payload = {
        "name": name, "desc": case["desc"], "dept": case["dept"],
        "severityClass": case["sev"], "priority": case["pri"],
        "destName": "Kasturba Hospital", "destLat": KASTURBA_COORDS["lat"], "destLng": KASTURBA_COORDS["lng"],
        "lat": start_lat, "lng": start_lng, "route": route_coords,
        "transport": "ambulance", "phone": f"+91 98{random.randint(10000000, 99999999)}"
    }

    try:
        res = requests.post(f"{BACKEND_URL}/api/triage", json=payload)
        patient_id = res.json().get("id")
        if not patient_id: return
    except Exception:
        print(f"❌ Backend refused connection for {name}.")
        return

    # ─── SMOOTH DRIVING LOGIC ───
    # Speed in km/h converted to meters per second
    speed_kmh = random.uniform(60, 90) # Slightly fast so the demo doesn't take forever
    speed_mps = speed_kmh * (1000 / 3600)
    
    update_interval = 1.0 # Send data to dashboard every 1 second
    distance_per_tick = speed_mps * update_interval

    route_idx = 0
    current_lon, current_lat = route_coords[route_idx]
    
    while route_idx < len(route_coords) - 1:
        next_lon, next_lat = route_coords[route_idx + 1]
        
        # Distance to the next corner
        segment_dist = haversine_distance(current_lon, current_lat, next_lon, next_lat)
        
        if segment_dist == 0:
            route_idx += 1
            continue

        # Drive along this specific road segment
        travelled = 0.0
        while travelled + distance_per_tick < segment_dist:
            travelled += distance_per_tick
            fraction = travelled / segment_dist
            
            # Get exact coordinate on the line
            new_pos = interpolate_point(current_lon, current_lat, next_lon, next_lat, fraction)
            
            # Send to backend
            try:
                requests.post(f"{BACKEND_URL}/api/update_location", json={
                    "id": patient_id, "lat": new_pos[1], "lng": new_pos[0]
                })
            except:
                pass
            
            # Wait exactly 1 second to mimic real-time GPS
            time.sleep(update_interval)
            
        # Segment finished, snap to corner and prepare for next road
        current_lon, current_lat = next_lon, next_lat
        route_idx += 1

    print(f"✅ {name} has arrived.")

# ─── STARTUP ────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n🚀 AEROHEALTH SMOOTH TELEMETRY SIMULATOR\n")
    
    NUM_PATIENTS = 5
    for i in range(1, NUM_PATIENTS + 1):
        t = threading.Thread(target=simulate_patient, args=(i,))
        t.daemon = True
        t.start()
        # Stagger departures so they enter the map naturally
        time.sleep(random.uniform(2.0, 5.0))
        
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        pass