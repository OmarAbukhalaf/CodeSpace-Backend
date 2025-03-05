const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://codespaceapp.vercel.app",
    methods: ["GET", "POST"],
  },
});

const MAX_ROOM_CAPACITY = 10; // Limit room capacity
const roomData = {};
const userRooms = {};
let roomCount = 0;  // Variable to track the number of rooms created

// Validate room ID and passcode format
const isValidRoomCredentials = (roomId, passcode) => {
  return (
    typeof roomId === 'string' && 
    typeof passcode === 'string' && 
    roomId.length >= 4 && 
    passcode.length >= 4
  );
};

// Function to broadcast user count for a room
const broadcastUserCount = (roomId) => {
  if (roomData[roomId]) {
    io.to(roomId).emit("userCountUpdate", roomData[roomId].users.size);
  }
};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("createRoom", () => {
    // Generate more secure random room ID and passcode
    const roomId = Math.random().toString(36).substring(2, 8);
    const passcode = Math.random().toString(36).substring(2, 8);

    roomData[roomId] = { 
      passcode, 
      code: "", 
      users: new Set(),
      createdAt: Date.now()
    }; 
    roomCount++;  // Increment the room creation count
    console.log(`Room created: ${roomId}, Passcode: ${passcode}`);

    socket.emit("roomCreated", { roomId, passcode });
    io.emit("roomCountUpdate", roomCount); // Broadcast the current room count to all clients
  });

  socket.on("joinRoom", (data) => {
    const { roomId, passcode } = data;

    // Validate input
    if (!isValidRoomCredentials(roomId, passcode)) {
      socket.emit("error", "Invalid room credentials");
      return;
    }

    // Check if room exists
    if (!roomData[roomId]) {
      socket.emit("error", "Room does not exist.");
      return;
    }

    // Check passcode
    if (roomData[roomId].passcode !== passcode) {
      socket.emit("error", "Incorrect passcode.");
      return;
    }

    // Check room capacity
    if (roomData[roomId].users.size >= MAX_ROOM_CAPACITY) {
      socket.emit("error", "Room is full.");
      return;
    }

    socket.join(roomId);
    roomData[roomId].users.add(socket.id);
    userRooms[socket.id] = roomId;

    console.log(`User ${socket.id} joined room ${roomId}`);

    // Broadcast the updated user count
    broadcastUserCount(roomId);

    // Send current code to newly joined user
    socket.emit("codeUpdate", roomData[roomId].code);
  });

  socket.on("leaveRoom", (data) => {
    const { roomId, passcode } = data;

    if (roomId && roomData[roomId]) {
      roomData[roomId].users.delete(socket.id);
      delete userRooms[socket.id];

      socket.leave(roomId);
      broadcastUserCount(roomId);

      if (roomData[roomId].users.size === 0) {
        delete roomData[roomId]; 
        roomCount--;  // Decrease the room count when the room is deleted
        console.log(`Room ${roomId} deleted (empty)`);

        io.emit("roomCountUpdate", roomCount); // Broadcast updated room count to all clients
      }
    }
  });

  socket.on("codeChange", (newCode) => {
    const roomId = userRooms[socket.id];

    if (roomId && roomData[roomId]) {
      // Optional: Add code size limit
      if (typeof newCode === 'string' && newCode.length <= 100000) {
        roomData[roomId].code = newCode;
        socket.to(roomId).emit("codeUpdate", newCode);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    const roomId = userRooms[socket.id];

    if (roomId && roomData[roomId]) {
      roomData[roomId].users.delete(socket.id);
      delete userRooms[socket.id];

      broadcastUserCount(roomId);

      if (roomData[roomId].users.size === 0) {
        delete roomData[roomId]; 
        roomCount--;  // Decrease the room count when the room is deleted
        console.log(`Room ${roomId} deleted (empty)`);

        io.emit("roomCountUpdate", roomCount); // Broadcast updated room count to all clients
      }
    }
  });
});

server.listen(4000, () => console.log("Server running on port 4000"));
