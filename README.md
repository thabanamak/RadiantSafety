RadiantSafety 🛡️
Navigate Melbourne with the power of collective insight and cutting-edge routing.

RadiantSafety is an active security ecosystem that tackles the gap between stale crime statistics and real-time public safety. By leveraging crowdsourced incident reports and a custom safety-weighted pathfinding engine, RadiantSafety replaces static pin-maps with a dynamic intelligence platform, empowering residents to visualize live threats and navigate urban environments safely.

💡 The Inspiration
Fed up with standard GPS tools that optimize for speed while ignoring danger, RadiantSafety was built from a simple necessity: personal safety in an unpredictable environment. We realized that true situational awareness requires live community input. RadiantSafety is a collective intelligence resource where every resident contributes to a "radiant" heat map, making the city safer, more transparent, and significantly easier to navigate.

🚀 Core Features
Dynamic Risk Visualization (Heat Map): Safety zones are rendered in real-time, with color "radiating" from high-risk hotspots. The map constantly evolves based on recent incident reports, historical baselines, and crowdsourced feedback.

Custom Safety Pathfinding (A Algorithm):* Pathfinding shouldn't just find the shortest route—it must find the safest. We engineered a custom A* algorithm that treats high-risk zones as "viscosity." By aggressively penalizing edges and vertices near danger hotspots, the engine calculates safe corridors, actively steering users away from threats.

Geofenced SOS Alerts: The system features active monitoring for high-risk geofenced areas. If a user enters a known danger zone, the app can trigger an immediate SOS alert to trusted contacts and nearby verified community responders, drastically reducing emergency response times.

Community-Driven Incident Reporting: Residents can instantly report hazards, violent activity, poor street lighting, or antisocial behavior. These categorized reports feed directly into our risk engine, keeping the routing logic current and actionable.

🛠️ Technical Architecture
We utilized a modern, distributed tech stack to ensure speed, reliability, and real-time synchronization:

Frontend: Next.js, React, TypeScript, and Tailwind CSS for a highly responsive, mobile-first interface.

Backend & Auth: Supabase and PLpgSQL for real-time database management, user authentication, and live state synchronization.

Geospatial & Mapping: Mapbox API for foundational map rendering, edge/vertex extraction, and spatial data.

Custom Routing Engine: A Python-based microservice that executes our proprietary safety-weighted A* traversal logic.

Infrastructure: Containerized via Docker and deployed for production scale.
