import { ws } from './bingo';

ws.on('open', () => {
  console.log('Connected to server');
  // Test join
  ws.send(JSON.stringify({ type: 'join', player: 'TestPlayer', room: 'testroom' }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg);
  if (msg.type === 'players') {
    console.log('Players in room:', msg.players);
    // Test start with 1 player (should error)
    ws.send(JSON.stringify({ type: 'start', numPlayers: 2 }));
  } else if (msg.type === 'error') {
    console.log('Error received:', msg.message);
    // Test call
    ws.send(JSON.stringify({ type: 'call', number: 5 }));
  } else if (msg.type === 'call') {
    console.log('Number called:', msg.number);
    // Test winner
    ws.send(JSON.stringify({ type: 'winner', player: 'TestPlayer' }));
  } else if (msg.type === 'winner') {
    console.log('Winner:', msg.player);
    ws.close();
  }
});

ws.on('close', () => {
  console.log('Connection closed');
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});
