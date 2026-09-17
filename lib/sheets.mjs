import { GoogleAuth } from "google-auth-library";
import { upstreamFetch } from "./http.mjs";
export const sheetId = () =>
  process.env.GOOGLE_SHEET_ID || "1tL1u65uuALC6Xky0CbUbPkSX7pZd_twl2Wpy0AYg8eU";
export async function sheetHeaders(write = false) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    throw new Error("Google 서비스 계정 설정이 필요합니다.");
  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error("Google 서비스 계정 JSON 형식 오류");
  }
  const auth = new GoogleAuth({
    credentials,
    scopes: [
      `https://www.googleapis.com/auth/spreadsheets${write ? "" : ".readonly"}`,
    ],
  });
  const token = await (await auth.getClient()).getAccessToken();
  return {
    Authorization: `Bearer ${token.token || token}`,
    "Content-Type": "application/json",
  };
}
export async function readSheet(name, columns, headers) {
  const range = encodeURIComponent(`'${name}'!${columns}`);
  const r = await upstreamFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values/${range}`,
    { headers },
  );
  if (!r.ok)
    throw new Error(
      `${name} 시트 조회 실패 (${r.status}). 이전 데이터를 확인하고 다시 시도하세요.`,
    );
  const data = await r.json();
  if (data.values && !Array.isArray(data.values))
    throw new Error(`${name} 시트 응답 형식 오류`);
  return data.values || [];
}
export async function writeCells(data, headers) {
  const r = await upstreamFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}/values:batchUpdate`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    },
  );
  if (!r.ok)
    throw new Error(
      `시트 저장 결과를 확인하세요 (${r.status}). 재조회 후 다시 시도하세요.`,
    );
  return r.json();
}
