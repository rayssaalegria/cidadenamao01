export function getSasiChannelIdFromClient(defaultChannelId = 27328) {
  const envId = Number(process.env.NEXT_PUBLIC_SASI_CHANNEL_ID || "");
  const urlId = Number(new URL(window.location.href).searchParams.get("channelId") || "");

  if (Number.isFinite(urlId) && urlId > 0) return urlId;
  if (Number.isFinite(envId) && envId > 0) return envId;
  return defaultChannelId;
}

