const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Using promise-based version
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// CORS Configuration - Allow multiple origins
const allowedOrigins = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:4173', // Vite preview server
  process.env.FRONTEND_URL || 'https://yourapp.netlify.app', // Netlify URL (set in env or replace later)
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., Postman) or if origin is in allowed list
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Explicitly include OPTIONS for preflight
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true, // If you use cookies or auth tokens
  maxAge: 86400, // Cache preflight response for 24 hours
};

app.use(cors(corsOptions));
app.use(express.json());

// Database configuration with reconnection settings
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root1234',
  database: process.env.DB_NAME || 'workflow_db',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 10,
  connectTimeout: 30000,
  acquireTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// Create pool with event listeners for reconnection
const pool = mysql.createPool(dbConfig);

// Database connection test with retry logic
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000; // 5 seconds

const testConnection = async (retryCount = 0) => {
  try {
    const connection = await pool.getConnection();
    console.log('MySQL database connected successfully!');
    connection.release();
  } catch (error) {
    console.error(`Error connecting to MySQL database (Attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      await testConnection(retryCount + 1);
    } else {
      console.error('Max retries reached. Exiting application.');
      process.exit(1);
    }
  }
};

testConnection();

// Event listeners for pool errors and reconnection
pool.on('error', (err) => {
  console.error('MySQL pool error:', err);
  if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('Connection lost. Attempting to reconnect...');
    testConnection();
  }
});

pool.on('connection', (connection) => {
  console.log('New MySQL connection established:', connection.threadId);
});

pool.on('release', (connection) => {
  console.log('Connection released:', connection.threadId);
});

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  if (err.sql) { // Database errors
    return res.status(500).json({
      status: 'error',
      message: 'Database operation failed',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized access',
    });
  }

  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
  });
};

// Request logger middleware
const requestLogger = (req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
};

app.use(requestLogger);

// Database query wrapper with retry
const executeQuery = async (sql, params, retryCount = 0) => {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error(`Database query failed (Attempt ${retryCount + 1}):`, error);
    if ((error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') && retryCount < 2) {
      console.log(`Retrying query in ${RETRY_DELAY_MS / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return executeQuery(sql, params, retryCount + 1);
    }
    throw new Error(`Database query failed: ${error.message}`);
  }
};

// Routes
const authRoutes = require('./routes/auth.routes');
const workflowsRoutes = require('./routes/workflows.routes');

app.use('/auth', authRoutes);
app.use('/api', workflowsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
  });
});

// Error handler should be last
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});

module.exports = app;