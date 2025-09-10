const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Schema = mongoose.Schema;
const UserSchema = new Schema({
    userId: { type: String, default: uuidv4, required: true, unique: true },
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    role: { type: String, enum: ['admin', 'facilitator', 'user'], default: 'user' }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);