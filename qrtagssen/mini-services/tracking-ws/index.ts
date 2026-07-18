import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT) || 3005;

// ── HTTP handler for health check ────────────────────────────
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'qrtags-websocket',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      connections: io?.sockets.sockets.size || 0,
    }));
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Types ────────────────────────────────────────────────────

interface JoinPayload {
  reference: string;
}

interface BroadcastPayload {
  reference: string;
  data: Record<string, unknown>;
}

// ── Connection handling ──────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[tracking-ws] client connected: ${socket.id}`);

  /**
   * Client joins a room specific to a tag reference.
   * Room name format: tag:<reference>  (e.g. tag:TAG-HOTEL-MLQGY7)
   */
  socket.on('join', (payload: JoinPayload) => {
    const { reference } = payload;

    if (!reference || typeof reference !== 'string') {
      console.warn(`[tracking-ws] invalid join payload from ${socket.id}`);
      return;
    }

    const room = `tag:${reference}`;
    socket.join(room);
    console.log(`[tracking-ws] ${socket.id} joined room ${room}`);
  });

  /**
   * Broadcast a scan event to everyone tracking the same reference.
   */
  socket.on('broadcast', (payload: BroadcastPayload) => {
    const { reference, data } = payload;

    if (!reference || typeof reference !== 'string') {
      console.warn(`[tracking-ws] invalid broadcast payload from ${socket.id}`);
      return;
    }

    const room = `tag:${reference}`;
    const enriched = {
      ...data,
      _broadcastAt: new Date().toISOString(),
      _source: socket.id,
    };

    io.to(room).emit('scan-event', enriched);
    console.log(`[tracking-ws] broadcast to ${room}:`, enriched);
  });

  socket.on('disconnect', (reason) => {
    console.log(`[tracking-ws] client disconnected: ${socket.id} (${reason})`);
  });

  socket.on('error', (err) => {
    console.error(`[tracking-ws] socket error (${socket.id}):`, err);
  });
});

// ── Start server ─────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[tracking-ws] QRTags WebSocket server running on port ${PORT}`);
});

// ── Graceful shutdown ────────────────────────────────────────

function shutdown(signal: string) {
  console.log(`[tracking-ws] received ${signal}, shutting down…`);
  io.close();
  httpServer.close(() => {
    console.log('[tracking-ws] server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
