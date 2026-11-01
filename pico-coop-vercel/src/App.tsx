import { useCallback, useEffect, useRef, useState } from 'react';
import Peer, { DataConnection } from 'peerjs';
import {
  HEIGHT, LEVELS, WIDTH, WorldState, InputState, makeWorld, stepWorld, emptyInput
} from './game';

type Role = 'host' | 'guest';
type Phase = 'menu' | 'waiting' | 'playing' | 'done';
type Packet =
  | { type: 'join'; name: string }
  | { type: 'input'; input: InputState }
  | { type: 'state'; world: WorldState }
  | { type: 'restart' };

const queryRoom = new URLSearchParams(window.location.search).get('room') || '';

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
}

function drawWorld(canvas: HTMLCanvasElement, world: WorldState) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const level = LEVELS[world.level];
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, '#171e32'); bg.addColorStop(1, '#252f48');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Soft distant hills and stars.
  ctx.fillStyle = 'rgba(122, 151, 207, .12)';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath(); ctx.arc(i * 175 - 25, 455, 100 + (i % 3) * 16, Math.PI, 0); ctx.fill();
  }
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 34; i++) {
    const x = (i * 137 + 29) % WIDTH, y = (i * 71 + 19) % 270;
    ctx.globalAlpha = .23 + (i % 3) * .12; ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;

  // Goal marker.
  ctx.fillStyle = '#4b5872'; roundedRect(ctx, 862, 408, 64, 84, 12);
  ctx.fillStyle = '#e5f0ff'; roundedRect(ctx, 873, 419, 42, 73, 9);
  ctx.fillStyle = canExit(world, level) ? '#5be0b5' : '#ffc66d';
  ctx.beginPath(); ctx.arc(905, 455, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8d9ab4'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('EXIT', 894, 401);

  // Platforms.
  for (const p of level.platforms) {
    ctx.fillStyle = '#52617d'; roundedRect(ctx, p.x, p.y, p.w, p.h, 7);
    ctx.fillStyle = '#8192b6'; roundedRect(ctx, p.x, p.y, p.w, 6, 4);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    for (let x = p.x + 14; x < p.x + p.w - 8; x += 30) ctx.fillRect(x, p.y + 10, 12, 2);
  }

  // Switches.
  if (level.pads) {
    level.pads.forEach((px, i) => {
      ctx.fillStyle = world.gateOpen ? '#64e7bb' : '#f5bd61';
      roundedRect(ctx, px - 28, 478, 56, 13, 6);
      ctx.fillStyle = '#1b2436'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(`SWITCH ${i + 1}`, px, 474);
    });
  }

  // Gate.
  if (level.gateX !== undefined && !world.gateOpen) {
    ctx.fillStyle = '#ee7890'; roundedRect(ctx, level.gateX, 360, 24, 132, 7);
    ctx.fillStyle = '#ffd5df';
    for (let y = 370; y < 486; y += 16) ctx.fillRect(level.gateX + 5, y, 14, 4);
  }

  // Key.
  if (level.key && !world.keyTaken) {
    ctx.save(); ctx.translate(level.key.x, level.key.y);
    ctx.shadowColor = '#ffce68'; ctx.shadowBlur = 20;
    ctx.strokeStyle = '#ffce68'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(-5, -2, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 3); ctx.lineTo(19, 18); ctx.lineTo(14, 23); ctx.moveTo(12, 11); ctx.lineTo(7, 16); ctx.stroke();
    ctx.restore();
  }

  // Players.
  world.players.forEach((p, i) => {
    const colors = i === 0 ? { main: '#61d8ff', shade: '#268eb8' } : { main: '#ff9b72', shade: '#c75e55' };
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, p.y + p.h + 3, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.shade; roundedRect(ctx, p.x, p.y + 5, p.w, p.h - 4, 10);
    ctx.fillStyle = colors.main; roundedRect(ctx, p.x + 2, p.y, p.w - 4, p.h - 5, 10);
    ctx.fillStyle = '#172033';
    ctx.beginPath(); ctx.arc(p.x + 12, p.y + 17, 2.6, 0, Math.PI * 2); ctx.arc(p.x + 23, p.y + 17, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(i === 0 ? 'P1' : 'P2', p.x + p.w / 2, p.y - 8);
  });

  // HUD inside game frame.
  ctx.textAlign = 'left'; ctx.fillStyle = '#eef4ff'; ctx.font = 'bold 17px system-ui';
  ctx.fillText(`LEVEL ${world.level + 1} / ${LEVELS.length}`, 24, 34);
  ctx.fillStyle = '#a9b8d4'; ctx.font = '13px system-ui'; ctx.fillText(level.name, 24, 55);
  if (level.pads) {
    ctx.fillStyle = '#a9b8d4'; ctx.fillText(`Switch charge: ${Math.round(world.padCharge * 100)}%`, 24, 78);
  } else if (level.key) {
    ctx.fillStyle = world.keyTaken ? '#70e1bc' : '#ffce68';
    ctx.fillText(world.keyTaken ? 'KEY FOUND ✓' : 'Find the key ✦', 24, 78);
  }
  if (world.complete) {
    ctx.fillStyle = 'rgba(9,13,23,.72)'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = 'bold 48px system-ui';
    ctx.fillText('TEAMWORK!', WIDTH / 2, 235);
    ctx.fillStyle = '#aeeedb'; ctx.font = '20px system-ui'; ctx.fillText('You cleared every level together.', WIDTH / 2, 278);
  }
}

function canExit(world: WorldState, level: typeof LEVELS[number]) {
  return (!level.key || world.keyTaken) && (level.gateX === undefined || world.gateOpen);
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const rafRef = useRef<number>(0);
  const keysRef = useRef(new Set<string>());
  const hostInputRef = useRef<InputState>(emptyInput());
  const guestInputRef = useRef<InputState>(emptyInput());
  const worldRef = useRef<WorldState>(makeWorld());
  const lastSendRef = useRef(0);
  const [phase, setPhase] = useState<Phase>('menu');
  const [role, setRole] = useState<Role | null>(null);
  const [roomId, setRoomId] = useState(queryRoom);
  const [inviteUrl, setInviteUrl] = useState('');
  const [status, setStatus] = useState('Ready for an adventure?');
  const [opponentName, setOpponentName] = useState('Waiting for player 2');
  const [copied, setCopied] = useState(false);
  const [playerName, setPlayerName] = useState('Player 1');
  const [error, setError] = useState('');

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    connRef.current?.close(); connRef.current = null;
    peerRef.current?.destroy(); peerRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const updateInputsFromKeys = useCallback(() => {
    const keys = keysRef.current;
    const roleNow = role;
    const local: InputState = roleNow === 'host'
      ? { left: keys.has('a') || keys.has('A'), right: keys.has('d') || keys.has('D'), jump: keys.has('w') || keys.has('W') || keys.has(' ') }
      : { left: keys.has('ArrowLeft'), right: keys.has('ArrowRight'), jump: keys.has('ArrowUp') || keys.has(' ') };
    return local;
  }, [role]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', ' '].includes(e.key)) e.preventDefault();
      keysRef.current.add(e.key);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    const blur = () => keysRef.current.clear();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    const loop = (time: number) => {
      if (role === 'host') {
        hostInputRef.current = updateInputsFromKeys();
        worldRef.current = stepWorld(worldRef.current, [hostInputRef.current, guestInputRef.current]);
        if (time - lastSendRef.current > 50 && connRef.current?.open) {
          connRef.current.send({ type: 'state', world: worldRef.current } satisfies Packet);
          lastSendRef.current = time;
        }
        if (worldRef.current.complete) {
          if (connRef.current?.open) connRef.current.send({ type: 'state', world: worldRef.current } satisfies Packet);
          setPhase('done');
        }
      } else if (role === 'guest') {
        const input = updateInputsFromKeys();
        if (time - lastSendRef.current > 35 && connRef.current?.open) {
          connRef.current.send({ type: 'input', input } satisfies Packet);
          lastSendRef.current = time;
        }
      }
      if (canvasRef.current) drawWorld(canvasRef.current, worldRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, role, updateInputsFromKeys]);

  useEffect(() => {
    if ((phase === 'playing' || phase === 'done') && canvasRef.current) drawWorld(canvasRef.current, worldRef.current);
  }, [phase]);

  const setupHostConnection = (conn: DataConnection) => {
    if (connRef.current) { conn.close(); return; }
    connRef.current = conn;
    conn.on('open', () => {
      setOpponentName('Player 2'); setStatus('Friend connected — solve the levels together!');
      setPhase('playing');
      conn.send({ type: 'state', world: worldRef.current } satisfies Packet);
    });
    conn.on('data', (raw) => {
      const packet = raw as Packet;
      if (packet.type === 'input') guestInputRef.current = packet.input;
      if (packet.type === 'join') setOpponentName(packet.name || 'Player 2');
      if (packet.type === 'restart') { worldRef.current = makeWorld(); setPhase('playing'); }
    });
    conn.on('close', () => { setStatus('Player 2 disconnected. Create a new room to play again.'); setPhase('waiting'); connRef.current = null; });
    conn.on('error', () => setError('Connection interrupted. Ask your friend to rejoin the room.'));
  };

  const createRoom = async () => {
    cleanup(); setError(''); setRole('host'); setStatus('Creating your room…'); setPhase('waiting'); setOpponentName('Waiting for player 2');
    worldRef.current = makeWorld();
    try {
      const peer = new Peer(); peerRef.current = peer;
      peer.on('open', (id) => {
        const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(id)}`;
        setInviteUrl(url); setStatus('Room created. Share the invite link with one friend.');
      });
      peer.on('connection', setupHostConnection);
      peer.on('error', (e) => setError(`Room error: ${e.type}. Try creating a new room.`));
    } catch {
      setError('Could not create a room. Check your connection and try again.'); setPhase('menu');
    }
  };

  const joinRoom = async (id = roomId) => {
    const target = id.trim();
    if (!target) { setError('Paste a room invite link or room ID first.'); return; }
    let normalized = target;
    if (target.includes('room=')) {
      try { normalized = new URL(target).searchParams.get('room') || ''; }
      catch { setError('Paste the full room invite URL, including https://.'); return; }
    }
    if (!normalized) { setError('That invite link does not contain a room ID.'); return; }
    cleanup(); setError(''); setRole('guest'); setPhase('waiting'); setStatus('Connecting to your friend…');
    try {
      const peer = new Peer(); peerRef.current = peer;
      peer.on('open', () => {
        const conn = peer.connect(normalized, { reliable: true }); connRef.current = conn;
        conn.on('open', () => {
          conn.send({ type: 'join', name: playerName.trim() || 'Player 2' } satisfies Packet);
          setStatus('Connected! Waiting for the game state…');
        });
        conn.on('data', (raw) => {
          const packet = raw as Packet;
          if (packet.type === 'state') {
            worldRef.current = packet.world;
            setPhase(packet.world.complete ? 'done' : 'playing');
            setOpponentName('Room host'); setStatus('You are connected — have fun!');
          }
        });
        conn.on('error', () => setError('Could not reach that room. Check the link and ask the host to keep their tab open.'));
        conn.on('close', () => { setStatus('The host left the room.'); setPhase('menu'); });
      });
      peer.on('error', (e) => setError(e.type === 'peer-unavailable' ? 'Room not found. The host may have closed the tab.' : `Connection error: ${e.type}`));
    } catch {
      setError('Could not join the room. Check your internet connection and try again.'); setPhase('menu');
    }
  };

  const touchKey = (key: string, pressed: boolean) => {
    if (pressed) keysRef.current.add(key); else keysRef.current.delete(key);
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError('Copy failed. Select and copy the invite link manually.'); }
  };

  const restart = () => {
    if (role === 'host') {
      worldRef.current = makeWorld(); setPhase('playing');
      connRef.current?.send({ type: 'state', world: worldRef.current } satisfies Packet);
    } else connRef.current?.send({ type: 'restart' } satisfies Packet);
  };

  const leave = () => {
    cleanup(); setPhase('menu'); setRole(null); setInviteUrl('');
    setStatus('Ready for an adventure?'); setError(''); setOpponentName('Waiting for player 2'); worldRef.current = makeWorld();
  };

  return (
    <main className="page-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>LITTLE TEAM QUEST</span></div><div className="top-pill">2 PLAYER CO-OP</div></header>
      <section className="hero">
        <div className="eyebrow">A TINY ADVENTURE FOR TWO</div>
        <h1>Small players.<br /><em>Big teamwork.</em></h1>
        <p className="subhead">Jump, explore, find keys and solve little puzzles. Every level is easier when you work together.</p>
      </section>

      {phase === 'menu' && (
        <section className="lobby panel">
          <div className="lobby-grid">
            <div className="lobby-option create-option">
              <div className="option-icon cyan">↗</div><div className="option-kicker">START A SESSION</div>
              <h2>Create a room</h2><p>Host the game and invite one friend with a private room link.</p>
              <button className="primary-btn" onClick={createRoom}>Create room <span>→</span></button>
            </div>
            <div className="lobby-divider"><span>OR</span></div>
            <div className="lobby-option join-option">
              <div className="option-icon coral">⇢</div><div className="option-kicker">JOIN A FRIEND</div>
              <h2>Join a room</h2><p>Paste the invite link shared by the room host.</p>
              <input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Your player name" aria-label="Your player name" maxLength={18} />
              <input value={roomId} onChange={e => setRoomId(e.target.value)} placeholder="Paste room link or room ID" aria-label="Room invite link" />
              <button className="secondary-btn" onClick={() => joinRoom()}>Join room <span>→</span></button>
            </div>
          </div>
          <div className="lobby-foot"><span className="status-dot" /> No account · No database · Just a friend and a link</div>
        </section>
      )}

      {phase === 'waiting' && (
        <section className="waiting-card panel">
          <div className="loader-orbit"><span>✦</span></div>
          <div className="option-kicker">{role === 'host' ? 'YOUR ROOM IS READY' : 'JOINING THE ADVENTURE'}</div>
          <h2>{role === 'host' ? 'Invite your player two.' : 'Finding your friend…'}</h2>
          <p>{role === 'host' ? 'Keep this tab open. Your friend can join from another device using this link.' : 'Make sure the host has their room open.'}</p>
          {role === 'host' && inviteUrl && <div className="invite-row"><input readOnly value={inviteUrl} /><button className="primary-btn copy-btn" onClick={copyInvite}>{copied ? 'Copied ✓' : 'Copy invite'}</button></div>}
          {role === 'guest' && <div className="waiting-status"><span className="pulse-dot" /> Connecting to room…</div>}
          <button className="text-btn" onClick={leave}>Cancel and go back</button>
        </section>
      )}

      {(phase === 'playing' || phase === 'done') && (
        <section className="game-section">
          <div className="game-meta"><div><span className="live-dot" /> LIVE ROOM <b>{role === 'host' ? 'HOST' : 'GUEST'}</b></div><div className="connected-name">✦ {opponentName}</div></div>
          <div className="canvas-wrap"><canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-label="Cooperative platform game" /></div>
          <div className="game-caption"><div><strong>{LEVELS[worldRef.current.level]?.name || 'Adventure complete'}</strong><span>{LEVELS[worldRef.current.level]?.hint || 'You cleared every level together.'}</span></div><div className="level-count">{Math.min(worldRef.current.level + 1, LEVELS.length)} / {LEVELS.length}</div></div>
          <div className="touch-controls" aria-label="Touch controls">
            <div className="touch-movement">
              <button onPointerDown={e => { e.preventDefault(); touchKey(role === 'host' ? 'a' : 'ArrowLeft', true); }} onPointerUp={() => touchKey(role === 'host' ? 'a' : 'ArrowLeft', false)} onPointerLeave={() => touchKey(role === 'host' ? 'a' : 'ArrowLeft', false)}>←</button>
              <button onPointerDown={e => { e.preventDefault(); touchKey(role === 'host' ? 'd' : 'ArrowRight', true); }} onPointerUp={() => touchKey(role === 'host' ? 'd' : 'ArrowRight', false)} onPointerLeave={() => touchKey(role === 'host' ? 'd' : 'ArrowRight', false)}>→</button>
            </div>
            <button className="jump-touch" onPointerDown={e => { e.preventDefault(); touchKey(role === 'host' ? 'w' : 'ArrowUp', true); }} onPointerUp={() => touchKey(role === 'host' ? 'w' : 'ArrowUp', false)} onPointerLeave={() => touchKey(role === 'host' ? 'w' : 'ArrowUp', false)}>JUMP</button>
          </div>
          <div className="controls panel">
            <div className="control-set"><span className="player-tag p1">PLAYER 1 · HOST</span><div className="key-row"><kbd>A</kbd><kbd>D</kbd><span>move</span><kbd>W</kbd><span>jump</span></div></div>
            <div className="control-set"><span className="player-tag p2">PLAYER 2 · GUEST</span><div className="key-row"><kbd>←</kbd><kbd>→</kbd><span>move</span><kbd>↑</kbd><span>jump</span></div></div>
          </div>
          <div className="game-actions"><span>{status}</span><div><button className="text-btn" onClick={restart}>↻ Restart levels</button><button className="text-btn" onClick={leave}>Leave room</button></div></div>
        </section>
      )}

      {error && <div className="error-toast" role="alert">⚠ {error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}

      <section className="how-section">
        <div className="section-heading"><div className="option-kicker">FOUR LITTLE CHALLENGES</div><h2>Made for teamwork.</h2></div>
        <div className="level-cards">
          {LEVELS.map((level, i) => <div className="level-card" key={level.name}><div className={`level-number n${i + 1}`}>0{i + 1}</div><h3>{level.name}</h3><p>{level.hint}</p></div>)}
        </div>
      </section>
      <footer><span>✦ LITTLE TEAM QUEST</span><span>Built for two. Powered by teamwork.</span></footer>
    </main>
  );
}
