export const hashPassword = async (password: string): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
};

export const hasStoredPassword = (): boolean => {
  return !!localStorage.getItem("admin_pw_hash");
};

export const verifyPassword = async (password: string): Promise<boolean> => {
  const storedHash = localStorage.getItem("admin_pw_hash");
  if (!storedHash) return false;
  
  const hash = await hashPassword(password);
  return hash === storedHash;
};

export const setPassword = async (password: string): Promise<void> => {
  const hash = await hashPassword(password);
  localStorage.setItem("admin_pw_hash", hash);
};
