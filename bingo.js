const playerInput = document.getElementById('playerName');
const roomInput = document.getElementById('roomId');
const wsInput = document.getElementById('wsUrl');
const numPlayersSelect = document.getElementById('numPlayers');
const joinBtn = document.getElementById('joinBtn');
const localBtn = document.getElementById('localBtn');
const playersList = document.getElementById('players');
const startBtn = document.getElementById('startBtn');
const callBtn = document.getElementById('callBtn');
const resetBtn = document.getElementById('resetBtn');
const calledDiv = document.getElementById('calledNumbers');
const announcement = document.getElementById('announcement');
const boardDiv = document.getElementById('bingoBoard');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const sendChat = document.getElementById('sendChat');
const statusEl = document.getElementById('status');
const roomDisplay = document.getElementById('roomDisplay');

let ws, connected = false, local = false;
let called = [];
let card = [];
let marked = [];
let playerName = 'Player-' + Math.floor(Math.random() * 1000);
let players = [];
let gameStarted = false;
let winner = null;
let currentTurn = null;
let myTurn = false;
playerInput.value = playerName;

// 🎲 Generate 1–25
function generateNumbers() {
  const nums = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  return nums;
}

// 🎯 Create 5×5 grid using 1–25
function genCard() {
  const nums = generateNumbers();
  const grid = [];
  let idx = 0;
  for (let r = 0; r < 5; r++) {
    grid[r] = [];
    for (let c = 0; c < 5; c++) {
      grid[r][c] = nums[idx++];
    }
  }
  return grid;
}

// 🎯 Auto-mark numbers that have been called
function autoMarkCalled() {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (called.includes(card[r][c])) {
        marked[r][c] = true;
      }
    }
  }
}

function renderBoard() {
  boardDiv.innerHTML = '';
  const lastCalled = called[called.length - 1];
  card.forEach((row, r) => {
    row.forEach((val, c) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (marked[r][c]) cell.classList.add('marked');
      if (val === lastCalled) cell.classList.add('highlighted');
      cell.textContent = val;
      
      // Manual marking disabled - only auto-marking allowed
      cell.onclick = () => {
        if (winner) return;
        addChat('System', 'Numbers are auto-marked when called!');
      };
      boardDiv.appendChild(cell);
    });
  });
}

function checkBingo() {
  if (!gameStarted || winner) return false;
  
  let completedLines = [];
  
  // Check Rows
  for (let r = 0; r < 5; r++) {
    if (marked[r].every(Boolean)) {
      completedLines.push(`Row ${r + 1}`);
    }
  }
  
  // Check Columns
  for (let c = 0; c < 5; c++) {
    let columnComplete = true;
    for (let r = 0; r < 5; r++) {
      if (!marked[r][c]) {
        columnComplete = false;
        break;
      }
    }
    if (columnComplete) {
      completedLines.push(`Column ${c + 1}`);
    }
  }
  
  // Check Diagonal 1 (top-left to bottom-right)
  let diagonal1Complete = true;
  for (let i = 0; i < 5; i++) {
    if (!marked[i][i]) {
      diagonal1Complete = false;
      break;
    }
  }
  if (diagonal1Complete) {
    completedLines.push('Diagonal \\');
  }
  
  // Check Diagonal 2 (top-right to bottom-left)
  let diagonal2Complete = true;
  for (let i = 0; i < 5; i++) {
    if (!marked[i][4 - i]) {
      diagonal2Complete = false;
      break;
    }
  }
  if (diagonal2Complete) {
    completedLines.push('Diagonal /');
  }
  
  // Win condition: 5 or more lines
  if (completedLines.length >= 5) {
    return { won: true, lines: completedLines };
  }
  
  return { won: false, lines: completedLines };
}

function checkAndAnnounceWin() {
  if (!gameStarted || winner) return;
  
  const result = checkBingo();
  
  if (result.won) {
    winner = playerName;
    announcement.textContent = `🎉 ${playerName} WINS! BINGO!`;
    announcement.style.color = '#00ff9d';
    announcement.style.fontSize = '1.5rem';
    announcement.style.fontWeight = 'bold';
    
    // Show popup alert
    alert(`🏆 BINGO! 🏆\n\nPlayer: ${playerName}\n\nCompleted Lines:\n${result.lines.join('\n')}\n\nCongratulations!`);
    
    addChat('System', `🏆 ${playerName} got BINGO with ${result.lines.length} lines!`);
    
    if (ws && connected) {
      ws.send(JSON.stringify({ 
        type: 'winner', 
        player: playerName,
        lines: result.lines 
      }));
    }
  }
}

function showNumberSelector() {
  if (!gameStarted || winner) {
    addChat('System', 'Game not started or already won!');
    return;
  }
  
  if (!myTurn && connected) {
    addChat('System', `It's ${currentTurn}'s turn!`);
    return;
  }
  
  const all = Array.from({ length: 25 }, (_, i) => i + 1);
  const available = all.filter((n) => !called.includes(n));
  
  if (available.length === 0) {
    addChat('System', 'All numbers have been called!');
    return;
  }
  
  // Create a prompt with available numbers
  const numberStr = available.join(', ');
  const selected = prompt(`Your turn to call a number!\n\nAvailable numbers:\n${numberStr}\n\nEnter a number:`);
  
  if (selected === null) return; // Cancelled
  
  const num = parseInt(selected);
  
  if (!available.includes(num)) {
    alert('Invalid number! Please select an available number.');
    return;
  }
  
  callSpecificNumber(num);
}

function callSpecificNumber(num) {
  if (called.includes(num)) {
    addChat('System', `Number ${num} already called!`);
    return;
  }
  
  called.push(num);
  autoMarkCalled();
  renderCalled();
  renderBoard();
  checkAndAnnounceWin();
  
  addChat(playerName, `Called number: ${num}`);
  
  if (ws && connected) {
    ws.send(JSON.stringify({ 
      type: 'call', 
      number: num,
      caller: playerName
    }));
  }
}

function renderCalled() {
  calledDiv.innerHTML = '';
  if (called.length === 0) {
    calledDiv.innerHTML = '<div style="opacity: 0.5;">No numbers called yet</div>';
    return;
  }
  
  called.forEach((n, i) => {
    const div = document.createElement('div');
    div.textContent = n;
    if (i === called.length - 1) div.classList.add('last-called');
    calledDiv.appendChild(div);
  });
}

function updateTurnDisplay() {
  if (!gameStarted || winner) return;
  
  if (local) {
    announcement.textContent = 'Your turn! Click "Call Number"';
    myTurn = true;
  } else if (currentTurn === playerName) {
    announcement.textContent = '🎯 YOUR TURN! Click "Call Number"';
    announcement.style.color = '#00ff9d';
    myTurn = true;
  } else {
    announcement.textContent = `Waiting for ${currentTurn} to call...`;
    announcement.style.color = '#ff6cff';
    myTurn = false;
  }
}

function resetGame() {
  called = [];
  card = genCard();
  marked = Array(5).fill(0).map(() => Array(5).fill(false));
  gameStarted = false;
  winner = null;
  currentTurn = null;
  myTurn = false;
  renderBoard();
  renderCalled();
  announcement.textContent = 'Waiting...';
  announcement.style.color = '#f0f0f0';
  announcement.style.fontSize = '1rem';
  announcement.style.fontWeight = 'normal';
  
  if (ws && connected) {
    ws.send(JSON.stringify({ type: 'reset' }));
  }
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  connected = false;
  local = false;
  statusEl.textContent = 'Status: Disconnected';
  players = [];
  renderPlayers();
  roomDisplay.textContent = '';
}

joinBtn.onclick = () => {
  playerName = playerInput.value.trim() || playerName;
  playerInput.value = playerName;
  
  const url = wsInput.value.trim();
  const room = roomInput.value.trim();
  
  if (!url || !room) {
    addChat('System', 'Please enter WebSocket URL and Room ID');
    return;
  }
  
  if (ws) disconnect();
  
  local = false;
  statusEl.textContent = 'Status: Connecting...';
  
  try {
    ws = new WebSocket(url);
    
    ws.onopen = () => {
      connected = true;
      statusEl.textContent = 'Status: Connected ✓';
      roomDisplay.textContent = `Room: ${room}`;
      addChat('System', `Connected to room: ${room}`);
      ws.send(JSON.stringify({ 
        type: 'join', 
        player: playerName, 
        room: room 
      }));
    };
    
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      
      if (msg.type === 'players') {
        players = msg.players;
        renderPlayers();
        addChat('System', `Players in room: ${players.length}`);
      } else if (msg.type === 'start') {
        gameStarted = true;
        winner = null;
        called = [];
        card = genCard();
        marked = Array(5).fill(0).map(() => Array(5).fill(false));
        currentTurn = msg.firstPlayer;
        
        console.log('Game started! First player:', currentTurn);
        console.log('My name:', playerName);
        console.log('Is my turn?', currentTurn === playerName);
        
        renderBoard();
        renderCalled();
        updateTurnDisplay();
        renderPlayers();
        addChat('System', `Game started! ${currentTurn} goes first.`);
      } else if (msg.type === 'call') {
        if (!called.includes(msg.number)) {
          called.push(msg.number);
          autoMarkCalled();
          renderCalled();
          renderBoard();
          checkAndAnnounceWin();
          
          // Update turn to next player
          if (msg.nextPlayer) {
            currentTurn = msg.nextPlayer;
            updateTurnDisplay();
          }
          
          addChat(msg.caller, `Called number: ${msg.number}`);
        }
      } else if (msg.type === 'winner') {
        winner = msg.player;
        announcement.textContent = `🎉 ${msg.player} WINS! BINGO!`;
        announcement.style.color = '#ff00ff';
        announcement.style.fontSize = '1.5rem';
        announcement.style.fontWeight = 'bold';
        
        const linesText = msg.lines ? msg.lines.join('\n') : 'Multiple lines';
        alert(`🏆 BINGO! 🏆\n\nWinner: ${msg.player}\n\nCompleted Lines:\n${linesText}`);
        
        addChat('System', `🏆 ${msg.player} won with ${msg.lines ? msg.lines.length : 5} lines!`);
        renderPlayers();
      } else if (msg.type === 'reset') {
        called = [];
        gameStarted = false;
        winner = null;
        currentTurn = null;
        myTurn = false;
        marked = Array(5).fill(0).map(() => Array(5).fill(false));
        renderCalled();
        renderBoard();
        announcement.textContent = 'Game reset - waiting...';
        announcement.style.color = '#f0f0f0';
        announcement.style.fontSize = '1rem';
        announcement.style.fontWeight = 'normal';
        addChat('System', 'Game has been reset');
      } else if (msg.type === 'chat') {
        addChat(msg.player, msg.message);
      } else if (msg.type === 'error') {
        addChat('Server', msg.message);
      }
    };
    
    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      statusEl.textContent = 'Status: Error ✗';
      addChat('System', 'Connection error occurred');
    };
    
    ws.onclose = () => {
      connected = false;
      statusEl.textContent = 'Status: Disconnected';
      roomDisplay.textContent = '';
      addChat('System', 'Disconnected from server');
      players = [];
      renderPlayers();
    };
    
  } catch (err) {
    console.error('Failed to connect:', err);
    addChat('System', 'Failed to connect to server');
    statusEl.textContent = 'Status: Error ✗';
  }
};

localBtn.onclick = () => {
  if (connected) {
    disconnect();
  }
  
  local = !local;
  
  if (local) {
    statusEl.textContent = 'Status: Local Mode ⚡';
    roomDisplay.textContent = 'Local Game';
    players = [playerName];
    renderPlayers();
    addChat('System', 'Local mode enabled');
    gameStarted = true;
    resetGame();
    announcement.textContent = 'Your turn! Click "Call Number"';
    myTurn = true;
  } else {
    statusEl.textContent = 'Status: Disconnected';
    roomDisplay.textContent = '';
    players = [];
    renderPlayers();
    gameStarted = false;
    announcement.textContent = 'Waiting...';
  }
};

startBtn.onclick = () => {
  if (ws && connected) {
    ws.send(JSON.stringify({ 
      type: 'start', 
      numPlayers: parseInt(numPlayersSelect.value) 
    }));
  } else if (local) {
    gameStarted = true;
    resetGame();
    announcement.textContent = 'Your turn! Click "Call Number"';
    myTurn = true;
    addChat('System', 'Game started in local mode');
  } else {
    addChat('System', 'Please connect to a server or enable local mode first');
  }
};

callBtn.onclick = showNumberSelector;
resetBtn.onclick = resetGame;

sendChat.onclick = () => {
  const text = chatInput.value.trim();
  if (!text) return;
  
  if (ws && connected) {
    ws.send(JSON.stringify({ 
      type: 'chat', 
      player: playerName, 
      message: text 
    }));
    addChat(playerName, text);
  } else if (local) {
    addChat(playerName, text);
  } else {
    addChat('System', 'Not connected to server');
  }
  
  chatInput.value = '';
};

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendChat.click();
  }
});

function addChat(from, text) {
  const div = document.createElement('div');
  div.className = 'msg';
  const time = new Date().toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  div.innerHTML = `<small>${time}</small> <b>${from}:</b> ${text}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function renderPlayers() {
  playersList.innerHTML = '';
  if (players.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No players';
    li.style.opacity = '0.5';
    playersList.appendChild(li);
    return;
  }
  
  players.forEach(player => {
    const li = document.createElement('li');
    let displayText = player;
    
    if (player === currentTurn && gameStarted && !winner) {
      displayText = player + ' 🎯';
    }
    if (player === winner) {
      displayText = player + ' 🏆';
    }
    if (player === playerName) {
      li.style.color = '#00ff9d';
      li.style.fontWeight = 'bold';
    }
    
    li.textContent = displayText;
    playersList.appendChild(li);
  });
}

// ✅ Initialize game
resetGame();
addChat('System', 'Welcome to Future Bingo!');
addChat('System', 'Players take turns calling numbers. Get 5 complete lines to win!');