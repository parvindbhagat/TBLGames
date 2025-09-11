const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const csv = require('csv-parser');
const { Readable } = require('stream');
const QuestionSet = require('../model/QuestionSetModel');
const usersRouter = require('./users'); // Import the users router
const { stat } = require('fs');

// Middlewares
const isAdmin = (req, res, next) => {
  // For development, we'll assume an admin is making the request.
  // REPLACE THIS with your actual authentication logic.
  // For example: if (req.session.user && req.session.user.role === 'admin')
  // req.user = { role: 'admin', name: 'System Admin' };  // development only
  req.user = req.session.user; // production code
  console.log('isAdmin middleware - req.session.user:', req.session.user);
  if (req.user && req.user.role === 'admin') {
    console.log('Admin user:', req.user);
    return next();
  } else {
  return res.status(403).redirect('/login?msg=Forbidden: Administrator access required.');
  }
  // return res.status(403).json({ message: 'Forbidden: Administrator access required.' });
};

// Apply the isAdmin middleware to all routes in this router.
router.use(isAdmin);

// --- Routes ---

// Configure multer for in-memory file storage. This is efficient for small files.
const upload = multer({ storage: multer.memoryStorage() });

/** 
 * GET /admin
 * Renders the admin home page.
 */
router.get('/', (req, res) => {
    res.render('adminhome', { title: 'Admin Home', userName: 'admin' });
});

// Mount the users router at the /users path
router.use('/users', usersRouter);

/**
 * GET /admin/questionsets
 * Lists all question sets in the database.
 */
router.get('/questionsets', async (req, res) => {
    try {
        // const questionSets = await QuestionSet.find().select('name description createdAt accessibleBy').sort({ createdAt: -1 });
        // res.render('adminquestionssets', { questionSets: questionSets , title: 'Question Sets' });
        const questionSets = await QuestionSet.aggregate([
        {
          $project: {
            name: 1,
            description: 1,
            accessibleBy: 1,
            questions: 1,
            // Use the $size operator to count the elements in the 'questions' array
            numberOfQuestions: { $size: { $ifNull: ['$questions', []] } }
          }
        }
        // You can add other stages like $match or $sort here as needed
        ]).sort({ createdAt: -1 });
        res.render('adminquestionssets', {
            title: 'Question Sets',
            questionSets: questionSets
        });
    } catch (error) {
        console.error('Error fetching question sets:', error);
        res.status(500).send('Error fetching question sets.');
    }
});

/**
 * @route   GET /admin/questions/:id
 * @desc    Fetches all questions for a specific question set.
 * @access  Private (should be protected by your admin auth middleware)
 */
router.get('/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid Question Set ID.' });
    }

    // Find the set by ID and project only the 'questions' field for efficiency.
    const questionSet = await QuestionSet.findById(id, 'questions').lean();

    if (!questionSet) {
      return res.status(404).json({ message: 'Question Set not found.' });
    }

    res.json(questionSet.questions || []);
  } catch (error) {
    console.error('API Error fetching questions:', error);
    res.status(500).json({ message: 'An error occurred while fetching questions.' });
  }
});

/**
 * GET /admin/addquestionset
 * Renders the page with the form to add a new question set.
 */
router.get('/addquestionset', (req, res) => {
    res.render('adminaddquestionset'); // Renders the EJS file we created above
});

/**
 * POST /admin/addquestionset
 * Handles the form submission, parses the CSV, and creates the new question set.
 */
router.post('/addquestionset', upload.single('questionsCsv'), (req, res) => {
    const { name, description, accessibleBy } = req.body;

    if (!req.file) {
        return res.status(400).send('No CSV file was uploaded.');
    }

    const questions = [];
    const csvData = [];

    // Create a readable stream from the file buffer to pipe into the CSV parser
    const bufferStream = Readable.from(req.file.buffer);

    bufferStream
        .pipe(csv())
        .on('data', (data) => csvData.push(data))
        .on('error', (err) => {
            console.error('CSV parsing error:', err);
            return res.status(400).send('Error parsing CSV file: ' + err.message);
        })
        .on('end', async () => {
            try {
                // Transform CSV data into our QuestionSchema format
                for (const row of csvData) {
                    // Ensure all required columns are present in the row
                    if (!row.Question || !row.Option1 || !row.Option2 || !row.Option3 || !row.Option4 || !row.Answer) {
                        console.warn('Skipping invalid row in CSV:', row);
                        continue; // Skip this malformed row
                    }

                    const questionData = {
                        questionText: row.Question.trim(),
                        options: [row.Option1.trim(), row.Option2.trim(), row.Option3.trim(), row.Option4.trim()],
                        correctAnswer: row.Answer.trim()
                    };

                    questions.push(questionData);
                }

                if (questions.length === 0) {
                    return res.status(400).send('The CSV file is either empty or contains no valid questions.');
                }

                // Helper function to format names into "Capitalized Case"
                const capitalizeName = (name) => {
                    if (!name) return '';
                    return name
                        .toLowerCase()
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                };

                // Create the new QuestionSet document
                const newQuestionSet = new QuestionSet({
                    name,
                    description,
                    questions,
                    accessibleBy: accessibleBy ? accessibleBy.split(',').map(name => capitalizeName(name.trim())).filter(Boolean) : []
                });

                // Save to the database. Mongoose will run our schema validations here.
                await newQuestionSet.save();

                // res.status(201).send(`<h1>Success!</h1><p>Question set "${name}" was created with ${questions.length} questions.</p><a href="/admin/addquestionset">Add another set</a>`);
                res.redirect('/admin/questionsets?msg=Question set "' + name + '" created successfully.');
            } catch (error) {
                console.error('Error saving question set:', error);
                // Handle specific errors for better feedback
                if (error.code === 11000) { // MongoDB duplicate key error
                    return res.status(409).send(`Error: A question set with the name "${name}" already exists.`);
                }
                // Catches validation errors from the schema (e.g., a correct answer not in options)
                // res.status(400).send(`Error saving the question set: ${error.message}`);
                res.status(400).render('error', {
                    message: 'Error saving the question set',
                    status: 400,    
                    error: error
                });
            }
        });
});

module.exports = router;