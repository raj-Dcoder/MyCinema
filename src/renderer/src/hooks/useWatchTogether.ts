import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { createPeerSetup, SyncMessage } from '../utils/p2pSync';

const generateShortId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

interface UseWatchTogetherReturn {
  isHost: boolean;
  roomId: string | null;
  participants: string[];
  isConnecting: boolean;
  error: string | null;
  startHosting: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  broadcastState: (msg: SyncMessage) => void;
  onReceiveSyncObj: React.MutableRefObject<((msg: SyncMessage) => void) | null>;
  debugLogs: string[];
}

export function useWatchTogether(): UseWatchTogetherReturn {
  const [isHost, setIsHost] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    console.log("[WatchTogether]", msg);
    setDebugLogs(prev => [...prev, msg]);
  }, []);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<DataConnection[]>([]); // For host to maintain guests
  const hostConnectionRef = useRef<DataConnection | null>(null); // For guest to maintain host
  const onReceiveSyncObj = useRef<((msg: SyncMessage) => void) | null>(null);

  const cleanup = useCallback((clearError = true) => {
    connectionsRef.current.forEach(c => c.close());
    connectionsRef.current = [];
    if (hostConnectionRef.current) {
      hostConnectionRef.current.close();
      hostConnectionRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setRoomId(null);
    setIsHost(false);
    setParticipants([]);
    setIsConnecting(false);
    if (clearError) setError(null);
  }, []);

  const handleIncomingMessage = (data: unknown) => {
    // Basic validation
    if (data && typeof data === 'object' && 'type' in data && 'time' in data) {
      const msg = data as SyncMessage;
      if (onReceiveSyncObj.current) {
        onReceiveSyncObj.current(msg);
      }
    }
  };

  const startHosting = useCallback(() => {
    cleanup();
    setIsConnecting(true);
    setDebugLogs(['[Host] Initiating connection...']);
    const newRoomId = generateShortId();
    // Prefix with something unique to avoid public ID collisions 
    const fullId = `mycinema-wt-${newRoomId}`;
    
    addLog(`[Host] Created ID: ${fullId}. Creating Peer object...`);
    
    // Safety timeout
    const timeoutInfo = setTimeout(() => {
      addLog(`[Host] 20 seconds elapsed. Still no open event. PeerJS might be blocked or invalid.`);
      setError('Connection timed out. PeerJS server unreachable or blocked.');
      setIsConnecting(false);
    }, 20000);

    try {
      const peer = createPeerSetup(fullId);
      peerRef.current = peer;

      addLog(`[Host] Peer object instantiated. Binding events...`);

      peer.on('open', (id) => {
        clearTimeout(timeoutInfo);
        addLog(`[Host] Peer OPEN event fired! ID: ${id}`);
        setIsHost(true);
        setRoomId(newRoomId);
        setIsConnecting(false);
      });

      peer.on('connection', (conn: any) => {
        addLog(`[Host] Incoming connection from: ${conn.peer}`);
        conn.on('open', () => {
          addLog(`[Host] Connection OPEN: ${conn.peer}`);
          connectionsRef.current.push(conn);
          setParticipants(prev => [...prev, conn.peer]);
          
          conn.on('data', (data: any) => {
             // Wait, as host do we expect messages from guests? 
          });

          conn.on('close', () => {
            addLog(`[Host] Connection CLOSED: ${conn.peer}`);
            connectionsRef.current = connectionsRef.current.filter(c => c.peer !== conn.peer);
            setParticipants(prev => prev.filter(p => p !== conn.peer));
          });
        });
      });

      peer.on('error', (err: any) => {
        clearTimeout(timeoutInfo);
        addLog(`[Host] Peer ERROR: ${err.message || 'Unknown error'}`);
        setError(err.message || 'Connection failed.');
        setIsConnecting(false);
        cleanup(false);
      });
    } catch (e: any) {
      clearTimeout(timeoutInfo);
      addLog(`[Host] Error during instantiation: ${e.message}`);
      setError(e.message);
      setIsConnecting(false);
    }
  }, [cleanup, addLog]);

  const joinRoom = useCallback((idToJoin: string) => {
    cleanup();
    setIsConnecting(true);
    addLog(`[Guest] Attempting to join ${idToJoin}, initializing peer...`);
    
    // Safety timeout for guest
    const timeoutInfo = setTimeout(() => {
      addLog(`[Guest] 20 seconds elapsed. PeerJS open event never fired. Server unreachable.`);
      setError('Connection timed out while joining. PeerJS server unreachable.');
      setIsConnecting(false);
    }, 20000);

    const peer = createPeerSetup();
    peerRef.current = peer;

    peer.on('open', () => {
      clearTimeout(timeoutInfo);
      addLog(`[Guest] Peer OPEN event fired! Connecting to host...`);
      const fullHostId = `mycinema-wt-${idToJoin.toUpperCase()}`;
      const conn = peer.connect(fullHostId, { reliable: true });

      conn.on('open', () => {
        hostConnectionRef.current = conn;
        setIsHost(false);
        setRoomId(idToJoin.toUpperCase());
        setIsConnecting(false);

        conn.on('data', (data: any) => {
          handleIncomingMessage(data);
        });

        conn.on('close', () => {
          setError('Host disconnected.');
          cleanup(false);
        });
      });

      conn.on('error', (err: any) => {
        setError('Failed to connect to host.');
        setIsConnecting(false);
        cleanup(false);
      });
    });

    peer.on('error', (err) => {
      setError(err.message);
      setIsConnecting(false);
      cleanup();
    });
  }, [cleanup]);

  const broadcastState = useCallback((msg: SyncMessage) => {
    if (isHost) {
      connectionsRef.current.forEach(conn => {
        if (conn.open) {
          conn.send(msg);
        }
      });
    }
    // Alternatively, if guest sends something, we can send to host directly
    // else if (hostConnectionRef.current && hostConnectionRef.current.open) {
    //   hostConnectionRef.current.send(msg);
    // }
  }, [isHost]);

  const leaveRoom = useCallback(() => {
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isHost,
    roomId,
    participants,
    isConnecting,
    error,
    startHosting,
    joinRoom,
    leaveRoom,
    broadcastState,
    onReceiveSyncObj,
    debugLogs
  };
}
