import { getDatabase } from './database';

// Simple hash for local-only PIN protection (not for network security)
function hashString(input: string): string {
  const salted = 'moments_salt_2026_' + input;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < salted.length; i++) {
    const ch = salted.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return (h1 >>> 0).toString(36) + '.' + (h2 >>> 0).toString(36);
}

export interface UserAccount {
  nickname: string;
  hasPassword: boolean;
  securityQuestion: string;
  hasSecurityAnswer: boolean;
  createdAt: number;
}

export async function getAccount(): Promise<UserAccount | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    nickname: string; password_hash: string;
    security_question: string; security_answer_hash: string; created_at: number;
  }>('SELECT * FROM user_account WHERE id = 1');
  if (!row) return null;
  return {
    nickname: row.nickname,
    hasPassword: row.password_hash !== '',
    securityQuestion: row.security_question,
    hasSecurityAnswer: row.security_answer_hash !== '',
    createdAt: row.created_at,
  };
}

export async function hasAccount(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM user_account WHERE id = 1 AND password_hash != \'\'');
  return !!row;
}

export async function registerAccount(
  nickname: string,
  password: string,
  securityQuestion: string,
  securityAnswer: string,
): Promise<void> {
  const db = await getDatabase();
  const passwordHash = hashString(password);
  const answerHash = hashString(securityAnswer);
  const now = Date.now();

  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM user_account WHERE id = 1');
  if (existing) {
    await db.runAsync(
      'UPDATE user_account SET nickname = ?, password_hash = ?, security_question = ?, security_answer_hash = ?, updated_at = ? WHERE id = 1',
      [nickname, passwordHash, securityQuestion, answerHash, now],
    );
  } else {
    await db.runAsync(
      'INSERT INTO user_account (id, nickname, password_hash, security_question, security_answer_hash, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)',
      [nickname, passwordHash, securityQuestion, answerHash, now, now],
    );
  }
}

export async function verifyPassword(password: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ password_hash: string }>('SELECT password_hash FROM user_account WHERE id = 1');
  if (!row || !row.password_hash) return false;
  return hashString(password) === row.password_hash;
}

export async function verifySecurityAnswer(answer: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ security_answer_hash: string }>('SELECT security_answer_hash FROM user_account WHERE id = 1');
  if (!row || !row.security_answer_hash) return false;
  return hashString(answer) === row.security_answer_hash;
}

export async function resetPassword(newPassword: string, securityAnswer: string): Promise<boolean> {
  const valid = await verifySecurityAnswer(securityAnswer);
  if (!valid) return false;
  const db = await getDatabase();
  const passwordHash = hashString(newPassword);
  await db.runAsync('UPDATE user_account SET password_hash = ?, updated_at = ? WHERE id = 1', [passwordHash, Date.now()]);
  return true;
}

export async function updateNickname(nickname: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE user_account SET nickname = ?, updated_at = ? WHERE id = 1', [nickname, Date.now()]);
}
