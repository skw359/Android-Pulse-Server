const express = require('express');
const bodyParser = require('body-parser');
const { Sequelize, DataTypes } = require('sequelize');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const path = require('path');
const winston = require('winston');

const app = express();
const port = 3000;

// Implement logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const sequelize = new Sequelize('pulse_db', 'postgres2', 'projecte1', {
  host: 'localhost',
  dialect: 'postgres',
  logging: (msg) => logger.info(msg)
});

// Tests the connection just in case on startup
sequelize.authenticate()
  .then(() => logger.info('Established connection to the database.'))
  .catch(err => logger.error('Unable to connect to the database:', err));

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

// Add indexes for better query performance
Stat.addIndex('deviceId');
Stat.addIndex('timestamp');

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

// Add index for deviceId in DeviceAlias
DeviceAlias.addIndex('deviceId');

sequelize.sync()
  .then(() => logger.info('Database & tables created!'))
  .catch(err => {
    logger.error('Error creating database & tables:', err);
    logger.error('Error details:', err.parent);
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

const connectedDevices = new Map();

function checkDisconnectedDevices() {
  const now = Date.now();
  for (const [deviceId, lastUpdate] of connectedDevices) {
    if (now - lastUpdate > 60000) { // 60000 ms = 1 minute
      logger.info(`Device ${deviceId} disconnected.`);
      connectedDevices.delete(deviceId);
    }
  }
}

setInterval(checkDisconnectedDevices, 60000);

const USERNAME = 'androidpulse';
const HASHED_PASSWORD = '$2b$15$plcm/nEgd/ZjIao/Tfwt1eRYVryyBPaLsdcJWnbR4Qhqbh4omlYLG';

app.use(express.static(path.join(__dirname, 'public')));

// Standardized error response function
function sendErrorResponse(res, statusCode, message) {
  res.status(statusCode).json({
    success: false,
    error: {
      message: message,
      status: statusCode
    }
  });
}

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME) {
    bcrypt.compare(password, HASHED_PASSWORD, (err, result) => {
      if (err) {
        sendErrorResponse(res, 500, 'Error comparing passwords.');
      } else if (result) {
        res.json({ success: true, redirect: '/landing' });
      } else {
        sendErrorResponse(res, 401, 'Invalid username or password.');
      }
    });
  } else {
    sendErrorResponse(res, 401, 'Invalid username or password.');
  }
});

app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mainpage.html'));
});

app.get('/device/:deviceId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'device.html'));
});

app.post('/api/updateAlias', async (req, res) => {
  const { deviceId, alias } = req.body;
  try {
    await DeviceAlias.upsert({ deviceId, alias });
    res.status(200).json({ success: true, message: 'Alias updated successfully' });
  } catch (error) {
    logger.error('Error updating alias:', error);
    sendErrorResponse(res, 500, 'Error updating alias');
  }
});

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

    res.json({ success: true, devices });
  } catch (error) {
    logger.error('Error fetching data:', error);
    sendErrorResponse(res, 500, 'Error fetching data');
  }
});

app.post('/api/stats', validateStatInput, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendErrorResponse(res, 400, 'Validation error', errors.array());
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
      logger.info(`NEW DEVICE CONNECTED: ${deviceId}`);
      logger.info(`Device ${deviceId} stats:`, newStats);
    } else {
      logger.info(`✔ Device ${deviceId} received information successfully`);
    }

    connectedDevices.set(deviceId, Date.now());

    res.status(201).json({ success: true, message: 'Data received and saved' });
  } catch (error) {
    logger.error('Error saving data:', error);
    sendErrorResponse(res, 500, 'Error saving data');
  }
});

app.get('/api/stats/:deviceId', async (req, res) => {
  try {
    const stats = await Stat.findAll({
      where: { deviceId: req.params.deviceId },
      order: [['timestamp', 'DESC']],
      limit: 100
    });

    const aliasEntry = await DeviceAlias.findOne({ where: { deviceId: req.params.deviceId } });
    const deviceAlias = aliasEntry ? aliasEntry.alias : req.params.deviceId;

    const networkTrafficData = stats.map(stat => ({
      timestamp: stat.timestamp,
      downloadSpeed: stat.networkTraffic ? stat.networkTraffic.download_speed_mbps : null,
      uploadSpeed: stat.networkTraffic ? stat.networkTraffic.upload_speed_mbps : null
    }));

    res.json({ success: true, stats, deviceAlias, networkTrafficData });
  } catch (error) {
    logger.error('Error fetching data:', error);
    sendErrorResponse(res, 500, 'Error fetching data');
  }
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});