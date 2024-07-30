const express = require('express');
const bodyParser = require('body-parser');
const { Sequelize, DataTypes } = require('sequelize');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const sequelize = new Sequelize('pulse_db', 'postgres2', 'projecte1', {
  host: 'localhost',
  dialect: 'postgres',
  logging: false
});

// Tests the connection just in case on startup
sequelize.authenticate()
  .then(() => console.log('Established connection to the database.'))
  .catch(err => console.error('Unable to connect to the database:', err));

const Stat = sequelize.define('Stat', {
  deviceId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW
  },
  batteryLevel: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  wifiNetwork: {
    type: DataTypes.STRING,
    allowNull: false
  },
  wifiSignalStrength: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  mobileDataAvailable: {
    type: DataTypes.BOOLEAN,
    allowNull: false
  },
  ramUsage: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  storageUsage: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  networkTraffic: {
    type: DataTypes.JSONB,
    allowNull: true
  }
});

// Model for device aliases
const DeviceAlias = sequelize.define('DeviceAlias', {
  deviceId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  alias: {
    type: DataTypes.STRING,
    allowNull: false
  }
});

sequelize.sync()
  .then(() => console.log('Database & tables created!'))
  .catch(err => {
    console.error('Error creating database & tables:', err);
    console.error('Error details:', err.parent);
  });

// Input validation...just in case
const validateStatInput = [
  body('device_id').isString(),
  body('battery_level').isFloat({ min: 0, max: 100 }),
  body('wifi_network').isString(),
  body('wifi_signal_strength').isInt(),
  body('mobile_data_available').isBoolean(),
  body('ram_usage').isFloat({ min: 0 }),
  body('storage_usage').isFloat({ min: 0 }),
  body('network_traffic').optional().isObject()
];

// This is for storing connected devices and time
const connectedDevices = new Map();

// If a device hasn't sent any data for than 5 minutes, consider it disconnected basically
function checkDisconnectedDevices() {
  const now = Date.now();
  for (const [deviceId, lastUpdate] of connectedDevices) {
    if (now - lastUpdate > 60000) { // 60000 ms = 1 minute
      console.log(`Device ${deviceId} disconnected.`);
      connectedDevices.delete(deviceId);
    }
  }
}

setInterval(checkDisconnectedDevices, 60000);

//CHANGE THIS LATER
// Web aspect (login, etc)
const USERNAME = 'androidpulse';
const HASHED_PASSWORD = '$2b$15$plcm/nEgd/ZjIao/Tfwt1eRYVryyBPaLsdcJWnbR4Qhqbh4omlYLG';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME) {
    bcrypt.compare(password, HASHED_PASSWORD, (err, result) => {
      if (err) {
        res.json({ success: false, message: 'Error comparing passwords.' });
      } else if (result) {
        res.json({ success: true, redirect: '/landing' });
      } else {
        res.json({ success: false, message: 'Invalid username or password.' });
      }
    });
  } else {
    res.json({ success: false, message: 'Invalid username or password.' });
  }
});

app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mainpage.html'));
});

app.get('/device/:deviceId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'device.html'));
});

// Function to update the device alias (when the user enters it in the web portal)
app.post('/api/updateAlias', async (req, res) => {
  const { deviceId, alias } = req.body;
  try {
    await DeviceAlias.upsert({ deviceId, alias });
    res.status(200).send('Alias updated successfully');
  } catch (error) {
    console.error('Error updating alias:', error);
    res.status(500).send('Error updating alias');
  }
});

// The best endpoint to get connected devices
app.get('/devices', async (req, res) => {
  try {
    const stats = await Stat.findAll({
      attributes: ['deviceId', [sequelize.fn('max', sequelize.col('timestamp')), 'latestTimestamp']],
      group: ['deviceId'],
      order: [[sequelize.fn('max', sequelize.col('timestamp')), 'DESC']],
      raw: true
    });

    const devices = await Promise.all(stats.map(async stat => {
      const latestStat = await Stat.findOne({
        where: { deviceId: stat.deviceId },
        order: [['timestamp', 'DESC']]
      });
      const aliasEntry = await DeviceAlias.findOne({ where: { deviceId: stat.deviceId } });
      return {
        id: stat.deviceId,
        name: aliasEntry ? aliasEntry.alias : stat.deviceId,
        battery: latestStat.batteryLevel,
        wifi: latestStat.wifiNetwork,
        wifiSignalStrength: latestStat.wifiSignalStrength,
        mobileData: latestStat.mobileDataAvailable ? 'Available' : 'Unavailable',
        ram: latestStat.ramUsage,
        storage: latestStat.storageUsage,
        lastUpdated: latestStat.timestamp
      };
    }));

    res.json({ devices });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Error fetching data');
  }
});

// The API thing to receive the device stats
app.post('/api/stats', validateStatInput, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const deviceId = req.body.device_id;
  const newStats = {
    batteryLevel: req.body.battery_level,
    wifiNetwork: req.body.wifi_network,
    wifiSignalStrength: req.body.wifi_signal_strength,
    mobileDataAvailable: req.body.mobile_data_available,
    ramUsage: req.body.ram_usage,
    storageUsage: req.body.storage_usage,
    networkTraffic: req.body.network_traffic
  };

  try {
    await Stat.create({
      deviceId,
      ...newStats
    });

    const isNewDevice = !connectedDevices.has(deviceId);

    if (isNewDevice) {
      console.log(`NEW DEVICE CONNECTED: ${deviceId}`);
      console.log(`Device ${deviceId} stats:`, newStats);
    } else {
      console.log(`✔ Device ${deviceId} received information successfully`);
    }

    connectedDevices.set(deviceId, Date.now());

    res.status(201).send('Data received and saved');
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).send('Error saving data');
  }
});

// This gets stats for a specific device
app.get('/api/stats/:deviceId', async (req, res) => {
  try {
    const stats = await Stat.findAll({
      where: { deviceId: req.params.deviceId },
      order: [['timestamp', 'DESC']],
      limit: 100
    });

    const aliasEntry = await DeviceAlias.findOne({ where: { deviceId: req.params.deviceId } });
    const deviceAlias = aliasEntry ? aliasEntry.alias : req.params.deviceId;

    // This processes network traffic data
    const networkTrafficData = stats.map(stat => ({
      timestamp: stat.timestamp,
      downloadSpeed: stat.networkTraffic ? stat.networkTraffic.download_speed_mbps : null,
      uploadSpeed: stat.networkTraffic ? stat.networkTraffic.upload_speed_mbps : null
    }));

    res.json({ stats, deviceAlias, networkTrafficData });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Error fetching data');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
