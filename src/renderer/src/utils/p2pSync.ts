import PeerJs, { Peer } from 'peerjs';

// Handle ESM / CJS module interop safely for Vite
const PeerClass = (PeerJs && (PeerJs as any).Peer) || (PeerJs && (PeerJs as any).default) || PeerJs;

export type SyncMessage = {
  type: 'PLAY' | 'PAUSE' | 'SEEK' | 'SYNC' | 'SPEED' | 'TALK_START' | 'TALK_END';
  time: number;
  rate?: number;
  speakerId?: string;
};

export const createPeerSetup = (id?: string): Peer => {
  // Use public STUN servers for better connectivity
  const options = {
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    path: '/',
    debug: 3, // Enable high-level debug logging for PeerJS
    pingInterval: 5000,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    }
  };
  try {
    return id ? new PeerClass(id, options) : new PeerClass(options);
  } catch (err: any) {
    console.error("PeerJS Constructor Error:", err);
    throw err;
  }
};
