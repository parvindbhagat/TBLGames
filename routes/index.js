var express = require('express');
var router = express.Router();
const User = require('../model/UserModel');
const bcrypt = require('bcrypt');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Chrysalis Game Arena' });
});

/* GET login page. */
router.get('/login', function(req, res, next) {
  // Pass any messages from the query string to the view
  const { msg } = req.query;
  res.render('login', { title: 'Login', msg });
});

router.post('/login', async (req, res) => {
  // This route is already mostly correct.
  // Just need to ensure bcrypt is required and handle potential errors.
  let { email, password } = req.body;

  console.log('Login attempt for email:', email);

  // Normalize the email to prevent issues with case-sensitivity and whitespace.
  if (typeof email !== 'string') {
    return res.redirect('/login?msg=InvalidCredentials');
  }
  const normalizedEmail = email.toLowerCase().trim();
  // console.log('Normalized email:', normalizedEmail);
  // Use a case-insensitive regular expression to find the user.
  // This is more robust against data entry or environment variable issues.
  // The '^' and '$' ensure it matches the whole string.
  const user = await User.findOne({ email: new RegExp('^' + normalizedEmail + '$', 'i') });

  // console.log('User found:', user ? user.email : 'No user found');

  // WARNING: This is a simplified example. Add proper error handling.
  if (user && user.isActive && await bcrypt.compare(password, user.password)) {
    // Password matches, create the session
    req.session.user = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role
    };
    // console.log('Login successful saving session for user in req.session.user:', req.session.user);
    // Save the session before redirecting
    req.session.save(() => {
      if (user.role === 'admin') {
        res.redirect('/admin'); // Or admin dashboard
      } else {
        res.redirect('/facilitator'); // Or facilitator dashboard
      }
    });
  } else {
    // --- Enhanced Debugging for Failed Login ---
    if (!user) {
      console.error(`Login Failure: No user found with email matching '${normalizedEmail}'.`);
    } else if (!user.isActive) {
      console.error(`Login Failure: User '${user.email}' is not active.`);
    } else {
      // This is the most likely failure point if the user and active status are correct.
      console.error(`Login Failure: Password comparison failed for user '${user.email}'.`);
    }
    // --- End of Enhanced Debugging ---
    res.redirect('/login?msg=InvalidCredentials');
  }
});

/* GET logout route. */
router.get('/logout', (req, res, next) => {
  // Destroy the session
  req.session.destroy((err) => {
    if (err) {
      // Handle error case
      return next(err);
    }
    // Redirect to homepage
    res.redirect('/');
  });
});

module.exports = router;
