var express = require('express');
var router = express.Router();
const QuestionSet = require('../model/QuestionSetModel');
const Game = require('../model/GameModel');
const { nanoid } = require('nanoid'); // A great tool for unique IDs. `npm install nanoid`

// Middleware to simulate a logged-in facilitator (replace with your actual auth middleware)
const ensureAuthenticated = (req, res, next) => {
  // In a real app, you'd get this from a session or token.
  req.user = req.session.user; 
  if (req.user) {
    console.log('Authenticated user:', req.user.name);
    return next();
  } else {
    return res.status(403).redirect('/login?msg=Forbidden: Access required.');
  }
};

/* GET facilitator home page. */
router.get('/', ensureAuthenticated, async (req, res, next) => {
  try {
    // Find question sets where the facilitator's name is in the 'accessibleBy' array
    const accessibleSets = await QuestionSet.find({ accessibleBy: req.user.name }).lean();

    res.render('fdashboard', {
      title: 'Facilitator Dashboard',
      questionSets: accessibleSets,
      facilitatorName: req.user.name
    });
  } catch (error) {
    next(error);
  }
});

/* GET game setup form. */
router.get('/game-setup', ensureAuthenticated, async (req, res, next) => {
    try {
        const accessibleSets = await QuestionSet.find({ accessibleBy: req.user.name }).lean();
        // console.log(accessibleSets);
        res.render('fgameSetup', {
            title: 'Setup New Game',
            questionSets: accessibleSets,
            facilitatorName: req.user.name
        });
    } catch (error) {
        next(error);
    }
});

/* POST to create a new game room. */
router.post('/game-setup', ensureAuthenticated, async (req, res, next) => {
    try {
        const { clientName, interventionName, batchId, questionSetId, numQuestions, numTeams } = req.body;

        // 1. Fetch the full question set
        const questionSet = await QuestionSet.findById(questionSetId).lean();
        if (!questionSet) {
            return res.status(404).send('Question Set not found.');
        }

        // 2. Shuffle and select a random subset of questions
        const shuffled = questionSet.questions.sort(() => 0.5 - Math.random());
        const selectedQuestions = shuffled.slice(0, numQuestions);

        // 3. Create the new game document
        const newGame = new Game({
            gameId: nanoid(6), // Generate a short, unique ID for the room
            clientName,
            interventionName,
            batchId,
            numberOfTeams: numTeams,
            questionSet: questionSetId,
            questions: selectedQuestions,
            facilitator: req.user._id
        });

        await newGame.save();

        // 4. Redirect facilitator to their game lobby
        res.redirect(`/facilitator/lobby/${newGame.gameId}`);
    } catch (error) {
        next(error);
    }
});

/* GET facilitator game lobby. */
router.get('/lobby/:gameId', ensureAuthenticated, async (req, res, next) => {
  try {
    const game = await Game.findOne({ gameId: req.params.gameId }).lean();

    if (!game) {
      const err = new Error('Game not found');
      err.status = 404;
      return next(err);
    }

    // Construct the join URL for players
    const joinUrl = `${req.protocol}://${req.get('host')}/game/join/${game.gameId}`;

    res.render('flobby', { title: `Lobby for ${game.clientName}`, game, joinUrl });
  } catch (error) {
    next(error);
  }
});


/* GET facilitator's live game view. */
router.get('/game/:gameId', ensureAuthenticated, async (req, res, next) => {
  try {
    const game = await Game.findOne({ gameId: req.params.gameId }).lean();
    if (!game) {
      const err = new Error('Game not found');
      err.status = 404;
      return next(err);
    }
    res.render('fgameview', { title: `Live Game: ${game.clientName}`, game });
  } catch (error) {
    next(error);
  }
});

module.exports = router;