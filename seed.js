// seed.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./model/UserModel'); 

// --- Configuration ---
// It's crucial to use environment variables for sensitive data
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/intervention-games-db';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'parvind.b@chrysalishrd.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe';

if (ADMIN_PASSWORD === 'ChangeMe') {
  console.warn(
    'WARNING: Using default admin password. Please set ADMIN_PASSWORD environment variable for production.'
  );
}

const seedAdminUser = async () => {
  try {
    // 1. Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('Successfully connected to MongoDB for seeding.');

    // 2. Check if an admin user already exists
    const existingAdmin = await User.findOne({ role: 'admin' });

    if (existingAdmin) {
      console.log('Admin user already exists. No action taken.');
      return;
    }

    // 3. If no admin exists, create one
    console.log('No admin user found, creating one...');

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);

    const adminUser = new User({
      email: ADMIN_EMAIL,
      password: hashedPassword,
      name: 'Parvind Bhagat',
      role: 'admin',
      createdBy: 'system',
      updatedBy: 'system'
    });

    await adminUser.save();

    console.log('Admin user created successfully!');
    console.log(`  Email: ${ADMIN_EMAIL}`);
    console.log(`  Password:  (This is the initial password, please change it upon first login)`);

  } catch (error) {
    console.error('Error during admin user seeding:', error);
    process.exit(1); // Exit with an error code
  } finally {
    // 4. Disconnect from the database
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
};

// Run the seeder
seedAdminUser();
