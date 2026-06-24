# AeroHealth

**Intelligent Healthcare Routing & Telemetry Engine**

AeroHealth is a real-time, AI-driven healthcare routing platform designed to intelligently dispatch patients to optimal hospital facilities. It evaluates live hospital capacity, department-specific wait times, and real-time street ETAs to balance the load across regional hospitals and ensure critical patients receive the fastest care.

## Key Features

- **AI Triage System**: Instantly classifies symptoms by urgency and target department.
- **Live Hospital Capacity**: Real-time tracking of ward occupancies to avoid saturated facilities.
- **Traffic-Aware ETAs**: Integrates with routing engines (OSRM) to provide true street-level ETAs and turn-by-turn navigation.
- **Live Ambulance Tracking**: Real-time GPS telemetry simulating live ambulance routing.
- **Dynamic Rerouting**: If a destination hospital becomes saturated while en route, the system automatically suggests the next best alternative.
- **Command Center Dashboard**: A real-time interface for hospital administrators to monitor incoming patients, ward telemetry, and predictive loads.

## Architecture

AeroHealth is composed of three main components:
1. **Frontend (React + Vite)**: A dynamic UI featuring a public landing page for triage, live tracking views with Leaflet maps, and a secure Admin Command Center.
2. **Backend (Node.js + Express + Socket.IO)**: An event-driven backend handling triage requests, live GPS telemetry updates, and broadcasting queue changes to all connected clients.
3. **Telemetry Simulator (Python)**: A robust script (`simulate.py`) that generates simulated patients and routes them along actual road networks to the hospital, streaming GPS coordinates to the backend.

## Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- Python (3.8 or higher)

### 1. Start the Backend
```bash
cd backend
npm install
npm start
```
The backend will run on `http://localhost:5000`.

### 2. Start the Frontend
In a new terminal window:
```bash
npm install
npm run dev
```
The frontend will run on `http://localhost:5173`.

### 3. Run the Telemetry Simulator (Optional)
To observe live ambulances on the dashboard map:
```bash
python simulate.py
```
This script dispatches multiple simulated emergencies and streams their live GPS coordinates as they drive to the hospital.

## Tech Stack
- **Frontend**: React, Vite, React-Leaflet, Socket.IO Client
- **Backend**: Node.js, Express, Socket.IO
- **Simulation**: Python, Requests, OSRM API for road routing

## Contributing
Contributions, issues, and feature requests are welcome.

## License
This project is licensed under the MIT License.
