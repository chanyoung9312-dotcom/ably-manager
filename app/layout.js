import "./globals.css";
export const metadata = {
  title: "OARS Manager",
  description: "오어즈 쇼핑몰 운영 관리",
};
export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
