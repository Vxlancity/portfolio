"use client";

import { useEffect, useMemo, useState } from "react";

const DISCORD_USER_ID = "1422272718459633664";
const API_URL = `https://api.lanyard.rest/v1/users/${DISCORD_USER_ID}`;
const SOCKET_URL = "wss://api.lanyard.rest/socket";

type Activity = {
  id?: string;
  name?: string;
  details?: string | null;
  state?: string | null;
  type?: number;
  timestamps?: { start?: number; end?: number };
};

type Spotify = {
  song?: string;
  artist?: string;
  album?: string;
  track_id?: string;
  album_art_url?: string;
};

type Presence = {
  discord_user?: {
    id?: string;
    username?: string;
    global_name?: string | null;
    avatar?: string | null;
    banner?: string | null;
    banner_color?: string | null;
  };
  discord_status?: "online" | "idle" | "dnd" | "offline";
  activities?: Activity[];
  spotify?: Spotify | null;
};

const statusLabel: Record<string, string> = {
  online: "Online",
  idle: "Abwesend",
  dnd: "Bitte nicht stören",
  offline: "Offline",
};

const statusClass: Record<string, string> = {
  online: "discord-online",
  idle: "discord-idle",
  dnd: "discord-dnd",
  offline: "discord-offline",
};

function avatarUrl(user?: Presence["discord_user"]) {
  if (!user?.id || !user.avatar) return "";
  const extension = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=256`;
}

function bannerUrl(user?: Presence["discord_user"]) {
  if (!user?.id || !user.banner) return "";
  const extension = user.banner.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${extension}?size=1024`;
}

function activityLabel(activity: Activity) {
  if (activity.type === 1) return "Streaming";
  if (activity.type === 2) return "Hört";
  if (activity.type === 3) return "Schaut";
  if (activity.type === 5) return "Wetteifert bei";
  return "Spielt";
}

export default function DiscordPresence() {
  const [presence, setPresence] = useState<Presence | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;

    const loadInitial = async () => {
      try {
        const response = await fetch(API_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("Lanyard request failed");
        const payload = await response.json();
        if (payload.success && payload.data) setPresence(payload.data);
      } catch {
        // The socket can still recover the presence.
      }
    };

    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(SOCKET_URL);

      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
        if (!stopped) reconnectTimer = setTimeout(connect, 5000);
      };
      socket.onerror = () => setConnected(false);

      socket.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);

          if (packet.op === 1) {
            socket?.send(
              JSON.stringify({
                op: 2,
                d: { subscribe_to_id: DISCORD_USER_ID },
              }),
            );

            if (heartbeatTimer) clearInterval(heartbeatTimer);
            const interval = Number(packet.d?.heartbeat_interval) || 30000;
            heartbeatTimer = setInterval(() => {
              if (socket?.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ op: 3, d: null }));
              }
            }, interval);
          }

          if (
            packet.op === 0 &&
            (packet.t === "INIT_STATE" || packet.t === "PRESENCE_UPDATE") &&
            packet.d
          ) {
            setPresence(packet.d);
          }
        } catch {
          // Ignore malformed socket packets.
        }
      };
    };

    void loadInitial();
    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      socket?.close();
    };
  }, []);

  const user = presence?.discord_user;
  const status = presence?.discord_status ?? "offline";
  const avatar = useMemo(() => avatarUrl(user), [user]);
  const banner = useMemo(() => bannerUrl(user), [user]);
  const spotify = presence?.spotify ?? null;
  const activities = (presence?.activities ?? []).filter(
    (activity) => activity.type !== 4 && !(spotify && activity.type === 2),
  );
  const customStatus = (presence?.activities ?? []).find(
    (activity) => activity.type === 4,
  );
  const mainActivity = activities[0];
  const spotifyUrl = spotify?.track_id
    ? `https://open.spotify.com/track/${spotify.track_id}`
    : null;

  return (
    <section id="discord" className="discord-presence" data-gsap="fade-up">
      <div className="discord-shell">
        <div
          className="discord-banner"
          style={{
            backgroundImage: banner
              ? `linear-gradient(180deg, transparent 15%, rgba(9, 8, 15, .96) 100%), url("${banner}")`
              : undefined,
          }}
        >
          <div className="discord-banner-content">
            <div>
              <p className="eyebrow mb-2">Discord / Live Presence</p>
              <h2 className="section-title">Discord</h2>
            </div>
            <span className="discord-live-badge">
              <span className={`discord-live-dot ${connected ? "is-live" : ""}`} />
              {connected ? "LIVE" : "CONNECTING"}
            </span>
          </div>
        </div>

        <div className="discord-content">
          <div className="discord-profile">
            <a
              className="discord-avatar-wrap"
              href={`https://discord.com/users/${DISCORD_USER_ID}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Discord Profil öffnen"
            >
              {avatar ? (
                <img src={avatar} alt="Discord Avatar" className="discord-avatar" />
              ) : (
                <div className="discord-avatar discord-avatar-placeholder" />
              )}
              <span className={`discord-avatar-status ${statusClass[status]}`} />
            </a>

            <div className="discord-identity">
              <div className="discord-name-row">
                <h3>{user?.global_name || user?.username || "Discord User"}</h3>
                <span className={`discord-status-pill ${statusClass[status]}`}>
                  {statusLabel[status]}
                </span>
              </div>
              <p>@{user?.username ?? "unknown"}</p>
              {customStatus?.state && (
                <span className="discord-custom-status">{customStatus.state}</span>
              )}
            </div>

            <a
              className="discord-profile-link"
              href={`https://discord.com/users/${DISCORD_USER_ID}`}
              target="_blank"
              rel="noreferrer"
            >
              Profil ↗
            </a>
          </div>

          {(mainActivity || presence?.spotify) && (
            <div className="discord-details">
              {mainActivity && (
                <div className="discord-detail-card">
                  <span className="discord-detail-label">
                    <span className="discord-eq"><i /><i /><i /><i /></span>
                    {activityLabel(mainActivity)}
                  </span>
                  <h3>{mainActivity.name}</h3>
                  {mainActivity.details && <p>{mainActivity.details}</p>}
                  {mainActivity.state && (
                    <span className="discord-detail-muted">{mainActivity.state}</span>
                  )}
                </div>
              )}

              {spotify && (
                <a
                  className={`discord-detail-card discord-spotify discord-spotify-link ${!mainActivity ? "discord-detail-card-wide" : ""}`}
                  href={spotifyUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Spotify öffnen: ${spotify.song ?? "aktueller Song"}`}
                  onClick={(event) => {
                    if (!spotifyUrl) event.preventDefault();
                  }}
                >
                  {spotify.album_art_url && (
                    <img
                      src={spotify.album_art_url}
                      alt=""
                      className="discord-album-art"
                    />
                  )}
                  <div className="min-w-0 self-center">
                    <span className="discord-detail-label">
                      <span className="discord-spotify-dot" /> Spotify
                    </span>
                    <h3>{spotify.song ?? "Unbekannter Titel"}</h3>
                    <p>{spotify.artist ?? "Unbekannter Artist"}</p>
                    <span className="discord-detail-muted">
                      {presence.spotify.album ?? ""}
                    </span>
                  </div>
                </a>
              )}
            </div>
          )}

          {!mainActivity && !spotify && (
            <div className="discord-idle-card">
              <span className="discord-detail-label">Activity</span>
              <p>Gerade keine aktive Rich Presence.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
