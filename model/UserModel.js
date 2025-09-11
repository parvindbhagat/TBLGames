const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Schema = mongoose.Schema;
const UserSchema = new Schema({
    userId: { type: String, default: uuidv4, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true },
    role: { type: String, enum: ['admin', 'facilitator'], default: 'facilitator' },
    createdBy: { type: String },
    updatedBy: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);