// rooms.js — in-memory room/participant state

const rooms = new Map();

const ROOM_TTL_MS = 5 * 60 * 1000; // 5 minutes empty room grace period

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(hostSocketId, hostName) {
  let code;
  do { code = generateCode(); } while (rooms.has(code));

  const room = {
    code,
    participants: new Map([[hostSocketId, { id: hostSocketId, name: hostName, isHost: true }]]),
    hostId: hostSocketId,
    source: null,
    cleanupTimer: null,
  };
  rooms.set(code, room);
  return room;
}

function joinRoom(code, socketId, name) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }
  room.participants.set(socketId, { id: socketId, name, isHost: false });
  return room;
}

function leaveRoom(socketId) {
  for (const [code, room] of rooms.entries()) {
    if (!room.participants.has(socketId)) continue;
    room.participants.delete(socketId);

    if (room.participants.size === 0) {
      // Schedule cleanup
      room.cleanupTimer = setTimeout(() => rooms.delete(code), ROOM_TTL_MS);
      return { code, room, newHostId: null };
    }

    // Transfer host if needed
    let newHostId = null;
    if (room.hostId === socketId) {
      newHostId = room.participants.keys().next().value;
      room.hostId = newHostId;
      room.participants.get(newHostId).isHost = true;
    }
    return { code, room, newHostId };
  }
  return null;
}

function getRoom(code) {
  return rooms.get(code?.toUpperCase()) || null;
}

function getParticipantsList(room) {
  return Array.from(room.participants.values());
}

module.exports = { createRoom, joinRoom, leaveRoom, getRoom, getParticipantsList };
