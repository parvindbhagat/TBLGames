const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../model/UserModel');

// --- Middleware ---
// Placeholder for real authentication. In a real app, this would be implemented
// using sessions or JWTs to verify that the logged-in user is an admin.
const isAdmin = (req, res, next) => {
  // For development, we'll assume an admin is making the request.
  // REPLACE THIS with your actual authentication logic.
  // For example: if (req.session.user && req.session.user.role === 'admin')
  // req.user = { role: 'admin', name: 'System Admin' };  // development only
  req.user = req.session.user; // production code
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Forbidden: Administrator access required.' });
};

// Apply the isAdmin middleware to all routes in this router.
router.use(isAdmin);

// --- Routes ---

/**
 * @route   GET /admin/users
 * @desc    Get all users
 * @access  Admin
 */
router.get('/', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.render('allusers', { users: users, title: 'Manage Users' });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).render('error',{ message: 'Error fetching users', error: error });
  }
});

/**
 * @route   GET /admin/users/newuser
 * @desc    Form to create a new user (facilitator or admin)
 * @access  Admin
 */
router.get('/newuser', (req, res) => {
  res.render('newuser', { title: 'Create New User' });
});

/**
 * @route   GET /admin/users/edit/:userId
 * @desc    Show form to edit a user
 * @access  Admin
 */
router.get('/edit/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId }).select('-password');
    if (!user) {
      return res.status(404).render('error', { message: 'User not found', error: {} });
    }
    res.render('edituser', { title: 'Edit User', user: user });
  } catch (error) {
    console.error('Error fetching user for edit:', error);
    res.status(500).render('error', { message: 'Error fetching user', error: error });
  }
});

/**
 * @route   POST /admin/users
 * @desc    Create a new user (facilitator or admin)
 * @access  Admin
 */
router.post('/', async (req, res) => {
  const { name, email, role } = req.body;

  if (!name || !email || !role) {
    return res.status(400).json({ message: 'Please provide name, email, and role.' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists.' });
    }

    // Generate a temporary password that the admin can share.
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
      createdBy: req.user.name // Assumes isAdmin middleware sets req.user
    });

    await newUser.save();

    // Return the new user's details along with the temporary password
    res.status(201).json({
      message: 'User created successfully. Please share the temporary password securely.',
      user: {
        userId: newUser.userId,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.isActive
      },
      temporaryPassword: tempPassword
    });

  } catch (error) {
    console.error('Error creating user:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation Error', errors: error.errors });
    }
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
});

/**
 * @route   PUT /admin/users/:userId
 * @desc    Update a user's details (name, email, role, active status)
 * @access  Admin
 */
router.put('/:userId', async (req, res) => {
  const { name, email, role, isActive } = req.body;
  const { userId } = req.params;

  const updateFields = {};
  if (name) updateFields.name = name;
  if (email) updateFields.email = email;
  if (role) updateFields.role = role;
  if (typeof isActive === 'boolean') updateFields.isActive = isActive;
  updateFields.updatedBy = req.user.name;

  if (Object.keys(updateFields).length <= 1) { // only updatedBy is present
    return res.status(400).json({ message: 'No update fields provided.' });
  }

  try {
    const user = await User.findOneAndUpdate(
      { userId },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ message: 'User updated successfully.', user });
  } catch (error) {
    console.error('Error updating user:', error);
    if (error.code === 11000) { // Duplicate key error for email
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
});

/**
 * @route   POST /admin/users/:userId/reset-password
 * @desc    Reset a user's password
 * @access  Admin
 */
router.post('/:userId/reset-password', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const tempPassword = crypto.randomBytes(8).toString('hex');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

    user.password = hashedPassword;
    user.updatedBy = req.user.name;
    await user.save();

    res.json({
      message: 'Password has been reset successfully. Please share the new temporary password securely.',
      temporaryPassword: tempPassword
    });

  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Error resetting password', error: error.message });
  }
});

/**
 * @route   POST /admin/users/delete/:userId
 * @desc    Delete a user
 * @access  Admin
 */
router.post('/delete/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findOneAndDelete({ userId });

    if (!user) {
      return res.status(404).send('User not found.');
    }

    // Redirect back to the user list page after successful deletion.
    res.redirect('/admin/users');

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).render('error', { message: 'Error deleting user', error: error });
  }
});

module.exports = router;
