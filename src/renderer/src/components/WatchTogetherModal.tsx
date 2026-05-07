import React, { useState } from 'react';
import { Users, X, Link, Play, Copy, Check, Info } from 'lucide-react';

interface Props {
  isHost: boolean;
  roomId: string | null;
  participants: string[];
  isConnecting: boolean;
  error: string | null;
  startHosting: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  isOpen: boolean;
  onClose: () => void;
  debugLogs?: string[];
}

export function WatchTogetherModal({
  isHost,
  roomId,
  participants,
  isConnecting,
  error,
  startHosting,
  joinRoom,
  leaveRoom,
  isOpen,
  onClose,
  debugLogs = []
}: Props) {
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const stopPlayerInteraction = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const handleCopy = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeSession = roomId !== null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={stopPlayerInteraction}
      onPointerDown={stopPlayerInteraction}
      onPointerUp={stopPlayerInteraction}
      onPointerCancel={stopPlayerInteraction}
    >
      <div className="bg-[#121212] border border-white/10 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <h2 className="text-xl flex items-center gap-2 font-medium">
            <Users className="w-5 h-5 text-indigo-400" />
            Watch Together
          </h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          {isConnecting ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-white/60 mb-6">Connecting to network...</p>
              {debugLogs.length > 0 && (
                <div className="w-full bg-black/50 border border-white/5 rounded p-3 text-xs font-mono text-white/50 text-left overflow-y-auto max-h-32">
                  {debugLogs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          ) : activeSession ? (
            <div className="space-y-6">
               <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                 <p className="text-xs text-white/50 uppercase tracking-wider mb-2 font-medium">
                   {isHost ? 'Your Room Code' : 'Connected Room'}
                 </p>
                 <div className="flex items-center gap-3">
                   <div className="flex-1 bg-black/40 rounded py-2 px-3 tracking-widest font-mono text-center text-xl text-indigo-300">
                     {roomId}
                   </div>
                   {isHost && (
                     <button
                       onClick={handleCopy}
                       className="p-3 bg-indigo-500 hover:bg-indigo-600 rounded text-white transition-colors flex items-center justify-center"
                       title="Copy code"
                     >
                       {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                     </button>
                   )}
                 </div>
               </div>

               <div>
                 <div className="flex items-center justify-between mb-3">
                   <span className="text-sm font-medium text-white/70">Participants</span>
                   <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-white/60">
                     {isHost ? participants.length + 1 : 'Connected'} total
                   </span>
                 </div>
                 
                 {isHost ? (
                    participants.length === 0 ? (
                      <div className="text-center p-6 border border-dashed border-white/10 rounded-lg">
                        <Users className="w-8 h-8 text-white/20 mx-auto mb-2" />
                        <p className="text-sm text-white/40">Waiting for friends to join...</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded p-2 text-sm flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-indigo-400" />
                          You (Host)
                        </div>
                        {participants.map((p, i) => (
                           <div key={i} className="bg-white/5 border border-white/10 rounded p-2 text-sm flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-green-400" />
                             Guest {i + 1}
                           </div>
                        ))}
                      </div>
                    )
                 ) : (
                   <div className="p-4 bg-white/5 rounded-lg text-sm text-white/60 flex items-start gap-3">
                     <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                     <p>You are connected to the host. The host controls playback. Keep your video open.</p>
                   </div>
                 )}
               </div>

               <button
                 onClick={() => { leaveRoom(); onClose(); }}
                 className="w-full py-2.5 rounded bg-white/5 hover:bg-white/10 text-white/80 transition-colors text-sm font-medium"
               >
                 {isHost ? 'End Session' : 'Disconnect'}
               </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1 border border-white/10 p-5 rounded-xl bg-white/5 hover:bg-white/[0.07] transition-colors cursor-pointer group flex flex-col items-center justify-center text-center gap-3" onClick={() => startHosting()}>
                <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Play className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-medium text-white mb-1">Host Party</h3>
                  <p className="text-xs text-white/50">Create a room and share code</p>
                </div>
              </div>

              <div className="col-span-2 sm:col-span-1 border border-white/10 p-5 rounded-xl bg-white/5 flex flex-col justify-between">
                 <h3 className="font-medium text-white mb-3 text-center sm:text-left">Join Party</h3>
                 <input 
                   type="text" 
                   value={joinCode}
                   onChange={e => setJoinCode(e.target.value.toUpperCase())}
                   placeholder="CODE"
                   maxLength={6}
                   className="w-full bg-black/40 border border-white/10 rounded p-2 text-center text-lg font-mono tracking-widest text-white mb-3 focus:outline-none focus:border-indigo-500/50"
                 />
                 <button 
                   disabled={joinCode.length < 5}
                   onClick={() => joinRoom(joinCode)}
                   className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 rounded text-sm text-white font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
                 >
                   Join
                 </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
