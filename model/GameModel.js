const mongoose = require('mongoose');
const { QuestionSchema } = require('./QuestionSetModel');

const TeamSchema = new mongoose.Schema({
    name: { type: String, required: true },
    score: { type: Number, default: 0 },
    isReady: { type: Boolean, default: false }
});

const GameSchema = new mongoose.Schema({
    // A unique, human-readable ID for the game room
    gameId: { type: String, required: true, unique: true, index: true },

    // Setup details from the facilitator
    clientName: { type: String, required: true },
    interventionName: { type: String },
    batchId: { type: String },
    numberOfTeams: { type: Number, required: true },

    // Game state
    status: {
        type: String,
        enum: ['lobby', 'in-progress', 'paused', 'finished'],
        default: 'lobby'
    },
    teams: [TeamSchema],
    currentQuestionIndex: { type: Number, default: -1 },
    answeringTeamName: { type: String, default: null }, // Tracks which team is currently answering

    // Linked data
    facilitator: { type: mongoose.Schema.Types.ObjectId, ref: 'Facilitator' }, // Assuming you have a Facilitator model
    questionSet: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionSet' },
    questions: [QuestionSchema] // The randomly selected subset of questions for this game

}, { timestamps: true });

const Game = mongoose.model('Game', GameSchema);

module.exports = Game;