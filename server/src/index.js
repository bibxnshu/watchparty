// index.js — Express + Socket.io wiring

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { createRoom, joinRoom, leaveRoom, getRoom, getParticipantsList } = require('./rooms');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 4000;

// ── REST ──────────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', time: Date.now() }));

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ── room:create ────────────────────────────────────────────────────────────
  socket.on('room:create', ({ name }, cb) => {
    const room = createRoom(socket.id, name || 'Host');
    socket.join(room.code);
    console.log(`[room:create] ${room.code} by ${name}`);
    cb({
      ok: true,
      code: room.code,
      participants: getParticipantsList(room),
    });
  });

  // ── room:join ──────────────────────────────────────────────────────────────
  socket.on('room:join', ({ code, name }, cb) => {
    const room = joinRoom(code, socket.id, name || 'Guest');
    if (!room) return cb({ ok: false, error: 'Room not found' });

    socket.join(room.code);
    console.log(`[room:join] ${code} by ${name}`);

    const participants = getParticipantsList(room);

    // Notify others
    socket.to(room.code).emit('room:participants', participants);

    cb({ ok: true, code: room.code, participants });
  });


  // ── chat:message ───────────────────────────────────────────────────────────
  socket.on('chat:message', ({ text }) => {
    console.log(`[chat:message] from ${socket.id}: ${text}`);
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const participant = room.participants.get(socket.id);
    const msg = {
      id: `${Date.now()}-${socket.id.slice(0, 4)}`,
      senderId: socket.id,
      senderName: participant?.name || 'Unknown',
      text,
      timestamp: Date.now(),
    };

    socket.to(room.code).emit('chat:message', msg);
  });

  // ── chat:typing ────────────────────────────────────────────────────────────
  socket.on('chat:typing', ({ senderName }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    socket.to(room.code).emit('chat:typing', { senderName });
  });


  // ── playback:command ───────────────────────────────────────────────────────
  socket.on('playback:command', (cmd) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    socket.to(room.code).emit('playback:command', cmd);
  });

  // ── WebRTC Signaling ───────────────────────────────────────────────────────
  socket.on('webrtc:offer', ({ targetId, sdp }) => {
    console.log(`[webrtc:offer] ${socket.id} -> ${targetId}`);
    socket.to(targetId).emit('webrtc:offer', { senderId: socket.id, sdp });
  });

  socket.on('webrtc:answer', ({ targetId, sdp }) => {
    console.log(`[webrtc:answer] ${socket.id} -> ${targetId}`);
    socket.to(targetId).emit('webrtc:answer', { senderId: socket.id, sdp });
  });

  socket.on('webrtc:ice-candidate', ({ targetId, candidate }) => {
    socket.to(targetId).emit('webrtc:ice-candidate', { senderId: socket.id, candidate });
  });

  // ── disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    const result = leaveRoom(socket.id);
    if (!result) return;

    const { code, room } = result;
    if (room.participants.size > 0) {
      io.to(code).emit('room:participants', getParticipantsList(room));
    }
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────
function getRoomBySocket(socketId) {
  // Find room by iterating socket rooms
  const socketRooms = io.sockets.sockets.get(socketId)?.rooms;
  if (!socketRooms) return null;
  for (const r of socketRooms) {
    if (r !== socketId) {
      const room = getRoom(r);
      if (room) return room;
    }
  }
  return null;
}

server.listen(PORT, () => {
  console.log(`\n🎬  WatchParty server running on http://localhost:${PORT}\n`);
});
