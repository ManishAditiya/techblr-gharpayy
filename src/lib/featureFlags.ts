const env = typeof import.meta !== "undefined" ? (import.meta as any).env ?? {} : {};

const parseFlag = (v: any, def: boolean) => {
  if (v === undefined) return def;
  if (typeof v === "boolean") return v;
  return String(v).toLowerCase() === "true";
};

const FEATURE_FLAGS = {
  leadUpload: parseFlag(env.VITE_FEATURE_LEAD_UPLOAD, true),
  leadRouting: parseFlag(env.VITE_FEATURE_LEAD_ROUTING, true),
  notifications: parseFlag(env.VITE_FEATURE_NOTIFICATIONS, true),
};

export default FEATURE_FLAGS;
