**Android Pulse**

Android Pulse is a device monitoring system, with the goal of a friendly user interface, that allows you to track and analyze the performance of your Android devices in real-time. This project consists of a server-side application that collects, stores, and visualizes data from connected Android devices.

**Features**

- Real-time monitoring of multiple Android devices
- Tracks key device metrics:
  - Battery level
  - Wi-Fi network and signal strength
  - Mobile data availability
  - RAM usage
  - Storage usage
  - Network traffic (download and upload speeds, total usage)

- Web-based dashboard for easy visualization of device stats
- Device aliasing for better organization
- API endpoints for data collection and retrieval

**Tech Stack**

- Backend: Node.js with Express.js
- Database: PostgreSQL with Sequelize ORM
- Frontend: HTML, CSS, JavaScript (static files served by Express)
- Authentication: bcrypt for password hashing
- Input Validation: express-validator

**Getting Started**

1. Clone the repository
2. Install dependencies: npm install
3. Set up your PostgreSQL database and update the connection details in server.js
4. Run the server: node server.js
5. Access the web interface at http://localhost:3000

**API Endpoints**

- POST /api/stats: Submit device statistics
- GET /api/stats/:deviceId: Retrieve stats for a specific device
- GET /devices: Get a list of all connected devices
- POST /api/updateAlias: Update the alias for a device

**Security Notice**
Currently, the project uses a basic authentication system. For production use or any other use cases besides development, it's recommended absolutely not use this. A .env file would be much better even

**Contributions are welcome! Please feel free to submit a Pull Request :)**
