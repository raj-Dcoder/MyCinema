import React, { useState } from 'react';
import { Users, X, Play, Copy, Check } from 'lucide-react';

const getUserName = () => localStorage.getItem('mycinema_user_name') || 'User';

interface Props {
  isHost: boolean;
  roomId: string | null;
  participants: { peerId: string; name: string }[];
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={stopPlayerInteraction}
      onPointerDown={stopPlayerInteraction}
      onPointerUp={stopPlayerInteraction}
      onPointerCancel={stopPlayerInteraction}
    >
      <div className="watch-together-modal keep-dark dark bg-[#121218]/95 border border-white/15 rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.8)] backdrop-blur-2xl w-full max-w-md overflow-hidden flex flex-col text-white animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Watch Together</h2>
              <p className="text-[11px] text-white/50 font-medium">Sync playback with friends</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all active:scale-95 border border-white/5"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl text-xs font-semibold flex items-center gap-2">
              <span>{error}</span>
            </div>
          )}

          {isConnecting ? (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-white/70 mb-4">Connecting to network…</p>
              {debugLogs.length > 0 && (
                <div className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-xs font-mono text-white/50 text-left overflow-y-auto max-h-32">
                  {debugLogs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          ) : activeSession ? (
            <div className="space-y-5">
              <div className="bg-white/[0.03] rounded-xl p-4 border border-white/10">
                <p className="text-[10px] text-white/50 uppercase tracking-[0.16em] mb-2 font-bold">
                  {isHost ? 'Your Room Code' : 'Connected Room'}
                </p>
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 bg-black/40 rounded-lg py-2.5 px-3 tracking-[0.2em] font-mono text-center text-xl font-bold text-indigo-300 border border-white/5">
                    {roomId}
                  </div>
                  {isHost && (
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="h-11 px-4 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-md shadow-indigo-600/30"
                      title="Copy code"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span className="text-xs font-bold">{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/60">Participants</span>
                  <span className="text-[10px] font-bold bg-white/10 px-2.5 py-0.5 rounded-full text-white/70">
                    {isHost ? participants.length + 1 : 'Connected'} total
                  </span>
                </div>
                
                {isHost ? (
                  participants.length === 0 ? (
                    <div className="text-center p-6 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
                      <Users className="w-8 h-8 text-white/20 mx-auto mb-2" />
                      <p className="text-xs font-medium text-white/40">Waiting for friends to join…</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-2.5 text-xs font-semibold flex items-center gap-2 text-indigo-300">
                        <div className="w-2 h-2 rounded-full bg-indigo-400" />
                        {getUserName()} (Host)
                      </div>
                      {participants.map((p, i) => (
                        <div key={p.peerId || i} className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs font-medium flex items-center gap-2 text-white/80">
                          <div className="w-2 h-2 rounded-full bg-emerald-400" />
                          {p.name || 'Guest'}
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-2.5 text-xs font-semibold flex items-center gap-2 text-indigo-300">
                      <div className="w-2 h-2 rounded-full bg-indigo-400" />
                      {participants.length > 0 ? `${participants[0].name} (Host)` : 'Host'}
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs font-medium flex items-center gap-2 text-white/80">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      You
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => { leaveRoom(); onClose(); }}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 border border-white/10 text-white/70 transition-all text-xs font-bold uppercase tracking-wider active:scale-98"
              >
                {isHost ? 'End Session' : 'Disconnect'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => startHosting()}
                className="col-span-2 sm:col-span-1 border border-white/10 p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] hover:border-indigo-500/40 transition-all cursor-pointer group flex flex-col items-center justify-center text-center gap-3 active:scale-98"
              >
                <div className="w-12 h-12 bg-indigo-500/15 border border-indigo-500/25 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-500/25 transition-all text-indigo-400">
                  <Play className="w-5 h-5 fill-indigo-400 ml-0.5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm mb-1 group-hover:text-indigo-200 transition-colors">Host Party</h3>
                  <p className="text-[11px] text-white/50 leading-snug">Create room & share code with friends</p>
                </div>
              </button>

              <div className="col-span-2 sm:col-span-1 border border-white/10 p-5 rounded-2xl bg-white/[0.03] flex flex-col justify-between">
                <h3 className="font-bold text-white text-sm mb-3 text-center sm:text-left">Join Party</h3>
                <input 
                  type="text" 
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="CODE"
                  maxLength={6}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-2 px-3 text-center text-lg font-mono tracking-widest text-white placeholder:text-white/20 mb-3 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/40 transition-all"
                />
                <button 
                  type="button"
                  disabled={joinCode.length < 5}
                  onClick={() => joinRoom(joinCode)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition-all shadow-md shadow-indigo-600/30 cursor-pointer disabled:cursor-not-allowed active:scale-98"
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
