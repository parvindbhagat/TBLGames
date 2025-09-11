var express = require('express');
var router = express.Router();
const User = require('../model/UserModel');
const bcrypt = require('bcrypt');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Intervention Games' });
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
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  // WARNING: This is a simplified example. Add proper error handling.
  if (user && await bcrypt.compare(password, user.password)) {
    // Password matches, create the session
    req.session.user = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role
    };

    // Save the session before redirecting
    req.session.save(() => {
      if (user.role === 'admin') {
        res.redirect('/admin'); // Or admin dashboard
      } else {
        res.redirect('/facilitator'); // Or facilitator dashboard
      }
    });
  } else {
    // Failed login
    // res.status(401).send('Invalid credentials');
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
