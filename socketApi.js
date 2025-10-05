const Game = require('./model/GameModel');

/**
 * Ends a game, sorts the teams by score, and broadcasts the final state.
 * @param {import('mongoose').Document & typeof Game} game The game document to end.
 * @param {import('socket.io').Server} io The Socket.IO server instance.
 */
async function endAndBroadcastGame(game, io) {
    if (!game || game.status === 'finished') return;
    game.status = 'finished';
    await game.save();
    const finalGame = game.toObject();
    finalGame.teams.sort((a, b) => b.score - a.score);
    io.to(game.gameId).emit('gameOver', finalGame);
    console.log(`Game '${game.gameId}' has ended.`);
}

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
                    socket.gameInfo = { gameId, teamName }; // Store info for disconnect handling
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
                socket.gameInfo = { gameId, isFacilitator: true }; // Store info for disconnect handling
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
                if (!game) {
                    socket.emit('joinError', 'Game does not exist.');
                    return;
                }

                const existingTeam = game.teams.find(t => t.name === teamName);

                if (game.status === 'lobby') {
                    // Only allow new teams if not already present and game is not full
                    if (existingTeam) {
                        socket.emit('joinError', 'A team with this name has already joined.');
                        return;
                    }
                    if (game.teams.length >= game.numberOfTeams) {
                        socket.emit('joinError', 'This game is already full.');
                        return;
                    }
                    // Add new team
                    const newTeam = {
                        name: teamName,
                        score: 0,
                        isReady: false,
                        socketId: socket.id
                    };
                    game.teams.push(newTeam);
                    await game.save();
                    socket.join(gameId);
                    socket.gameInfo = { gameId, teamName };
                    io.to(gameId).emit('updateGameState', game.toObject());
                } else {
                    // Game is in-progress or finished
                    if (existingTeam) {
                        // Allow reconnect for existing team
                        existingTeam.socketId = socket.id;
                        await game.save();
                        socket.join(gameId);
                        socket.gameInfo = { gameId, teamName };
                        io.to(gameId).emit('updateGameState', game.toObject());
                    } else {
                        // New team after game started: Spectator only
                        socket.join(gameId);
                        socket.gameInfo = { gameId, spectator: true };
                        socket.emit('spectatorView', { gameId, message: 'You are viewing as a spectator.' });
                        // Optionally, emit current game state for spectators
                        socket.emit('updateGameState', game.toObject());
                    }
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

        // when team couldn't answer in 60 seconds
        // io.to(game.gameId).emit('answerTimeout', {
        //     teamName: answeringTeam.name,
        //     openForNextAnswer: true // or false if no more teams can answer
        // });

        // A team clicks the "BUZZER" button
        socket.on('answerAttempt', async ({ gameId, teamName }) => {
            try {
                const game = await Game.findOne({ gameId });

                // **SECURITY FIX**: Check if the team is a legitimate participant before proceeding.
                const isLegitTeam = game && game.teams.some(t => t.name === teamName);

                if (!isLegitTeam) {
                    console.warn(`Unauthorized answer attempt by non-existent team '${teamName}' in game '${gameId}'.`);
                    return; // Ignore the attempt
                }

                // Only allow an attempt if the game is in progress, no one else is answering, and the team is valid.
                if (game.status === 'in-progress' && !game.answeringTeamName) {
                    game.answeringTeamName = teamName;
                    await game.save();

                    io.to(gameId).emit('updateGameState', game.toObject());
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
                    if (!game.attemptedTeams) game.attemptedTeams = [];
                    if (!game.attemptedTeams.includes(teamName)) {
                        game.attemptedTeams.push(teamName);
                    }
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
                game.attemptedTeams = [];

                if (game.currentQuestionIndex >= game.questions.length) {
                    await endAndBroadcastGame(game, io);
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
                    await endAndBroadcastGame(game, io);
                }
            } catch (error) {
                console.error(`Error ending game ${gameId}:`, error);
                socket.emit('gameError', 'An error occurred while ending the game.');
            }
        });

        // Facilitator kicks a team from the lobby
        socket.on('kickTeam', async ({ gameId, teamName }) => {
            try {
                const game = await Game.findOne({ gameId });

                // Security check: Only allow kicking during the lobby phase.
                if (game && game.status === 'lobby') {
                    const teamIndex = game.teams.findIndex(t => t.name === teamName);

                    if (teamIndex > -1) {
                        const kickedTeam = game.teams[teamIndex];
                        game.teams.splice(teamIndex, 1); // Remove the team from the array
                        await game.save();

                        // Notify everyone in the room about the updated game state
                        io.to(gameId).emit('updateGameState', game.toObject());

                        // Specifically notify the kicked player's socket
                        if (kickedTeam.socketId) {
                            const kickedSocket = io.sockets.sockets.get(kickedTeam.socketId);
                            if (kickedSocket) {
                                // Forcefully disconnect the user. This is more robust than just leaving a room.
                                kickedSocket.emit('kicked', { reason: 'You have been removed from the game by the facilitator.' });
                                kickedSocket.disconnect(true);
                            }
                        }
                        console.log(`Team '${teamName}' was kicked from game '${gameId}' by the facilitator.`);
                    }
                }
            } catch (error) {
                console.error(`Error kicking team ${teamName} from game ${gameId}:`, error);
                socket.emit('gameError', 'An error occurred while trying to kick the team.');
            }
        });

        socket.on('disconnect', async () => {
            console.log('User disconnected:', socket.id);
            // If the socket had game info, a player or facilitator disconnected.
            if (socket.gameInfo && socket.gameInfo.gameId && socket.gameInfo.teamName) {
                try {
                    const { gameId, teamName } = socket.gameInfo;
                    const game = await Game.findOne({ gameId });

                    if (!game) return;

                    const team = game.teams.find(t => t.name === teamName);

                    // Only clear the socketId if it matches the one that just disconnected.
                    // This prevents a race condition where a quick reconnect happens before the disconnect is processed.
                    if (team && team.socketId === socket.id) {
                        team.socketId = null; // Mark as disconnected
                        await game.save();
                        io.to(gameId).emit('updateGameState', game.toObject());
                        console.log(`Team '${teamName}' disconnected from game '${gameId}'.`);
                    }
                } catch (error) {
                    console.error('Error during disconnect cleanup:', error);
                }
            }
        });

        socket.on('answerTimeout', async ({ gameId, teamName }) => {
            try {
                const game = await Game.findOne({ gameId });
                if (!game || game.status !== 'in-progress') return;

                // Mark this team as having attempted this question
                if (!game.attemptedTeams) game.attemptedTeams = [];
                if (!game.attemptedTeams.includes(teamName)) {
                    game.attemptedTeams.push(teamName);
                }

                // Clear answering team
                game.answeringTeamName = null;
                await game.save();

                // Check if other teams can answer
                const remainingTeams = game.teams.filter(t => !game.attemptedTeams.includes(t.name));
                const openForNextAnswer = remainingTeams.length > 0;

                io.to(gameId).emit('answerTimeout', {
                    teamName,
                    openForNextAnswer
                });

                io.to(gameId).emit('updateGameState', game.toObject());
            } catch (error) {
                console.error(`Error handling answerTimeout for game ${gameId}:`, error);
            }
        });
    });
}

module.exports = { initialize };