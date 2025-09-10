const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema for a single question.
 * This will be embedded as a sub-document within a QuestionSet.
 */
const QuestionSchema = new Schema({
    category:{
        type: String
    },
    questionText: {
        type: String,
        required: [true, 'Question text cannot be blank.'],
        trim: true
    },
    options: {
        type: [String],
        required: true,
        // As requested, we validate that there are exactly 4 options.
        validate: {
            validator: function(v) {
                return Array.isArray(v) && v.length === 4;
            },
            message: 'Each question must have exactly four options.'
        }
    },
    correctAnswer: {
        type: String,
        required: [true, 'Correct answer cannot be blank.'],
        validate: {
            // This validator ensures the correct answer is always one of the options.
            validator: function(value) {
                // 'this' refers to the question document being validated.
                return this.options.includes(value);
            },
            message: props => `The correct answer "${props.value}" is not one of the provided options.`
        }
    }
});

/**
 * Schema for a set of questions.
 * Each document represents a unique quiz or question set.
 */
const QuestionSetSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Question set name cannot be blank.'],
        unique: true,
        trim: true
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    // Here we embed the array of questions.
    questions: [QuestionSchema],
    accessibleBy: {
        type: [String], // Defines an array of strings
        default: []     // Defaults to an empty array
    }
}, { timestamps: true });

const QuestionSet = mongoose.model('QuestionSet', QuestionSetSchema);

// Export both the Model and the reusable QuestionSchema
module.exports = QuestionSet;
module.exports.QuestionSchema = QuestionSchema;
// module.exports = mongoose.model('QuestionSet', QuestionSetSchema);