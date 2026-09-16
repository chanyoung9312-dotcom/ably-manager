import './globals.css';
import TodayHomeNav from './TodayHomeNav';
export const metadata={title:'OARS Manager',description:'오어즈 쇼핑몰 운영 관리'};
export default function RootLayout({children}){return <html lang="ko"><body><TodayHomeNav/><div style={{maxWidth:1000,margin:'0 auto',padding:'16px 18px 0'}}><a href="/" style={{color:'#c8b99d',textDecoration:'none',fontSize:15}}>← OARS Manager</a></div>{children}</body></html>}
