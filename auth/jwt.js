// auth/jwt.js

const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Create MySQL pool (use your existing pool if you have one)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root1234',
  database: process.env.DB_NAME || 'workflow_db'
});

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      user_id: user.user_id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' } // Token expires in 24 hours
  );
};

// Verify JWT token middleware
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        status: 'error',
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid or expired token'
    });
  }
};

// Login handler
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
    }

    // Query to check user credentials
    const [users] = await pool.execute(
      'SELECT * FROM rb_user_master WHERE email = ? AND password = ?',
      [email, password] // Note: In production, use hashed passwords!
    );

    if (users.length === 0) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    const user = users[0];
    const token = generateToken(user);

    // You might want to store the token in your database
    await pool.execute(
      'UPDATE rb_user_master SET last_login = NOW(), token = ? WHERE user_id = ?',
      [token, user.user_id]
    );

    res.json({
      status: 'success',
      data: {
        token,
        user: {
          user_id: user.user_id,
          email: user.email,
          role: user.role
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

module.exports = {
  generateToken,
  verifyToken,
  login
};