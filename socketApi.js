const Game = require('./model/GameModel');

function initialize(io) {
    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

    
        // --- Player Reconnection Logic ---
        socket.on('playerConnect', async ({ gameId, teamName }) => {
            try {
                if (!gameId || !teamName) {
                    console.error('playerConnect event missing gameId or teamName');
                    return;
                }

                const game = await Game.findOne({ gameId });
                const team = game ? game.teams.find(team => team.name === teamName) : null;

                if (game && team) {
                    team.socketId = socket.id; // Update team's socket ID
                    await game.save();
                    socket.join(gameId); // Ensure socket is in the game room
                    console.log(`Team '${teamName}' reconnected to game '${gameId}' with socket ID '${socket.id}'`);
                    io.to(gameId).emit('updateGameState', game.toObject()); // Update everyone
                }
            } catch (error) {
                console.error(`Error during playerConnect for game ${gameId}:`, error);
            }
        });


        // Facilitator joins their specific game lobby
        socket.on('facilitatorJoin', async (gameId) => {
            try {
                socket.join(gameId);
                console.log(`Facilitator joined room: ${gameId}`);
                // Optionally send back the current game state
                const game = await Game.findOne({ gameId }).lean();
                socket.emit('updateGameState', game);
                socket.emit('facilitatorJoined', { gameId }); // Notify facilitator that join was successful
            } catch (error) {
                console.error(`Error during facilitatorJoin for game ${gameId}:`, error);
                socket.emit('gameError', 'An error occurred while joining the lobby.');
            }
        });

        // A team joins the game
        socket.on('teamJoin', async ({ gameId, teamName }) => {
            try {
                const game = await Game.findOne({ gameId });

                // Prevent duplicate team names
                if (game && game.teams.some(t => t.name === teamName)) {
                    socket.emit('joinError', 'A team with this name has already joined.');
                    return;
                }

                if (game && game.teams.length < game.numberOfTeams) {
                    socket.join(gameId);
                    const newTeam = {
                        name: teamName,
                        score: 0,
                        isReady: false,
                        socketId: socket.id
                    };
                    game.teams.push(newTeam);
                    await game.save();
                    // Broadcast the new game state to everyone in the room
                    io.to(gameId).emit('updateGameState', game.toObject());
                } else {
                    // Handle error: room full or not found
                    socket.emit('joinError', 'Room is full or does not exist.');
                }
            } catch (error) {
                console.error(`Error during teamJoin for game ${gameId}:`, error);
                socket.emit('gameError', 'An error occurred while trying to join the game.');
            }
        });

        // A team signals they are ready
        socket.on('teamReady', async ({ gameId, teamName }) => {
            try {
                const game = await Game.findOne({ gameId });
                const team = game.teams.find(t => t.name === teamName);
                if (team) {
                    team.isReady = true;
                    await game.save();
                    io.to(gameId).emit('updateGameState', game.toObject());
                }
            } catch (error) {
                console.error(`Error during teamReady for game ${gameId}:`, error);
                socket.emit('gameError', 'An error occurred while updating ready status.');
            }
        });

        // Facilitator starts the game
        socket.on('startGame', async (gameId) => {
            try {
                const game = await Game.findOne({ gameId });
                if (game && game.status === 'lobby') {
                    game.status = 'in-progress';
                    game.currentQuestionIndex = 0; // Start with the first question
                    await game.save();

                    // Broadcast to all clients in the room that the game has started.
                    io.to(gameId).emit('gameStarted', { gameId });
                }
            } catch (error) {
                console.error(`Error starting game ${gameId}:`, error);
                socket.emit('gameError', 'Could not start the game.');
            }
        });

        // A team clicks the "Answer" button
        socket.on('answerAttempt', async ({ gameId, teamName }) => {
            try {
                const game = await Game.findOne({ gameId });
                // Only allow an attempt if the game is in progress and no one else is answering
                if (game && game.status === 'in-progress' && !game.answeringTeamName) {
                    game.answeringTeamName = teamName;
                    await game.save();

                    // Notify all clients that a team has locked in to answer
                    io.to(gameId).emit('answerLock', { answeringTeamName: teamName });
                }
            } catch (error) {
                console.error(`Error on answer attempt for game ${gameId}:`, error);
            }
        });

        // Answering team submits their chosen answer
        socket.on('submitAnswer', async ({ gameId, teamName, answer }) => {
            try {
                const game = await Game.findOne({ gameId });
                if (!game || game.status !== 'in-progress' || game.answeringTeamName !== teamName) {
                    return; // Ignore if game not found, not in progress, or not their turn
                }

                const question = game.questions[game.currentQuestionIndex];
                const team = game.teams.find(t => t.name === teamName);

                if (!question || !team) return;

                const wasCorrect = (answer === question.correctAnswer);
                let openForNextAnswer = false;

                if (wasCorrect) {
                    team.score += 10;
                    // Question is answered, lock it down until facilitator moves to next.
                    game.answeringTeamName = '__answered__';
                } else {
                    team.score -= 5;
                    // Question is now open for others to answer
                    game.answeringTeamName = null;
                    openForNextAnswer = true;
                }

                await game.save();

                io.to(gameId).emit('answerResult', { teamName, wasCorrect, openForNextAnswer });
                io.to(gameId).emit('updateGameState', game.toObject());
            } catch (error) {
                console.error(`Error on submit answer for game ${gameId}:`, error);
            }
        });

        // Facilitator moves to the next question
        socket.on('nextQuestion', async (gameId) => {
            try {
                const game = await Game.findOne({ gameId });
                if (!game || game.status !== 'in-progress') return;

                game.currentQuestionIndex++;
                game.answeringTeamName = null;

                if (game.currentQuestionIndex >= game.questions.length) {
                    game.status = 'finished';
                    await game.save();
                    // Sort teams by score before sending the final state
                    const finalGame = game.toObject();
                    finalGame.teams.sort((a, b) => b.score - a.score);
                    io.to(gameId).emit('gameOver', finalGame);
                } else {
                    await game.save();
                    const nextQuestion = game.questions[game.currentQuestionIndex];
                    io.to(gameId).emit('newQuestion', { question: nextQuestion, questionIndex: game.currentQuestionIndex });
                    io.to(gameId).emit('updateGameState', game.toObject());
                }
            } catch (error) {
                console.error(`Error on next question for game ${gameId}:`, error);
            }
        });

        // Facilitator ends the game
        socket.on('endGame', async (gameId) => {
            try {
                const game = await Game.findOne({ gameId });
                if (game) {
                    game.status = 'finished';
                    await game.save();
                    // Sort teams by score before sending the final state
                    const finalGame = game.toObject();
                    finalGame.teams.sort((a, b) => b.score - a.score);
                    io.to(gameId).emit('gameOver', finalGame);
                }
            } catch (error) {
                console.error(`Error ending game ${gameId}:`, error);
                socket.emit('gameError', 'An error occurred while ending the game.');
            }
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });
}

module.exports = { initialize };