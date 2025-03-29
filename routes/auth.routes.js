const express = require('express');
const router = express.Router();
const db = require('../config/db.config');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    console.log('Login attempt:', { username, password }); // Debugging log

    // Query rb_user_master for the user by user_name, ensuring the user is active
    const [rows] = await db.query(
      'SELECT idrb_user_master, password, is_active FROM rb_user_master WHERE user_name = ?',
      [username]
    );

    if (rows.length === 0) {
      console.log('User not found:', username);
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const user = rows[0];
    console.log('Found user:', { idrb_user_master: user.idrb_user_master, password: user.password, is_active: user.is_active });

    // Check if user is active
    if (user.is_active !== 1) {
      console.log('User is inactive:', username);
      return res.status(401).json({ message: 'User account is inactive' });
    }

    // Compare passwords in plain text (as requested)
    if (password !== user.password) {
      console.log('Password mismatch for user:', username);
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Fetch roles for the user from rb_role_master via rb_user_role
    const [roleRows] = await db.query(
      'SELECT r.rb_role_name FROM rb_role_master r JOIN rb_user_role ur ON r.idrb_role_master = ur.rb_role_id WHERE ur.rb_user_id = ?',
      [user.idrb_user_master]
    );

    const roles = roleRows.map((row) => row.rb_role_name); // Use rb_role_name from rb_role_master
    console.log('User roles:', roles);

    // Update last_login timestamp (assuming this column exists in rb_user_master)
    await db.query(
      'UPDATE rb_user_master SET last_login = NOW() WHERE idrb_user_master = ?',
      [user.idrb_user_master]
    );

    // Return userId (using idrb_user_master) and roles
    res.json({ userId: user.idrb_user_master, roles });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: `Login failed: ${error.message}` });
  }
});

module.exports = router;