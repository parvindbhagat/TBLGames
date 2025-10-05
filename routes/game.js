var express = require('express');
var router = express.Router();
const QuestionSet = require('../model/QuestionSetModel');
const Game = require('../model/GameModel');

/* GET Game join page. */
router.get('/join/:gameId', async function(req, res, next) {
    try {
        const { gameId } = req.params;
        // Use findOne with the custom gameId field, not findById
        const game = await Game.findOne({ gameId: gameId }).lean();

        if (!game) {
            const err = new Error('Game not found');
            err.status = 404;
            return next(err);
        }

        res.render('joingame', { title: `Join Game: ${game.clientName} ${game.gameType}`, gameId, game });
    } catch (error) {
        next(error);
    }
});

/* GET player's live game view. */
router.get('/play/:gameId', async (req, res, next) => {
  try {
    const game = await Game.findOne({ gameId: req.params.gameId }).lean();
    if (!game) {
      const err = new Error('Game not found');
      err.status = 404;
      return next(err);
    }
    res.render('pgameview', { title: `Game: ${game.clientName}`, game });
  } catch (error) {
    next(error);
  }
});


module.exports = router;