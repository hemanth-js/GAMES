// Simple Bingo multiplayer WebSocket server with turn-based gameplay
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

const rooms = new Map();

// Try to create a WebSocket server starting from a port (default 8080).
// If the port is in use, try the next port up to a small range.
async function createWSS(startPort = 8080, maxAttempts = 10) {
  for (let p = startPort; p < startPort + maxAttempts; p++) {
    const server = http.createServer();

    try {
      await new Promise((resolve, reject) => {
        const onError = (err) => {
          server.removeListener('listening', resolve);
          reject(err);
        };

        server.once('error', onError);
        server.once('listening', () => {
          server.removeListener('error', onError);
          resolve();
        });

        server.listen(p);
      });

      // now that server is listening, attach WebSocketServer
      const wss = new WebSocketServer({ server });
      return { wss, server, port: p };
    } catch (err) {
      // ensure server is closed before retrying
      try { server.close(); } catch (e) {}
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`Port ${p} in use, trying next port...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Could not bind to any port in range ${startPort}-${startPort + maxAttempts - 1}`);
}

function broadcast(roomId, data, sender = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  for (const clientObj of room.players) {
    const client = clientObj.ws;
    // skip closed clients
    if (!client || client.readyState !== WebSocket.OPEN) continue;
    // optionally skip the sender
    if (sender && client === sender) continue;
    
    try {
      client.send(JSON.stringify(data));
    } catch (err) {
      console.error('Error sending to client:', err);
    }
  }
}

function getNextPlayer(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.players.length) return null;
  
  const currentIndex = room.players.findIndex(p => p.player === room.currentTurn);
  const nextIndex = (currentIndex + 1) % room.players.length;
  return room.players[nextIndex].player;
}

const preferredPort = process.env.PORT ? Number(process.env.PORT) : 8080;
const { wss, server, port } = await createWSS(preferredPort, 20);

wss.on("connection", (ws) => {
  let roomId = null;
  let playerName = null;

  console.log('New client connected');

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      
      if (data.type === "join") {
        roomId = data.room;
        playerName = data.player;
        
        console.log(`Join request - Player: "${playerName}", Room: "${roomId}"`);
        
        if (!rooms.has(roomId)) {
          rooms.set(roomId, {
            players: [],
            currentTurn: null,
            gameStarted: false
          });
          console.log(`Created new room: ${roomId}`);
        }
        
        const room = rooms.get(roomId);
        
        // Check if player already exists in room
        const existingPlayer = room.players.find(p => p.player === playerName);
        if (existingPlayer) {
          console.log(`Player ${playerName} already in room, updating connection`);
          existingPlayer.ws = ws;
        } else {
          room.players.push({ ws, player: playerName });
          console.log(`Player ${playerName} added to room ${roomId}`);
        }
        
        console.log(`Room ${roomId} now has ${room.players.length} players:`, room.players.map(p => p.player));
        
        // Broadcast updated players list
        const playerNames = room.players.map(p => p.player);
        broadcast(roomId, { type: 'players', players: playerNames }, null);
      }

      if (data.type === "start" && roomId) {
        const room = rooms.get(roomId);
        if (!room) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Room not found!' 
          }));
          return;
        }
        
        console.log(`Start request in room ${roomId}`);
        console.log(`Current players in room:`, room.players.map(p => p.player));
        console.log(`Players array length: ${room.players.length}`);
        console.log(`First player object:`, room.players[0]);
        
        if (room.players.length >= data.numPlayers) {
          if (!room.players[0] || !room.players[0].player) {
            console.error('ERROR: First player has no name!');
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Server error: Player data corrupted' 
            }));
            return;
          }
          
          // Get the first player's name
          const firstPlayerName = room.players[0].player;
          console.log(`Starting game in room ${roomId} with ${room.players.length} players`);
          console.log(`Setting first player to: "${firstPlayerName}"`);
          
          room.gameStarted = true;
          room.currentTurn = firstPlayerName;
          
          // Send to ALL players including sender
          const startMessage = { 
            type: 'start',
            firstPlayer: firstPlayerName
          };
          
          console.log('Sending start message:', JSON.stringify(startMessage));
          
          for (const clientObj of room.players) {
            const client = clientObj.ws;
            if (client && client.readyState === WebSocket.OPEN) {
              try {
                client.send(JSON.stringify(startMessage));
                console.log(`✓ Sent start to ${clientObj.player}`);
              } catch (err) {
                console.error(`✗ Error sending start to ${clientObj.player}:`, err);
              }
            } else {
              console.warn(`✗ Client ${clientObj.player} not connected properly`);
            }
          }
        } else {
          const currentPlayers = room.players.length;
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: `Waiting for ${data.numPlayers} players. Currently ${currentPlayers}.` 
          }));
        }
      }

      if (data.type === "call" && roomId) {
        const room = rooms.get(roomId);
        if (!room || !room.gameStarted) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Game not started yet!' 
          }));
          return;
        }
        
        // Verify it's this player's turn
        if (room.currentTurn !== playerName) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: `It's ${room.currentTurn}'s turn, not yours!` 
          }));
          return;
        }
        
        console.log(`${playerName} called number ${data.number} in room ${roomId}`);
        
        // Move to next player
        room.currentTurn = getNextPlayer(roomId);
        
        broadcast(roomId, { 
          type: "call", 
          number: data.number,
          caller: playerName,
          nextPlayer: room.currentTurn
        }, ws);
      }

      if (data.type === "winner" && roomId) {
        console.log(`${data.player} won in room ${roomId}`);
        const room = rooms.get(roomId);
        if (room) {
          room.gameStarted = false;
          room.currentTurn = null;
        }
        
        broadcast(roomId, { 
          type: "winner", 
          player: data.player,
          lines: data.lines || []
        }, ws);
      }
      
      if (data.type === "reset" && roomId) {
        console.log(`Game reset in room ${roomId}`);
        const room = rooms.get(roomId);
        if (room) {
          room.gameStarted = false;
          room.currentTurn = null;
        }
        broadcast(roomId, { type: "reset" }, ws);
      }
      
      if (data.type === "chat" && roomId) {
        console.log(`Chat from ${data.player} in room ${roomId}: ${data.message}`);
        // Broadcast chat to everyone EXCEPT sender
        broadcast(roomId, { 
          type: "chat", 
          player: data.player, 
          message: data.message 
        }, ws);
      }
      
    } catch (err) {
      console.error('Error processing message:', err);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: 'Server error processing request' 
      }));
    }
  });

  ws.on("close", () => {
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      const updated = room.players.filter((c) => c.ws !== ws);
      
      if (updated.length === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
      } else {
        room.players = updated;
        
        // If the disconnected player was current turn, move to next
        if (room.currentTurn === playerName && room.gameStarted) {
          room.currentTurn = updated[0].player;
          broadcast(roomId, {
            type: 'chat',
            player: 'System',
            message: `${playerName} disconnected. Now ${room.currentTurn}'s turn.`
          }, null);
        }
        
        console.log(`Player ${playerName} left room ${roomId}`);
        // Broadcast updated players list
        const playerNames = updated.map(p => p.player);
        broadcast(roomId, { type: 'players', players: playerNames }, null);
      }
    }
  });
  
  ws.on("error", (err) => {
    console.error('WebSocket error:', err);
  });
});

console.log(`✅ WebSocket server running at ws://localhost:${port}`);
console.log(`Ready for turn-based Bingo!`);