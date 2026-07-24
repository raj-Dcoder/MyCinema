import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection, MediaConnection } from 'peerjs';
import { createPeerSetup, SyncMessage } from '../utils/p2pSync';

const generateShortId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const getUserName = () => localStorage.getItem('mycinema_user_name') || 'User';

interface Participant {
  peerId: string;
  name: string;
}

interface UseWatchTogetherReturn {
  isHost: boolean;
  roomId: string | null;
  participants: Participant[];
  localPeerId: string | null;
  isConnecting: boolean;
  error: string | null;
  voiceError: string | null;
  voiceEnabled: boolean;
  isMicActive: boolean;
  remoteAudioStreams: RemoteAudioStream[];
  startHosting: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  broadcastState: (msg: SyncMessage) => void;
  startVoiceSession: () => Promise<boolean>;
  setPushToTalkActive: (active: boolean) => void;
  onReceiveSyncObj: React.MutableRefObject<((msg: SyncMessage) => void) | null>;
  debugLogs: string[];
  notifications: { id: number; text: string }[];
}

interface RemoteAudioStream {
  peerId: string;
  stream: MediaStream;
}

export function useWatchTogether(): UseWatchTogetherReturn {
  const [isHost, setIsHost] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [remoteAudioStreams, setRemoteAudioStreams] = useState<RemoteAudioStream[]>([]);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    console.log("[WatchTogether]", msg);
    setDebugLogs(prev => [...prev, msg]);
  }, []);

  const peerRef = useRef<Peer | null>(null);
  const localPeerIdRef = useRef<string | null>(null);
  const connectionsRef = useRef<DataConnection[]>([]); // For host to maintain guests
  const hostConnectionRef = useRef<DataConnection | null>(null); // For guest to maintain host
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaCallsRef = useRef<MediaConnection[]>([]);
  const onReceiveSyncObj = useRef<((msg: SyncMessage) => void) | null>(null);
  const participantsRef = useRef<Participant[]>([]);
  const hostNameRef = useRef<string>('Host');
  const notifCounterRef = useRef(0);

  const [notifications, setNotifications] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const addNotification = useCallback((text: string) => {
    const id = ++notifCounterRef.current;
    setNotifications(prev => [...prev, { id, text }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  const stopVoice = useCallback(() => {
    mediaCallsRef.current.forEach(call => call.close());
    mediaCallsRef.current = [];
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setRemoteAudioStreams([]);
    setVoiceEnabled(false);
    setIsMicActive(false);
  }, []);

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
    localPeerIdRef.current = null;
    stopVoice();
    setRoomId(null);
    setIsHost(false);
    setParticipants([]);
    setIsConnecting(false);
    if (clearError) setError(null);
  }, [stopVoice]);

  const handleRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    setRemoteAudioStreams(prev => {
      const next = prev.filter(item => item.peerId !== peerId);
      return [...next, { peerId, stream }];
    });
  }, []);

  const removeRemoteStream = useCallback((peerId: string) => {
    setRemoteAudioStreams(prev => prev.filter(item => item.peerId !== peerId));
  }, []);

  const wireMediaCall = useCallback((call: MediaConnection) => {
    mediaCallsRef.current = mediaCallsRef.current.filter(existing => existing.peer !== call.peer);
    mediaCallsRef.current.push(call);
    call.on('stream', (stream) => handleRemoteStream(call.peer, stream));
    call.on('close', () => {
      mediaCallsRef.current = mediaCallsRef.current.filter(existing => existing !== call);
      removeRemoteStream(call.peer);
    });
    call.on('error', (err: any) => {
      addLog(`[Voice] Call error with ${call.peer}: ${err.message || 'Unknown error'}`);
      setVoiceError(err.message || 'Voice call failed.');
    });
  }, [addLog, handleRemoteStream, removeRemoteStream]);

  const bindIncomingVoiceCalls = useCallback((peer: Peer) => {
    peer.on('call', (call: MediaConnection) => {
      if (!localStreamRef.current) {
        addLog(`[Voice] Incoming call from ${call.peer}, but mic is not enabled yet.`);
        call.close();
        return;
      }
      call.answer(localStreamRef.current);
      wireMediaCall(call);
    });
  }, [addLog, wireMediaCall]);

  const connectVoiceToPeer = useCallback((peerId: string) => {
    if (!peerRef.current || !localStreamRef.current) return;
    if (mediaCallsRef.current.some(call => call.peer === peerId)) return;
    const call = peerRef.current.call(peerId, localStreamRef.current);
    wireMediaCall(call);
  }, [wireMediaCall]);

  const handleIncomingMessage = useCallback((data: unknown, senderPeer?: string) => {
    // Basic validation
    if (data && typeof data === 'object' && 'type' in data) {
      const msg = data as any;
      if (msg.type === 'USER_INFO' && senderPeer) {
        setParticipants(prev =>
          prev.some(p => p.peerId === senderPeer)
            ? prev.map(p => p.peerId === senderPeer ? { ...p, name: msg.name || 'Guest' } : p)
            : [...prev, { peerId: senderPeer, name: msg.name || 'Guest' }]
        );
        addNotification(`${msg.name || 'Guest'} joined`);
        return;
      }
      if (msg.type === 'HOST_INFO' && senderPeer) {
        hostNameRef.current = msg.name || 'Host';
        setParticipants(prev => {
          const exists = prev.some(p => p.peerId === senderPeer);
          return exists
            ? prev.map(p => p.peerId === senderPeer ? { ...p, name: msg.name || 'Host' } : p)
            : [...prev, { peerId: senderPeer, name: msg.name || 'Host' }];
        });
        return;
      }
      if (msg.type === 'USER_LEFT') {
        addNotification(`${msg.name || 'Someone'} left`);
        setParticipants(prev => prev.filter(p => p.name !== msg.name));
        return;
      }
      if ('time' in msg) {
        const syncMsg = { ...msg, speakerId: msg.speakerId || senderPeer };
        if (onReceiveSyncObj.current) {
          onReceiveSyncObj.current(syncMsg);
        }
      }
    }
  }, [addNotification]);

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
        localPeerIdRef.current = id;
        setIsHost(true);
        setRoomId(newRoomId);
        setIsConnecting(false);
      });

      bindIncomingVoiceCalls(peer);

peer.on('connection', (conn: any) => {
        addLog(`[Host] Incoming connection from: ${conn.peer}`);
        conn.on('open', () => {
          addLog(`[Host] Connection OPEN: ${conn.peer}`);
          connectionsRef.current.push(conn);
          const hostName = getUserName();
          setParticipants(prev => [...prev, { peerId: conn.peer, name: 'Guest' }]);
          conn.send({ type: 'HOST_INFO', time: 0, name: hostName });

          conn.on('data', (data: any) => {
            handleIncomingMessage(data, conn.peer);
            if (data && typeof data === 'object' && 'type' in data && ['TALK_START', 'TALK_END'].includes(data.type)) {
              connectionsRef.current.forEach(other => {
                if (other.open && other.peer !== conn.peer) other.send({ ...data, speakerId: conn.peer });
              });
            }
          });

          conn.on('close', () => {
            addLog(`[Host] Connection CLOSED: ${conn.peer}`);
            const left = participantsRef.current.find(p => p.peerId === conn.peer);
            connectionsRef.current = connectionsRef.current.filter(c => c.peer !== conn.peer);
            setParticipants(prev => prev.filter(p => p.peerId !== conn.peer));
            removeRemoteStream(conn.peer);
            if (left) addNotification(`${left.name} left`);
          });

          if (localStreamRef.current) connectVoiceToPeer(conn.peer);
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
  }, [cleanup, addLog, bindIncomingVoiceCalls, connectVoiceToPeer, handleIncomingMessage, removeRemoteStream]);

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
      localPeerIdRef.current = peer.id;
      const fullHostId = `mycinema-wt-${idToJoin.toUpperCase()}`;
      const conn = peer.connect(fullHostId, { reliable: true });

      conn.on('open', () => {
        hostConnectionRef.current = conn;
        setIsHost(false);
        setRoomId(idToJoin.toUpperCase());
        setIsConnecting(false);
        const guestName = getUserName();
        conn.send({ type: 'USER_INFO', time: 0, name: guestName });

        conn.on('data', (data: any) => {
          handleIncomingMessage(data, fullHostId);
        });

        conn.on('close', () => {
          const hostName = hostNameRef.current;
          addNotification(`${hostName} left (session ended)`);
          setError(`${hostName} disconnected.`);
          cleanup(false);
        });
      });

      conn.on('error', (err: any) => {
        setError('Failed to connect to host.');
        setIsConnecting(false);
        cleanup(false);
      });
    });

    bindIncomingVoiceCalls(peer);

    peer.on('error', (err) => {
      setError(err.message);
      setIsConnecting(false);
      cleanup();
    });
  }, [cleanup, addLog, bindIncomingVoiceCalls, connectVoiceToPeer, handleIncomingMessage, removeRemoteStream]);

  const broadcastState = useCallback((msg: SyncMessage) => {
    if (isHost) {
      connectionsRef.current.forEach(conn => {
        if (conn.open) {
          conn.send(msg);
        }
      });
    }
    else if (hostConnectionRef.current && hostConnectionRef.current.open) {
      hostConnectionRef.current.send(msg);
    }
  }, [isHost]);

  const startVoiceSession = useCallback(async () => {
    if (localStreamRef.current) return true;
    try {
      setVoiceError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      stream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
      localStreamRef.current = stream;
      setVoiceEnabled(true);

      if (isHost) {
        connectionsRef.current.forEach(conn => connectVoiceToPeer(conn.peer));
      } else {
        const hostPeerId = `mycinema-wt-${roomId}`;
        if (roomId) connectVoiceToPeer(hostPeerId);
      }

      return true;
    } catch (err: any) {
      setVoiceError(err.message || 'Microphone permission was denied.');
      return false;
    }
  }, [connectVoiceToPeer, isHost, roomId]);

  const setPushToTalkActive = useCallback((active: boolean) => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(track => {
      track.enabled = active;
    });
    setIsMicActive(active);
  }, []);

  const leaveRoom = useCallback(() => {
    const name = getUserName();
    broadcastState({ type: 'USER_LEFT', time: 0, name });
    setTimeout(() => cleanup(), 100);
  }, [broadcastState, cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isHost,
    roomId,
    participants,
    localPeerId: localPeerIdRef.current,
    isConnecting,
    error,
    voiceError,
    voiceEnabled,
    isMicActive,
    remoteAudioStreams,
    startHosting,
    joinRoom,
    leaveRoom,
    broadcastState,
    startVoiceSession,
    setPushToTalkActive,
    onReceiveSyncObj,
    debugLogs,
    notifications
  };
}
